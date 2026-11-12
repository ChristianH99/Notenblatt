/**
 * Screenshots for the website (site/): seeds three school years of invented data, opens the
 * real app and saves cropped views as WebP (1x and 2x) to site/assets/screens/.
 * Run with `npm run site:screenshots`; the files are committed, the pages build never runs this.
 */
import fs from 'node:fs';
import path from 'node:path';
import { _electron, expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { invoke, navClick, ROOT, tempDir } from '../e2e/helpers';
import { seed, type Seeded } from './data';

const OUT = path.join(ROOT, 'site', 'assets', 'screens');
const SCALE = 2;
type Clip = { x: number; y: number; width: number; height: number };
const MANIFEST = path.join(OUT, 'screens.json');
/**
 * Sizes of the screenshots, written together with each image: a run that fails halfway leaves
 * every image next to its correct size (the site build reads width/height/srcset from here).
 */
const manifest: Record<string, { width: number; height: number }> = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
/** Requested window size (the real one can be a pixel larger after rounding). */
let win = { width: 0, height: 0 };

/** PNG (at SCALE) → name.webp (2x) and name-1x.webp, encoded by Chromium in the app window. */
async function save(page: Page, name: string, png: Buffer): Promise<void> {
  const out = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const enc = (w: number, h: number): string => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/webp', 0.86).split(',')[1] as string;
    };
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    return { w, h, x2: enc(w, h), x1: enc(Math.round(w / 2), Math.round(h / 2)) };
  }, png.toString('base64'));
  fs.writeFileSync(path.join(OUT, `${name}.webp`), Buffer.from(out.x2, 'base64'));
  fs.writeFileSync(path.join(OUT, `${name}-1x.webp`), Buffer.from(out.x1, 'base64'));
  manifest[name] = { width: Math.round(out.w / SCALE), height: Math.round(out.h / SCALE) };
  taken.add(name);
  writeManifest();
}

/** Screenshots taken in this run; after a complete run, all others are removed. */
const taken = new Set<string>();

function writeManifest(): void {
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Drops screenshots this test no longer takes (entry and files), so none linger unnoticed. */
function removeStale(): void {
  for (const name of Object.keys(manifest)) {
    if (taken.has(name)) continue;
    delete manifest[name];
    for (const file of [`${name}.webp`, `${name}-1x.webp`]) fs.rmSync(path.join(OUT, file), { force: true });
  }
  writeManifest();
}

async function shot(page: Page, name: string, target?: Locator | Clip): Promise<void> {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  let png: Buffer;
  if (!target) png = await page.screenshot({ clip: { x: 0, y: 0, ...win } });
  else if ('screenshot' in target) png = await target.screenshot();
  else png = await page.screenshot({ clip: target });
  await save(page, name, png);
}

/**
 * Window size in CSS pixels. Set on the BrowserWindow, not with setViewportSize: viewport
 * emulation would reset the device scale factor to 1.
 */
async function resize(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  win = { width, height };
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]?.setContentSize(w as number, h as number), [width, height]);
  // Windows may round the size by a pixel when converting to physical pixels.
  await expect
    .poll(async () => {
      const [w, h, dpr] = await page.evaluate(() => [window.innerWidth, window.innerHeight, window.devicePixelRatio]);
      return Math.abs((w as number) - width) <= 1 && Math.abs((h as number) - height) <= 1 && dpr === SCALE;
    })
    .toBe(true);
}

async function box(l: Locator): Promise<Clip> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no bounding box');
  return b;
}

test('website screenshots', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dataDir = tempDir('nb-site-');
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ version: 1, dbDir: null, onboarding: 'done' }));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE' && !k.startsWith('NOTENBLATT_')) env[k] = v;
  env.NOTENBLATT_USER_DATA = dataDir;
  env.NOTENBLATT_E2E = '1';
  const app = await _electron.launch({ args: [`--force-device-scale-factor=${SCALE}`, ROOT], cwd: ROOT, env });
  try {
    await takeScreenshots(app);
    removeStale(); // only after a complete run: a failed one keeps everything it did not retake
  } finally {
    await app.close();
  }
});

