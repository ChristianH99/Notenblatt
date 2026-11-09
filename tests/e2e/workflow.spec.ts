/**
 * End-to-end workflow (§9.4 steps 1–14 and 16) on a fresh, empty database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  GOLDEN_LABELS,
  GOLDEN_MAX,
  GOLDEN_NAMES,
  GOLDEN_NP_KEY_55,
  GOLDEN_RESULTS,
  GOLDEN_ROWS,
  GOLDEN_TASK_AVG,
  GOLDEN_TASK_SHARE,
} from '../fixtures/golden';
import { cell, expectFlash, invoke, launch, mockSaveDialog, navClick, netLog, setClipboard, tempDir, type App } from './helpers';

const ABSENT = [10, 17, 18];
const N_TASKS = GOLDEN_LABELS.length; // 17

async function expectGolden(page: Page): Promise<void> {
  await expect(page.locator('#total-max')).toHaveText('55');
  for (let nr = 1; nr <= 20; nr++) {
    const r = nr - 1;
    const exp = GOLDEN_RESULTS[nr];
    if (exp) {
      await expect(page.locator(`#sum-${r}`)).toHaveText(exp[0]);
      await expect(page.locator(`#res-${r}`)).toHaveText(String(exp[1]));
      const entries = GOLDEN_ROWS[nr] as string[];
      for (let c = 0; c < 8; c++) await expect(cell(page, r, c)).toHaveText(entries[c] as string);
    } else {
      await expect(page.locator(`#sum-${r}`)).toHaveText('–');
      await expect(page.locator(`#res-${r}`)).toHaveText('–');
    }
  }
  for (let c = 0; c < 8; c++) {
    await expect(page.locator(`#avg-${c}`)).toHaveText(GOLDEN_TASK_AVG[c] as string);
    await expect(page.locator(`#share-${c}`)).toHaveText(GOLDEN_TASK_SHARE[c] as string);
  }
  for (let c = 8; c < N_TASKS; c++) {
    await expect(page.locator(`#avg-${c}`)).toHaveText('');
    await expect(page.locator(`#share-${c}`)).toHaveText('');
  }
  await expect(page.locator('#avg-sum')).toHaveText('15,6');
  await expect(page.locator('#avg-grade')).toHaveText('1,94');
  // Panel
  const panel = page.getByTestId('panel');
  await expect(panel.getByTestId('count-np-3')).toHaveText('5');
  await expect(panel.getByTestId('count-np-2')).toHaveText('7');
  await expect(panel.getByTestId('count-np-1')).toHaveText('4');
  await expect(panel.getByTestId('count-np-0')).toHaveText('1');
  await expect(panel.getByTestId('count-np-15')).toHaveText('0');
  await expect(panel.getByTestId('pct-group-5')).toHaveText('94,1 %');
  await expect(panel.getByTestId('pct-group-6')).toHaveText('5,9 %');
  await expect(panel.getByTestId('fig-avg')).toHaveText('1,94 NP');
  await expect(panel.getByTestId('fig-low')).toHaveText('100 %');
  await expect(panel.getByTestId('fig-written')).toHaveText('17 / 20');
  await expect(panel.getByTestId('fig-absent')).toHaveText('3');
  for (const [np, min, max] of GOLDEN_NP_KEY_55) {
    const row = panel.locator(`tr[data-np="${np}"] td`);
    await expect(row.nth(1)).toHaveText(min);
    await expect(row.nth(2)).toHaveText(max);
  }
}

test('complete workflow on an empty database', async () => {
  const dataDir = tempDir();
  const outDir = tempDir('nb-out-');
  let a: App = await launch(dataDir);
  let { app, page } = a;

  // 1 — empty database: three numbered steps
  await expect(page.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  // Written in Notenpunkte; the app's default for new subjects is Noten 1–6.
  await invoke(page, 'settings.set', { key: 'defaultGradingSystem', value: 'NP15' });

  // 2 — create class, paste 20 names (comma and tab variants)
  await page.getByRole('button', { name: 'Klasse anlegen' }).click();
  await page.getByLabel('Klasse', { exact: true }).fill('F-A11a');
  await page.getByRole('button', { name: 'Klasse anlegen' }).last().click();
  await expect(page.getByRole('heading', { name: 'Klasse F-A11a' })).toBeVisible();
  await page.getByRole('button', { name: 'Namen einfügen…' }).click();
  const shuffled = [...GOLDEN_NAMES].reverse();
  const text = shuffled.map(([l, f], i) => (i % 3 === 0 ? `${l}\t${f}` : i % 3 === 1 ? `${l}, ${f}` : `  ${l},${f}  `)).join('\r\n') + '\r\n\r\n';
  await page.locator('#paste-text').fill(text);
  await expect(page.getByRole('table', { name: 'Vorschau' }).locator('tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: '20 Namen übernehmen' }).click();
  const list = page.getByRole('table', { name: 'Schülerliste' });
  await expect(list.locator('tbody tr')).toHaveCount(21); // + new row
  await expect(list.locator('tbody tr').nth(9).getByLabel(/^Name von/)).toHaveValue('Jäger');
  await expect(list.locator('tbody tr').nth(14).getByLabel(/^Name von/)).toHaveValue('Öztürk');

  // 3 — subject Biologie in the class, then a new exam with 8 tasks; labels and max points; add tasks 7–15 to reach M = 55
  await page.getByRole('button', { name: 'Neues Fach' }).click();
  await page.getByRole('dialog', { name: 'Neues Fach' }).locator('#course-subject').fill('Biologie');
  await page.getByRole('button', { name: 'Fach anlegen' }).click();
  await expect(page.getByRole('heading', { name: 'Biologie · Klasse F-A11a' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Schüler/innen im Fach' }).locator('tbody input:checked')).toHaveCount(20);
  await page.getByRole('button', { name: 'Neue Prüfung' }).last().click();
  await expect(page.locator('#ex-course')).toHaveValue(/\d+/);
  await expect(page.locator('#ex-course option:checked')).toHaveText('F-A11a · Biologie');
  await page.locator('#ex-kind').fill('Kurzarbeit');
  await page.locator('#ex-nr').fill('2.');
  await page.locator('#ex-date').fill('19.03.2025');
  await page.locator('#ex-count').fill('8');
  await page.getByRole('button', { name: 'Prüfung anlegen' }).click();
  await expect(cell(page, -2, 7)).toHaveText('8');
  await expect(page.getByTestId('crumb')).toHaveText('F-A11a › Biologie › Kurzarbeit 2 · 19.03.2025');
  // settings and help: a second click on the pressed header button returns to the exam
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Hilfe' }).click();
  await expect(page.getByRole('button', { name: 'Hilfe' })).toHaveAttribute('title', /zurück zur vorherigen Ansicht/);
  await page.getByRole('button', { name: 'Hilfe' }).click();
  await expect(page.getByTestId('crumb')).toHaveText('F-A11a › Biologie › Kurzarbeit 2 · 19.03.2025');
  await expect(cell(page, -2, 7)).toHaveText('8');
  for (let c = 8; c < N_TASKS; c++) {
    await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
    await expect(cell(page, -2, c)).toBeVisible();
  }
  await cell(page, -2, 0).click();
  for (let c = 0; c < N_TASKS; c++) {
    // label row → Enter moves down to the max row → Enter moves down; go back up and right.
    await page.keyboard.type(GOLDEN_LABELS[c] as string);
    await page.keyboard.press('Enter');
    await page.keyboard.type(String(GOLDEN_MAX[c]).replace('.', ','));
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowUp');
  }
  for (let c = 0; c < N_TASKS; c++) {
    await expect(cell(page, -2, c)).toHaveText(GOLDEN_LABELS[c] as string);
    await expect(cell(page, -1, c)).toHaveText(String(GOLDEN_MAX[c]));
  }
  await expect(page.locator('#total-max')).toHaveText('55');

  // 4 — enter all scores with the keyboard only; Enter moves down within a task column
  await cell(page, -1, 0).click();
  await page.keyboard.press('ArrowDown');
  for (let c = 0; c < 8; c++) {
    for (let nr = 1; nr <= 20; nr++) {
      const v = GOLDEN_ROWS[nr]?.[c];
      if (v !== undefined) await page.keyboard.type(v);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 19; i++) await page.keyboard.press('ArrowUp');
  }
  await expect(page.getByTestId('status')).toHaveText('Gespeichert');

  // 5 — three students absent; everything matches §3.6
  for (const nr of ABSENT) {
    await page.locator(`#nr-${nr - 1}`).click();
    await page.getByRole('menuitem', { name: 'Fehlt' }).click();
    await expect(page.locator(`#res-${nr - 1}`)).toHaveText('–');
  }
  await expectGolden(page);
  // partial-row marker
  await expect(page.locator('#sum-0')).toHaveAttribute('title', 'Unvollständig: 9 von 17 Aufgaben ohne Eintrag');

  // 6 — linear scheme (the grading system is set per subject, in the "Gewichtung" tab)
  const setSystem = async (v: 'LIN6' | 'NP15'): Promise<void> => {
    await page.getByTestId('crumb').getByRole('button', { name: 'Biologie' }).click();
    await page.getByRole('tab', { name: 'Gewichtung' }).click();
    await page.locator('#cls-system').selectOption(v);
    await expect(page.locator('#cls-system')).toHaveValue(v);
    await navClick(page, 'Kurzarbeit 2 · 19.03.2025');
  };
  await setSystem('LIN6');
  for (const [nr, exp] of Object.entries(GOLDEN_RESULTS)) {
    await expect(page.locator(`#res-${Number(nr) - 1}`)).toHaveText(exp[2]);
  }
  const panel = page.getByTestId('panel');
  await expect(panel.getByTestId('fig-avg')).toHaveText('4,51');
  await expect(panel.getByTestId('fig-low')).toHaveText('58,8 %');
  await expect(panel.getByTestId('count-band-5')).toHaveText('10');
  await expect(panel.getByTestId('count-band-4')).toHaveText('7');
  await expect(page.locator('#verbal-0')).toHaveText('mangelhaft');
  await setSystem('NP15');
  await expect(panel.getByTestId('fig-avg')).toHaveText('1,94 NP');

  // 7 — add, rename, move, delete tasks; undo and redo
  await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
  await expect(cell(page, -2, 17)).toHaveText('18');
  await expect(cell(page, -2, 17)).toBeFocused();
  await page.keyboard.type('Z1');
  await page.keyboard.press('Enter');
  await expect(cell(page, -2, 17)).toHaveText('Z1');
  await page.locator('#more-17').click();
  await page.getByRole('menuitem', { name: 'Nach links' }).click();
  await expect(cell(page, -2, 16)).toHaveText('Z1');
  await expect(cell(page, -2, 17)).toHaveText('15');
  await page.locator('#more-16').click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  await expect(cell(page, -2, 16)).toHaveText('15');
  await expect(cell(page, -2, 17)).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(cell(page, -2, 16)).toHaveText('Z1');
  await page.keyboard.press('Control+y');
  await expect(cell(page, -2, 17)).toHaveCount(0);
  await page.keyboard.press('Control+z'); // restore
  await expect(cell(page, -2, 16)).toHaveText('Z1');
  await page.keyboard.press('Control+z'); // move back
  await expect(cell(page, -2, 17)).toHaveText('Z1');
  await page.keyboard.press('Control+z'); // rename back
  await expect(cell(page, -2, 17)).toHaveText('18');
  await page.keyboard.press('Control+z'); // remove added task
  await expect(cell(page, -2, 17)).toHaveCount(0);
  await expect(page.locator('#total-max')).toHaveText('55');
  // a task with entries asks before deleting
  await page.locator('#more-0').click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  await expect(page.getByRole('dialog', { name: 'Aufgabe löschen' })).toContainText('17 Einträge');
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  // cell edit undo/redo
  await cell(page, 1, 0).click();
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(cell(page, 1, 0)).toHaveText('5');
  await page.keyboard.press('Control+z');
  await expect(cell(page, 1, 0)).toHaveText('4,5');
  await page.keyboard.press('Control+y');
  await expect(cell(page, 1, 0)).toHaveText('5');
  await page.keyboard.press('Control+z');
  await expect(cell(page, 1, 0)).toHaveText('4,5');

  // 8 — paste a 3×4 block (one undo step), then an invalid block (rejected completely)
  await setClipboard(app, '1\t2\t3\t1\r\n0,5\t1\t1\t2\r\n3\t4\t5\t0\r\n');
  await cell(page, 0, 8).click();
  await page.keyboard.press('Control+v');
  const block = [
    ['1', '2', '3', '1'],
    ['0,5', '1', '1', '2'],
    ['3', '4', '5', '0'],
  ];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) await expect(cell(page, r, 8 + c)).toHaveText(block[r]?.[c] as string);
  await page.keyboard.press('Control+z');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) await expect(cell(page, r, 8 + c)).toHaveText('');
  await setClipboard(app, '1\t9\r\n1\t1');
  await cell(page, 0, 8).click();
  await page.keyboard.press('Control+v');
  await expectFlash(page, /Aufgabe 8: höchstens 4 Punkte – nichts wurde übernommen/);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) await expect(cell(page, r, 8 + c)).toHaveText('');

  // 9 — value above max is rejected with a message
  await cell(page, 0, 0).click();
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  await expectFlash(page, 'Aufgabe 1.: höchstens 6 Punkte');
  await expect(cell(page, 0, 0)).toHaveText('3,5');
  await page.keyboard.type('3,25');
  await page.keyboard.press('Enter');
  await expectFlash(page, 'Nur Schritte von 0,5 erlaubt');
  await expect(cell(page, 0, 0)).toHaveText('3,5');
  await expectGolden(page);

  // 13 — PDF: file exists, non-empty, one page for a class of 20
  const pdfPath = path.join(outDir, 'exam.pdf');
  await mockSaveDialog(app, pdfPath);
  await page.getByRole('button', { name: 'Als PDF speichern…' }).click();
  await expectFlash(page, 'PDF gespeichert');
  const pdf = fs.readFileSync(pdfPath);
  expect(pdf.length).toBeGreaterThan(1000);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)?.length).toBe(1);

  // 14 — CSV byte by byte (BOM, ";" and decimal comma)
  const csvPath = path.join(outDir, 'exam.csv');
  await mockSaveDialog(app, csvPath);
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  await expectFlash(page, 'CSV-Datei gespeichert');
  const lines = [['Nr', 'Name', 'Vorname', ...GOLDEN_LABELS, 'Summe', 'Note', 'Status'].join(';')];
  GOLDEN_NAMES.forEach(([l, f], i) => {
    const nr = i + 1;
    const e = GOLDEN_ROWS[nr];
    const res = GOLDEN_RESULTS[nr];
    const values = GOLDEN_LABELS.map((_, c) => (e && c < 8 ? (e[c] as string) : ''));
    lines.push([String(nr), l, f, ...values, res ? res[0] : '', res ? String(res[1]) : '', res ? 'teilgenommen' : 'fehlt'].join(';'));
  });
  const expected = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n') + '\r\n', 'utf8')]);
  expect(fs.readFileSync(csvPath).equals(expected)).toBe(true);

  // 10 — restart: data persists, last exam reopens
  expect(await netLog(app)).toEqual([]);
  await app.close();
  a = await launch(dataDir);
  ({ app, page } = a);
  await expect(cell(page, 0, 0)).toHaveText('3,5');
  await expectGolden(page);

  // 11 — delete a student: gone from every exam, statistics updated
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click();
  await page.getByRole('menuitem', { name: 'Prüfung duplizieren' }).click();
  await expect(page.locator('#sum-0')).toHaveText('');
  await navClick(page, 'Biologie');
  await expect(page.getByRole('table', { name: 'Notenübersicht' })).toBeVisible();
  await navClick(page, 'F-A11a');
  await page.getByLabel('Albrecht, Anna auswählen').check();
  await page.getByRole('button', { name: 'Schüler/in löschen…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Schüler/in löschen' });
  await expect(dlg).toContainText('Albrecht, Anna');
  await expect(dlg).toContainText('8 Einträge in 1 Prüfung');
  await dlg.getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(page.getByRole('table', { name: 'Schülerliste' }).locator('tbody tr')).toHaveCount(20);
  await page.keyboard.press('Control+b');
  const navExams = page.getByRole('navigation', { name: 'Klassen und Prüfungen' }).locator('button', { hasText: /^Kurzarbeit 2 · / });
  await expect(navExams).toHaveCount(2);
  await page.keyboard.press('Escape');
  for (let i = 0; i < 2; i++) {
    await navClick(page, /^Kurzarbeit 2 · /, i);
    await expect(page.getByRole('grid').locator('tbody tr')).toHaveCount(19);
    await expect(page.getByRole('grid')).not.toContainText('Albrecht');
  }
  await navClick(page, 'Kurzarbeit 2 · 19.03.2025');
  await expect(page.getByTestId('fig-written')).toHaveText('16 / 19');
  await expect(page.locator('#sum-0')).toHaveText('17');

  // 12 — delete the class
  await navClick(page, 'F-A11a');
  await page.getByRole('button', { name: 'Klasse löschen…' }).click();
  const del = page.getByRole('dialog', { name: 'Klasse löschen' });
  await expect(del).toContainText('19 Schüler/innen');
  await expect(del).toContainText('1 Fach');
  await expect(del).toContainText('2 Prüfungen');
  await expect(del.getByRole('button', { name: 'Endgültig löschen' })).toBeDisabled();
  await del.getByLabel(/Klassennamen/).fill('F-A11a');
  await del.getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(page.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  await page.keyboard.press('Control+b');
  await expect(page.getByText('Noch keine Klassen angelegt.')).toBeVisible();

  // 16 — no network request other than local app content during the whole run
  expect(await netLog(app)).toEqual([]);
  await app.close();

  // Physical erasure: the deleted names are not in the DB files.
  for (const f of ['notenblatt.db', 'notenblatt.db-wal', 'notenblatt.db-shm']) {
    const p = path.join(dataDir, f);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    expect(buf.includes(Buffer.from('Albrecht'))).toBe(false);
    expect(buf.includes(Buffer.from('Thaler'))).toBe(false);
  }
});
