/** Typed IPC contract between renderer (via preload) and main. */
import type { StepQp } from './grading/units';
import type {
  EntryMode,
  RoundingDigits,
  RoundingRule,
  TotalChange,
  MarkChange,
  OverviewData,
  Scheme,
  StorageInfo,
  StorageState,
  BackupCounts,
  ClassDeletionInfo,
  ClassTreeItem,
  CourseDeletionInfo,
  ExamData,
  ExamPatch,
  NameInput,
  NewExamInput,
  ParticipationStatus,
  PrintMode,
  ScoreChange,
  Settings,
  StartupInfo,
  Student,
  StudentDeletionInfo,
  TaskSnapshot,
} from './types';

export type SettingKey =
  | 'teacher'
  | 'school'
  | 'enterDirection'
  | 'touchMode'
  | 'retentionMonths'
  | 'showGradeEquivalent'
  | 'lastExamId'
  | 'defaultGradingSystem'
  | 'categoryTemplate'
  | 'defaultRounding'
  | 'defaultRoundingDigits';

export interface DirChoice {
  dir: string;
  exists: boolean;
  encrypted: boolean;
  writable: boolean;
}

export interface ExamPick {
  id: number;
  title: string;
  className: string;
  subject: string;
  schoolYear: string;
  stepQp: StepQp;
  taskCount: number;
}

export interface ApiMethods {
  'app.startupInfo': (a: void) => StartupInfo;
  'app.openDataFolder': (a: void) => void;
  'app.wipeAll': (a: void) => void;
  'settings.get': (a: void) => Settings;
  'settings.set': (a: { key: SettingKey; value: string | null }) => Settings;
  'classes.tree': (a: void) => ClassTreeItem[];
  'classes.create': (a: { name: string; schoolYear: string }) => number;
  'classes.update': (a: { id: number; name: string; schoolYear: string }) => void;
  'classes.copy': (a: { id: number; name: string; schoolYear: string }) => number;
  'classes.deletionInfo': (a: { id: number }) => ClassDeletionInfo;
  'classes.delete': (a: { id: number }) => void;
  'courses.create': (a: { classId: number; subject: string }) => number;
  'courses.rename': (a: { id: number; subject: string }) => void;
  'courses.deletionInfo': (a: { id: number }) => CourseDeletionInfo;
  'courses.delete': (a: { id: number }) => void;
  'courses.setMember': (a: { id: number; studentId: number; member: boolean }) => void;
  'courses.subjects': (a: void) => string[];
  'courses.overview': (a: { id: number }) => OverviewData;
  'courses.updateGrading': (a: { id: number; gradingSystem?: Scheme; finalRounding?: RoundingRule; finalDigits?: RoundingDigits }) => void;
  'categories.add': (a: { courseId: number; name: string; weightC: number; defaultMode: EntryMode }) => number;
  'categories.update': (a: { id: number; name?: string; weightC?: number; defaultMode?: EntryMode }) => void;
  'categories.move': (a: { id: number; position: number }) => void;
  'categories.delete': (a: { id: number }) => void;
  'marks.set': (a: { examId: number; changes: MarkChange[] }) => ExamData;
  'totals.set': (a: { examId: number; changes: TotalChange[] }) => ExamData;
  'output.overviewCsv': (a: { courseId: number }) => string | null;
  'storage.info': (a: void) => StorageInfo;
  'storage.chooseDir': (a: void) => DirChoice | null;
  'storage.relocate': (a: { dir: string | null; overwrite: boolean }) => StorageState;
  'storage.openOther': (a: { dir: string | null }) => StorageState;
  'storage.enableEncryption': (a: { password: string }) => void;
  'storage.changePassword': (a: { oldPassword: string; newPassword: string }) => void;
  'storage.disableEncryption': (a: { password: string }) => void;
  'storage.unlock': (a: { password: string }) => StorageState;
  'storage.retry': (a: void) => StorageState;
  'storage.forceOpen': (a: void) => StorageState;
  'storage.useDefault': (a: void) => StorageState;
  'storage.createHere': (a: void) => StorageState;
  'students.list': (a: { classId: number }) => Student[];
  'students.add': (a: { classId: number; names: NameInput[] }) => number[];
  'students.update': (a: { id: number; lastName: string; firstName: string }) => void;
  'students.deletionInfo': (a: { ids: number[] }) => StudentDeletionInfo;
  'students.delete': (a: { ids: number[] }) => void;
  'exams.get': (a: { id: number }) => ExamData | null;
  'exams.create': (a: NewExamInput) => number;
  'exams.update': (a: { id: number; patch: ExamPatch }) => ExamData;
  'exams.duplicate': (a: { id: number }) => number;
  'exams.delete': (a: { id: number }) => void;
  'exams.all': (a: void) => ExamPick[];
  'tasks.add': (a: { examId: number; position: number }) => { data: ExamData; taskId: number };
  'tasks.update': (a: { id: number; label?: string; maxQp?: number }) => ExamData;
  'tasks.move': (a: { id: number; position: number }) => ExamData;
  'tasks.delete': (a: { id: number }) => ExamData;
  'tasks.snapshot': (a: { id: number }) => TaskSnapshot;
  'tasks.restore': (a: TaskSnapshot) => { data: ExamData; taskId: number };
  'scores.set': (a: { examId: number; changes: ScoreChange[] }) => ExamData;
  'participation.set': (a: { examId: number; studentId: number; status: ParticipationStatus }) => ExamData;
  'output.print': (a: { examId: number; mode: PrintMode }) => void;
  'output.pdf': (a: { examId: number; mode: PrintMode }) => string | null;
  'output.csv': (a: { examId: number }) => string | null;
  'print.ready': (a: void) => void;
  'backup.export': (a: { password: string }) => string | null;
  'backup.pick': (a: void) => string | null;
  'backup.inspect': (a: { password: string }) => BackupCounts;
  'backup.import': (a: void) => void;
  'backup.cancel': (a: void) => void;
  'clipboard.read': (a: void) => string;
  'clipboard.write': (a: { text: string }) => void;
}

export type ApiMethod = keyof ApiMethods;
export type ApiArg<K extends ApiMethod> = Parameters<ApiMethods[K]>[0];
export type ApiResult<K extends ApiMethod> = ReturnType<ApiMethods[K]>;

export type ApiResponse<T> = { ok: true; value: T } | { ok: false; error: string; user: boolean };

export interface Bridge {
  invoke<K extends ApiMethod>(method: K, arg: ApiArg<K>): Promise<ApiResponse<ApiResult<K>>>;
  /** Subscribes to main → renderer events ("data-reset"). Returns an unsubscribe function. */
  on(event: 'data-reset', fn: () => void): () => void;
}
