import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron, expect, type ElectronApplication, type Page } from '@playwright/test';

export const ROOT = path.resolve(__dirname, '../..');
/** Screenshots taken by the E2E tests (gitignored; uploaded as a CI artifact). */
export const SCREENSHOTS = path.join(ROOT, 'test-results', 'screenshots');

export function tempDir(prefix = 'nb-e2e-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export interface App {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
}

export interface LaunchOptions {
  /** Show the first-start tour (otherwise a new data folder starts with it marked as done). */
  onboarding?: boolean;
  /** Extra environment, e.g. NOTENBLATT_UPDATE_URL. */
  env?: Record<string, string>;
}

export async function launch(dataDir: string, size = { width: 1280, height: 720 }, opts: LaunchOptions = {}): Promise<App> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE' && !k.startsWith('NOTENBLATT_')) env[k] = v;
  env.NOTENBLATT_USER_DATA = dataDir;
  env.NOTENBLATT_E2E = '1';
  Object.assign(env, opts.env);
  const config = path.join(dataDir, 'config.json');
  if (!opts.onboarding && !fs.existsSync(config)) fs.writeFileSync(config, JSON.stringify({ version: 1, dbDir: null, onboarding: 'done' }));
  const app = await _electron.launch({ args: [ROOT], cwd: ROOT, env });
  const page = await app.firstWindow();
  await page.setViewportSize(size);
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dataDir };
}

/** URLs requested that were not local (recorded by main). */
export async function netLog(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => (globalThis as unknown as { __nbNetLog: string[] }).__nbNetLog);
}

export async function mockSaveDialog(app: ElectronApplication, file: string): Promise<void> {
  await app.evaluate(({ dialog }, f) => {
    (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({ canceled: false, filePath: f });
  }, file);
}

/**
 * Puts text on the app's clipboard. The tests replace Electron's clipboard with an
 * in-memory one so they never touch (or depend on) the user's real system clipboard.
 */
export async function setClipboard(app: ElectronApplication, text: string): Promise<void> {
  await app.evaluate(({ clipboard }, t) => {
    const cb = clipboard as unknown as { __mem?: boolean; readText: () => Promise<string>; writeText: (x: string) => Promise<void>; clear: () => Promise<void> };
    const g = globalThis as unknown as { __nbClip: string };
    if (!cb.__mem) {
      cb.__mem = true;
      cb.readText = async () => g.__nbClip;
      cb.writeText = async (x: string) => {
        g.__nbClip = x;
      };
      cb.clear = async () => {
        g.__nbClip = '';
      };
    }
    g.__nbClip = t;
  }, text);
}

export const cell = (page: Page, r: number, c: number) => page.locator(`#cell-${r}-${c}`);

export async function expectFlash(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByTestId('flash')).toHaveText(text);
}

/** Calls the typed bridge directly from the renderer (used only to seed layout tests). */
export async function invoke<T>(page: Page, method: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ([m, a]) => {
      const r = await (window as unknown as { notenblatt: { invoke: (m: string, a: unknown) => Promise<{ ok: boolean; value: unknown; error?: string }> } }).notenblatt.invoke(
        m as string,
        a,
      );
      if (!r.ok) throw new Error(r.error);
      return r.value;
    },
    [method, arg] as const,
  ) as Promise<T>;
}

/** Clicks an entry in the class/exam navigation, opening it first if collapsed (narrow window). */
export async function navClick(page: Page, name: string | RegExp, nth = 0): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Klassen und Prüfungen' });
  if (!(await nav.isVisible())) await page.keyboard.press('Control+b');
  await nav.getByRole('button', { name }).nth(nth).click();
}
