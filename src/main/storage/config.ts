/**
 * Local, per-device configuration (%APPDATA%\Notenblatt\config.json).
 * Holds only where the database lives and the window position — never personal data.
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
