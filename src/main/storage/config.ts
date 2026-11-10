/**
 * Local, per-device configuration (%APPDATA%\Notenblatt\config.json).
 * Holds only where the database lives, the window position and the onboarding/update
 * preferences — never personal data.
 * It must be readable before the (possibly encrypted, possibly remote) database is open.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface AppConfig {
  version: 1;
  /** Folder of the database; null = default folder (userData). */
  dbDir: string | null;
  window?: WindowState;
  /** First-start tour: shown while 'pending'; unset until the first start with an open database. */
  onboarding?: 'pending' | 'done';
  /** Check GitHub for a new version on every start (default on). */
  autoUpdateCheck?: boolean;
  /** Version the user chose to skip; newer versions are offered again. */
  skippedVersion?: string;
}

const DEFAULT: AppConfig = { version: 1, dbDir: null };

export function configPath(userData: string): string {
  return path.join(userData, 'config.json');
}

export function readConfig(userData: string): AppConfig {
  try {
    const v = JSON.parse(fs.readFileSync(configPath(userData), 'utf8')) as Partial<AppConfig>;
    return {
      version: 1,
      dbDir: typeof v.dbDir === 'string' && v.dbDir.trim() ? v.dbDir : null,
      window: v.window && typeof v.window.width === 'number' ? v.window : undefined,
      onboarding: v.onboarding === 'pending' || v.onboarding === 'done' ? v.onboarding : undefined,
      autoUpdateCheck: typeof v.autoUpdateCheck === 'boolean' ? v.autoUpdateCheck : undefined,
      skippedVersion: typeof v.skippedVersion === 'string' && /^\d+\.\d+\.\d+$/.test(v.skippedVersion) ? v.skippedVersion : undefined,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeConfig(userData: string, cfg: AppConfig): void {
  fs.mkdirSync(userData, { recursive: true });
  const file = configPath(userData);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, file);
}

/** Read-modify-write of config.json. */
export function updateConfig(userData: string, patch: Partial<Omit<AppConfig, 'version'>>): AppConfig {
  const next = { ...readConfig(userData), ...patch };
  writeConfig(userData, next);
  return next;
}
