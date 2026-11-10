/**
 * Updates from GitHub releases. The only network access of the app: it runs in its own
 * in-memory session (not the window's), may only reach the GitHub hosts in UPDATE_HOSTS
 * (every redirect is checked) and sends nothing but a version-free request for the
 * latest release. The installer is verified against the SHA-256 digest GitHub lists for
 * it and then runs silently (per-user install, no UAC) and restarts the app.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { net, session, type Session } from 'electron';
import { compareVersions, isUpdateUrl, parseVersion, pickUpdate, RELEASES_LATEST_URL, type Arch, type UpdateOffer } from '@shared/update';
import { UserError } from '../db/repo';
import { log } from '../log';

const PARTITION = 'notenblatt-updates'; // in-memory, separate from the app window
const API_TIMEOUT_MS = 15_000;
const STALL_TIMEOUT_MS = 60_000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_INSTALLER_BYTES = 1024 * 1024 * 1024;

export const NO_CONNECTION = 'GitHub ist nicht erreichbar. Bitte prüfen Sie die Internetverbindung und versuchen Sie es später erneut.';

export interface UpdaterOptions {
  current: string;
  arch: Arch;
  /** Folder for the downloaded installer (deleted on the next start). */
  downloadDir: string;
  /** Development/test only: release URL on localhost instead of GitHub. */
  testUrl?: string;
  /** Development/test only: verify the download but do not run the installer. */
  dryRun?: boolean;
}

export type CheckResult = { status: 'available'; offer: UpdateOffer } | { status: 'current' };

export class Updater {
  private ses: Session | null = null;
  private abort: (() => void) | null = null;
  private offer: UpdateOffer | null = null;

  constructor(private readonly opts: UpdaterOptions) {}

  /** Release builds only; a development build (0.0.0) checks only against a test URL. */
  get enabled(): boolean {
    return !!this.opts.testUrl || (!!parseVersion(this.opts.current) && compareVersions(this.opts.current, '0.0.0') > 0);
  }

  get busy(): boolean {
    return this.abort !== null;
  }

