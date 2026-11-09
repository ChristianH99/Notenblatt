import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbManager } from '../../src/main/db/manager';
import { openDatabase } from '../../src/main/db/files';
import { Repo, UserError } from '../../src/main/db/repo';
import { MIGRATIONS, SCHEMA_VERSION } from '../../src/main/db/schema';
import { buildOverview, formatAvg } from '@shared/overview';
import type { NewExamInput } from '@shared/types';

let dir: string;
let mgr: DbManager;
let repo: Repo;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-co-'));
  mgr = new DbManager(dir, { logN: 12, heartbeatMs: 3_600_000 });
  repo = mgr.open();
});
afterEach(() => {
  mgr.shutdown(false);
  fs.rmSync(dir, { recursive: true, force: true });
});

const exam = (courseId: number, over: Partial<NewExamInput> = {}): NewExamInput => ({
  courseId, kind: 'Schulaufgabe', number: '1', examDate: '2025-10-01', teacher: '',
  stepQp: 2, taskCount: 1, copyFromExamId: null, categoryId: null, entryMode: 'points', ...over,
});
const count = (t: string): number => (repo.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;

/** Class 10a (Albers, Brandt, Conrad) with the subjects Mathematik and Physik. */
function setup(): { cls: number; mathe: number; physik: number; s: number[] } {
  const cls = repo.createClass('10a', '2025/26');
  const s = repo.addStudents(cls, [
    { lastName: 'Albers', firstName: 'A' },
    { lastName: 'Brandt', firstName: 'B' },
    { lastName: 'Conrad', firstName: 'C' },
  ]);
  return { cls, s, mathe: repo.createCourse(cls, 'Mathematik'), physik: repo.createCourse(cls, 'Physik') };
}

describe('subjects are graded separately', () => {
  it('marks of one subject never appear in the overview or averages of another subject of the same class', () => {
    const { mathe, physik, s } = setup();
    const m = repo.createExam(exam(mathe, { categoryId: null, entryMode: 'grade', kind: 'Abfrage' }));
    const p = repo.createExam(exam(physik, { entryMode: 'grade', kind: 'Abfrage' }));
    repo.setMarks(m, [{ studentId: s[0]!, value: 15 }]);
    repo.setMarks(p, [{ studentId: s[0]!, value: 3 }]);

    const om = buildOverview(repo.overview(mathe));
    expect(om.columns.map((c) => c.exam.id)).toEqual([m]);
    expect(formatAvg(om.rows[0]!.avg.overallHundredths)).toBe('15,00');
    expect(om.rows[0]!.finalText).toBe('15');
    const op = buildOverview(repo.overview(physik));
    expect(op.columns.map((c) => c.exam.id)).toEqual([p]);
    expect(formatAvg(op.rows[0]!.avg.overallHundredths)).toBe('3,00');
    expect(repo.overview(mathe).course.subject).toBe('Mathematik');
  });

  it('each subject has its own categories, weights and grading system', () => {
    const { mathe, physik } = setup();
    repo.updateCategory(repo.categories(mathe)[0]!.id, { weightC: 200 });
    repo.addCategory(physik, { name: 'Praktikum', weightC: 100, defaultMode: 'grade' });
    repo.updateCourseGrading(physik, { gradingSystem: 'LIN6' });
    expect(repo.categories(mathe).map((c) => [c.name, c.weightC])).toEqual([['Schriftlich', 200], ['Mündlich', 100]]);
    expect(repo.categories(physik).map((c) => [c.name, c.weightC])).toEqual([['Schriftlich', 300], ['Mündlich', 100], ['Praktikum', 100]]);
    expect(repo.getExamData(repo.createExam(exam(mathe))).exam.scheme).toBe('NP15');
    expect(repo.getExamData(repo.createExam(exam(physik))).exam.scheme).toBe('LIN6');
    expect(() => repo.deleteCategory(repo.categories(mathe)[1]!.id)).not.toThrow();
    expect(() => repo.deleteCategory(repo.categories(mathe)[0]!.id)).toThrow(/von 1 Prüfung verwendet/);
    const kunst = repo.createCourse(repo.getCourse(mathe).classId, 'Kunst');
    repo.deleteCategory(repo.categories(kunst)[0]!.id);
    expect(() => repo.deleteCategory(repo.categories(kunst)[0]!.id)).toThrow(/Ein Fach braucht mindestens eine Kategorie/);
  });
});

describe('course members', () => {
  it('a new subject includes every student of the class; exams list only members', () => {
    const { cls, mathe, s } = setup();
    expect(repo.memberIds(mathe)).toEqual([...s].sort((a, b) => a - b));
    repo.setCourseMember(mathe, s[1]!, false);
    const e = repo.createExam(exam(mathe));
    expect(repo.getExamData(e).students.map((x) => x.lastName)).toEqual(['Albers', 'Conrad']);
    expect(repo.overview(mathe).students.map((x) => x.lastName)).toEqual(['Albers', 'Conrad']);
    expect(repo.listStudents(cls)).toHaveLength(3); // still in the class
    expect(repo.classTree()[0]!.courses.find((k) => k.id === mathe)!.memberIds).toHaveLength(2);
  });

  it('taking a student into a subject adds them (present, no entries) to its existing exams', () => {
    const { mathe, s } = setup();
    repo.setCourseMember(mathe, s[2]!, false);
    const e1 = repo.createExam(exam(mathe));
    const e2 = repo.createExam(exam(mathe, { entryMode: 'grade' }));
    repo.setCourseMember(mathe, s[2]!, true);
    repo.setCourseMember(mathe, s[2]!, true); // idempotent
    for (const id of [e1, e2]) {
      const d = repo.getExamData(id);
      expect(d.students.find((x) => x.id === s[2])?.status).toBe('present');
      expect(d.scores.filter((x) => x.studentId === s[2])).toEqual([]);
    }
    expect(repo.memberIds(mathe)).toHaveLength(3);
  });

  it('removing a member is refused while they have results in the subject, and removes their (empty) participation otherwise', () => {
    const { mathe, physik, s } = setup();
    const w = repo.createExam(exam(mathe));
    const o = repo.createExam(exam(mathe, { entryMode: 'grade', kind: 'Abfrage' }));
    const t = repo.tasks(w)[0]!;
    repo.setScores(w, [{ taskId: t.id, studentId: s[0]!, qp: 2 }]);
    expect(() => repo.setCourseMember(mathe, s[0]!, false)).toThrow(/Albers, A hat in „Schulaufgabe 1 · Mathematik · 01\.10\.2025“ bereits Ergebnisse/);
    repo.setScores(w, [{ taskId: t.id, studentId: s[0]!, qp: null }]);
    repo.setMarks(o, [{ studentId: s[0]!, value: 10 }]);
    expect(() => repo.setCourseMember(mathe, s[0]!, false)).toThrow(/Abfrage 1/);
    repo.setMarks(o, [{ studentId: s[0]!, value: null }]);
    repo.setTotals(w, [{ studentId: s[0]!, qp: 2 }]);
    expect(() => repo.setCourseMember(mathe, s[0]!, false)).toThrow(UserError);
    repo.setTotals(w, [{ studentId: s[0]!, qp: null }]);
    // results in ANOTHER subject do not block
    const p = repo.createExam(exam(physik, { entryMode: 'grade' }));
    repo.setMarks(p, [{ studentId: s[0]!, value: 7 }]);
    repo.setParticipation(o, s[0]!, 'absent');
    repo.setCourseMember(mathe, s[0]!, false);
    expect(repo.getExamData(w).students.some((x) => x.id === s[0])).toBe(false);
    expect(repo.getExamData(o).students.some((x) => x.id === s[0])).toBe(false);
    expect(repo.getExamData(p).marks).toEqual([{ studentId: s[0]!, value: 7 }]);
    // results of the removed student can no longer be entered in that subject
    expect(() => repo.setMarks(o, [{ studentId: s[0]!, value: 10 }])).toThrow(/gehört nicht zu dieser Prüfung/);
  });

  it('only students of the course class can become members', () => {
    const { mathe } = setup();
    const other = repo.createClass('10b', '2025/26');
    const [x] = repo.addStudents(other, [{ lastName: 'Fremd', firstName: '' }]);
    expect(() => repo.setCourseMember(mathe, x!, true)).toThrow(/gehört nicht zu dieser Klasse/);
    expect(() => repo.setCourseMember(mathe, 99999, true)).toThrow(UserError);
    expect(() => repo.setCourseMember(99999, x!, true)).toThrow(/Fach wurde nicht gefunden/);
  });

  it('students added to the class later join every subject and its exams', () => {
    const { cls, mathe, physik } = setup();
    const e = repo.createExam(exam(physik));
    const [n] = repo.addStudents(cls, [{ lastName: 'Neu', firstName: 'N' }]);
    expect(repo.memberIds(mathe)).toContain(n);
    expect(repo.memberIds(physik)).toContain(n);
    expect(repo.getExamData(e).students.find((x) => x.id === n)?.status).toBe('present');
  });

  it('deleting a student removes the memberships', () => {
    const { mathe, physik, s } = setup();
    repo.deleteStudents([s[0]!]);
    expect(repo.memberIds(mathe)).toHaveLength(2);
    expect(repo.memberIds(physik)).toHaveLength(2);
    expect(count('course_student')).toBe(4);
  });
});

describe('course lifecycle', () => {
  it('rename checks for duplicates per class (case-insensitive), not across classes', () => {
    const { cls, mathe, physik } = setup();
    expect(() => repo.renameCourse(physik, 'MATHEMATIK')).toThrow(/bereits das Fach/);
    repo.renameCourse(mathe, 'mathematik'); // own name in another case is fine
    expect(repo.getCourse(mathe).subject).toBe('mathematik');
    expect(() => repo.renameCourse(mathe, '  ')).toThrow(UserError);
    const other = repo.createClass('10b', '2025/26');
    expect(repo.createCourse(other, 'Physik')).toBeGreaterThan(0);
    expect(repo.courses(cls).map((k) => k.subject)).toEqual(['mathematik', 'Physik']);
    expect(repo.subjects()).toEqual(['mathematik', 'Physik']);
  });

  it('deleting a subject removes its exams, results and categories; students and other subjects stay', () => {
    const { cls, mathe, physik, s } = setup();
    const w = repo.createExam(exam(mathe));
    repo.setScores(w, [{ taskId: repo.tasks(w)[0]!.id, studentId: s[0]!, qp: 4 }]);
    const o = repo.createExam(exam(mathe, { entryMode: 'grade' }));
    repo.setMarks(o, [{ studentId: s[1]!, value: 12 }]);
    const p = repo.createExam(exam(physik));
    expect(repo.courseDeletionInfo(mathe)).toEqual({ subject: 'Mathematik', className: '10a', exams: 2, scores: 2 });
    repo.deleteCourse(mathe);
    expect(() => repo.getCourse(mathe)).toThrow(UserError);
    expect(() => repo.deleteCourse(mathe)).toThrow(UserError);
    expect([count('exam'), count('score'), count('mark'), count('grade_category'), count('course_student')]).toEqual([1, 0, 0, 2, 3]);
    expect(repo.listStudents(cls)).toHaveLength(3);
    expect(repo.getExamData(p).students).toHaveLength(3);
  });

  it('an exam keeps class and subject of its course; duplicates stay in the course', () => {
    const { cls, physik } = setup();
    const e = repo.createExam(exam(physik));
    const d = repo.getExamData(e);
    expect(d.exam).toMatchObject({ courseId: physik, classId: cls, subject: 'Physik' });
    expect(d.course.id).toBe(physik);
    expect(d.schoolClass.id).toBe(cls);
    expect(repo.getExamData(repo.duplicateExam(e)).exam.courseId).toBe(physik);
  });
});

describe('migration to courses (schema 3 → 4)', () => {
  /** Builds a database at schema version 3 with the old class-level layout. */
  function v3(f: string): void {
    const db = new Database(f);
    db.pragma('foreign_keys = ON');
    db.exec(MIGRATIONS[0] as string);
    (MIGRATIONS[1] as (x: Database.Database) => void)(db);
    (MIGRATIONS[2] as (x: Database.Database) => void)(db);
    db.pragma('user_version = 3');
    db.exec(`
      UPDATE school_class SET grading_system = grading_system;
      INSERT INTO school_class(id, name, school_year, grading_system, final_rounding, final_digits) VALUES
        (1, '10a', '2024/25', 'LIN6', 'half_favor', 1),
        (2, '10b', '2024/25', 'NP15', 'half_up', 0),
        (3, '5c', '2025/26', 'NP15', 'none', 0);
      DELETE FROM grade_category;
      INSERT INTO grade_category(id, class_id, name, weight_c, default_mode, position) VALUES
        (11, 1, 'Schriftlich', 200, 'points', 0), (12, 1, 'Mündlich', 100, 'grade', 1),
        (21, 2, 'Schriftlich', 300, 'points', 0), (22, 2, 'Mündlich', 100, 'grade', 1),
        (31, 3, 'Alles', 100, 'points', 0);
      INSERT INTO student(id, class_id, last_name, first_name) VALUES (1, 1, 'Albers', 'A'), (2, 1, 'Brandt', 'B'), (3, 2, 'Conrad', 'C'), (4, 3, 'Dorn', 'D');
      INSERT INTO exam(id, class_id, kind, number, subject, exam_date, teacher, scheme, step_qp, notes, category_id, entry_mode, created_at, updated_at) VALUES
        (1, 1, 'Schulaufgabe', '1', 'Mathe', '2024-10-01', 'X', 'LIN6', 2, 'n1', 11, 'points', '2024-10-01T00:00:00.000Z', '2024-10-02T00:00:00.000Z'),
        (2, 1, 'Abfrage', '', ' mathe ', '2024-11-01', '', 'LIN6', 2, NULL, 12, 'grade', '2024-11-01T00:00:00.000Z', '2024-11-01T00:00:00.000Z'),
        (3, 1, 'Test', '', 'Physik', '2024-12-01', '', 'LIN6', 4, NULL, 11, 'points', '2024-12-01T00:00:00.000Z', '2024-12-01T00:00:00.000Z'),
        (4, 2, 'Test', '', 'Mathe', '2025-01-01', '', 'NP15', 2, NULL, NULL, 'points', '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z');
      INSERT INTO task(id, exam_id, position, label, max_qp) VALUES (1, 1, 0, '1', 40), (3, 3, 0, '1', 8), (4, 4, 0, 'a', 4);
      INSERT INTO participation(exam_id, student_id, status) VALUES (1, 1, 'present'), (1, 2, 'absent'), (2, 1, 'present'), (2, 2, 'present'),
        (3, 1, 'present'), (3, 2, 'present'), (4, 3, 'present');
      INSERT INTO score(task_id, student_id, points_qp) VALUES (1, 1, 30), (3, 2, 8), (4, 3, 2);
      INSERT INTO mark(exam_id, student_id, value) VALUES (2, 2, 17);
      INSERT INTO score_total(exam_id, student_id, points_qp) VALUES (3, 1, 4);
    `);
    db.close();
  }

  it('creates one course per subject (case-insensitive) with the class settings, members and remapped categories', () => {
    const f = path.join(dir, 'v3.db');
    v3(f);
    const db = openDatabase(f);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    const r = new Repo(db);
    const tree = r.classTree();
    const k10a = tree.find((c) => c.id === 1)!;
    // "Mathe" and " mathe " are one subject; the spelling of the first exam wins.
    expect(k10a.courses.map((k) => [k.subject, k.gradingSystem, k.finalRounding, k.finalDigits, k.memberIds])).toEqual([
      ['Mathe', 'LIN6', 'half_favor', 1, [1, 2]],
      ['Physik', 'LIN6', 'half_favor', 1, [1, 2]],
    ]);
    const [mathe, physik] = k10a.courses;
    expect(mathe!.exams.map((e) => e.id)).toEqual([2, 1]);
    expect(physik!.exams.map((e) => e.id)).toEqual([3]);
    // each course has its own copy of the categories; exams point to the copy of their course
    expect(mathe!.categories.map((c) => [c.name, c.weightC])).toEqual([['Schriftlich', 200], ['Mündlich', 100]]);
    expect(physik!.categories.map((c) => [c.name, c.weightC])).toEqual([['Schriftlich', 200], ['Mündlich', 100]]);
    expect(new Set([...mathe!.categories, ...physik!.categories].map((c) => c.id)).size).toBe(4);
    expect(r.getExamData(1).exam.categoryId).toBe(mathe!.categories[0]!.id);
    expect(r.getExamData(2).exam.categoryId).toBe(mathe!.categories[1]!.id);
    expect(r.getExamData(3).exam.categoryId).toBe(physik!.categories[0]!.id);
    expect(r.getExamData(4).exam.categoryId).toBeNull();
    // all results, statuses and exam fields survive
    const e1 = r.getExamData(1);
    expect(e1.exam).toMatchObject({ kind: 'Schulaufgabe', number: '1', subject: 'Mathe', teacher: 'X', notes: 'n1', stepQp: 2, scheme: 'LIN6', classId: 1 });
    expect(e1.scores).toEqual([{ taskId: 1, studentId: 1, qp: 30 }]);
    expect(e1.students.map((s) => [s.lastName, s.status])).toEqual([['Albers', 'present'], ['Brandt', 'absent']]);
    expect(r.getExamData(2).marks).toEqual([{ studentId: 2, value: 17 }]);
    expect(r.getExamData(3).totals).toEqual([{ studentId: 1, qp: 4 }]);
    expect(r.getExamData(3).exam).toMatchObject({ subject: 'Physik', stepQp: 4 });
    expect(db.prepare('SELECT created_at, updated_at FROM exam WHERE id = 1').get()).toEqual({ created_at: '2024-10-01T00:00:00.000Z', updated_at: '2024-10-02T00:00:00.000Z' });
    // the other class keeps its own system; a class without exams gets no course but keeps its students
    expect(tree.find((c) => c.id === 2)!.courses.map((k) => [k.subject, k.gradingSystem, k.memberIds])).toEqual([['Mathe', 'NP15', [3]]]);
    expect(tree.find((c) => c.id === 3)).toMatchObject({ studentCount: 1, courses: [] });
    // settings moved off the class
    expect(Object.keys(db.prepare('SELECT * FROM school_class WHERE id = 1').get() as object).sort()).toEqual(['created_at', 'id', 'name', 'school_year', 'updated_at']);
    expect(db.prepare('SELECT COUNT(*) n FROM grade_category').get()).toEqual({ n: 6 });
    // the averages of a subject no longer mix in the other subject
    const ov = buildOverview(r.overview(mathe!.id));
    expect(ov.columns.map((c) => c.exam.id)).toEqual([1, 2]);
    // new rows still get ids and timestamps; cascades work on the rebuilt tables
    const n = r.createExam({ ...exam(physik!.id), copyFromExamId: 3, stepQp: 4 });
    expect(r.getExamData(n).tasks).toHaveLength(1);
    r.deleteClass(1);
    expect(db.prepare('SELECT COUNT(*) n FROM exam').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) n FROM course').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) n FROM grade_category').get()).toEqual({ n: 2 });
    expect(db.prepare('SELECT COUNT(*) n FROM participation').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) n FROM score').get()).toEqual({ n: 1 });
    db.close();
  });

  it('a failing migration step leaves the old database unchanged', () => {
    const f = path.join(dir, 'v3bad.db');
    v3(f);
    // A participation of a student that does not exist: the foreign-key check refuses the step.
    const raw = new Database(f);
    raw.pragma('foreign_keys = OFF');
    raw.prepare('INSERT INTO participation(exam_id, student_id, status) VALUES (4, 99, ?)').run('present');
    raw.close();
    expect(() => openDatabase(f)).toThrow();
    const after = new Database(f, { readonly: true });
    expect(after.pragma('user_version', { simple: true })).toBe(3);
    expect(after.prepare('SELECT COUNT(*) n FROM exam').get()).toEqual({ n: 4 });
    expect(() => after.prepare('SELECT 1 FROM course').get()).toThrow();
    after.close();
  });
});
