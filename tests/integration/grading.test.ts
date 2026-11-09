import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbManager } from '../../src/main/db/manager';
import { openDatabase } from '../../src/main/db/files';
import { parseCategoryTemplate, UserError, type Repo } from '../../src/main/db/repo';
import { MIGRATIONS } from '../../src/main/db/schema';
import { buildOverview, formatAvg } from '@shared/overview';
import type { NewExamInput } from '@shared/types';

let dir: string;
let mgr: DbManager;
let repo: Repo;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-gr-'));
  mgr = new DbManager(dir, { logN: 12, heartbeatMs: 3_600_000 });
  repo = mgr.open();
  // These tests are written in Notenpunkte; the app's defaults for new subjects are Noten 1–6 with one decimal.
  repo.setSetting('defaultGradingSystem', 'NP15');
  repo.setSetting('defaultRoundingDigits', '0');
});
afterEach(() => {
  mgr.shutdown(false);
  fs.rmSync(dir, { recursive: true, force: true });
});

const exam = (courseId: number, over: Partial<NewExamInput> = {}): NewExamInput => ({
  courseId, kind: 'Schulaufgabe', number: '1', examDate: '2025-10-01', teacher: '',
  stepQp: 2, taskCount: 1, copyFromExamId: null, categoryId: null, entryMode: 'points', ...over,
});

/** A class with one subject ("Deutsch"): cls = class id (students), c = course id (exams, grading). */
const mk = (name: string, subject = 'Deutsch'): { cls: number; c: number } => {
  const cls = repo.createClass(name, '2025/26');
  return { cls, c: repo.createCourse(cls, subject) };
};

describe('migration from schema version 1', () => {
  it('adds categories to existing classes and assigns existing exams', () => {
    const f = path.join(dir, 'v1.db');
    const db = new Database(f);
    db.exec(MIGRATIONS[0] as string);
    db.pragma('user_version = 1');
    db.prepare("INSERT INTO school_class(id, name, school_year) VALUES (1, 'Alt', '2024/25')").run();
    db.prepare("INSERT INTO exam(id, class_id, kind, subject, exam_date, scheme) VALUES (1, 1, 'Test', 'Bio', '2025-01-01', 'LIN6')").run();
    db.close();
    const m = openDatabase(f);
    // Migration 4 turns the class's subject "Bio" into a course that carries the categories and the system.
    expect(m.prepare('SELECT id, class_id, subject, grading_system FROM course').all()).toEqual([{ id: 1, class_id: 1, subject: 'Bio', grading_system: 'LIN6' }]);
    const cats = m.prepare('SELECT name, weight_c, default_mode FROM grade_category WHERE course_id = 1 ORDER BY position').all();
    expect(cats).toEqual([
      { name: 'Schriftlich', weight_c: 300, default_mode: 'points' },
      { name: 'Mündlich', weight_c: 100, default_mode: 'grade' },
    ]);
    const e = m.prepare('SELECT e.entry_mode, e.course_id, c.name FROM exam e JOIN grade_category c ON c.id = e.category_id').get();
    expect(e).toEqual({ entry_mode: 'points', course_id: 1, name: 'Schriftlich' });
    m.close();
  });
});

