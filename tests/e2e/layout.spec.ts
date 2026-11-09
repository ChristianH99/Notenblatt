/**
 * §9.4 step 15 / §7.4: viewport checks at 1280×720 and 1440×960 (touch mode),
 * plus screenshots of the main views.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { GOLDEN_NAMES } from '../fixtures/golden';
import { cell, invoke, launch, navClick, netLog, ROOT, SCREENSHOTS, tempDir } from './helpers';

interface ExamDataLite {
  tasks: { id: number }[];
  students: { id: number }[];
}

async function seed(page: Page): Promise<number> {
  const classId = await invoke<number>(page, 'classes.create', { name: '10b', schoolYear: '2025/26' });
  const names = Array.from({ length: 32 }, (_, i) => {
    const [l, f] = GOLDEN_NAMES[i % 20] as [string, string];
    return { lastName: i < 20 ? l : `${l}-Neumeier`, firstName: f };
  });
  await invoke(page, 'students.add', { classId, names });
  // Written in Notenpunkte; the app's default for new subjects is Noten 1–6.
  await invoke(page, 'settings.set', { key: 'defaultGradingSystem', value: 'NP15' });
  const courseId = await invoke<number>(page, 'courses.create', { classId, subject: 'Mathematik' });
  await invoke(page, 'courses.create', { classId, subject: 'Physik' });
  const examId = await invoke<number>(page, 'exams.create', {
    courseId, kind: 'Schulaufgabe', number: '1', examDate: '2025-11-20', teacher: 'Frau Huber',
    stepQp: 2, taskCount: 10, copyFromExamId: null, categoryId: null, entryMode: 'points',
  });
  let data = await invoke<ExamDataLite>(page, 'exams.get', { id: examId });
  const max = [6, 4, 8, 5, 3, 6, 4, 7, 5, 2];
  for (let i = 0; i < data.tasks.length; i++) await invoke(page, 'tasks.update', { id: data.tasks[i]?.id, maxQp: (max[i] as number) * 4 });
  data = await invoke<ExamDataLite>(page, 'exams.get', { id: examId });
  const changes: { taskId: number; studentId: number; qp: number | null }[] = [];
  data.students.forEach((s, r) => {
    data.tasks.forEach((t, c) => {
      if (r === 5 && c > 6) return; // one partial row
      const m = (max[c] as number) * 4;
      changes.push({ taskId: t.id, studentId: s.id, qp: Math.round(((r * 7 + c * 3) % 11) / 10 * m / 2) * 2 });
    });
  });
  await invoke(page, 'scores.set', { examId, changes });
  await invoke(page, 'participation.set', { examId, studentId: data.students[3]?.id, status: 'absent' });
  await invoke(page, 'settings.set', { key: 'lastExamId', value: String(examId) });
  await invoke(page, 'settings.set', { key: 'teacher', value: 'Frau Huber' });
  return examId;
}

/** No element outside the grid's own scroll area may overflow the window. */
async function assertNoOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const doc = document.documentElement;
    const bad: string[] = [];
    if (doc.scrollWidth > W || doc.scrollHeight > H) bad.push(`document ${doc.scrollWidth}x${doc.scrollHeight}`);
    const isClipped = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (['auto', 'scroll', 'hidden'].includes(o.overflowX) || ['auto', 'scroll', 'hidden'].includes(o.overflowY)) return true;
      }
      return false;
    };
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0 || isClipped(el)) continue;
      if (b.right > W + 0.5 || b.bottom > H + 0.5 || b.left < -0.5) bad.push(`${el.tagName}.${el.className} ${Math.round(b.right)}/${Math.round(b.bottom)}`);
    }
    return bad;
  });
  expect(r).toEqual([]);
}

/** Element is actually visible on top at its centre (not covered by sticky cells). */
async function onTop(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, selector);
}

async function assertStickyAfterScroll(page: Page): Promise<void> {
  // Before scrolling: result columns are pinned to the right edge, not at their natural position.
  expect(await onTop(page, '#sum-0')).toBe(true);
  expect(await onTop(page, '#res-0')).toBe(true);
  const gap = await page.evaluate(() => {
    const sc = document.querySelector('[data-testid="grid-scroller"]')!.getBoundingClientRect();
    const res = document.querySelector('#res-0')!.getBoundingClientRect();
    return Math.abs(sc.right - res.right);
  });
  expect(gap).toBeLessThan(20); // pinned right (allowing for the vertical scrollbar)
  await expect(page.locator('#sum-0')).not.toHaveText('');
  await page.getByTestId('grid-scroller').evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(100);
  const sc = await page.getByTestId('grid-scroller').evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
  expect(sc.left).toBeGreaterThan(0);
  expect(sc.top).toBeGreaterThan(0);
  // left: last row's name; right: its sum and result; top: header; bottom: footer
  expect(await onTop(page, 'tbody tr:last-child td:nth-child(2)')).toBe(true);
  expect(await onTop(page, '#sum-31')).toBe(true);
  expect(await onTop(page, '#res-31')).toBe(true);
  expect(await onTop(page, '#cell--2-9')).toBe(true);
  expect(await onTop(page, '#total-max')).toBe(true);
  expect(await onTop(page, '#avg-sum')).toBe(true);
  expect(await onTop(page, '#avg-9')).toBe(true);
  await page.getByTestId('grid-scroller').evaluate((el) => {
    el.scrollLeft = 0;
    el.scrollTop = 0;
  });
}