async function takeScreenshots(app: ElectronApplication): Promise<void> {
  let page = await app.firstWindow();
  await resize(app, page, 1440, 900);
  await page.waitForLoadState('domcontentloaded');

  const s: Seeded = await seed(page);
  await invoke(page, 'settings.set', { key: 'lastExamId', value: String(s.heroExam) });
  await page.reload();
  page = await app.firstWindow();
  await expect(page.getByTestId('panel')).toBeVisible();

  // 1 — hero: the exam grid with the evaluation panel, whole window.
  await page.locator('#cell-0-0').click();
  await shot(page, 'exam-grid');

  // 2 — evaluation panel (grade key, figures, chart), taller window so it fits.
  await resize(app, page, 1440, 1300);
  const panel = await box(page.getByTestId('panel'));
  const keyBtn = await box(page.getByTestId('panel').getByRole('button', { name: 'Vollständigen Schlüssel anzeigen' }));
  await shot(page, 'panel', { ...panel, height: keyBtn.y + keyBtn.height + 16 - panel.y });
  await resize(app, page, 1440, 900);

  // 3 — the grid alone: points per task, totals, grades.
  await shot(page, 'grid', page.getByTestId('grid-scroller'));

  // 5 — error grading (5a Deutsch, Diktat).
  await invoke(page, 'settings.set', { key: 'lastExamId', value: String(s.errorExam) });
  await page.reload();
  await expect(page.getByTestId('panel')).toBeVisible();
  await shot(page, 'error-grading', page.getByTestId('grid-scroller'));

  // 7 — grade overview of a complete school year (9b Englisch 2025/26).
  await resize(app, page, 1440, 900);
  await navClick(page, /^9b/);
  await navClick(page, /^Englisch/, 2); // order in the tree: 10b, Q11, 9b, 8b
  await page.getByRole('tab', { name: 'Notenübersicht' }).click();
  // Same table scrolled to the end: weighted averages and final mark.
  await page.locator('main table').first().evaluate((t) => {
    for (let p = t.parentElement; p; p = p.parentElement) {
      if (p.scrollWidth > p.clientWidth + 1) {
        p.scrollLeft = p.scrollWidth;
        return;
      }
    }
  });
  await shot(page, 'overview-final');

  // 8 — weighting tab: the settings block of the subject.
  await page.getByRole('tab', { name: 'Gewichtung' }).click();
  // From the first setting down to "Kategorie hinzufügen", as wide as the category table.
  const first = await box(page.locator('main').getByText('Notensystem', { exact: true }).first());
  const table = await box(page.locator('main table').filter({ hasText: 'Kategorie' }).first());
  const addCat = await box(page.getByRole('button', { name: 'Kategorie hinzufügen' }));
  const left = table.x - 16;
  const top = first.y - 16;
  await shot(page, 'weighting', { x: left, y: top, width: table.x + table.width + 16 - left, height: addCat.y + addCat.height + 16 - top });

  // 8b — paste names (two columns from Excel/ASV) and a new exam that copies a task structure.
  await navClick(page, /^10b/);
  await page.getByRole('button', { name: 'Namen einfügen…' }).click();
  const paste = page.getByRole('dialog');
  await paste.locator('textarea').fill(['Neumann\tJulia', 'Okafor\tDaniel', 'Petrović\tMila', 'Richter\tTom', 'Sommer\tLaura'].join('\n'));
  await shot(page, 'paste-names', paste);
  await page.keyboard.press('Escape');
  await expect(paste).toBeHidden();
  await page.getByRole('button', { name: 'Neue Prüfung' }).click();
  const newExam = page.getByRole('dialog');
  // A make-up exam for the student who missed Schulaufgabe 1: same tasks, same maximum points.
  await newExam.locator('#ex-course').selectOption(String(s.weightingCourse));
  await newExam.locator('#ex-kind').fill('Nachholschulaufgabe');
  await newExam.locator('#ex-nr').fill('1');
  await newExam.locator('#ex-pertask').check();
  await newExam.getByText('Struktur übernehmen von…').click();
  await newExam.locator('#ex-source').selectOption(String(s.heroExam));
  await shot(page, 'new-exam', newExam);
  await page.keyboard.press('Escape');
  await expect(newExam).toBeHidden();

  // 9 — settings: storage and encryption. The real (temporary) path is replaced by a typical
  // school home drive, so no local user name ends up on the website.
  await invoke(page, 'storage.enableEncryption', { password: 'Beispiel-Passwort-2026' });
  await page.reload();
  await resize(app, page, 1440, 900);
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByTestId('storage-encryption')).toContainText('AES-256');
  await page.getByTestId('storage-dir').evaluate((el) => {
    el.textContent = String.raw`H:\Notenblatt`;
  });
  const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Speicherort und Verschlüsselung' }) });
  await shot(page, 'settings-storage', section);
  const template = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Vorlage für neue Fächer' }) });
  await template.scrollIntoViewIfNeeded();
  await shot(page, 'settings-template', template);
}
