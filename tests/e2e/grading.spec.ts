/**
 * Weighted grading across written (points) and oral (mark-only) exams, per-subject weights,
 * subjects of one class kept apart, template for new subjects, database encryption and a
 * custom storage folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectFlash, launch, navClick, netLog, SCREENSHOTS, tempDir } from './helpers';

const SHOT = (name: string): string => path.join(SCREENSHOTS, name);

async function openCourseTab(page: Page, subject: string, tab: string): Promise<void> {
  await navClick(page, subject);
  await page.getByRole('tab', { name: tab }).click();
}

async function newCourse(page: Page, subject: string): Promise<void> {
  await page.getByRole('button', { name: 'Neues Fach' }).click();
  const dlg = page.getByRole('dialog', { name: 'Neues Fach' });
  await dlg.locator('#course-subject').fill(subject);
  await dlg.getByRole('button', { name: 'Fach anlegen' }).click();
  await expect(dlg).toBeHidden();
}

async function newExam(page: Page, opts: { category: string; kind?: string; count?: string }): Promise<void> {
  const dlg = page.getByRole('dialog', { name: 'Neue Prüfung' });
  await expect(dlg).toBeVisible();
  const label = await dlg.locator('#ex-cat option', { hasText: opts.category }).first().textContent();
  await dlg.locator('#ex-cat').selectOption({ label: label ?? '' });
  if (opts.kind) await dlg.locator('#ex-kind').fill(opts.kind);
  if (opts.count) await dlg.locator('#ex-count').fill(opts.count);
  await dlg.getByRole('button', { name: 'Prüfung anlegen' }).click();
  await expect(dlg).toBeHidden();
}

test('weighted overall average, per-subject weights, encryption and custom folder', async () => {
  const dataDir = tempDir();
  const share = tempDir('nb-share-');
  let { app, page } = await launch(dataDir, { width: 1440, height: 900 });

  // class with three students
  await page.getByRole('button', { name: 'Klasse anlegen' }).click();
  await page.getByLabel('Klasse', { exact: true }).fill('9c');
  await page.getByRole('button', { name: 'Klasse anlegen' }).last().click();
  await page.getByRole('button', { name: 'Namen einfügen…' }).click();
  await page.locator('#paste-text').fill('Conrad, Clara\nAlbers, Anna\nBrandt, Ben');
  await page.getByRole('button', { name: '3 Namen übernehmen' }).click();
  await newCourse(page, 'Physik');
  await expect(page.getByRole('heading', { name: 'Physik · Klasse 9c' })).toBeVisible();

  // weighting of the subject comes from the template: Schriftlich ×3, Mündlich ×1
  await page.getByRole('tab', { name: 'Gewichtung' }).click();
  const cats = page.getByRole('table', { name: 'Kategorien des Fachs' });
  await expect(cats.locator('tbody tr')).toHaveCount(2);
  await expect(cats.getByLabel('Gewicht von Schriftlich')).toHaveValue('3');
  await expect(cats.getByLabel('Gewicht von Mündlich')).toHaveValue('1');
  await expect(cats.locator('tr[data-category="Schriftlich"]')).toContainText('75 %');

  // written exam with points: 1 task, max 15
  await page.getByRole('tab', { name: 'Prüfungen und Schüler/innen' }).click();
  await page.getByRole('button', { name: 'Neue Prüfung' }).last().click();
  await newExam(page, { category: 'Schriftlich', count: '1' });
  await page.locator('#cell--1-0').click();
  await page.keyboard.type('15');
  await page.keyboard.press('Enter');
  for (const v of ['15', '6']) {
    await page.keyboard.type(v);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#res-0')).toHaveText('15'); // Albers
  await expect(page.locator('#res-1')).toHaveText('3'); // Brandt 6/15
  // Conrad: only the total is known → type it into the sum cell
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#sum-2')).toBeFocused();
  await page.keyboard.type('12');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sum-2')).toHaveText('12');
  await expect(page.locator('#res-2')).toHaveText('11'); // 12/15
  await expect(page.locator('#sum-2')).toHaveAttribute('aria-label', 'Summe direkt eingetragen: 12');
  // the task cells of that row are locked until the sum is cleared
  await expect(page.locator('#cell-2-0')).toHaveAttribute('aria-readonly', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('5');
  await expectFlash(page, /Für Conrad, Clara ist die Summe direkt eingetragen/);
  await expect(page.locator('#cell-2-0')).toHaveText('');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Delete');
  await expect(page.locator('#sum-2')).toHaveText('');
  await expect(page.locator('#cell-2-0')).not.toHaveAttribute('aria-readonly', 'true');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#sum-2')).toHaveText('12');
  await expect(page.locator('#res-2')).toHaveText('11');
  await page.screenshot({ path: SHOT('direct-sum-1440x900.png') });

  // oral marks: from the overview, "Note „Mündlich“ eintragen" preselects subject, category and mode
  await openCourseTab(page, 'Physik', 'Notenübersicht');
  await page.getByRole('button', { name: 'Note „Mündlich“ eintragen' }).click();
  const dlg = page.getByRole('dialog', { name: 'Neue Prüfung' });
  await expect(dlg.locator('#ex-course option:checked')).toHaveText('9c · Physik');
  await expect(dlg.getByLabel('Nur Note (z. B. mündlich)')).toBeChecked();
  await expect(dlg.locator('#ex-count')).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Prüfung anlegen' }).click();
  await expect(page.getByRole('grid', { name: 'Notentabelle' })).toBeVisible();
  await page.locator('#mark-0').click();
  await page.keyboard.type('16');
  await page.keyboard.press('Enter');
  await expectFlash(page, 'Bitte Notenpunkte von 0 bis 15 (ganze Zahl) eingeben');
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  await page.keyboard.type('12');
  await page.keyboard.press('Enter');
  await expect(page.locator('#mark-0')).toHaveText('9');
  await expect(page.locator('#mark-1')).toHaveText('12');
  await expect(page.locator('#avg-grade')).toHaveText('10,50');
  await page.screenshot({ path: SHOT('oral-marks-1440x900.png') });
  await page.keyboard.press('Control+z');
  await expect(page.locator('#mark-1')).toHaveText('');
  await page.keyboard.press('Control+y');
  await expect(page.locator('#mark-1')).toHaveText('12');

  await openCourseTab(page, 'Physik', 'Notenübersicht');
  await page.getByRole('button', { name: 'Note „Mündlich“ eintragen' }).click();
  await page.getByRole('dialog', { name: 'Neue Prüfung' }).getByRole('button', { name: 'Prüfung anlegen' }).click();
  await page.locator('#mark-0').click();
  await page.keyboard.type('13');
  await page.keyboard.press('Enter');

  // a second subject of the same class: its marks never mix into Physik; Brandt does not take it
  await navClick(page, '9c');
  await newCourse(page, 'Chemie');
  await page.getByLabel('Brandt, Ben nimmt am Fach teil').uncheck();
  await expect(page.getByLabel('Brandt, Ben nimmt am Fach teil')).not.toBeChecked();
  await expect(page.getByText('2 von 3 Schüler/innen')).toBeVisible();
  await page.getByRole('button', { name: 'Neue Prüfung' }).last().click();
  await expect(page.locator('#ex-course option:checked')).toHaveText('9c · Chemie');
  await newExam(page, { category: 'Mündlich' });
  await expect(page.getByRole('grid', { name: 'Notentabelle' }).locator('tbody tr')).toHaveCount(2);
  await page.locator('#mark-0').click();
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('crumb')).toHaveText(/^9c › Chemie › Mündliche Note/);
  await openCourseTab(page, 'Chemie', 'Notenübersicht');
  await expect(page.getByRole('table', { name: 'Notenübersicht' }).locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('overall-Albers')).toHaveText('1,00');
  await expect(page.getByTestId('overall-Brandt')).toHaveCount(0);

  // overview (every exam weighted with its category): Albers (3·15 + 9 + 13)/5 = 13,40 · Brandt (3·3 + 12)/4 = 5,25 · Conrad 11
  await openCourseTab(page, 'Physik', 'Notenübersicht');
  const ov = page.getByRole('table', { name: 'Notenübersicht' });
  await expect(ov.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('overall-Albers')).toHaveText('13,40');
  await expect(page.getByTestId('overall-Brandt')).toHaveText('5,25');
  await expect(page.getByTestId('overall-Conrad')).toHaveText('11,00');
  // final mark, rounded "kaufmännisch" (template default)
  await expect(page.getByTestId('final-Albers')).toHaveText('13');
  await expect(page.getByTestId('final-Brandt')).toHaveText('5');
  await expect(page.getByTestId('final-Conrad')).toHaveText('11');
  await page.screenshot({ path: SHOT('overview-1440x900.png') });
  await expect(ov.locator('tr[data-student="Albers"] td')).toContainText(['1', 'Albers', 'Anna', '15', '9', '13', '15,00', '11,00', '13,40', '13']);

  // change the weighting of the subject: Mündlich ×3 → Albers (45 + 27 + 39)/9 = 12,33, Brandt (9 + 36)/6 = 7,50 → Endnote 8
  await page.getByRole('tab', { name: 'Gewichtung' }).click();
  await page.getByLabel('Gewicht von Mündlich').fill('3');
  await page.getByLabel('Gewicht von Mündlich').press('Enter');
  await expect(page.getByRole('table', { name: 'Kategorien des Fachs' }).locator('tr[data-category="Mündlich"]')).toContainText('50 %');
  await page.screenshot({ path: SHOT('weighting-1440x900.png') });
  await page.getByRole('tab', { name: 'Notenübersicht' }).click();
  await expect(page.getByTestId('overall-Albers')).toHaveText('12,33');
  await expect(page.getByTestId('overall-Brandt')).toHaveText('7,50');
  await expect(page.getByTestId('final-Albers')).toHaveText('12');
  await expect(page.getByTestId('final-Brandt')).toHaveText('8');
  // no final mark → column disappears
  await page.getByRole('tab', { name: 'Gewichtung' }).click();
  await page.locator('#cls-rounding').selectOption('none');
  await page.getByRole('tab', { name: 'Notenübersicht' }).click();
  await expect(page.getByTestId('final-Albers')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Gewichtung' }).click();
  await page.locator('#cls-rounding').selectOption('half_up');
  // the grading system cannot change while oral marks exist
  await page.locator('#cls-system').selectOption('LIN6');
  await expectFlash(page, /Das Notensystem kann nicht geändert werden: In „Mündliche Note · Physik · .*“ sind bereits Noten eingetragen/);
  await expect(page.locator('#cls-system')).toHaveValue('NP15');

  // the other subject of the class keeps its own weighting
  await openCourseTab(page, 'Chemie', 'Gewichtung');
  await expect(page.getByLabel('Gewicht von Mündlich')).toHaveValue('1');
  await expect(page.locator('#cls-rounding')).toHaveValue('half_up');

  // template change in the settings affects only NEW subjects
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  const tpl = page.getByRole('table', { name: 'Kategorien der Vorlage' });
  await tpl.getByLabel('Gewicht von Mündlich').fill('2');
  await tpl.getByLabel('Gewicht von Mündlich').press('Enter');
  await expect(page.getByTestId('status')).toHaveText('Gespeichert');
  await openCourseTab(page, 'Physik', 'Gewichtung');
  await expect(page.getByLabel('Gewicht von Mündlich')).toHaveValue('3');
  const nav = page.getByRole('navigation', { name: 'Klassen und Prüfungen' });
  if (!(await nav.isVisible())) await page.keyboard.press('Control+b');
  await nav.getByRole('button', { name: 'Neue Klasse' }).click();
  await page.getByLabel('Klasse', { exact: true }).fill('10a');
  await page.getByRole('button', { name: 'Klasse anlegen' }).last().click();
  await newCourse(page, 'Englisch');
  await page.getByRole('tab', { name: 'Gewichtung' }).click();
  await expect(page.getByLabel('Gewicht von Mündlich')).toHaveValue('2');
  await expect(page.getByLabel('Gewicht von Schriftlich')).toHaveValue('3');

  // encryption
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Mit Passwort verschlüsseln…' }).click();
  const enc = page.getByRole('dialog', { name: 'Datenbank verschlüsseln' });
  await expect(enc).toContainText('Wenn Sie das Passwort vergessen, sind alle Daten verloren.');
  await enc.locator('#enc-pw').fill('lehrer-2026');
  await enc.locator('#enc-pw2').fill('lehrer-2026');
  await enc.getByRole('button', { name: 'Verschlüsseln' }).click();
  await expect(enc).toBeHidden();
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByTestId('storage-encryption')).toHaveText(/^An/);
  expect(fs.existsSync(path.join(dataDir, 'notenblatt.db'))).toBe(false);
  const enc1 = fs.readFileSync(path.join(dataDir, 'notenblatt.nbdb'));
  expect(enc1.subarray(0, 7).toString('latin1')).toBe('NBLTDB1');
  expect(enc1.includes(Buffer.from('Albers'))).toBe(false);

  // move the (encrypted) database to another folder, e.g. a network share
  await app.evaluate(({ dialog }, d) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [d] });
  }, share);
  await page.getByRole('button', { name: 'Speicherort ändern…' }).click();
  const loc = page.getByRole('dialog', { name: 'Speicherort der Datenbank' });
  await loc.getByRole('button', { name: 'Ordner wählen…' }).click();
  await loc.getByRole('button', { name: 'Daten in diesen Ordner verschieben' }).click();
  await expect(loc).toBeHidden();
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByTestId('storage-dir')).toHaveText(share);
  await page.screenshot({ path: SHOT('settings-storage-1440x900.png') });
  expect(fs.existsSync(path.join(share, 'notenblatt.nbdb'))).toBe(true);
  expect(fs.existsSync(path.join(share, 'notenblatt.nbdb.lock'))).toBe(true);
  expect(fs.existsSync(path.join(dataDir, 'notenblatt.nbdb'))).toBe(false);
  expect(fs.readFileSync(path.join(share, 'notenblatt.nbdb')).includes(Buffer.from('Albers'))).toBe(false);
  expect(await netLog(app)).toEqual([]);
  await app.close();
  expect(fs.existsSync(path.join(share, 'notenblatt.nbdb.lock'))).toBe(false);

  // restart: password prompt, wrong password rejected, data from the share after unlocking
  ({ app, page } = await launch(dataDir, { width: 1440, height: 900 }));
  await expect(page.getByRole('heading', { name: 'Datenbank entsperren' })).toBeVisible();
  await page.screenshot({ path: SHOT('unlock-1440x900.png') });
  await page.locator('#gate-pw').fill('falsch-falsch');
  await page.getByRole('button', { name: 'Entsperren' }).click();
  await expect(page.getByText('Das Passwort ist falsch oder die Datei ist beschädigt.')).toBeVisible();
  await page.locator('#gate-pw').fill('lehrer-2026');
  await page.getByRole('button', { name: 'Entsperren' }).click();
  await openCourseTab(page, 'Physik', 'Notenübersicht');
  await expect(page.getByTestId('overall-Albers')).toHaveText('12,33'); // Mündlich ×3 since the weighting change
  expect(await netLog(app)).toEqual([]);
  await app.close();

  // share not reachable → clear message, option to use the local default folder
  fs.renameSync(share, `${share}-offline`);
  ({ app, page } = await launch(dataDir, { width: 1440, height: 900 }));
  await expect(page.getByRole('heading', { name: 'Speicherort nicht verfügbar' })).toBeVisible();
  fs.renameSync(`${share}-offline`, share);
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('heading', { name: 'Datenbank entsperren' })).toBeVisible();
  await app.close();
});
