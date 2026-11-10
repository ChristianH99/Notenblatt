/**
 * First-start tour: shown on a new installation, saves name/school and the grading
 * template, "Überspringen" without the checkbox shows it again on the next start,
 * finishing or "Nicht mehr anzeigen" ends it for good; settings can open it again.
 * Existing installations (classes present, no tour state yet) never see it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { invoke, launch, netLog, SCREENSHOTS, tempDir } from './helpers';

const tour = (page: Page) => page.getByRole('dialog', { name: /Willkommen bei Notenblatt|Notenvorgaben prüfen|Updates|So geht es los/ });
const config = (dir: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) as Record<string, unknown>;

test('tour on first start: settings saved, finished once and never again', async () => {
  const dir = tempDir();
  let { app, page } = await launch(dir, undefined, { onboarding: true });
  const dlg = tour(page);
  await expect(dlg).toHaveAccessibleName('Willkommen bei Notenblatt');
  await expect(dlg).toContainText('Schritt 1 von 4');
  await dlg.getByLabel('Lehrkraft').fill('Fr. Qzwx');
  await dlg.getByLabel('Schule').fill('Testschule Qzwx');
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, 'onboarding-1.png') });
  await dlg.getByRole('button', { name: 'Weiter' }).click();

  await expect(dlg).toHaveAccessibleName('Notenvorgaben prüfen');
  await expect(dlg).toContainText('Schriftlich ×3');
  await dlg.locator('#onb-system').selectOption('NP15');
  await dlg.getByRole('button', { name: 'Weiter' }).click();

  await expect(dlg).toHaveAccessibleName('Updates');
  await expect(dlg.getByLabel('Beim Start nach Updates suchen')).toBeChecked();
  await dlg.getByRole('button', { name: 'Zurück' }).click();
  await expect(dlg).toHaveAccessibleName('Notenvorgaben prüfen');
  await dlg.getByRole('button', { name: 'Weiter' }).click();
  await dlg.getByRole('button', { name: 'Weiter' }).click();

  await expect(dlg).toHaveAccessibleName('So geht es los');
  await expect(dlg).toContainText('Fehlerbewertung');
  await expect(dlg.getByRole('button', { name: 'Überspringen' })).toHaveCount(0);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'onboarding-4.png') });
  await dlg.getByRole('button', { name: 'Fertig' }).click();
  await expect(dlg).toHaveCount(0);

  const settings = await invoke<{ teacher: string; school: string; defaultGradingSystem: string }>(page, 'settings.get');
  expect(settings).toMatchObject({ teacher: 'Fr. Qzwx', school: 'Testschule Qzwx', defaultGradingSystem: 'NP15' });
  expect(config(dir).onboarding).toBe('done');
  expect(await netLog(app)).toEqual([]);
  await app.close();

  ({ app, page } = await launch(dir, undefined, { onboarding: true }));
  await expect(page.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  await expect(tour(page)).toHaveCount(0);

  // Settings → "Einführung anzeigen" opens it again.
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Einführung anzeigen' }).click();
  await expect(tour(page)).toHaveAccessibleName('Willkommen bei Notenblatt');
  await expect(tour(page).getByLabel('Lehrkraft')).toHaveValue('Fr. Qzwx');
  await tour(page).getByLabel('Nicht mehr anzeigen').check();
  await tour(page).getByRole('button', { name: 'Überspringen' }).click();
  await expect(tour(page)).toHaveCount(0);
  await app.close();
});

test('skip: without the checkbox the tour returns, with it (or Esc + checkbox) it does not', async () => {
  const dir = tempDir();
  let { app, page } = await launch(dir, undefined, { onboarding: true });
  await tour(page).getByRole('button', { name: 'Überspringen' }).click();
  await expect(tour(page)).toHaveCount(0);
  expect(config(dir).onboarding).toBe('pending');
  await app.close();

  // Still shown although the database is no longer empty: the decision was made on the first start.
  ({ app, page } = await launch(dir, undefined, { onboarding: true }));
  await expect(tour(page)).toBeVisible();
  await invoke(page, 'classes.create', { name: 'Qwz-7a', schoolYear: '2025/26' });
  await tour(page).getByLabel('Nicht mehr anzeigen').check();
  await page.keyboard.press('Escape');
  await expect(tour(page)).toHaveCount(0);
  expect(config(dir).onboarding).toBe('done');
  await app.close();

  ({ app, page } = await launch(dir, undefined, { onboarding: true }));
  await expect(page.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  await app.close();
});

test('existing installation with classes: no tour after updating', async () => {
  const dir = tempDir();
  let { app, page } = await launch(dir);
  await invoke(page, 'classes.create', { name: 'Qwz-8b', schoolYear: '2025/26' });
  await app.close();
  // Simulate config.json of a version without the tour.
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ version: 1, dbDir: null }));

  ({ app, page } = await launch(dir, undefined, { onboarding: true }));
  await expect(page.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  expect(config(dir).onboarding).toBe('done');
  await app.close();
});