describe('categories', () => {
  it('new courses take the template from the settings; later template changes do not affect them', () => {
    const { c: a } = mk('A');
    expect(repo.categories(a).map((c) => [c.name, c.weightC, c.defaultMode])).toEqual([
      ['Schriftlich', 300, 'points'],
      ['Mündlich', 100, 'grade'],
    ]);
    repo.setSetting('categoryTemplate', JSON.stringify([{ name: 'Groß', weightC: 200, defaultMode: 'points' }, { name: 'Klein', weightC: 100, defaultMode: 'grade' }]));
    repo.setSetting('defaultGradingSystem', 'LIN6');
    const { c: b } = mk('B');
    expect(repo.categories(b).map((c) => c.name)).toEqual(['Groß', 'Klein']);
    expect(repo.getCourse(b).gradingSystem).toBe('LIN6');
    expect(repo.categories(a).map((c) => c.name)).toEqual(['Schriftlich', 'Mündlich']);
    expect(repo.getCourse(a).gradingSystem).toBe('NP15');
  });

  it('add, update, move and delete with rules', () => {
    const { cls, c } = mk('A');
    const [w, o] = repo.categories(c);
    const extra = repo.addCategory(c, { name: 'Referat', weightC: 150, defaultMode: 'grade' });
    repo.updateCategory(w!.id, { weightC: 200, name: undefined, defaultMode: undefined });
    repo.moveCategory(extra, 0);
    expect(repo.categories(c).map((x) => [x.name, x.weightC])).toEqual([
      ['Referat', 150],
      ['Schriftlich', 200],
      ['Mündlich', 100],
    ]);
    expect(() => repo.updateCategory(w!.id, { weightC: 0 })).toThrow(UserError);
    expect(() => repo.updateCategory(w!.id, { name: ' ' })).toThrow(UserError);
    expect(() => repo.addCategory(c, { name: 'x', weightC: 20000, defaultMode: 'points' })).toThrow(UserError);
    repo.createExam(exam(c, { categoryId: o!.id, entryMode: 'grade' }));
    expect(() => repo.deleteCategory(o!.id)).toThrow(/1 Prüfung/);
    repo.deleteCategory(extra);
    repo.deleteCategory(w!.id);
    expect(() => repo.deleteCategory(o!.id)).toThrow(UserError);
    // categories belong to one course: not usable in another subject of the same class or in another class
    const otherSubject = repo.createCourse(cls, 'Englisch');
    expect(() => repo.createExam(exam(otherSubject, { categoryId: o!.id }))).toThrow(/gehört nicht/);
    const { c: other } = mk('B');
    expect(() => repo.createExam(exam(other, { categoryId: o!.id }))).toThrow(/gehört nicht/);
    expect(repo.categories(otherSubject)).toHaveLength(2);
  });

  it('copying a class keeps the weighting, grading system and rounding of each subject', () => {
    const { cls: a, c } = mk('A');
    const physik = repo.createCourse(a, 'Physik');
    repo.updateCategory(repo.categories(c)[0]!.id, { weightC: 250 });
    repo.updateCourseGrading(c, { gradingSystem: 'LIN6', finalRounding: 'half_favor', finalDigits: 1 });
    const b = repo.copyClass(a, 'A2', '2026/27');
    const [deutsch, physik2] = repo.courses(b);
    expect(deutsch).toMatchObject({ subject: 'Deutsch', gradingSystem: 'LIN6', finalRounding: 'half_favor', finalDigits: 1 });
    expect(repo.categories(deutsch!.id).map((x) => x.weightC)).toEqual([250, 100]);
    expect(physik2).toMatchObject({ subject: 'Physik', gradingSystem: repo.getCourse(physik).gradingSystem, finalRounding: 'half_up' });
    expect(repo.categories(physik2!.id).map((x) => x.weightC)).toEqual([300, 100]);
  });

  it('settings template is validated; rounding defaults come from the settings', () => {
    expect(parseCategoryTemplate('kaputt')[0]?.name).toBe('Schriftlich');
    expect(parseCategoryTemplate('[]')).toHaveLength(2);
    expect(parseCategoryTemplate(JSON.stringify([{ name: 'x', weightC: 0, defaultMode: 'points' }]))[0]?.name).toBe('Schriftlich');
    expect(parseCategoryTemplate(JSON.stringify([{ name: 'x', weightC: 5, defaultMode: 'oral' }]))[0]?.name).toBe('Schriftlich');
    expect(parseCategoryTemplate(JSON.stringify([{ name: 'x', weightC: 5, defaultMode: 'grade' }]))).toEqual([{ name: 'x', weightC: 5, defaultMode: 'grade' }]);
    expect(repo.getCourse(mk('X').c)).toMatchObject({ finalRounding: 'half_up', finalDigits: 0 });
    repo.setSetting('defaultRounding', 'none');
    repo.setSetting('defaultRoundingDigits', '1');
    expect(repo.getCourse(mk('Y').c)).toMatchObject({ finalRounding: 'none', finalDigits: 1 });
  });
});

