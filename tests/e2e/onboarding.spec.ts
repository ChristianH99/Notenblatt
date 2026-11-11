/**
 * First-start tour: shown on a new installation, saves name/school and the grading
 * template (incl. category and error weights), moves the database to another folder and
 * encrypts it (or keeps it unencrypted), "Überspringen" without the checkbox shows it again on the next start,
 * finishing or "Nicht mehr anzeigen" ends it for good; settings can open it again.
 * Existing installations (classes present, no tour state yet) never see it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { invoke, launch, netLog, SCREENSHOTS, tempDir } from './helpers';

const tour = (page: Page) => page.getByRole('dialog', { name: /Willkommen bei Notenblatt|Notenvorgaben prüfen|Speicherort und Verschlüsselung|Updates|So geht es los/ });
const config = (dir: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) as Record<string, unknown>;

test('tour on first start: settings saved, folder changed, encrypted, finished once and never again', async () => {
  const dir = tempDir();
  const share = tempDir('nb-share-');
  let { app, page } = await launch(dir, undefined, { onboarding: true });
  const dlg = tour(page);
  await expect(dlg).toHaveAccessibleName('Willkommen bei Notenblatt');
  await expect(dlg).toContainText('Schritt 1 von 5');
  await dlg.getByLabel('Lehrkraft').fill('Fr. Qzwx');
  await dlg.getByLabel('Schule').fill('Testschule Qzwx');
  await fs.promises.mkdir(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, 'onboarding-1.png') });
  await dlg.getByRole('button', { name: 'Weiter' }).click();

  await expect(dlg).toHaveAccessibleName('Notenvorgaben prüfen');
  await expect(dlg.getByLabel('Gewicht Schriftlich')).toHaveValue('3');
  await dlg.getByLabel('Gewicht Mündlich').fill('2');
  await dlg.getByLabel('Gewicht Mündlich').press('Tab');
  await dlg.getByLabel('Gewicht der Note aus den Fehlern').fill('2');
  await dlg.getByLabel('Gewicht der Note aus den Fehlern').press('Tab');
  await page.screenshot({ path: path.join(SCREENSHOTS, 'onboarding-2.png') });
  await dlg.locator('#onb-system').selectOption('NP15');
  await dlg.getByRole('button', { name: 'Weiter' }).click();

  // Storage: folder change, then encryption is the primary action.
  await expect(dlg).toHaveAccessibleName('Speicherort und Verschlüsselung');
  await expect(dlg.getByTestId('onb-storage-dir')).toContainText(dir);
  await expect(dlg.getByTestId('onb-storage-dir')).toContainText('(Standardordner)');
  await page.screenshot({ path: path.join(SCREENSHOTS, 'onboarding-3.png') });
  await app.evaluate(({ dialog }, d) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [d] });
  }, share);
  await dlg.getByRole('button', { name: /^Ordner ändern/ }).click();
  await expect(dlg.getByTestId('onb-storage-dir')).toHaveText(share);
  await dlg.getByLabel('Passwort').fill('kurz');
  await dlg.getByRole('button', { name: 'Verschlüsseln', exact: true }).click();
  await expect(dlg).toContainText('Mindestens 8 Zeichen.');
  await dlg.getByLabel('Passwort').fill('lehrer-2026');
  await dlg.getByLabel('Wiederholen').fill('lehrer-2026');
  await dlg.getByRole('button', { name: 'Verschlüsseln', exact: true }).click();

  await expect(dlg).toHaveAccessibleName('Updates');
  expect(fs.readFileSync(path.join(share, 'notenblatt.nbdb')).subarray(0, 7).toString('latin1')).toBe('NBLTDB1');
  expect(fs.existsSync(path.join(dir, 'notenblatt.db'))).toBe(false);
  await expect(dlg.getByLabel('Beim Start nach Updates suchen')).toBeChecked();
  await expect(dlg).not.toContainText('GitHub');
  await dlg.getByRole('button', { name: 'Zurück' }).click();
  await expect(dlg).toHaveAccessibleName('Speicherort und Verschlüsselung');
  await expect(dlg.getByTestId('onb-encrypted')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Unverschlüsselt speichern' })).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Weiter' }).click();
  await dlg.getByRole('button', { name: 'Weiter' }).click();

  await expect(dlg).toHaveAccessibleName('So geht es los');
  await expect(dlg).toContainText('Fehlerbewertung');
  await expect(dlg.getByRole('button', { name: 'Überspringen' })).toHaveCount(0);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'onboarding-4.png') });
  await dlg.getByRole('button', { name: 'Fertig' }).click();
  await expect(dlg).toHaveCount(0);

  const settings = await invoke<{ teacher: string; school: string; defaultGradingSystem: string; defaultErrorsWeightC: number; categoryTemplate: { weightC: number }[] }>(
    page,
    'settings.get',
  );
  expect(settings).toMatchObject({ teacher: 'Fr. Qzwx', school: 'Testschule Qzwx', defaultGradingSystem: 'NP15', defaultErrorsWeightC: 200 });
  expect(settings.categoryTemplate.map((c) => c.weightC)).toEqual([300, 200]);
  expect(config(dir).onboarding).toBe('done');
  expect(await netLog(app)).toEqual([]);
  await app.close();

  ({ app, page } = await launch(dir, undefined, { onboarding: true }));
  await page.locator('#gate-pw').fill('lehrer-2026');
  await page.getByRole('button', { name: 'Entsperren' }).click();
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

test('storage step: keep unencrypted; a folder with a database from another device is offered, not overwritten', async () => {
  const dir = tempDir();
  const other = tempDir('nb-other-');
  fs.writeFileSync(path.join(other, 'notenblatt.nbdb'), 'x');
  const { app, page } = await launch(dir, undefined, { onboarding: true });
  const dlg = tour(page);
  await dlg.getByRole('button', { name: 'Weiter' }).click();
  await dlg.getByRole('button', { name: 'Weiter' }).click();
  await expect(dlg).toHaveAccessibleName('Speicherort und Verschlüsselung');
  await app.evaluate(({ dialog }, d) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [d] });
  }, other);
  await dlg.getByRole('button', { name: /^Ordner ändern/ }).click();
  await expect(dlg).toContainText('In diesem Ordner liegt bereits eine Notenblatt-Datenbank');
  await expect(dlg.getByRole('button', { name: 'Diese Datenbank verwenden' })).toBeVisible();
  await expect(dlg.getByTestId('onb-storage-dir')).toContainText(dir);
  expect(fs.readFileSync(path.join(other, 'notenblatt.nbdb'), 'utf8')).toBe('x');
  await dlg.getByRole('button', { name: 'Unverschlüsselt speichern' }).click();
  await expect(dlg).toHaveAccessibleName('Updates');
  expect(fs.existsSync(path.join(dir, 'notenblatt.db'))).toBe(true);
  expect(fs.existsSync(path.join(dir, 'notenblatt.nbdb'))).toBe(false);
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
