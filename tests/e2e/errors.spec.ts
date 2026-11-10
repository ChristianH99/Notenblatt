/**
 * Error grading: a points exam with an additional error count per student, two part grades,
 * the combined grade with the subject's points : errors weighting, and the overview.
 */
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { expectFlash, launch, navClick, netLog, SCREENSHOTS, tempDir } from './helpers';

test('error grading: part grades, combined grade, weighting and undo', async () => {
  const { app, page } = await launch(tempDir(), { width: 1440, height: 900 });

  await page.getByRole('button', { name: 'Klasse anlegen' }).click();
  await page.getByLabel('Klasse', { exact: true }).fill('9b');
  await page.getByRole('button', { name: 'Klasse anlegen' }).last().click();
  await page.getByRole('button', { name: 'Namen einfügen…' }).click();
  await page.locator('#paste-text').fill('Albers, Anna\nBrandt, Ben');
  await page.getByRole('button', { name: '2 Namen übernehmen' }).click();
  await page.getByRole('button', { name: 'Neues Fach' }).click();
  await page.getByRole('dialog', { name: 'Neues Fach' }).locator('#course-subject').fill('Englisch');
  await page.getByRole('dialog', { name: 'Neues Fach' }).getByRole('button', { name: 'Fach anlegen' }).click();

  // new points exam with error grading (the checkbox is off by default)
  await page.getByRole('tab', { name: 'Prüfungen und Schüler/innen' }).click();
  await page.getByRole('button', { name: 'Neue Prüfung' }).last().click();
  const dlg = page.getByRole('dialog', { name: 'Neue Prüfung' });
  // "Art": Klassenarbeit is the default; the arrow shows every option although a text is entered, typing filters
  const kind = dlg.locator('#ex-kind');
  await expect(kind).toHaveValue('Klassenarbeit');
  await dlg.getByRole('button', { name: 'Alle Vorschläge anzeigen' }).dispatchEvent('mousedown');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['Klassenarbeit', 'Schulaufgabe', 'Kurzarbeit', 'Stegreifaufgabe', 'Test', 'Klausur']);
  await kind.press('Escape');
  await expect(dlg).toBeVisible(); // Esc closed only the list
  await kind.fill('');
  await kind.pressSequentially('ar');
  await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['Klassenarbeit', 'Kurzarbeit']);
  await kind.press('ArrowDown');
  await kind.press('ArrowDown');
  await kind.press('Enter');
  await expect(kind).toHaveValue('Kurzarbeit');
  await expect(dlg).toBeVisible(); // Enter picked the option and did not submit
  await kind.fill('Klassenarbeit');
  const box = dlg.getByLabel('Fehlerbewertung (zusätzlich Anzahl der Fehler je Schüler/in)');
  await expect(box).not.toBeChecked();
  await box.check();
  // points per task is off by default: only the total and its maximum
  await expect(dlg.locator('#ex-pertask')).not.toBeChecked();
  await expect(dlg.locator('#ex-count')).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Prüfung anlegen' }).click();
  await expect(dlg.getByText('Bitte die Höchstpunktzahl eingeben.')).toBeVisible();
  await dlg.locator('#ex-max').fill('20');
  await dlg.getByRole('button', { name: 'Prüfung anlegen' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('#meta-errors')).toBeChecked();
  await expect(page.locator('#meta-pertask')).not.toBeChecked();
  // one points column, no separate sum column and no "add task" button
  await expect(page.locator('#cell--2-0')).toHaveText('Punkte');
  await expect(page.locator('#cell--1-0')).toHaveText('20');
  await expect(page.locator('#sum-0')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aufgabe hinzufügen' })).toHaveCount(0);

  // Albers 13 (2,7), Brandt 10 (3,5)
  await page.locator('#cell-0-0').click();
  for (const v of ['13', '10']) {
    await page.keyboard.type(v);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#pres-0')).toHaveText('2,7');
  await expect(page.locator('#pres-1')).toHaveText('3,5');
  await expect(page.locator('#res-0')).toHaveText(''); // no errors entered yet

  // errors: Albers 3,5 (2,0), Brandt 14 (6,0)
  await page.locator('#err-0').click();
  await page.keyboard.type('3,5');
  await page.keyboard.press('Enter');
  await expect(page.locator('#err-1')).toBeFocused();
  await page.keyboard.type('14');
  await page.keyboard.press('Enter');
  await expect(page.locator('#eres-0')).toHaveText('2,0');
  await expect(page.locator('#eres-1')).toHaveText('6,0');
  await expect(page.locator('#res-0')).toHaveText('2,3'); // (2,7 + 2,0) / 2 = 2,35 → truncated 2,3
  await expect(page.locator('#res-1')).toHaveText('4,7'); // (3,5 + 6,0) / 2 = 4,75 → truncated 4,7
  await expect(page.locator('#avg-pres')).toHaveText('3,10');
  await expect(page.locator('#avg-eres')).toHaveText('4,00');
  await expect(page.locator('#avg-grade')).toHaveText('3,50');
  await expect(page.getByTestId('panel').getByTestId('fig-error-weights')).toHaveText('1 : 1');
  await page.screenshot({ path: path.join(SCREENSHOTS, 'error-grading-1440x900.png') });

  // invalid input is refused; undo / redo work on the error column
  await page.locator('#err-0').click();
  await page.keyboard.type('1,25');
  await page.keyboard.press('Enter');
  await expectFlash(page, 'Fehler: nur ganze oder halbe Fehler erlaubt');
  await page.keyboard.press('Escape');
  await expect(page.locator('#err-0')).toHaveText('3,5');
  await page.keyboard.press('Control+z');
  await expect(page.locator('#err-1')).toHaveText('');
  await expect(page.locator('#res-1')).toHaveText('');
  await page.keyboard.press('Control+y');
  await expect(page.locator('#res-1')).toHaveText('4,7');

  // the weighting points : errors is set per subject: 1 : 3 → Albers (2,7 + 3·2,0) / 4 = 2,175 → 2,1
  await navClick(page, 'Englisch');
  await page.getByRole('tab', { name: 'Gewichtung' }).click();
  await page.locator('#cls-werrors').fill('3');
  await page.locator('#cls-werrors').press('Enter');
  await expect(page.getByTestId('status')).toHaveText('Gespeichert');
  // the overview shows only the combined grade
  await page.getByRole('tab', { name: 'Notenübersicht' }).click();
  await expect(page.getByTestId('overall-Albers')).toHaveText('2,10');
  // (3,5 + 3·6,0) / 4 = 5,375 → 5,3
  await expect(page.getByTestId('overall-Brandt')).toHaveText('5,30');

  expect(await netLog(app)).toEqual([]);
  await app.close();
});