describe('grading system per course', () => {
  it('exams take the course system; changing it switches all exams of the course only; refused while oral marks exist', () => {
    const { cls, c } = mk('A');
    const [s1] = repo.addStudents(cls, [{ lastName: 'A', firstName: '' }]);
    const sibling = repo.createCourse(cls, 'Englisch');
    const sw = repo.createExam(exam(sibling));
    const w = repo.createExam(exam(c));
    const o = repo.createExam(exam(c, { categoryId: repo.categories(c)[1]!.id, entryMode: 'grade', kind: 'Abfrage' }));
    expect(repo.getExamData(w).exam.scheme).toBe('NP15');
    repo.updateCourseGrading(c, { gradingSystem: 'LIN6' });
    expect([repo.getExamData(w).exam.scheme, repo.getExamData(o).exam.scheme]).toEqual(['LIN6', 'LIN6']);
    expect(repo.getExamData(sw).exam.scheme).toBe('NP15'); // the other subject keeps its system
    expect(repo.getCourse(sibling).gradingSystem).toBe('NP15');
    repo.setMarks(o, [{ studentId: s1!, value: 23 }]);
    expect(() => repo.updateCourseGrading(c, { gradingSystem: 'NP15' })).toThrow(/„Abfrage 1 · Deutsch · 01\.10\.2025“ sind bereits Noten/);
    expect(repo.getCourse(c).gradingSystem).toBe('LIN6');
    repo.updateCourseGrading(c, { gradingSystem: 'LIN6', finalRounding: 'none' }); // unchanged system is fine
    repo.setMarks(o, [{ studentId: s1!, value: null }]);
    repo.updateCourseGrading(c, { gradingSystem: 'NP15' });
    expect(repo.getExamData(o).exam.scheme).toBe('NP15');
    const n = repo.createExam(exam(c));
    expect(repo.getExamData(n).exam.scheme).toBe('NP15');
  });

  it('migration v2 → v3 aligns exams with the class and adopts the scheme of marked oral exams', () => {
    const f = path.join(dir, 'v2.db');
    // Build a v2 DB by hand (migrations 1 and 2 only), then let openDatabase run migration 3.
    const d2 = new Database(f);
    d2.pragma('foreign_keys = ON');
    d2.exec(MIGRATIONS[0] as string);
    (MIGRATIONS[1] as (x: Database.Database) => void)(d2);
    d2.pragma('user_version = 2');
    d2.prepare("INSERT INTO school_class(id, name, school_year, grading_system) VALUES (1, 'K', '2024/25', 'NP15'), (2, 'L', '2024/25', 'NP15')").run();
    d2.prepare("INSERT INTO student(id, class_id, last_name) VALUES (1, 1, 'S')").run();
    d2.prepare("INSERT INTO exam(id, class_id, kind, subject, exam_date, scheme, entry_mode) VALUES (1, 1, 'Ab', 'B', '2025-01-01', 'LIN6', 'grade'), (2, 1, 'SA', 'B', '2025-01-02', 'NP15', 'points'), (3, 2, 'SA', 'B', '2025-01-03', 'LIN6', 'points')").run();
    d2.prepare('INSERT INTO mark(exam_id, student_id, value) VALUES (1, 1, 23)').run();
    d2.close();
    const m = openDatabase(f);
    // (After migration 4 the system lives on the course; each class had one subject "B".)
    expect(m.prepare('SELECT class_id, subject, grading_system FROM course ORDER BY class_id').all()).toEqual([
      { class_id: 1, subject: 'B', grading_system: 'LIN6' },
      { class_id: 2, subject: 'B', grading_system: 'NP15' },
    ]);
    expect(m.prepare('SELECT id, scheme FROM exam ORDER BY id').all()).toEqual([
      { id: 1, scheme: 'LIN6' },
      { id: 2, scheme: 'LIN6' },
      { id: 3, scheme: 'NP15' },
    ]);
    expect(m.prepare('SELECT final_rounding, final_digits FROM course WHERE class_id = 1').get()).toEqual({ final_rounding: 'half_up', final_digits: 0 });
    expect(() => m.prepare('SELECT avg_method FROM school_class').get()).toThrow();
    expect(m.prepare('SELECT value FROM mark').all()).toEqual([{ value: 23 }]);
    m.close();
  });
});

describe('directly entered sums', () => {
  it('a sum replaces the task entries; tasks are locked until the sum is cleared', () => {
    const { cls, c } = mk('A');
    const [s1, s2] = repo.addStudents(cls, [{ lastName: 'Albers', firstName: 'A' }, { lastName: 'Brandt', firstName: 'B' }]);
    const e = repo.createExam(exam(c, { taskCount: 2 }));
    const [t1, t2] = repo.tasks(e);
    repo.updateTask(t1!.id, { maxQp: 40 }); // 10
    repo.updateTask(t2!.id, { maxQp: 20 }); // 5 → M = 15
    repo.setScores(e, [{ taskId: t1!.id, studentId: s1!, qp: 4 }]);
    repo.setTotals(e, [{ studentId: s1!, qp: 48 }]); // 12 points total
    const d = repo.getExamData(e);
    expect(d.totals).toEqual([{ studentId: s1!, qp: 48 }]);
    expect(d.scores).toHaveLength(1); // kept, but ignored
    expect(() => repo.setScores(e, [{ taskId: t2!.id, studentId: s1!, qp: 4 }])).toThrow(/Summe direkt eingetragen/);
    repo.setScores(e, [{ taskId: t2!.id, studentId: s2!, qp: 4 }]); // other students unaffected
    expect(() => repo.setTotals(e, [{ studentId: s2!, qp: 64 }])).toThrow(/höchstens 15 Punkte/);
    expect(() => repo.setTotals(e, [{ studentId: s2!, qp: 49 }])).toThrow(/Schritte/);
    expect(() => repo.setTotals(e, [{ studentId: 999, qp: 4 }])).toThrow(UserError);
    // structure changes that would push the sum above the total max are refused
    expect(() => repo.updateTask(t1!.id, { maxQp: 20 })).toThrow(/Albers, A hat als Summe 12 Punkte/);
    expect(() => repo.deleteTask(t1!.id)).toThrow(/Summe 12 Punkte/);
    // coarser step
    repo.setTotals(e, [{ studentId: s1!, qp: 46 }]);
    repo.setScores(e, [{ taskId: t2!.id, studentId: s2!, qp: null }]);
    expect(() => repo.setScores(e, [{ taskId: t1!.id, studentId: s1!, qp: null }])).toThrow(UserError); // locked, also for clearing
    expect(() => repo.updateExam(e, { stepQp: 4 })).toThrow(/Summe: 11,5 Punkte/);
    // counts for deletion, cascade
    expect(repo.studentDeletionInfo([s1!])).toMatchObject({ scores: 2, exams: 1 }); // kept task entry + sum
    repo.setTotals(e, [{ studentId: s1!, qp: null }]);
    repo.setScores(e, [{ taskId: t1!.id, studentId: s1!, qp: 4 }]);
    expect(repo.getExamData(e).totals).toEqual([]);
    const oral = repo.createExam(exam(c, { entryMode: 'grade' }));
    expect(() => repo.setTotals(oral, [{ studentId: s1!, qp: 4 }])).toThrow(/nur mit Noten/);
  });
});

