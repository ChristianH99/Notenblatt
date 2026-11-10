import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbManager } from '../../src/main/db/manager';
import { dbFiles } from '../../src/main/db/files';
import { SCHEMA_VERSION } from '../../src/main/db/schema';
import { UserError, type Repo } from '../../src/main/db/repo';
import { BackupError, encryptBackup } from '../../src/main/backup/crypto';
import type { NewExamInput } from '@shared/types';

let dir: string;
let mgr: DbManager;
let repo: Repo;

const SECRET = 'Zqxwvy Testperson';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-db-'));
  mgr = new DbManager(dir, { logN: 12, heartbeatMs: 3_600_000 });
  repo = mgr.open();
});

afterEach(() => {
  mgr.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function examInput(courseId: number, over: Partial<NewExamInput> = {}): NewExamInput {
  return {
    courseId, kind: 'Kurzarbeit', number: '2.', examDate: '2025-03-19', teacher: 'Frau X',
    stepQp: 2, taskCount: 3, copyFromExamId: null, categoryId: null, entryMode: 'points', errorGrading: false, ...over,
  };
}

/** Class F-A11a with three students and the subject Biologie (one exam, all scores 0,5). */
function setup(): { classId: number; courseId: number; examId: number; students: number[]; tasks: number[] } {
  const classId = repo.createClass('F-A11a', '2024/25');
  const students = repo.addStudents(classId, [
    { lastName: 'Zqxwvy', firstName: 'Testperson' },
    { lastName: 'Ärger', firstName: 'Anna' },
    { lastName: 'Bauer', firstName: 'Ben' },
  ]);
  const courseId = repo.createCourse(classId, 'Biologie');
  const examId = repo.createExam(examInput(courseId));
  const tasks = repo.tasks(examId).map((t) => t.id);
  repo.setScores(examId, students.flatMap((s) => tasks.map((t) => ({ taskId: t, studentId: s, qp: 2 }))));
  return { classId, courseId, examId, students, tasks };
}

function rawContains(needle: string): string[] {
  const hits: string[] = [];
  const utf8 = Buffer.from(needle, 'utf8');
  const utf16le = Buffer.from(needle, 'utf16le');
  const utf16be = Buffer.from(utf16le).swap16();
  for (const f of dbFiles(mgr.file)) {
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    for (const [enc, b] of [['utf8', utf8], ['utf16le', utf16le], ['utf16be', utf16be]] as const) {
      if (buf.includes(b)) hits.push(`${path.basename(f)}:${enc}`);
    }
    // Also check the last name alone.
    if (buf.includes(Buffer.from('Zqxwvy', 'utf8')) || buf.includes(Buffer.from('Zqxwvy', 'utf16le'))) hits.push(`${path.basename(f)}:lastname`);
  }
  return hits;
}

const count = (t: string): number => (repo.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;

describe('schema', () => {
  it('migrates an empty DB and sets pragmas', () => {
    expect(repo.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(repo.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(repo.db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(repo.db.pragma('secure_delete', { simple: true })).toBe(1);
    expect(repo.isEmpty()).toBe(true);
    // Re-opening is idempotent.
    mgr.close();
    repo = mgr.open();
    expect(repo.db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
  });
});

describe('classes, students, exams', () => {
  it('sorts students with German collation and numbers them', () => {
    const { examId } = setup();
    const d = repo.getExamData(examId);
    expect(d.students.map((s) => `${s.nr} ${s.lastName}`)).toEqual(['1 Ärger', '2 Bauer', '3 Zqxwvy']);
    expect(d.tasks.map((t) => t.label)).toEqual(['1', '2', '3']);
    expect(d.scores).toHaveLength(9);
  });

  it('a student added later appears in existing exams as present without entries', () => {
    const { classId, examId } = setup();
    const [id] = repo.addStudents(classId, [{ lastName: 'Neu', firstName: 'Nina' }]);
    const d = repo.getExamData(examId);
    const s = d.students.find((x) => x.id === id);
    expect(s?.status).toBe('present');
    expect(d.scores.filter((x) => x.studentId === id)).toHaveLength(0);
  });

  it('class tree: school year newest first → class → subjects (alphabetical) → exams newest first', () => {
    const a = repo.createClass('7a', '2023/24');
    const b = repo.createClass('8a', '2025/26');
    const chemie = repo.createCourse(b, 'Chemie');
    const bio = repo.createCourse(b, 'Biologie');
    repo.createCourse(a, 'Biologie');
    repo.createExam(examInput(bio, { examDate: '2025-10-01' }));
    repo.createExam(examInput(bio, { examDate: '2026-02-01', kind: 'Test' }));
    repo.createExam(examInput(chemie, { examDate: '2026-01-10' }));
    const tree = repo.classTree();
    expect(tree.map((c) => c.id)).toEqual([b, a]);
    expect(tree[0]?.courses.map((k) => k.subject)).toEqual(['Biologie', 'Chemie']);
    expect(tree[0]?.courses[0]?.exams.map((e) => [e.kind, e.subject])).toEqual([['Test', 'Biologie'], ['Kurzarbeit', 'Biologie']]);
    expect(tree[0]?.courses[1]?.exams.map((e) => e.subject)).toEqual(['Chemie']);
    expect(tree[1]?.courses.map((k) => [k.subject, k.exams.length])).toEqual([['Biologie', 0]]);
    expect(repo.subjects()).toEqual(['Biologie', 'Chemie']);
    expect(repo.allExams()[0]).toMatchObject({ title: 'Test 2 · Biologie · 01.02.2026', className: '8a', subject: 'Biologie' });
  });

  it('copies a class with names and subjects (members, weighting) but without exams', () => {
    const { classId, courseId, students } = setup();
    const latein = repo.createCourse(classId, 'Latein');
    repo.setCourseMember(latein, students[0] as number, false);
    repo.updateCategory(repo.categories(courseId)[1]!.id, { weightC: 200 });
    const copy = repo.copyClass(classId, 'F-A12a', '2025/26');
    const newStudents = repo.listStudents(copy);
    expect(newStudents.map((s) => s.lastName)).toEqual(['Ärger', 'Bauer', 'Zqxwvy']);
    const item = repo.classTree().find((c) => c.id === copy)!;
    expect(item.courses.map((k) => [k.subject, k.exams.length, k.memberIds.length])).toEqual([['Biologie', 0, 3], ['Latein', 0, 2]]);
    // members are the copied students, not the originals
    const lateinCopy = item.courses[1]!;
    expect(lateinCopy.memberIds.every((id) => newStudents.some((s) => s.id === id))).toBe(true);
    expect(repo.courseStudents(lateinCopy.id).map((s) => s.lastName)).toEqual(['Ärger', 'Bauer']);
    expect(item.courses[0]!.categories.map((c) => c.weightC)).toEqual([300, 200]);
    // the source is unchanged
    expect(repo.memberIds(latein)).toHaveLength(2);
    expect(repo.classTree().find((c) => c.id === classId)!.courses[0]!.exams).toHaveLength(1);
  });

  it('validates input', () => {
    expect(() => repo.createClass('  ', '2025/26')).toThrow(UserError);
    const { classId, courseId, examId, students, tasks } = setup();
    expect(() => repo.updateClass(classId, '', '2025/26')).toThrow(UserError);
    expect(() => repo.updateStudent(students[0] as number, ' ', '')).toThrow(UserError);
    expect(() => repo.updateStudent(99999, 'X', '')).toThrow(UserError);
    expect(() => repo.addStudents(classId, [{ lastName: ' ', firstName: 'x' }])).toThrow(UserError);
    expect(() => repo.setScores(examId, [{ taskId: tasks[0] as number, studentId: students[0] as number, qp: 5 }])).toThrow(UserError);
    expect(() => repo.setScores(examId, [{ taskId: tasks[0] as number, studentId: students[0] as number, qp: 3 }])).toThrow(/Schritte/);
    expect(() => repo.setScores(examId, [{ taskId: tasks[0] as number, studentId: students[0] as number, qp: 6 }])).toThrow(/höchstens 1 Punkte/);
    expect(() => repo.setScores(examId, [{ taskId: 9999, studentId: students[0] as number, qp: 0 }])).toThrow(UserError);
    expect(() => repo.setScores(examId, [{ taskId: tasks[0] as number, studentId: 9999, qp: 0 }])).toThrow(UserError);
    expect(() => repo.createExam(examInput(courseId, { taskCount: 0 }))).toThrow(UserError);
    expect(() => repo.createExam(examInput(9999))).toThrow(/Fach wurde nicht gefunden/);
    expect(() => repo.createCourse(classId, ' ')).toThrow(/Bitte ein Fach/);
    expect(() => repo.createCourse(classId, 'biologie ')).toThrow(/bereits das Fach „biologie“/);
    expect(() => repo.createCourse(9999, 'Physik')).toThrow(UserError);
    expect(() => repo.getExamData(9999)).toThrow(UserError);
  });

  it('absent students cannot get scores; a failed batch changes nothing', () => {
    const { examId, students, tasks } = setup();
    const before = repo.getExamData(examId).scores;
    repo.setParticipation(examId, students[1] as number, 'absent');
    expect(() =>
      repo.setScores(examId, [
        { taskId: tasks[0] as number, studentId: students[0] as number, qp: 4 },
        { taskId: tasks[0] as number, studentId: students[1] as number, qp: 4 },
      ]),
    ).toThrow(/fehlende/);
    expect(repo.getExamData(examId).scores).toEqual(before);
    expect(() => repo.setParticipation(examId, 9999, 'absent')).toThrow(UserError);
  });

  it('empty value deletes the entry', () => {
    const { examId, students, tasks } = setup();
    repo.setScores(examId, [{ taskId: tasks[0] as number, studentId: students[0] as number, qp: null }]);
    expect(repo.getExamData(examId).scores).toHaveLength(8);
  });
});

describe('point step', () => {
  it('refuses a coarser step when values conflict, naming the first cell', () => {
    const { examId, students, tasks } = setup();
    expect(() => repo.updateExam(examId, { stepQp: 4 })).toThrow(/Aufgabe 1: 0,5 Punkte/);
    expect(() => repo.updateExam(examId, { stepQp: 4 })).toThrow(/Ärger, Anna/);
    // Make all values whole points → allowed.
    repo.setScores(examId, students.flatMap((s) => tasks.map((t) => ({ taskId: t, studentId: s, qp: 4 }))));
    repo.updateExam(examId, { stepQp: 4 });
    expect(repo.getExamData(examId).exam.stepQp).toBe(4);
    // Finer step always works.
    repo.updateExam(examId, { stepQp: 1 });
    repo.updateTask(tasks[0] as number, { maxQp: 5 });
    expect(() => repo.updateExam(examId, { stepQp: 2 })).toThrow(/max\. Punkte 1,25/);
  });

  it('changing the course grading system switches its exams and keeps scores; the subject comes from the course', () => {
    const { courseId, examId } = setup();
    repo.updateCourseGrading(courseId, { gradingSystem: 'LIN6' });
    repo.renameCourse(courseId, 'Chemie');
    const d = repo.getExamData(examId);
    expect(d.exam.scheme).toBe('LIN6');
    expect(d.exam.subject).toBe('Chemie');
    expect(d.course).toMatchObject({ id: courseId, subject: 'Chemie', gradingSystem: 'LIN6' });
    expect(d.scores).toHaveLength(9);
    expect(() => repo.updateExam(examId, { kind: ' ' })).toThrow(UserError);
  });
});

describe('tasks', () => {
  it('add, move, update, delete, restore', () => {
    const { examId, tasks } = setup();
    const id = repo.addTask(examId, 1);
    expect(repo.tasks(examId).map((t) => t.label)).toEqual(['1', '4', '2', '3']);
    repo.updateTask(id, { label: '1b', maxQp: 6 });
    repo.moveTask(id, 3);
    expect(repo.tasks(examId).map((t) => t.label)).toEqual(['1', '2', '3', '1b']);
    expect(repo.tasks(examId).map((t) => t.position)).toEqual([0, 1, 2, 3]);
    expect(() => repo.updateTask(id, { maxQp: 3 })).toThrow(/Schritte/);
    expect(() => repo.updateTask(id, { maxQp: 0 })).toThrow(UserError);
    expect(() => repo.updateTask(id, { label: ' ' })).toThrow(UserError);
    expect(() => repo.updateTask(tasks[0] as number, { maxQp: 0 })).toThrow(UserError);
    repo.updateTask(tasks[0] as number, { maxQp: 2 });
    expect(() => repo.addTask(examId, 0, 'x', 3)).toThrow(UserError);

    const snap = repo.taskSnapshot(tasks[1] as number);
    expect(snap.scores).toHaveLength(3);
    repo.deleteTask(tasks[1] as number);
    expect(count('score')).toBe(6);
    const restored = repo.restoreTask(snap);
    expect(repo.tasks(examId).find((t) => t.id === restored)?.position).toBe(1);
    expect(count('score')).toBe(9);
  });

  it('refuses lowering max below an existing entry and deleting the last task', () => {
    const classId = repo.createClass('K', '2025/26');
    const [s] = repo.addStudents(classId, [{ lastName: 'A', firstName: 'B' }]);
    const examId = repo.createExam(examInput(repo.createCourse(classId, 'Bio'), { taskCount: 1 }));
    const [t] = repo.tasks(examId);
    repo.updateTask(t!.id, { maxQp: 12 });
    repo.setScores(examId, [{ taskId: t!.id, studentId: s as number, qp: 10 }]);
    expect(() => repo.updateTask(t!.id, { maxQp: 8 })).toThrow(/2,5 Punkte/);
    expect(() => repo.deleteTask(t!.id)).toThrow(/mindestens eine/);
  });

  it('supports 40 tasks', () => {
    const classId = repo.createClass('K', '2025/26');
    const examId = repo.createExam(examInput(repo.createCourse(classId, 'Bio'), { taskCount: 40 }));
    expect(repo.tasks(examId)).toHaveLength(40);
  });

  it('duplicates structure only and copies structure from another exam', () => {
    const { courseId, examId, tasks } = setup();
    repo.updateTask(tasks[0] as number, { label: '1a', maxQp: 6 });
    const dup = repo.duplicateExam(examId);
    const d = repo.getExamData(dup);
    expect(d.tasks.map((t) => [t.label, t.maxQp])).toEqual([['1a', 6], ['2', 4], ['3', 4]]);
    expect(d.scores).toHaveLength(0);
    expect(d.students).toHaveLength(3);
    expect(repo.getExamData(dup).exam.courseId).toBe(courseId);
    const other = repo.createCourse(repo.createClass('Parallel', '2024/25'), 'Biologie');
    const copied = repo.createExam(examInput(other, { copyFromExamId: examId }));
    expect(repo.tasks(copied).map((t) => t.label)).toEqual(['1a', '2', '3']);
    expect(() => repo.createExam(examInput(courseId, { copyFromExamId: examId, stepQp: 4 }))).toThrow(/passt nicht/);
  });
});

describe('cascading deletes (§6.1–6.3)', () => {
  it('deleting a student removes scores and participations', () => {
    const { courseId, students } = setup();
    repo.createExam(examInput(courseId));
    const info = repo.studentDeletionInfo([students[0] as number]);
    expect(info.students[0]?.lastName).toBe('Zqxwvy');
    expect(info.scores).toBe(3);
    expect(info.exams).toBe(1);
    repo.deleteStudents([students[0] as number]);
    expect(count('student')).toBe(2);
    expect(count('score')).toBe(6);
    expect(count('participation')).toBe(4);
  });

  it('deleting an exam removes tasks, scores and participations', () => {
    const { examId } = setup();
    repo.deleteExam(examId);
    expect([count('exam'), count('task'), count('score'), count('participation'), count('student')]).toEqual([0, 0, 0, 0, 3]);
    expect(() => repo.deleteExam(examId)).toThrow(UserError);
  });

  it('deleting a class removes everything belonging to it', () => {
    const { classId } = setup();
    const other = repo.createClass('Andere', '2024/25');
    repo.addStudents(other, [{ lastName: 'Bleibt', firstName: 'Da' }]);
    repo.createCourse(classId, 'Chemie');
    expect(repo.classDeletionInfo(classId)).toEqual({ name: 'F-A11a', students: 3, courses: 2, exams: 1, scores: 9 });
    repo.deleteClass(classId);
    expect([count('school_class'), count('student'), count('exam'), count('task'), count('score'), count('participation')]).toEqual([1, 1, 0, 0, 0, 0]);
    expect([count('course'), count('course_student'), count('grade_category')]).toEqual([0, 0, 0]);
    expect(() => repo.deleteClass(classId)).toThrow(UserError);
  });
});

describe('secure erasure', () => {
  it('a deleted student leaves no trace in db, wal or shm', () => {
    const { students } = setup();
    repo.secureCleanup(false);
    expect(rawContains(SECRET).length + rawContains('Zqxwvy').length).toBeGreaterThan(0);
    repo.deleteStudents([students[0] as number]);
    repo.secureCleanup();
    expect(rawContains(SECRET)).toEqual([]);
  });

  it('a deleted subject leaves no trace of its results', () => {
    const { courseId, examId } = setup();
    repo.updateExam(examId, { notes: 'Notiz Qwyxzv' });
    repo.secureCleanup(false);
    expect(rawContains('Qwyxzv').length).toBeGreaterThan(0);
    repo.deleteCourse(courseId);
    repo.secureCleanup();
    // (the students stay in the class, so only the exam note must be gone)
    expect(rawContains('Qwyxzv').filter((h) => !h.endsWith(':lastname'))).toEqual([]);
    expect(repo.listStudents(repo.classTree()[0]!.id)).toHaveLength(3);
  });

  it('a deleted class leaves no trace', () => {
    const { classId } = setup();
    repo.deleteClass(classId);
    repo.secureCleanup();
    expect(rawContains(SECRET)).toEqual([]);
  });

  it('"Alle Daten löschen" leaves no trace and yields an empty DB', () => {
    setup();
    repo = mgr.wipe();
    expect(rawContains(SECRET)).toEqual([]);
    expect(repo.isEmpty()).toBe(true);
  });
});

describe('settings', () => {
  it('new subjects default to grades 1,0–6,0 with a final mark to one decimal', () => {
    expect(repo.getSettings()).toMatchObject({ defaultGradingSystem: 'LIN6', defaultRounding: 'truncate', defaultRoundingDigits: 1 });
    const courseId = repo.createCourse(repo.createClass('K', '2025/26'), 'Mathematik');
    expect(repo.getCourse(courseId)).toMatchObject({ gradingSystem: 'LIN6', rounding: 'truncate', showFinal: true, finalDigits: 1, pointsWeightC: 100, errorsWeightC: 100 });
    repo.setSetting('defaultRoundingDigits', '0');
    repo.setSetting('defaultGradingSystem', 'NP15');
    expect(repo.getSettings()).toMatchObject({ defaultGradingSystem: 'NP15', defaultRoundingDigits: 0 });
  });

  it('stores and validates settings', () => {
    expect(repo.getSettings()).toMatchObject({ enterDirection: 'down', touchMode: 'auto', retentionMonths: '12', lastExamId: null });
    repo.setSetting('enterDirection', 'right');
    repo.setSetting('touchMode', 'bogus');
    repo.setSetting('lastExamId', '7');
    repo.setSetting('showGradeEquivalent', '1');
    expect(repo.getSettings()).toMatchObject({ enterDirection: 'right', touchMode: 'auto', lastExamId: 7, showGradeEquivalent: true });
    repo.setSetting('lastExamId', null);
    expect(repo.getSetting('lastExamId')).toBeNull();
  });
});

describe('backup', () => {
  it('round-trip: export, wipe, import gives identical data', async () => {
    const { examId } = setup();
    const before = repo.getExamData(examId);
    const file = await mgr.exportEncrypted('geheim123', 12);
    expect(file.includes(Buffer.from('Zqxwvy'))).toBe(false);
    repo = mgr.wipe();
    expect(repo.isEmpty()).toBe(true);
    const { payload, counts } = await DbManager.inspect(file, 'geheim123');
    expect(counts).toEqual({ classes: 1, students: 3, exams: 1 });
    repo = mgr.replaceWith(payload);
    expect(repo.getExamData(examId)).toEqual(before);
    expect(repo.db.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('wrong password or damaged file changes nothing', async () => {
    const { examId } = setup();
    const before = repo.getExamData(examId);
    const file = await mgr.exportEncrypted('geheim123', 12);
    await expect(DbManager.inspect(file, 'falsch!!')).rejects.toMatchObject({ code: 'password' });
    const damaged = Buffer.from(file);
    damaged[damaged.length - 5] = (damaged[damaged.length - 5] as number) ^ 0xff;
    await expect(DbManager.inspect(damaged, 'geheim123')).rejects.toBeInstanceOf(BackupError);
    await expect(DbManager.inspect(Buffer.from('hello world, not a backup at all'), 'x')).rejects.toMatchObject({ code: 'format' });
    const wrongVersion = Buffer.from(file);
    wrongVersion[8] = 9;
    await expect(DbManager.inspect(wrongVersion, 'geheim123')).rejects.toMatchObject({ code: 'version' });
    const badParams = Buffer.from(file);
    badParams[9] = 40;
    await expect(DbManager.inspect(badParams, 'geheim123')).rejects.toMatchObject({ code: 'format' });
    const notSqlite = await encryptBackup(Buffer.from('not a database'), 'geheim123', 12);
    await expect(DbManager.inspect(notSqlite, 'geheim123')).rejects.toMatchObject({ code: 'format' });
    expect(repo.getExamData(examId)).toEqual(before);
  });
});

describe('corrupted DB file', () => {
  it('renames the damaged file and starts with an empty DB', () => {
    setup();
    mgr.close();
    fs.writeFileSync(mgr.file, Buffer.alloc(8192, 0x41));
    const m2 = new DbManager(dir);
    const r2 = m2.open();
    expect(m2.corrupt?.renamedTo).toMatch(/notenblatt\.db\.defekt-\d{8}-\d{6}$/);
    expect(fs.existsSync(m2.corrupt?.renamedTo as string)).toBe(true);
    expect(r2.isEmpty()).toBe(true);
    m2.close();
  });
});
