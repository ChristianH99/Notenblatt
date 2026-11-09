import type Database from 'better-sqlite3';
import { compareNames } from '@shared/parse/names';
import { formatQp, todayIso } from '@shared/parse/number';
import { compareSchoolYearDesc } from '@shared/schoolYear';
import { isStepQp, type StepQp } from '@shared/grading/units';
import { examTitle } from '@shared/labels';
import { isValidMark } from '@shared/grading/marks';
import { DEFAULT_CATEGORY_TEMPLATE } from './schema';
import type {
  BackupCounts,
  RoundingDigits,
  RoundingRule,
  TotalChange,
  CategoryTemplate,
  EntryMode,
  GradeCategory,
  MarkChange,
  OverviewData,
  Scheme,
  ClassDeletionInfo,
  ClassTreeItem,
  Exam,
  ExamData,
  ExamPatch,
  ExamStudent,
  ExamSummary,
  NameInput,
  NewExamInput,
  ParticipationStatus,
  SchoolClass,
  ScoreChange,
  Settings,
  Student,
  StudentDeletionInfo,
  Task,
  TaskSnapshot,
} from '@shared/types';

/** An error whose message is meant for the user (German). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

interface ClassRow {
  id: number;
  name: string;
  school_year: string;
  grading_system: Scheme;
  final_rounding: RoundingRule;
  final_digits: number;
  created_at: string;
  updated_at: string;
}
interface StudentRow {
  id: number;
  class_id: number;
  last_name: string;
  first_name: string;
}
interface ExamRow {
  id: number;
  class_id: number;
  kind: string;
  number: string | null;
  subject: string;
  exam_date: string;
  teacher: string | null;
  scheme: 'NP15' | 'LIN6';
  step_qp: number;
  notes: string | null;
  category_id: number | null;
  entry_mode: EntryMode;
}
interface CategoryRow {
  id: number;
  class_id: number;
  name: string;
  weight_c: number;
  default_mode: EntryMode;
  position: number;
}
interface TaskRow {
  id: number;
  exam_id: number;
  position: number;
  label: string;
  max_qp: number;
}

const toClass = (r: ClassRow): SchoolClass => ({
  id: r.id,
  name: r.name,
  schoolYear: r.school_year,
  gradingSystem: r.grading_system,
  finalRounding: r.final_rounding,
  finalDigits: r.final_digits === 1 ? 1 : 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const toStudent = (r: StudentRow): Student => ({
  id: r.id,
  classId: r.class_id,
  lastName: r.last_name,
  firstName: r.first_name,
});
const toExam = (r: ExamRow): Exam => ({
  id: r.id,
  classId: r.class_id,
  kind: r.kind,
  number: r.number ?? '',
  subject: r.subject,
  examDate: r.exam_date,
  teacher: r.teacher ?? '',
  scheme: r.scheme,
  stepQp: (isStepQp(r.step_qp) ? r.step_qp : 2) as StepQp,
  notes: r.notes ?? '',
  categoryId: r.category_id,
  entryMode: r.entry_mode,
});
const toCategory = (r: CategoryRow): GradeCategory => ({
  id: r.id,
  classId: r.class_id,
  name: r.name,
  weightC: r.weight_c,
  defaultMode: r.default_mode,
  position: r.position,
});

/** Validates a category template from the settings JSON; falls back to the default. */
export function parseCategoryTemplate(raw: string | null | undefined): CategoryTemplate[] {
  if (!raw) return DEFAULT_CATEGORY_TEMPLATE.map((t) => ({ ...t }));
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v) || v.length === 0 || v.length > 20) throw new Error('bad');
    return v.map((x: { name?: unknown; weightC?: unknown; defaultMode?: unknown }) => {
      if (typeof x.name !== 'string' || !x.name.trim() || x.name.length > 40) throw new Error('bad');
      if (typeof x.weightC !== 'number' || !Number.isInteger(x.weightC) || x.weightC < 1 || x.weightC > 10000) throw new Error('bad');
      if (x.defaultMode !== 'points' && x.defaultMode !== 'grade') throw new Error('bad');
      return { name: x.name.trim(), weightC: x.weightC, defaultMode: x.defaultMode };
    });
  } catch {
    return DEFAULT_CATEGORY_TEMPLATE.map((t) => ({ ...t }));
  }
}
const toTask = (r: TaskRow): Task => ({
  id: r.id,
  examId: r.exam_id,
  position: r.position,
  label: r.label,
  maxQp: r.max_qp,
});

export const DEFAULT_SETTINGS: Settings = {
  teacher: '',
  school: '',
  enterDirection: 'down',
  touchMode: 'auto',
  retentionMonths: '12',
  showGradeEquivalent: false,
  lastExamId: null,
  defaultGradingSystem: 'NP15',
  categoryTemplate: DEFAULT_CATEGORY_TEMPLATE.map((t) => ({ ...t })),
  defaultRounding: 'half_up',
  defaultRoundingDigits: 0,
};