  private allowed(url: string): boolean {
    if (isUpdateUrl(url)) return true;
    return !!this.opts.testUrl && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url);
  }

  private session(): Session {
    if (this.ses) return this.ses;
    const s = session.fromPartition(PARTITION);
    // Second fence besides the per-redirect check in get().
    s.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !this.allowed(d.url) }));
    s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    s.setPermissionCheckHandler(() => false);
    this.ses = s;
    return s;
  }

  /** GET with checked redirects. Resolves with the response once the status is known. */
  private get(url: string, accept: string, onAbort: (fn: () => void) => void): Promise<Electron.IncomingMessage> {
    return new Promise((resolve, reject) => {
      if (!this.allowed(url)) return reject(new Error('URL_NOT_ALLOWED'));
      const req = net.request({ url, session: this.session(), redirect: 'manual', useSessionCookies: false, cache: 'no-store' });
      req.setHeader('Accept', accept);
      req.setHeader('User-Agent', 'Notenblatt-Updater');
      if (accept.includes('github')) req.setHeader('X-GitHub-Api-Version', '2022-11-28');
      req.on('redirect', (_status, _method, to) => {
        if (this.allowed(to)) req.followRedirect();
        else {
          req.abort();
          reject(new Error('REDIRECT_NOT_ALLOWED'));
        }
      });
      req.on('response', resolve);
      req.on('error', reject);
      req.on('abort', () => reject(new Error('ABORTED')));
      onAbort(() => req.abort());
      req.end();
    });
  }

  private async latestRelease(): Promise<unknown> {
    let cancel = (): void => {};
    const timer = setTimeout(() => cancel(), API_TIMEOUT_MS);
    try {
      const res = await this.get(this.opts.testUrl ?? RELEASES_LATEST_URL, 'application/vnd.github+json', (fn) => (cancel = fn));
      // 404: no release published yet.
      if (res.statusCode === 404) return null;
      if (res.statusCode !== 200) {
        log('warn', 'UPDATE_HTTP', { status: res.statusCode });
        throw new Error('HTTP');
      }
      const chunks: Buffer[] = [];
      let size = 0;
      await new Promise<void>((resolve, reject) => {
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_JSON_BYTES) return cancel();
          chunks.push(c);
        });
        res.on('end', resolve);
        res.on('error', reject);
        res.on('aborted', () => reject(new Error('ABORTED')));
      });
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } finally {
      clearTimeout(timer);
    }
  }

  async check(): Promise<CheckResult> {
    if (!this.enabled) return { status: 'current' };
    let release: unknown;
    try {
      release = await this.latestRelease();
    } catch (e) {
      log('warn', 'UPDATE_CHECK_FAILED', { code: (e as Error).message });
      throw new UserError(NO_CONNECTION);
    }
    this.offer = pickUpdate(release, this.opts.current, this.opts.arch, (u) => this.allowed(u));
    return this.offer ? { status: 'available', offer: this.offer } : { status: 'current' };
  }

  cancel(): void {
    this.abort?.();
  }

  /** Removes installers left over from an earlier update (best effort). */
  cleanup(): void {
    try {
      fs.rmSync(this.opts.downloadDir, { recursive: true, force: true });
    } catch {
      // still in use by the finishing installer: removed next time
    }
  }

  /**
   * Downloads the installer of the last offered version and verifies size and SHA-256.
   * Returns its path, or null for a dry run (tests). The caller quits the app, then launch()es it.
   */
  async download(version: string, onProgress: (received: number, total: number) => void): Promise<string | null> {
    const offer = this.offer;
    if (!offer || offer.version !== version) throw new UserError('Bitte zuerst nach Updates suchen.');
    if (this.abort) throw new UserError('Das Update wird bereits heruntergeladen.');
    const { asset } = offer;
    if (asset.size > MAX_INSTALLER_BYTES) throw new UserError('Die Update-Datei ist ungültig.');

    this.cleanup();
    fs.mkdirSync(this.opts.downloadDir, { recursive: true });
    const file = path.join(this.opts.downloadDir, asset.name);
    const part = `${file}.part`;
    let cancelled = false;
    let abortReq = (): void => {};
    this.abort = () => {
      cancelled = true;
      abortReq();
    };
    try {
      const res = await this.get(asset.url, 'application/octet-stream', (fn) => (abortReq = fn));
      if (res.statusCode !== 200) throw new Error('HTTP');
      const hash = createHash('sha256');
      const out = fs.createWriteStream(part);
      let received = 0;
      await new Promise<void>((resolve, reject) => {
        let stall = setTimeout(() => abortReq(), STALL_TIMEOUT_MS);
        const fail = (e: Error): void => {
          clearTimeout(stall);
          out.destroy();
          reject(e);
        };
        res.on('data', (c: Buffer) => {
          clearTimeout(stall);
          stall = setTimeout(() => abortReq(), STALL_TIMEOUT_MS);
          received += c.length;
          if (received > asset.size) return abortReq();
          hash.update(c);
          out.write(c);
          onProgress(received, asset.size);
        });
        res.on('end', () => {
          clearTimeout(stall);
          out.end(() => resolve());
        });
        res.on('error', fail);
        res.on('aborted', () => fail(new Error('ABORTED')));
      });
      if (received !== asset.size || hash.digest('hex') !== asset.sha256) {
        log('warn', 'UPDATE_CHECKSUM_MISMATCH', {});
        throw new UserError('Die heruntergeladene Datei ist beschädigt oder wurde verändert. Das Update wurde nicht installiert.');
      }
      fs.renameSync(part, file);
    } catch (e) {
      this.cleanup();
      if (cancelled) throw new UserError('Der Download wurde abgebrochen.');
      if (e instanceof UserError) throw e;
      log('warn', 'UPDATE_DOWNLOAD_FAILED', { code: (e as Error).message });
      throw new UserError(NO_CONNECTION);
    } finally {
      this.abort = null;
    }

    return this.opts.dryRun ? null : file;
  }

  /** Starts the verified installer. Called on quit, after the database is saved and the lock released. */
  launch(file: string): void {
    log('info', 'UPDATE_INSTALL', {});
    // electron-builder NSIS: /S silent, --updated keeps the user's shortcut choices, --force-run starts the app afterwards.
    spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  }
}
