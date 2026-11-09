/**
 * Data safety flows through the UI: corrupted DB on start, database from a newer version,
 * backup export/import (incl. wrong password), "Alle Daten löschen".
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { expectFlash, invoke, launch, mockSaveDialog, netLog, tempDir } from './helpers';

test('corrupted DB on start: dialog, renamed file, never crashes', async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'notenblatt.db'), Buffer.alloc(16384, 0x5a));
  const { app, page } = await launch(dir);
  const dlg = page.getByRole('dialog', { name: 'Datenbank beschädigt' });
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('.defekt-');
  expect(fs.readdirSync(dir).some((f) => /^notenblatt\.db\.defekt-\d{8}-\d{6}$/.test(f))).toBe(true);
  await expect(dlg.getByRole('button', { name: 'Datensicherung wiederherstellen' })).toBeVisible();
  await dlg.getByRole('button', { name: 'Neu beginnen' }).click();
  await expect(page.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  expect(await netLog(app)).toEqual([]);
  await app.close();
});

test('database from a newer version: explained, file untouched, not treated as damaged', async () => {
  const dir = tempDir();
  const file = path.join(dir, 'notenblatt.db');
  const db = new Database(file);
  db.exec("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('Zqxwvy')");
  db.pragma('user_version = 999');
  db.close();
  const before = fs.readFileSync(file);
  const { app, page } = await launch(dir);
  await expect(page.getByRole('heading', { name: 'Neuere Notenblatt-Version erforderlich' })).toBeVisible();
  await expect(page.getByText('Die Datenbank wurde nicht verändert.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Datenbank beschädigt' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.getByRole('heading', { name: 'Neuere Notenblatt-Version erforderlich' })).toBeVisible();
  expect(await netLog(app)).toEqual([]);
  await app.close();
  expect(fs.readdirSync(dir).filter((f) => f.includes('defekt'))).toEqual([]);
  expect(fs.readFileSync(file).equals(before)).toBe(true);
});

test('backup export → wipe → import, wrong password changes nothing', async () => {
  const dir = tempDir();
  const out = tempDir('nb-bk-');
  const file = path.join(out, 'sicherung.notenblatt');
  const { app, page } = await launch(dir);
  const classId = await invoke<number>(page, 'classes.create', { name: 'Qwzyx-Klasse', schoolYear: '2025/26' });
  await invoke(page, 'students.add', { classId, names: [{ lastName: 'Zqxwvy', firstName: 'Testperson' }] });
  await page.reload();

  // export
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Datensicherung…' }).click();
  const ex = page.getByRole('dialog', { name: 'Datensicherung erstellen' });
  await expect(ex).toContainText('personenbezogene Daten');
  await ex.locator('#bk-pw').fill('kurz');
  await ex.locator('#bk-pw2').fill('kurz');
  await ex.getByRole('button', { name: 'Speichern unter…' }).click();
  await expect(ex).toContainText('mindestens 8 Zeichen');
  await ex.locator('#bk-pw').fill('geheim-123');
  await ex.locator('#bk-pw2').fill('geheim-123');
  await mockSaveDialog(app, file);
  await ex.getByRole('button', { name: 'Speichern unter…' }).click();
  await expectFlash(page, 'Datensicherung gespeichert');
  const raw = fs.readFileSync(file);
  expect(raw.subarray(0, 7).toString('latin1')).toBe('NBLTBKP');
  expect(raw.includes(Buffer.from('Zqxwvy'))).toBe(false);

  // wipe everything
  await page.getByRole('button', { name: 'Alle Daten löschen…' }).click();
  const wipe = page.getByRole('dialog', { name: 'Alle Daten löschen' });
  await expect(wipe.getByRole('button', { name: 'Endgültig löschen' })).toBeDisabled();
  await wipe.getByLabel('Geben Sie zur Bestätigung LÖSCHEN ein').fill('LÖSCHEN');
  await wipe.getByRole('button', { name: 'Endgültig löschen' }).click();
  await expect(page.getByRole('heading', { name: 'Erste Schritte' })).toBeVisible();
  expect(await invoke<unknown[]>(page, 'classes.tree')).toEqual([]);
  for (const f of ['notenblatt.db', 'notenblatt.db-wal', 'notenblatt.db-shm']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      const buf = fs.readFileSync(p);
      expect(buf.includes(Buffer.from('Zqxwvy'))).toBe(false);
      expect(buf.includes(Buffer.from('Zqxwvy', 'utf16le'))).toBe(false);
    }
  }

  // import with wrong password, then the right one
  await app.evaluate(({ dialog }, f) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [f] });
  }, file);
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Wiederherstellen…' }).click();
  const im = page.getByRole('dialog', { name: 'Datensicherung wiederherstellen' });
  await im.getByRole('button', { name: 'Datei auswählen…' }).first().click();
  await expect(im).toContainText('sicherung.notenblatt');
  await im.locator('#rs-pw').fill('falsches-passwort');
  await im.getByRole('button', { name: 'Prüfen' }).click();
  await expect(im).toContainText('Das Passwort ist falsch oder die Datei ist beschädigt.');
  expect(await invoke<unknown[]>(page, 'classes.tree')).toEqual([]);
  await im.locator('#rs-pw').fill('geheim-123');
  await im.getByRole('button', { name: 'Prüfen' }).click();
  await expect(im).toContainText('1 Klasse, 1 Schüler, 0 Prüfungen');
  await im.getByRole('button', { name: 'Alle Daten ersetzen' }).click();
  await page.keyboard.press('Control+b');
  await expect(page.getByRole('navigation', { name: 'Klassen und Prüfungen' }).getByRole('button', { name: 'Qwzyx-Klasse' })).toBeVisible();
  expect(await netLog(app)).toEqual([]);
  await app.close();
});