const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export class Repo {
  constructor(readonly db: Database.Database) {}

  private tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ───────────── settings ─────────────

  getSetting(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM setting WHERE key = ?').get(key) as { value: string | null } | undefined;
    return r?.value ?? null;
  }

  setSetting(key: string, value: string | null): void {
    if (value === null) this.db.prepare('DELETE FROM setting WHERE key = ?').run(key);
    else this.db.prepare('INSERT INTO setting(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM setting').all() as { key: string; value: string | null }[];
    const m = new Map(rows.map((r) => [r.key, r.value ?? '']));
    const pick = <T extends string>(k: string, allowed: readonly T[], def: T): T => {
      const v = m.get(k);
      return v !== undefined && (allowed as readonly string[]).includes(v) ? (v as T) : def;
    };
    const last = Number(m.get('lastExamId'));
    return {
      teacher: m.get('teacher') ?? '',
      school: m.get('school') ?? '',
      enterDirection: pick('enterDirection', ['down', 'right'] as const, 'down'),
      touchMode: pick('touchMode', ['auto', 'on', 'off'] as const, 'auto'),
      retentionMonths: pick('retentionMonths', ['6', '12', '24', 'off'] as const, '12'),
      showGradeEquivalent: m.get('showGradeEquivalent') === '1',
      lastExamId: Number.isInteger(last) && last > 0 ? last : null,
      defaultGradingSystem: pick('defaultGradingSystem', ['NP15', 'LIN6'] as const, 'NP15'),
      categoryTemplate: parseCategoryTemplate(m.get('categoryTemplate')),
      defaultRounding: pick('defaultRounding', ['none', 'half_up', 'half_favor'] as const, 'half_up'),
      defaultRoundingDigits: m.get('defaultRoundingDigits') === '1' ? 1 : 0,
    };
  }

  // ───────────── classes ─────────────

  getClass(id: number): SchoolClass {
    const r = this.db.prepare('SELECT * FROM school_class WHERE id = ?').get(id) as ClassRow | undefined;
    if (!r) throw new UserError('Die Klasse wurde nicht gefunden.');
    return toClass(r);
  }

  classTree(): ClassTreeItem[] {
    const classes = (this.db.prepare('SELECT * FROM school_class').all() as ClassRow[]).map(toClass);
    const counts = new Map(
      (this.db.prepare('SELECT class_id, COUNT(*) n FROM student GROUP BY class_id').all() as { class_id: number; n: number }[]).map(
        (r) => [r.class_id, r.n],
      ),
    );
    const exams = (this.db.prepare('SELECT * FROM exam ORDER BY exam_date DESC, id DESC').all() as ExamRow[]).map(toExam);
    const categories = (this.db.prepare('SELECT * FROM grade_category ORDER BY position, id').all() as CategoryRow[]).map(toCategory);
    const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
    return classes
      .sort((a, b) => compareSchoolYearDesc(a.schoolYear, b.schoolYear) || collator.compare(a.name, b.name) || a.id - b.id)
      .map((c) => ({
        ...c,
        studentCount: counts.get(c.id) ?? 0,
        exams: exams
          .filter((e) => e.classId === c.id)
          .map(
            (e): ExamSummary => ({
              id: e.id,
              classId: e.classId,
              kind: e.kind,
              number: e.number,
              subject: e.subject,
              examDate: e.examDate,
              scheme: e.scheme,
              entryMode: e.entryMode,
              categoryId: e.categoryId,
            }),
          ),
        categories: categories.filter((k) => k.classId === c.id),
      }));
  }

  /** Creates a class; categories and grading system come from the template in the settings. */
  createClass(name: string, schoolYear: string): number {
    const n = name.trim();
    if (!n) throw new UserError('Bitte einen Klassennamen eingeben.');
    return this.tx(() => {
      const st = this.getSettings();
      const id = Number(
        this.db
          .prepare('INSERT INTO school_class(name, school_year, grading_system, final_rounding, final_digits) VALUES (?, ?, ?, ?, ?)')
          .run(n, schoolYear.trim(), st.defaultGradingSystem, st.defaultRounding, st.defaultRoundingDigits).lastInsertRowid,
      );
      const ins = this.db.prepare('INSERT INTO grade_category(class_id, name, weight_c, default_mode, position) VALUES (?, ?, ?, ?, ?)');
      st.categoryTemplate.forEach((t, i) => ins.run(id, t.name, t.weightC, t.defaultMode, i));
      return id;
    });
  }

  /**
   * Grading system and final-mark rounding of a class. Changing the system switches all
   * exams of the class (point exams are simply re-graded). It is refused while a mark-only
   * exam holds marks, because those numbers would change their meaning.
   */
  updateClassGrading(id: number, patch: { gradingSystem?: Scheme; finalRounding?: RoundingRule; finalDigits?: RoundingDigits }): void {
    this.tx(() => {
      const c = this.getClass(id);
      const system = patch.gradingSystem ?? c.gradingSystem;
      if (system !== c.gradingSystem) {
        const marked = this.db
          .prepare(
            "SELECT * FROM exam e WHERE e.class_id = ? AND e.entry_mode = 'grade' AND e.scheme <> ? AND EXISTS (SELECT 1 FROM mark m WHERE m.exam_id = e.id) ORDER BY e.exam_date, e.id LIMIT 1",
          )
          .get(id, system) as ExamRow | undefined;
        if (marked) {
          throw new UserError(
            `Das Notensystem kann nicht geändert werden: In „${examTitle(toExam(marked))}“ sind bereits Noten eingetragen. Löschen Sie diese Noten zuerst.`,
          );
        }
        this.db.prepare(`UPDATE exam SET scheme = ?, updated_at = ${NOW_SQL} WHERE class_id = ?`).run(system, id);
      }
      this.db
        .prepare(`UPDATE school_class SET grading_system = ?, final_rounding = ?, final_digits = ?, updated_at = ${NOW_SQL} WHERE id = ?`)
        .run(system, patch.finalRounding ?? c.finalRounding, patch.finalDigits ?? c.finalDigits, id);
    });
  }

  // ───────────── categories ─────────────

  categories(classId: number): GradeCategory[] {
    return (this.db.prepare('SELECT * FROM grade_category WHERE class_id = ? ORDER BY position, id').all(classId) as CategoryRow[]).map(toCategory);
  }

  private categoryRow(id: number): GradeCategory {
    const r = this.db.prepare('SELECT * FROM grade_category WHERE id = ?').get(id) as CategoryRow | undefined;
    if (!r) throw new UserError('Die Kategorie wurde nicht gefunden.');
    return toCategory(r);
  }

  private checkCategory(name: string, weightC: number): string {
    const n = name.trim();
    if (!n) throw new UserError('Bitte einen Namen für die Kategorie eingeben.');
    if (!Number.isInteger(weightC) || weightC < 1 || weightC > 10000) throw new UserError('Die Gewichtung muss zwischen 0,01 und 100 liegen.');
    return n;
  }

  addCategory(classId: number, c: { name: string; weightC: number; defaultMode: EntryMode }): number {
    return this.tx(() => {
      this.getClass(classId);
      const n = this.checkCategory(c.name, c.weightC);
      const pos = (this.db.prepare('SELECT COALESCE(MAX(position), -1) + 1 p FROM grade_category WHERE class_id = ?').get(classId) as { p: number }).p;
      return Number(
        this.db.prepare('INSERT INTO grade_category(class_id, name, weight_c, default_mode, position) VALUES (?, ?, ?, ?, ?)').run(classId, n, c.weightC, c.defaultMode, pos).lastInsertRowid,
      );
    });
  }

  updateCategory(id: number, patch: { name?: string; weightC?: number; defaultMode?: EntryMode }): void {
    this.tx(() => {
      const cur = this.categoryRow(id);
      const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      const next = { ...cur, ...defined };
      const n = this.checkCategory(next.name, next.weightC);
      this.db.prepare('UPDATE grade_category SET name = ?, weight_c = ?, default_mode = ? WHERE id = ?').run(n, next.weightC, next.defaultMode, id);
    });
  }

  moveCategory(id: number, position: number): void {
    this.tx(() => {
      const cur = this.categoryRow(id);
      const ids = this.categories(cur.classId).map((c) => c.id).filter((x) => x !== id);
      ids.splice(Math.max(0, Math.min(position, ids.length)), 0, id);
      const up = this.db.prepare('UPDATE grade_category SET position = ? WHERE id = ?');
      ids.forEach((cid, i) => up.run(i, cid));
    });
  }

  deleteCategory(id: number): void {
    this.tx(() => {
      const cur = this.categoryRow(id);
      const used = (this.db.prepare('SELECT COUNT(*) n FROM exam WHERE category_id = ?').get(id) as { n: number }).n;
      if (used > 0) {
        throw new UserError(`Die Kategorie „${cur.name}“ wird von ${used === 1 ? '1 Prüfung' : `${used} Prüfungen`} verwendet. Ordnen Sie diese zuerst einer anderen Kategorie zu.`);
      }
      if (this.categories(cur.classId).length <= 1) throw new UserError('Eine Klasse braucht mindestens eine Kategorie.');
      this.db.prepare('DELETE FROM grade_category WHERE id = ?').run(id);
    });
  }

  updateClass(id: number, name: string, schoolYear: string): void {
    const n = name.trim();
    if (!n) throw new UserError('Bitte einen Klassennamen eingeben.');
    this.getClass(id);
    this.db.prepare(`UPDATE school_class SET name = ?, school_year = ?, updated_at = ${NOW_SQL} WHERE id = ?`).run(n, schoolYear.trim(), id);
  }

  /** Copies the class with its students (names only), without exams. */
  copyClass(id: number, name: string, schoolYear: string): number {
    return this.tx(() => {
      this.getClass(id);
      const src = this.getClass(id);
      const newId = this.createClass(name, schoolYear);
      // The copy keeps the source class's weighting, not the template.
      this.db.prepare('DELETE FROM grade_category WHERE class_id = ?').run(newId);
      this.db
        .prepare('INSERT INTO grade_category(class_id, name, weight_c, default_mode, position) SELECT ?, name, weight_c, default_mode, position FROM grade_category WHERE class_id = ? ORDER BY position, id')
        .run(newId, id);
      this.updateClassGrading(newId, { gradingSystem: src.gradingSystem, finalRounding: src.finalRounding, finalDigits: src.finalDigits });
      this.db.prepare('INSERT INTO student(class_id, last_name, first_name) SELECT ?, last_name, first_name FROM student WHERE class_id = ? ORDER BY id').run(newId, id);
      return newId;
    });
  }

  classDeletionInfo(id: number): ClassDeletionInfo {
    const c = this.getClass(id);
    const one = (sql: string): number => (this.db.prepare(sql).get(id) as { n: number }).n;
    return {
      name: c.name,
      students: one('SELECT COUNT(*) n FROM student WHERE class_id = ?'),
      exams: one('SELECT COUNT(*) n FROM exam WHERE class_id = ?'),
      scores:
        one('SELECT COUNT(*) n FROM score s JOIN task t ON t.id = s.task_id JOIN exam e ON e.id = t.exam_id WHERE e.class_id = ?') +
        one('SELECT COUNT(*) n FROM mark m JOIN exam e ON e.id = m.exam_id WHERE e.class_id = ?') +
        one('SELECT COUNT(*) n FROM score_total s JOIN exam e ON e.id = s.exam_id WHERE e.class_id = ?'),
    };
  }

  deleteClass(id: number): void {
    this.tx(() => {
      this.getClass(id);
      this.db.prepare('DELETE FROM school_class WHERE id = ?').run(id);
    });
  }

  // ───────────── students ─────────────

  listStudents(classId: number): Student[] {
    return (this.db.prepare('SELECT * FROM student WHERE class_id = ?').all(classId) as StudentRow[])
      .map(toStudent)
      .sort(compareNames);
  }

  addStudents(classId: number, names: NameInput[]): number[] {
    return this.tx(() => {
      this.getClass(classId);
      const ins = this.db.prepare('INSERT INTO student(class_id, last_name, first_name) VALUES (?, ?, ?)');
      const part = this.db.prepare("INSERT INTO participation(exam_id, student_id, status) SELECT id, ?, 'present' FROM exam WHERE class_id = ?");
      const ids: number[] = [];
      for (const n of names) {
        const last = n.lastName.trim();
        if (!last) throw new UserError('Bitte einen Nachnamen eingeben.');
        const id = Number(ins.run(classId, last, n.firstName.trim()).lastInsertRowid);
        part.run(id, classId);
        ids.push(id);
      }
      return ids;
    });
  }

  updateStudent(id: number, lastName: string, firstName: string): void {
    const last = lastName.trim();
    if (!last) throw new UserError('Der Nachname darf nicht leer sein.');
    const r = this.db.prepare('UPDATE student SET last_name = ?, first_name = ? WHERE id = ?').run(last, firstName.trim(), id);
    if (r.changes === 0) throw new UserError('Schüler/in wurde nicht gefunden.');
  }

  studentDeletionInfo(ids: number[]): StudentDeletionInfo {
    const ph = ids.map(() => '?').join(',');
    const students = (this.db.prepare(`SELECT * FROM student WHERE id IN (${ph})`).all(...ids) as StudentRow[])
      .map(toStudent)
      .sort(compareNames)
      .map((s) => ({ id: s.id, lastName: s.lastName, firstName: s.firstName }));
    const r = this.db
      .prepare(
        `SELECT COUNT(*) n, COUNT(DISTINCT exam_id) m FROM (
           SELECT t.exam_id FROM score s JOIN task t ON t.id = s.task_id WHERE s.student_id IN (${ph})
           UNION ALL SELECT exam_id FROM mark WHERE student_id IN (${ph})
           UNION ALL SELECT exam_id FROM score_total WHERE student_id IN (${ph}))`,
      )
      .get(...ids, ...ids, ...ids) as { n: number; m: number };
    return { students, scores: r.n, exams: r.m };
  }

  deleteStudents(ids: number[]): void {
    this.tx(() => {
      const del = this.db.prepare('DELETE FROM student WHERE id = ?');
      for (const id of ids) del.run(id);
    });
  }

  // ───────────── exams ─────────────

  private examRow(id: number): Exam {
    const r = this.db.prepare('SELECT * FROM exam WHERE id = ?').get(id) as ExamRow | undefined;
    if (!r) throw new UserError('Die Prüfung wurde nicht gefunden.');
    return toExam(r);
  }

  examExists(id: number): boolean {
    return this.db.prepare('SELECT 1 FROM exam WHERE id = ?').get(id) !== undefined;
  }

  tasks(examId: number): Task[] {
    return (this.db.prepare('SELECT * FROM task WHERE exam_id = ? ORDER BY position, id').all(examId) as TaskRow[]).map(toTask);
  }

  private examStudents(examId: number): ExamStudent[] {
    const rows = this.db
      .prepare('SELECT s.*, p.status FROM participation p JOIN student s ON s.id = p.student_id WHERE p.exam_id = ?')
      .all(examId) as (StudentRow & { status: ParticipationStatus })[];
    return rows
      .map((r) => ({ ...toStudent(r), status: r.status }))
      .sort(compareNames)
      .map((s, i) => ({ ...s, nr: i + 1 }));
  }

  getExamData(examId: number): ExamData {
    const exam = this.examRow(examId);
    const scores = this.db
      .prepare('SELECT s.task_id taskId, s.student_id studentId, s.points_qp qp FROM score s JOIN task t ON t.id = s.task_id WHERE t.exam_id = ?')
      .all(examId) as ExamData['scores'];
    const marks = this.db.prepare('SELECT student_id studentId, value FROM mark WHERE exam_id = ?').all(examId) as ExamData['marks'];
    const totals = this.db.prepare('SELECT student_id studentId, points_qp qp FROM score_total WHERE exam_id = ?').all(examId) as ExamData['totals'];
    return {
      exam,
      schoolClass: this.getClass(exam.classId),
      tasks: this.tasks(examId),
      students: this.examStudents(examId),
      scores,
      marks,
      totals,
    };
  }

  /** All data for the class grade overview. */
  overview(classId: number): OverviewData {
    const schoolClass = this.getClass(classId);
    const ids = (this.db.prepare('SELECT id FROM exam WHERE class_id = ?').all(classId) as { id: number }[]).map((r) => r.id);
    return { schoolClass, categories: this.categories(classId), students: this.listStudents(classId), exams: ids.map((id) => this.getExamData(id)) };
  }

  private resolveCategory(classId: number, categoryId: number | null): number | null {
    if (categoryId === null) return this.categories(classId)[0]?.id ?? null;
    const c = this.categoryRow(categoryId);
    if (c.classId !== classId) throw new UserError('Die Kategorie gehört nicht zu dieser Klasse.');
    return c.id;
  }

  createExam(input: NewExamInput): number {
    return this.tx(() => {
      const scheme = this.getClass(input.classId).gradingSystem;
      if (!input.kind.trim()) throw new UserError('Bitte die Art der Prüfung angeben.');
      if (!input.subject.trim()) throw new UserError('Bitte ein Fach angeben.');
      const categoryId = this.resolveCategory(input.classId, input.categoryId);
      let structure: { label: string; maxQp: number }[];
      if (input.entryMode === 'grade') {
        structure = [];
      } else if (input.copyFromExamId !== null) {
        structure = this.tasks(input.copyFromExamId).map((t) => ({ label: t.label, maxQp: t.maxQp }));
        if (structure.length === 0) throw new UserError('Die gewählte Prüfung hat keine Aufgaben.');
        const bad = structure.find((t) => t.maxQp % input.stepQp !== 0);
        if (bad) {
          throw new UserError(`Aufgabe ${bad.label} hat ${formatQp(bad.maxQp)} Punkte und passt nicht zum Punkteschritt ${formatQp(input.stepQp)}.`);
        }
      } else {
        const n = input.taskCount;
        if (!Number.isInteger(n) || n < 1) throw new UserError('Mindestens eine Aufgabe ist erforderlich.');
        structure = Array.from({ length: n }, (_, i) => ({ label: String(i + 1), maxQp: 4 }));
      }
      const id = Number(
        this.db
          .prepare(
            'INSERT INTO exam(class_id, kind, number, subject, exam_date, teacher, scheme, step_qp, category_id, entry_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            input.classId,
            input.kind.trim(),
            input.number.trim(),
            input.subject.trim(),
            input.examDate,
            input.teacher.trim(),
            scheme,
            input.stepQp,
            categoryId,
            input.entryMode,
          )
          .lastInsertRowid,
      );
      const insT = this.db.prepare('INSERT INTO task(exam_id, position, label, max_qp) VALUES (?, ?, ?, ?)');
      structure.forEach((t, i) => insT.run(id, i, t.label, t.maxQp));
      this.db.prepare("INSERT INTO participation(exam_id, student_id, status) SELECT ?, id, 'present' FROM student WHERE class_id = ?").run(id, input.classId);
      return id;
    });
  }

  updateExam(id: number, patch: ExamPatch): void {
    this.tx(() => {
      const cur = this.examRow(id);
      if (patch.kind !== undefined && !patch.kind.trim()) throw new UserError('Die Art darf nicht leer sein.');
      if (patch.subject !== undefined && !patch.subject.trim()) throw new UserError('Das Fach darf nicht leer sein.');
      if (patch.stepQp !== undefined && patch.stepQp > cur.stepQp) this.assertStepFits(id, patch.stepQp);
      const categoryId = patch.categoryId !== undefined ? this.resolveCategory(cur.classId, patch.categoryId) : cur.categoryId;
      const next = { ...cur, ...patch };
      this.db
        .prepare(
          `UPDATE exam SET kind = ?, number = ?, subject = ?, exam_date = ?, teacher = ?, scheme = ?, step_qp = ?, notes = ?, category_id = ?, updated_at = ${NOW_SQL} WHERE id = ?`,
        )
        .run(next.kind.trim(), next.number.trim(), next.subject.trim(), next.examDate, next.teacher.trim(), next.scheme, next.stepQp, next.notes, categoryId, id);
    });
  }

  private assertStepFits(examId: number, stepQp: StepQp): void {
    const tasks = this.tasks(examId);
    const stepTxt = formatQp(stepQp);
    for (const t of tasks) {
      if (t.maxQp % stepQp !== 0) {
        throw new UserError(`Punkteschritt ${stepTxt} nicht möglich: Aufgabe ${t.label}, max. Punkte ${formatQp(t.maxQp)}.`);
      }
    }
    const students = this.examStudents(examId);
    const scores = new Map<string, number>();
    for (const s of this.getExamData(examId).scores) scores.set(`${s.taskId}:${s.studentId}`, s.qp);
    for (const tot of this.db.prepare('SELECT student_id, points_qp FROM score_total WHERE exam_id = ?').all(examId) as { student_id: number; points_qp: number }[]) {
      if (tot.points_qp % stepQp !== 0) {
        const st = students.find((x) => x.id === tot.student_id);
        throw new UserError(`Punkteschritt ${stepTxt} nicht möglich: ${st?.lastName}, ${st?.firstName} – Summe: ${formatQp(tot.points_qp)} Punkte.`);
      }
    }
    for (const t of tasks) {
      for (const st of students) {
        const v = scores.get(`${t.id}:${st.id}`);
        if (v !== undefined && v % stepQp !== 0) {
          throw new UserError(
            `Punkteschritt ${stepTxt} nicht möglich: ${st.lastName}, ${st.firstName} – Aufgabe ${t.label}: ${formatQp(v)} Punkte.`,
          );
        }
      }
    }
  }

  duplicateExam(id: number): number {
    return this.tx(() => {
      const e = this.examRow(id);
      return this.createExam({
        classId: e.classId,
        kind: e.kind,
        number: e.number,
        subject: e.subject,
        examDate: todayIso(),
        teacher: e.teacher,
        stepQp: e.stepQp,
        taskCount: 0,
        copyFromExamId: e.entryMode === 'points' ? id : null,
        categoryId: e.categoryId,
        entryMode: e.entryMode,
      });
    });
  }

  deleteExam(id: number): void {
    this.tx(() => {
      this.examRow(id);
      this.db.prepare('DELETE FROM exam WHERE id = ?').run(id);
    });
  }

  subjects(): string[] {
    return (this.db.prepare('SELECT DISTINCT subject FROM exam ORDER BY subject COLLATE NOCASE').all() as { subject: string }[]).map((r) => r.subject);
  }

  allExams(): { id: number; title: string; className: string; schoolYear: string; stepQp: StepQp; taskCount: number }[] {
    const rows = this.db
      .prepare(
        "SELECT e.*, c.name class_name, c.school_year, (SELECT COUNT(*) FROM task t WHERE t.exam_id = e.id) task_count FROM exam e JOIN school_class c ON c.id = e.class_id WHERE e.entry_mode = 'points' ORDER BY e.exam_date DESC, e.id DESC",
      )
      .all() as (ExamRow & { class_name: string; school_year: string; task_count: number })[];
    return rows.map((r) => {
      const e = toExam(r);
      return { id: e.id, title: examTitle(e), className: r.class_name, schoolYear: r.school_year, stepQp: e.stepQp, taskCount: r.task_count };
    });
  }

  // ───────────── tasks ─────────────

  private taskRow(id: number): Task {
    const r = this.db.prepare('SELECT * FROM task WHERE id = ?').get(id) as TaskRow | undefined;
    if (!r) throw new UserError('Die Aufgabe wurde nicht gefunden.');
    return toTask(r);
  }

  private renumber(examId: number, ordered: number[]): void {
    const up = this.db.prepare('UPDATE task SET position = ? WHERE id = ?');
    ordered.forEach((tid, i) => up.run(i, tid));
    this.touchExam(examId);
  }

  private touchExam(examId: number): void {
    this.db.prepare(`UPDATE exam SET updated_at = ${NOW_SQL} WHERE id = ?`).run(examId);
  }

  /** Inserts a task at `position` (0-based); returns its id. */
  addTask(examId: number, position: number, label?: string, maxQp?: number): number {
    return this.tx(() => {
      const exam = this.examRow(examId);
      const ids = this.tasks(examId).map((t) => t.id);
      const pos = Math.max(0, Math.min(position, ids.length));
      const max = maxQp ?? Math.max(4, exam.stepQp);
      if (max <= 0 || max % exam.stepQp !== 0) throw new UserError(`Nur Schritte von ${formatQp(exam.stepQp)} erlaubt`);
      const id = Number(
        this.db.prepare('INSERT INTO task(exam_id, position, label, max_qp) VALUES (?, ?, ?, ?)').run(examId, pos, label ?? String(ids.length + 1), max)
          .lastInsertRowid,
      );
      ids.splice(pos, 0, id);
      this.renumber(examId, ids);
      return id;
    });
  }

  updateTask(id: number, patch: { label?: string; maxQp?: number }): number {
    return this.tx(() => {
      const t = this.taskRow(id);
      const exam = this.examRow(t.examId);
      if (patch.label !== undefined) {
        const l = patch.label.trim();
        if (!l) throw new UserError('Die Aufgabenbezeichnung darf nicht leer sein.');
        this.db.prepare('UPDATE task SET label = ? WHERE id = ?').run(l, id);
      }
      if (patch.maxQp !== undefined) {
        const m = patch.maxQp;
        if (m <= 0) throw new UserError('Die Höchstpunktzahl muss größer als 0 sein');
        if (m % exam.stepQp !== 0) throw new UserError(`Nur Schritte von ${formatQp(exam.stepQp)} erlaubt`);
        const over = this.db
          .prepare('SELECT s.points_qp qp, st.last_name l, st.first_name f FROM score s JOIN student st ON st.id = s.student_id WHERE s.task_id = ? AND s.points_qp > ? ORDER BY s.points_qp DESC LIMIT 1')
          .get(id, m) as { qp: number; l: string; f: string } | undefined;
        if (over) {
          throw new UserError(`Aufgabe ${t.label}: ${over.l}, ${over.f} hat bereits ${formatQp(over.qp)} Punkte – höchstens ${formatQp(m)} nicht möglich.`);
        }
        this.assertTotalsFit(t.examId, this.totalMax(t.examId) - t.maxQp + m);
        this.db.prepare('UPDATE task SET max_qp = ? WHERE id = ?').run(m, id);
      }
      this.touchExam(t.examId);
      return t.examId;
    });
  }

  moveTask(id: number, position: number): number {
    return this.tx(() => {
      const t = this.taskRow(id);
      const ids = this.tasks(t.examId).map((x) => x.id).filter((x) => x !== id);
      ids.splice(Math.max(0, Math.min(position, ids.length)), 0, id);
      this.renumber(t.examId, ids);
      return t.examId;
    });
  }

  taskSnapshot(id: number): TaskSnapshot {
    const t = this.taskRow(id);
    const scores = this.db.prepare('SELECT student_id studentId, points_qp qp FROM score WHERE task_id = ?').all(id) as TaskSnapshot['scores'];
    return { examId: t.examId, position: t.position, label: t.label, maxQp: t.maxQp, scores };
  }

  deleteTask(id: number): number {
    return this.tx(() => {
      const t = this.taskRow(id);
      const ids = this.tasks(t.examId).map((x) => x.id);
      if (ids.length <= 1) throw new UserError('Eine Prüfung braucht mindestens eine Aufgabe.');
      this.assertTotalsFit(t.examId, this.totalMax(t.examId) - t.maxQp);
      this.db.prepare('DELETE FROM task WHERE id = ?').run(id);
      this.renumber(t.examId, ids.filter((x) => x !== id));
      return t.examId;
    });
  }

  /** Re-creates a deleted task (undo). Scores of students no longer in the exam are skipped. */
  restoreTask(s: TaskSnapshot): number {
    return this.tx(() => {
      const id = this.addTask(s.examId, s.position, s.label, s.maxQp);
      const ins = this.db.prepare(
        'INSERT INTO score(task_id, student_id, points_qp) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM participation WHERE exam_id = ? AND student_id = ?)',
      );
      for (const sc of s.scores) ins.run(id, sc.studentId, sc.qp, s.examId, sc.studentId);
      return id;
    });
  }

  // ───────────── scores & participation ─────────────

  setScores(examId: number, changes: ScoreChange[]): void {
    this.tx(() => {
      const exam = this.examRow(examId);
      const tasks = new Map(this.tasks(examId).map((t) => [t.id, t]));
      const status = new Map(
        (this.db.prepare('SELECT student_id, status FROM participation WHERE exam_id = ?').all(examId) as { student_id: number; status: ParticipationStatus }[]).map(
          (r) => [r.student_id, r.status],
        ),
      );
      const up = this.db.prepare(
        'INSERT INTO score(task_id, student_id, points_qp) VALUES (?, ?, ?) ON CONFLICT(task_id, student_id) DO UPDATE SET points_qp = excluded.points_qp',
      );
      const del = this.db.prepare('DELETE FROM score WHERE task_id = ? AND student_id = ?');
      const overridden = new Set(
        (this.db.prepare('SELECT student_id FROM score_total WHERE exam_id = ?').all(examId) as { student_id: number }[]).map((r) => r.student_id),
      );
      for (const c of changes) {
        if (overridden.has(c.studentId)) {
          throw new UserError('Für diese Schülerin bzw. diesen Schüler ist die Summe direkt eingetragen. Leeren Sie zuerst die Summe.');
        }
        const t = tasks.get(c.taskId);
        if (!t) throw new UserError('Die Aufgabe gehört nicht zu dieser Prüfung.');
        const st = status.get(c.studentId);
        if (st === undefined) throw new UserError('Schüler/in gehört nicht zu dieser Prüfung.');
        if (st === 'absent') throw new UserError('Für fehlende Schüler/innen können keine Punkte eingetragen werden.');
        if (c.qp === null) {
          del.run(c.taskId, c.studentId);
          continue;
        }
        if (c.qp < 0) throw new UserError('Negative Werte sind nicht erlaubt');
        if (c.qp > t.maxQp) throw new UserError(`Aufgabe ${t.label}: höchstens ${formatQp(t.maxQp)} Punkte`);
        if (c.qp % exam.stepQp !== 0) throw new UserError(`Nur Schritte von ${formatQp(exam.stepQp)} erlaubt`);
        up.run(c.taskId, c.studentId, c.qp);
      }
      this.touchExam(examId);
    });
  }

  private totalMax(examId: number): number {
    return (this.db.prepare('SELECT COALESCE(SUM(max_qp), 0) m FROM task WHERE exam_id = ?').get(examId) as { m: number }).m;
  }

  /** Refuses a structure change that would put a directly entered sum above the total max. */
  private assertTotalsFit(examId: number, newMax: number): void {
    const over = this.db
      .prepare(
        'SELECT t.points_qp qp, s.last_name l, s.first_name f FROM score_total t JOIN student s ON s.id = t.student_id WHERE t.exam_id = ? AND t.points_qp > ? ORDER BY t.points_qp DESC LIMIT 1',
      )
      .get(examId, newMax) as { qp: number; l: string; f: string } | undefined;
    if (over) {
      throw new UserError(`${over.l}, ${over.f} hat als Summe ${formatQp(over.qp)} Punkte eingetragen – höchstens ${formatQp(newMax)} wären dann möglich.`);
    }
  }

  /** Directly entered sums (points exams). The task entries of these students are kept but ignored. */
  setTotals(examId: number, changes: TotalChange[]): void {
    this.tx(() => {
      const exam = this.examRow(examId);
      if (exam.entryMode !== 'points') throw new UserError('Diese Prüfung wird nur mit Noten bewertet.');
      const max = this.totalMax(examId);
      const status = new Map(
        (this.db.prepare('SELECT student_id, status FROM participation WHERE exam_id = ?').all(examId) as { student_id: number; status: ParticipationStatus }[]).map(
          (r) => [r.student_id, r.status],
        ),
      );
      const up = this.db.prepare(
        'INSERT INTO score_total(exam_id, student_id, points_qp) VALUES (?, ?, ?) ON CONFLICT(exam_id, student_id) DO UPDATE SET points_qp = excluded.points_qp',
      );
      const del = this.db.prepare('DELETE FROM score_total WHERE exam_id = ? AND student_id = ?');
      for (const c of changes) {
        const st = status.get(c.studentId);
        if (st === undefined) throw new UserError('Schüler/in gehört nicht zu dieser Prüfung.');
        if (st === 'absent') throw new UserError('Für fehlende Schüler/innen können keine Punkte eingetragen werden.');
        if (c.qp === null) {
          del.run(examId, c.studentId);
          continue;
        }
        if (c.qp > max) throw new UserError(`Summe: höchstens ${formatQp(max)} Punkte`);
        if (c.qp % exam.stepQp !== 0) throw new UserError(`Nur Schritte von ${formatQp(exam.stepQp)} erlaubt`);
        up.run(examId, c.studentId, c.qp);
      }
      this.touchExam(examId);
    });
  }

  /** Directly entered marks (mark-only exams). */
  setMarks(examId: number, changes: MarkChange[]): void {
    this.tx(() => {
      const exam = this.examRow(examId);
      if (exam.entryMode !== 'grade') throw new UserError('Diese Prüfung wird mit Punkten bewertet.');
      const status = new Map(
        (this.db.prepare('SELECT student_id, status FROM participation WHERE exam_id = ?').all(examId) as { student_id: number; status: ParticipationStatus }[]).map(
          (r) => [r.student_id, r.status],
        ),
      );
      const up = this.db.prepare('INSERT INTO mark(exam_id, student_id, value) VALUES (?, ?, ?) ON CONFLICT(exam_id, student_id) DO UPDATE SET value = excluded.value');
      const del = this.db.prepare('DELETE FROM mark WHERE exam_id = ? AND student_id = ?');
      for (const c of changes) {
        const st = status.get(c.studentId);
        if (st === undefined) throw new UserError('Schüler/in gehört nicht zu dieser Prüfung.');
        if (st === 'absent') throw new UserError('Für fehlende Schüler/innen können keine Noten eingetragen werden.');
        if (c.value === null) {
          del.run(examId, c.studentId);
          continue;
        }
        if (!isValidMark(exam.scheme, c.value)) {
          throw new UserError(exam.scheme === 'NP15' ? 'Bitte Notenpunkte von 0 bis 15 eingeben' : 'Bitte eine Note von 1,0 bis 6,0 eingeben');
        }
        up.run(examId, c.studentId, c.value);
      }
      this.touchExam(examId);
    });
  }

  setParticipation(examId: number, studentId: number, status: ParticipationStatus): void {
    const r = this.db.prepare('UPDATE participation SET status = ? WHERE exam_id = ? AND student_id = ?').run(status, examId, studentId);
    if (r.changes === 0) throw new UserError('Schüler/in gehört nicht zu dieser Prüfung.');
  }

  // ───────────── maintenance ─────────────

  counts(): BackupCounts {
    const n = (t: string): number => (this.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
    return { classes: n('school_class'), students: n('student'), exams: n('exam') };
  }

  isEmpty(): boolean {
    const c = this.counts();
    return c.classes === 0;
  }

  /** Physical erasure after deletes: checkpoint, VACUUM, checkpoint (truncate WAL). */
  secureCleanup(vacuum = true): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    if (vacuum) {
      this.db.exec('VACUUM');
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    }
  }
}