describe('overview', () => {
  it('every exam weighted with its category (3 : 1), direct sums count, final mark rounded per course rule', () => {
    const { cls, c } = mk('A');
    const [s1, s2, s3] = repo.addStudents(cls, [
      { lastName: 'Albers', firstName: '' },
      { lastName: 'Brandt', firstName: '' },
      { lastName: 'Conrad', firstName: '' },
    ]);
    const [written, oral] = repo.categories(c);
    const w1 = repo.createExam(exam(c, { categoryId: written!.id }));
    const t = repo.tasks(w1)[0]!;
    repo.updateTask(t.id, { maxQp: 60 }); // 15 points
    repo.setScores(w1, [{ taskId: t.id, studentId: s1!, qp: 60 }, { taskId: t.id, studentId: s2!, qp: 20 }]);
    repo.setTotals(w1, [{ studentId: s3!, qp: 48 }]); // Conrad: only the total (12 points → 11 NP)
    const o1 = repo.createExam(exam(c, { categoryId: oral!.id, entryMode: 'grade' }));
    const o2 = repo.createExam(exam(c, { categoryId: oral!.id, entryMode: 'grade', examDate: '2025-11-01' }));
    repo.setMarks(o1, [{ studentId: s1!, value: 9 }, { studentId: s2!, value: 10 }]);
    repo.setMarks(o2, [{ studentId: s1!, value: 12 }]);
    repo.setParticipation(o2, s2!, 'absent');

    const o = buildOverview(repo.overview(c));
    expect(o.columns.every((col) => col.included)).toBe(true);
    const row = (n: string): (typeof o.rows)[number] => o.rows.find((r) => r.student.lastName === n)!;
    expect(row('Albers').cells.map((x) => x.text)).toEqual(['15', '9', '12']);
    expect(row('Brandt').cells.map((x) => x.text)).toEqual(['2', '10', '–']); // 5 of 15 points = 2 NP
    expect(row('Conrad').cells.map((x) => x.text)).toEqual(['11', '', '']);
    // Albers: (3·15 + 9 + 12) / 5 = 13,2 · Brandt: (3·2 + 10) / 4 = 4 · Conrad: 11
    expect(formatAvg(row('Albers').avg.overallHundredths)).toBe('13,20');
    expect(row('Albers').avg.perCategory.get(oral!.id)?.avgHundredths).toBe(1050);
    expect(formatAvg(row('Brandt').avg.overallHundredths)).toBe('4,00');
    expect(o.showFinal).toBe(true);
    expect(o.rows.map((r) => r.finalText)).toEqual(['13', '4', '11']);
    // weight change in the course changes the result: oral ×3 → Albers (45 + 27 + 36)/9 = 12
    repo.updateCategory(oral!.id, { weightC: 300 });
    expect(formatAvg(buildOverview(repo.overview(c)).rows[0]!.avg.overallHundredths)).toBe('12,00');
    // rounding "none" hides the final mark
    repo.updateCourseGrading(c, { finalRounding: 'none' });
    const none = buildOverview(repo.overview(c));
    expect(none.showFinal).toBe(false);
    expect(none.rows[0]!.finalText).toBe('');
  });
});
