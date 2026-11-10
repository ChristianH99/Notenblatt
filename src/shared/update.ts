/**
 * Update check: picks the installer for this device from a GitHub release
 * (`GET /repos/{owner}/{repo}/releases/latest`). Pure functions, no I/O.
 */

export const UPDATE_REPO = 'ChristianH99/Notenblatt';
export const RELEASES_LATEST_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;

/** Hosts the updater may contact: the API and the download redirect targets. */
export const UPDATE_HOSTS = ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'] as const;

export type Arch = 'x64' | 'arm64';

export interface UpdateOffer {
  version: string;
  /** Release title, e.g. "Notenblatt 0.2.0". */
  name: string;
  /** Release notes as written on GitHub (Markdown). */
  notes: string;
  publishedAt: string;
  asset: { name: string; url: string; size: number; sha256: string };
}

/** [major, minor, patch] of "1.2.3" or "v1.2.3"; null for anything else (also pre-release versions). */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** < 0 if a is older than b, 0 if equal, > 0 if newer. Both must be valid versions. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error('invalid version');
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  return 0;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const isAllowedUrl = (u: string): boolean => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && (UPDATE_HOSTS as readonly string[]).includes(url.hostname);
  } catch {
    return false;
  }
};

/**
 * The update offered by a release, or null if there is none for this device:
 * draft or pre-release, tag not a plain version, not newer than `current`,
 * or no installer for `arch` with a SHA-256 digest (installers are still being built).
 * `allowUrl` decides which download URLs are acceptable (tests use a local server).
 */
export function pickUpdate(release: unknown, current: string, arch: Arch, allowUrl: (url: string) => boolean = isAllowedUrl): UpdateOffer | null {
  if (typeof release !== 'object' || release === null) return null;
  const r = release as Record<string, unknown>;
  if (r.draft === true || r.prerelease === true) return null;
  const tag = str(r.tag_name);
  const v = parseVersion(tag);
  if (!v || !parseVersion(current) || compareVersions(tag, current) <= 0) return null;
  const version = v.join('.');
  const wanted = `Notenblatt-Setup-${version}-${arch}.exe`;
  const assets = Array.isArray(r.assets) ? (r.assets as unknown[]) : [];
  for (const a of assets) {
    if (typeof a !== 'object' || a === null) continue;
    const x = a as Record<string, unknown>;
    if (x.name !== wanted || x.state !== 'uploaded') continue;
    const sha = /^sha256:([0-9a-f]{64})$/i.exec(str(x.digest));
    const url = str(x.browser_download_url);
    const size = typeof x.size === 'number' && Number.isSafeInteger(x.size) && x.size > 0 ? x.size : 0;
    if (!sha || !allowUrl(url) || !size) return null;
    return {
      version,
      name: str(r.name).trim() || `Notenblatt ${version}`,
      notes: str(r.body),
      publishedAt: str(r.published_at),
      asset: { name: wanted, url, size, sha256: (sha[1] as string).toLowerCase() },
    };
  }
  return null;
}

/** Whether `url` (also a redirect target) may be requested by the updater. */
export function isUpdateUrl(url: string): boolean {
  return isAllowedUrl(url);
}
