/** Domain types shared by main, preload and renderer. */
import type { StepQp } from './grading/units';

export type Scheme = 'NP15' | 'LIN6';
export type ParticipationStatus = 'present' | 'absent';
/** points = tasks with points (written); grade = the mark is entered directly (e.g. oral). */
export type EntryMode = 'points' | 'grade';
/**
 * Rounding of the final mark (Endnote) from the exact weighted average.
 * none = no final mark; half_up = from x,5 to the higher number ("kaufmännisch");
 * half_favor = at exactly x,5 to the better mark (for NP identical to half_up).
 */
export type RoundingRule = 'none' | 'half_up' | 'half_favor';
/** Final mark precision for grades 1–6: 0 = whole grade, 1 = one decimal. NP are always whole. */
export type RoundingDigits = 0 | 1;

/** A weighting category of a class, e.g. "Schriftlich" x3, "Mündlich" x1. */
export interface GradeCategory {
  id: number;
  classId: number;
  name: string;
  /** Weight in hundredths (300 = 3). */
  weightC: number;
  defaultMode: EntryMode;
  position: number;
}

/** Template entry for categories of new classes (stored in settings). */
export interface CategoryTemplate {
  name: string;
  weightC: number;
  defaultMode: EntryMode;
}

export interface SchoolClass {
  id: number;
  name: string;
  schoolYear: string;
  /** Grading system of the class; all exams of the class use it. */
  gradingSystem: Scheme;
  finalRounding: RoundingRule;
  finalDigits: RoundingDigits;
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: number;
  classId: number;
  lastName: string;
  firstName: string;
}

export interface Exam {
  id: number;
  classId: number;
  kind: string;
  number: string;
  subject: string;
  /** ISO date YYYY-MM-DD */
  examDate: string;
  teacher: string;
  scheme: Scheme;
  stepQp: StepQp;
  notes: string;
  categoryId: number | null;
  entryMode: EntryMode;
}

export interface Task {
  id: number;
  examId: number;
  position: number;
  label: string;
  maxQp: number;
}

export interface ExamStudent extends Student {
  /** 1-based position in German collation order. */
  nr: number;
  status: ParticipationStatus;
}

export interface ScoreEntry {
  taskId: number;
  studentId: number;
  qp: number;
}

export interface ExamData {
  exam: Exam;
  schoolClass: SchoolClass;
  tasks: Task[];
  students: ExamStudent[];
  scores: ScoreEntry[];
  /** Directly entered marks (entryMode "grade"): NP 0-15 or grade x 10. */
  marks: MarkEntry[];
  /** Directly entered sums (points exams): the task entries of these students are ignored. */
  totals: TotalEntry[];
}

export interface TotalEntry {
  studentId: number;
  qp: number;
}

export interface TotalChange {
  studentId: number;
  qp: number | null;
}

export interface MarkEntry {
  studentId: number;
  value: number;
}

export interface MarkChange {
  studentId: number;
  value: number | null;
}

/** Everything needed for the class grade overview. */
export interface OverviewData {
  schoolClass: SchoolClass;
  categories: GradeCategory[];
  students: Student[];
  exams: ExamData[];
}

export interface ExamSummary {
  id: number;
  classId: number;
  kind: string;
  number: string;
  subject: string;
  examDate: string;
  scheme: Scheme;
  entryMode: EntryMode;
  categoryId: number | null;
}

export interface ClassTreeItem extends SchoolClass {
  studentCount: number;
  exams: ExamSummary[];
  categories: GradeCategory[];
}

export interface ClassDeletionInfo {
  name: string;
  students: number;
  exams: number;
  scores: number;
}

export interface StudentDeletionInfo {
  students: { id: number; lastName: string; firstName: string }[];
  scores: number;
  exams: number;
}

export interface Settings {
  teacher: string;
  school: string;
  enterDirection: 'down' | 'right';
  touchMode: 'auto' | 'on' | 'off';
  retentionMonths: '6' | '12' | '24' | 'off';
  showGradeEquivalent: boolean;
  lastExamId: number | null;
  /** Defaults for NEW classes only. */
  defaultGradingSystem: Scheme;
  categoryTemplate: CategoryTemplate[];
  defaultRounding: RoundingRule;
  defaultRoundingDigits: RoundingDigits;
}

export interface LockInfo {
  host: string;
  user: string;
  pid: number;
  since: string;
  heartbeat: string;
}

export type StorageState =
  | { state: 'ready' }
  | { state: 'locked' }
  | { state: 'unavailable'; reason: string; canCreate: boolean }
  | { state: 'inUse'; lock: LockInfo }
  /** The file is left untouched: written by a newer program version, or its migration failed. */
  | { state: 'incompatible'; reason: 'tooNew' | 'migrationFailed' };

export interface StorageInfo {
  /** Folder that holds the database. */
  dir: string;
  /** True for the default folder (APPDATA). */
  isDefault: boolean;
  encrypted: boolean;
  /** wal = local SQLite file; snapshot = in-memory DB saved as one (optionally encrypted) file. */
  mode: 'wal' | 'snapshot';
  file: string;
}

export interface StartupInfo {
  corrupt: { renamedTo: string } | null;
  dataDir: string;
  isEmpty: boolean;
  storage: StorageState;
  info: StorageInfo;
}

export interface BackupCounts {
  classes: number;
  students: number;
  exams: number;
}

export type PrintMode = 'exam' | 'spiegel' | 'key';

export interface NewExamInput {
  classId: number;
  kind: string;
  number: string;
  subject: string;
  examDate: string;
  teacher: string;
  stepQp: StepQp;
  taskCount: number;
  copyFromExamId: number | null;
  categoryId: number | null;
  entryMode: EntryMode;
}

export interface ExamPatch {
  kind?: string;
  number?: string;
  subject?: string;
  examDate?: string;
  teacher?: string;
  stepQp?: StepQp;
  notes?: string;
  categoryId?: number | null;
}

export interface ScoreChange {
  taskId: number;
  studentId: number;
  qp: number | null;
}

export interface NameInput {
  lastName: string;
  firstName: string;
}

export interface TaskSnapshot {
  examId: number;
  position: number;
  label: string;
  maxQp: number;
  scores: { studentId: number; qp: number }[];
}
