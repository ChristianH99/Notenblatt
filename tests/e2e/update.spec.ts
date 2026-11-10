/**
 * Updates against a local stand-in for the GitHub releases API (NOTENBLATT_UPDATE_URL):
 * offer on start with the release notes as text, "Später", "Diese Version überspringen",
 * manual check in the settings, download through a redirect with SHA-256 check (dry run:
 * the installer is not started), a tampered download, and the switch for the check on start.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launch, netLog, SCREENSHOTS, tempDir } from './helpers';

const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const INSTALLER = `Notenblatt-Setup-9.1.0-${ARCH}.exe`;
const NOTES = '## Neu\n\n- **Einführung** beim ersten Start\n- Updates aus dem Programm\n\nMehr unter [GitHub](https://github.com/x).';

interface Server {
  url: string;
  hits: string[];
  close: () => Promise<void>;
}

/** Serves /latest (release JSON), /download (302) and the installer bytes. `serve` may differ from what the digest says. */
async function releaseServer(opts: { file?: Buffer; serve?: Buffer; prerelease?: boolean } = {}): Promise<Server> {
  const file = opts.file ?? Buffer.alloc(300_000, 7);
  const serve = opts.serve ?? file;
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    if (req.url === '/latest') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          tag_name: 'v9.1.0',
          name: 'Notenblatt 9.1.0',
          body: NOTES,
          draft: false,
          prerelease: !!opts.prerelease,
          published_at: '2026-11-10T08:00:00Z',
          assets: [
            {
              name: INSTALLER,
              state: 'uploaded',
              size: file.length,
              digest: `sha256:${createHash('sha256').update(file).digest('hex')}`,
              browser_download_url: `${base}/download`,
            },
          ],
        }),
      );
    } else if (req.url === '/download') {
      res.writeHead(302, { Location: `${base}/files/${INSTALLER}` });
      res.end();
    } else if (req.url === `/files/${INSTALLER}`) {
      res.setHeader('Content-Length', String(serve.length));
      res.end(serve);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/latest`,
    hits,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

const updateEnv = (srv: Server): Record<string, string> => ({ NOTENBLATT_UPDATE_URL: srv.url, NOTENBLATT_UPDATE_DRY_RUN: '1' });
const offer = (page: Page) => page.getByRole('dialog', { name: 'Update verfügbar' });
const config = (dir: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) as Record<string, unknown>;

test('offer on start, later, skip this version, manual check, download and verify', async () => {
  const srv = await releaseServer();
  const dir = tempDir();
  let { app, page } = await launch(dir, undefined, { env: updateEnv(srv) });

  // Offered on start, release notes as text in the app (links not followed).
  const dlg = offer(page);
  await expect(dlg).toContainText('Notenblatt 9.1.0 vom 10.11.2026 ist verfügbar');
  const notes = dlg.getByTestId('release-notes');
  await expect(notes.getByRole('heading', { name: 'Neu' })).toBeVisible();
  await expect(notes.locator('li strong')).toHaveText('Einführung');
  await expect(notes).toContainText('Mehr unter GitHub.');
  await expect(notes.locator('a')).toHaveCount(0);
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, 'update-offer.png') });

  // "Später": nothing stored, offered again on the next start.
  await dlg.getByRole('button', { name: 'Später' }).click();
  await expect(dlg).toHaveCount(0);
  expect(config(dir).skippedVersion).toBeUndefined();
  await app.close();

  ({ app, page } = await launch(dir, undefined, { env: updateEnv(srv) }));
  await offer(page).getByRole('button', { name: 'Diese Version überspringen' }).click();
  await expect(offer(page)).toHaveCount(0);
  expect(config(dir).skippedVersion).toBe('9.1.0');
  await app.close();

  // Skipped: not offered on start …
  const before = srv.hits.filter((h) => h === '/latest').length;
  ({ app, page } = await launch(dir, undefined, { env: updateEnv(srv) }));
  await expect.poll(() => srv.hits.filter((h) => h === '/latest').length).toBe(before + 1);
  await page.waitForTimeout(500);
  await expect(offer(page)).toHaveCount(0);

  // … but a manual check still shows it.
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  await expect(offer(page)).toBeVisible();

  // Install: follows the redirect, checks size and SHA-256, then (dry run) does not start the installer.
  await offer(page).getByRole('button', { name: 'Jetzt installieren' }).click();
  await expect(page.getByTestId('update-installing')).toBeVisible();
  expect(srv.hits).toContain('/download');
  expect(srv.hits).toContain(`/files/${INSTALLER}`);
  expect(await netLog(app)).toEqual([]);
  await app.close();
  await srv.close();
});

test('tampered download is rejected', async () => {
  const file = Buffer.alloc(200_000, 1);
  const serve = Buffer.from(file);
  serve[1000] = 2;
  const srv = await releaseServer({ file, serve });
  const { app, page } = await launch(tempDir(), undefined, { env: updateEnv(srv) });
  await offer(page).getByRole('button', { name: 'Jetzt installieren' }).click();
  await expect(offer(page)).toContainText('beschädigt oder wurde verändert');
  await expect(page.getByTestId('update-installing')).toHaveCount(0);
  await app.close();
  await srv.close();
});

test('check on start can be switched off; pre-releases are never offered; offline is reported', async () => {
  const srv = await releaseServer({ prerelease: true });
  const dir = tempDir();
  let { app, page } = await launch(dir, undefined, { env: updateEnv(srv) });
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  await expect(page.getByTestId('update-status')).toHaveText('Notenblatt ist auf dem neuesten Stand.');
  await expect(offer(page)).toHaveCount(0);
  await page.getByLabel('Nach Updates suchen', { exact: true }).uncheck();
  expect(config(dir).autoUpdateCheck).toBe(false);
  await app.close();

  const before = srv.hits.length;
  ({ app, page } = await launch(dir, undefined, { env: updateEnv(srv) }));
  await expect(page.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(srv.hits.length).toBe(before);
  await app.close();
  await srv.close();

  // Server gone: a manual check says so instead of failing silently.
  ({ app, page } = await launch(dir, undefined, { env: updateEnv(srv) }));
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Nach Updates suchen' }).click();
  await expect(page.getByTestId('update-status')).toContainText('GitHub ist nicht erreichbar');
  await app.close();
});