test.beforeAll(() => fs.mkdirSync(SCREENSHOTS, { recursive: true }));

test('1280×720 laptop: class of 32, 10 tasks fully usable', async () => {
  const dir = tempDir();
  let { app, page } = await launch(dir, { width: 1280, height: 720 });
  await page.screenshot({ path: path.join(SCREENSHOTS, 'welcome-1280x720.png') });
  await seed(page);
  await app.close();
  ({ app, page } = await launch(dir, { width: 1280, height: 720 }));
  await expect(page.locator('#sum-31')).toBeVisible();
  await expect(page.getByRole('grid').locator('tbody tr')).toHaveCount(32);
  // row height 30 px
  const h = await page.locator('tbody tr').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(h)).toBe(30);
  await assertNoOverflow(page);
  await cell(page, 0, 0).click();
  await page.screenshot({ path: path.join(SCREENSHOTS, 'exam-1280x720.png') });
  await assertStickyAfterScroll(page);
  // keyboard navigation to the last cell scrolls it into view, not under sticky columns
  for (let i = 0; i < 31; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  expect(await onTop(page, '#cell-31-9')).toBe(true);
  const setSystem = async (v: 'LIN6' | 'NP15'): Promise<void> => {
    await navClick(page, 'Mathematik');
    await page.getByRole('tab', { name: 'Gewichtung' }).click();
    await page.locator('#cls-system').selectOption(v);
    await expect(page.locator('#cls-system')).toHaveValue(v);
    await navClick(page, 'Schulaufgabe 1 · 20.11.2025');
  };
  await setSystem('LIN6');
  await expect(page.locator('#verbal-0')).not.toHaveText('');
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'exam-linear-1280x720.png') });
  await setSystem('NP15');
  // navigation overlay and class view (the overlay closes as soon as an entry is picked)
  const navOverlay = page.getByRole('navigation', { name: 'Klassen und Prüfungen' });
  await expect(navOverlay).toBeHidden();
  await page.keyboard.press('Control+b');
  await expect(navOverlay).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOTS, 'nav-overlay-1280x720.png') });
  await page.getByRole('navigation', { name: 'Klassen und Prüfungen' }).getByRole('button', { name: '10b' }).click();
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'class-1280x720.png') });
  await navClick(page, 'Mathematik');
  await expect(page.getByRole('table', { name: 'Notenübersicht' })).toBeVisible();
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'course-overview-1280x720.png') });
  await page.getByRole('tab', { name: 'Prüfungen und Schüler/innen' }).click();
  await expect(page.getByRole('table', { name: 'Schüler/innen im Fach' }).locator('tbody tr')).toHaveCount(32);
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'course-exams-1280x720.png') });
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'settings-1280x720.png') });
  // info page: version, own license, third-party licenses with full texts
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string };
  await page.getByRole('region', { name: 'Über Notenblatt' }).scrollIntoViewIfNeeded();
  await expect(page.getByTestId('app-version')).toHaveText(version === '0.0.0' ? '0.0.0 (Entwicklungsversion)' : version);
  await expect(page.getByText('Copyright © 2026 Christian Häußler')).toBeVisible();
  const licenses = page.getByTestId('third-party-licenses');
  for (const name of ['electron', 'better-sqlite3', 'react', 'react-dom', 'zod', 'zustand', 'SQLite', 'Fluent UI System Icons']) {
    await expect(licenses.getByText(name, { exact: true })).toBeVisible();
  }
  await licenses.getByText('better-sqlite3', { exact: true }).click();
  await expect(licenses.locator('details[open] pre')).toContainText('Permission is hereby granted');
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'about-1280x720.png') });
  expect(await netLog(app)).toEqual([]);
  await app.close();
});

test('1440×960 Surface with touch mode: 40 px rows, sticky columns', async () => {
  const dir = tempDir();
  let { app, page } = await launch(dir, { width: 1440, height: 960 });
  await seed(page);
  await invoke(page, 'settings.set', { key: 'touchMode', value: 'on' });
  await app.close();
  ({ app, page } = await launch(dir, { width: 1440, height: 960 }));
  await expect(page.locator('html')).toHaveClass(/touch/);
  await expect(page.locator('#sum-31')).toBeVisible();
  const h = await page.locator('tbody tr').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(Math.round(h)).toBe(40);
  // "⋯" always visible in touch mode, hit targets ≥ 40 px for toolbar buttons
  expect(await page.locator('#more-0').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  const tb = await page.getByRole('toolbar').getByRole('button').first().evaluate((el) => el.getBoundingClientRect().height);
  expect(tb).toBeGreaterThanOrEqual(40);
  // inputs ask for the numeric touch keyboard
  await cell(page, 0, 0).dblclick();
  await expect(page.locator('#cell-0-0 input')).toHaveAttribute('inputmode', 'decimal');
  await page.keyboard.press('Escape');
  await assertNoOverflow(page);
  await page.screenshot({ path: path.join(SCREENSHOTS, 'exam-touch-1440x960.png') });
  await assertStickyAfterScroll(page);
  expect(await netLog(app)).toEqual([]);
  await app.close();
});
