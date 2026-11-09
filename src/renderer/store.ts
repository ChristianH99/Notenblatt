import { create } from 'zustand';
import type { ClassTreeItem, ExamData, MarkChange, ScoreChange, Settings, StartupInfo, TaskSnapshot, TotalChange } from '@shared/types';
import type { SettingKey } from '@shared/api';
import { ApiError, call } from './api';

export type CourseTab = 'overview' | 'exams' | 'grading';

export type Route =
  | { view: 'home' }
  | { view: 'class'; classId: number }
  | { view: 'course'; courseId: number; tab?: CourseTab }
  | { view: 'exam'; examId: number }
  | { view: 'settings' }
  | { view: 'help' }
  | { view: 'retention' };

export type DialogState =
  | { kind: 'newClass' }
  | { kind: 'newCourse'; classId: number }
  | { kind: 'newExam'; courseId: number | null; categoryId?: number }
  | { kind: 'corrupt'; renamedTo: string }
  | { kind: 'backupExport' }
  | { kind: 'backupImport' }
  | { kind: 'wipe' }
  | { kind: 'deleteClass'; classId: number }
  | { kind: 'deleteCourse'; courseId: number }
  | { kind: 'deleteExam'; examId: number }
  | { kind: 'deleteStudents'; ids: number[] }
  | { kind: 'fullKey'; examId: number }
  | { kind: 'storageLocation' }
  | { kind: 'encrypt' }
  | { kind: 'changePassword' }
  | { kind: 'decrypt' };

export type UndoEntry =
  | { kind: 'cells'; changes: { taskId: number; studentId: number; before: number | null; after: number | null }[] }
  | { kind: 'marks'; changes: { studentId: number; before: number | null; after: number | null }[] }
  | { kind: 'totals'; changes: { studentId: number; before: number | null; after: number | null }[] }
  | { kind: 'task-update'; taskId: number; before: { label: string; maxQp: number }; after: { label: string; maxQp: number } }
  | { kind: 'task-add'; taskId: number; snapshot: TaskSnapshot | null }
  | { kind: 'task-delete'; taskId: number; snapshot: TaskSnapshot }
  | { kind: 'task-move'; taskId: number; from: number; to: number };

const UNDO_LIMIT = 100;

export interface Flash {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

interface State {
  ready: boolean;
  startup: StartupInfo | null;
  settings: Settings;
  tree: ClassTreeItem[];
  route: Route;
  exam: ExamData | null;
  save: { state: 'idle' | 'saved' | 'error'; error: string };
  flash: Flash | null;
  dialog: DialogState | null;
  navPref: 'auto' | 'open' | 'closed';
  panelHidden: boolean;
  retentionDismissed: boolean;
  undo: Record<number, UndoEntry[]>;
  redo: Record<number, UndoEntry[]>;
  /** Bumped whenever class/student data changed, so views reload. */
  version: number;
}

const DEFAULT_SETTINGS: Settings = {
  teacher: '',
  school: '',
  enterDirection: 'down',
  touchMode: 'auto',
  retentionMonths: '12',
  showGradeEquivalent: false,
  lastExamId: null,
  defaultGradingSystem: 'LIN6',
  categoryTemplate: [
    { name: 'Schriftlich', weightC: 300, defaultMode: 'points' },
    { name: 'Mündlich', weightC: 100, defaultMode: 'grade' },
  ],
  defaultRounding: 'half_up',
  defaultRoundingDigits: 1,
};

export const useStore = create<State>(() => ({
  ready: false,
  startup: null,
  settings: DEFAULT_SETTINGS,
  tree: [],
  route: { view: 'home' },
  exam: null,
  save: { state: 'idle', error: '' },
  flash: null,
  dialog: null,
  navPref: 'auto',
  panelHidden: false,
  retentionDismissed: false,
  undo: {},
  redo: {},
  version: 0,
}));

export function bumpVersion(): void {
  set({ version: get().version + 1 });
}

const set = useStore.setState;
const get = useStore.getState;

let flashSeq = 0;
let flashTimer: ReturnType<typeof setTimeout> | null = null;

/** Shows a message in the status area for 4 s. */
export function flash(text: string, kind: Flash['kind'] = 'error'): void {
  const id = ++flashSeq;
  set({ flash: { id, text, kind } });
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    if (get().flash?.id === id) set({ flash: null });
  }, 4000);
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Unerwarteter Fehler.';
}

/**
 * Runs a write. Updates the quiet "Gespeichert" status; user errors are flashed.
 * Returns undefined if the write failed.
 */
export async function save<T>(p: Promise<T>, opts: { flashUserErrors?: boolean } = {}): Promise<T | undefined> {
  try {
    const v = await p;
    set({ save: { state: 'saved', error: '' } });
    return v;
  } catch (e) {
    const msg = errorText(e);
    if (e instanceof ApiError && e.user) {
      if (opts.flashUserErrors !== false) flash(msg);
    } else {
      set({ save: { state: 'error', error: msg } });
    }
    return undefined;
  }
}

/** Like save(), for writes without a result value: resolves to true on success. */
export async function saveOk(p: Promise<unknown>): Promise<boolean> {
  let ok = false;
  await save(
    p.then((v) => {
      ok = true;
      return v;
    }),
  );
  return ok;
}

export async function refreshTree(): Promise<void> {
  const tree = await call('classes.tree');
  set({ tree });
}

export async function init(): Promise<void> {
  const startup = await call('app.startupInfo');
  if (startup.storage.state !== 'ready') {
    // Locked (password), unreachable folder or in use elsewhere: the start gate is shown.
    set({ startup, ready: true });
    return;
  }
  const [settings, tree] = await Promise.all([call('settings.get'), call('classes.tree')]);
  set({ startup, settings, tree, ready: true });
  if (startup.corrupt) set({ dialog: { kind: 'corrupt', renamedTo: startup.corrupt.renamedTo } });
  if (settings.lastExamId !== null) {
    const ok = await openExam(settings.lastExamId, { remember: false });
    if (ok) return;
  }
  set({ route: { view: 'home' } });
}

export async function setSetting(key: SettingKey, value: string | null): Promise<void> {
  const settings = await save(call('settings.set', { key, value }));
  if (settings) set({ settings });
}

export function navigate(route: Route): void {
  set({ route });
  if (route.view !== 'exam') set({ exam: null });
}

export async function openExam(examId: number, opts: { remember?: boolean } = {}): Promise<boolean> {
  const data = await call('exams.get', { id: examId });
  if (!data) {
    if (get().settings.lastExamId === examId) await setSetting('lastExamId', null);
    return false;
  }
  set({ exam: data, route: { view: 'exam', examId } });
  if (opts.remember !== false && get().settings.lastExamId !== examId) {
    const settings = await call('settings.set', { key: 'lastExamId', value: String(examId) });
    set({ settings });
  }
  return true;
}

export function setExam(data: ExamData | undefined): void {
  if (!data) return;
  if (get().exam && get().exam?.exam.id !== data.exam.id) return;
  set({ exam: data });
}

/** Applies a local (optimistic) mark change to the open exam. */
export function applyLocalMarks(changes: MarkChange[]): void {
  const exam = get().exam;
  if (!exam) return;
  const m = new Map(exam.marks.map((x) => [x.studentId, x]));
  for (const c of changes) {
    if (c.value === null) m.delete(c.studentId);
    else m.set(c.studentId, { studentId: c.studentId, value: c.value });
  }
  set({ exam: { ...exam, marks: [...m.values()] } });
}

/** Applies a local (optimistic) change of directly entered sums to the open exam. */
export function applyLocalTotals(changes: TotalChange[]): void {
  const exam = get().exam;
  if (!exam) return;
  const m = new Map(exam.totals.map((x) => [x.studentId, x]));
  for (const c of changes) {
    if (c.qp === null) m.delete(c.studentId);
    else m.set(c.studentId, { studentId: c.studentId, qp: c.qp });
  }
  set({ exam: { ...exam, totals: [...m.values()] } });
}

let pendingWrites = 0;

/**
 * Runs a write that returns fresh ExamData. Server results are applied only
 * when no other write is in flight, so optimistic local edits never flicker.
 * After a failure the exam is re-read to show the true state.
 */
export async function examWrite(p: Promise<ExamData>): Promise<ExamData | undefined> {
  pendingWrites++;
  let data: ExamData | undefined;
  try {
    data = await save(p);
  } finally {
    pendingWrites--;
  }
  if (pendingWrites === 0) {
    if (data) setExam(data);
    else {
      const cur = get().exam;
      if (cur) setExam((await call('exams.get', { id: cur.exam.id })) ?? undefined);
    }
  }
  return data;
}

/** Applies a local (optimistic) score change to the open exam. */
export function applyLocalScores(changes: ScoreChange[]): void {
  const exam = get().exam;
  if (!exam) return;
  const key = (t: number, s: number): string => `${t}:${s}`;
  const m = new Map(exam.scores.map((x) => [key(x.taskId, x.studentId), x]));
  for (const c of changes) {
    if (c.qp === null) m.delete(key(c.taskId, c.studentId));
    else m.set(key(c.taskId, c.studentId), { taskId: c.taskId, studentId: c.studentId, qp: c.qp });
  }
  set({ exam: { ...exam, scores: [...m.values()] } });
}

// ───────────── undo / redo ─────────────

export function pushUndo(examId: number, entry: UndoEntry): void {
  const u = [...(get().undo[examId] ?? []), entry].slice(-UNDO_LIMIT);
  set({ undo: { ...get().undo, [examId]: u }, redo: { ...get().redo, [examId]: [] } });
}

export function clearAllUndo(): void {
  set({ undo: {}, redo: {} });
}

function remapTask(examId: number, from: number, to: number): void {
  const fix = (e: UndoEntry): UndoEntry => {
    if (e.kind === 'marks' || e.kind === 'totals') return e;
    if (e.kind === 'cells') return { ...e, changes: e.changes.map((c) => (c.taskId === from ? { ...c, taskId: to } : c)) };
    return { ...e, taskId: e.taskId === from ? to : e.taskId };
  };
  set({
    undo: { ...get().undo, [examId]: (get().undo[examId] ?? []).map(fix) },
    redo: { ...get().redo, [examId]: (get().redo[examId] ?? []).map(fix) },
  });
}

async function applyEntry(examId: number, e: UndoEntry, dir: 'undo' | 'redo'): Promise<ExamData> {
  switch (e.kind) {
    case 'cells': {
      const changes: ScoreChange[] = e.changes.map((c) => ({ taskId: c.taskId, studentId: c.studentId, qp: dir === 'undo' ? c.before : c.after }));
      return call('scores.set', { examId, changes });
    }
    case 'marks':
      return call('marks.set', { examId, changes: e.changes.map((c) => ({ studentId: c.studentId, value: dir === 'undo' ? c.before : c.after })) });
    case 'totals':
      return call('totals.set', { examId, changes: e.changes.map((c) => ({ studentId: c.studentId, qp: dir === 'undo' ? c.before : c.after })) });
    case 'task-update': {
      const v = dir === 'undo' ? e.before : e.after;
      return call('tasks.update', { id: e.taskId, label: v.label, maxQp: v.maxQp });
    }
    case 'task-move':
      return call('tasks.move', { id: e.taskId, position: dir === 'undo' ? e.from : e.to });
    case 'task-add':
    case 'task-delete': {
      const removing = (e.kind === 'task-add') === (dir === 'undo');
      if (removing) {
        if (e.kind === 'task-add') e.snapshot = await call('tasks.snapshot', { id: e.taskId });
        return call('tasks.delete', { id: e.taskId });
      }
      const snap = e.snapshot as TaskSnapshot;
      const r = await call('tasks.restore', snap);
      remapTask(examId, e.taskId, r.taskId);
      return r.data;
    }
  }
}

let undoBusy: Promise<void> = Promise.resolve();

/** Undo/redo are serialised so rapid Ctrl+Z presses apply one entry each. */
export function undoRedo(dir: 'undo' | 'redo'): Promise<void> {
  undoBusy = undoBusy.then(() => undoRedoNow(dir)).catch(() => undefined);
  return undoBusy;
}

async function undoRedoNow(dir: 'undo' | 'redo'): Promise<void> {
  const exam = get().exam;
  if (!exam) return;
  const examId = exam.exam.id;
  const from = dir === 'undo' ? get().undo : get().redo;
  const stack = from[examId] ?? [];
  const entry = stack[stack.length - 1];
  if (!entry) {
    flash(dir === 'undo' ? 'Nichts zum Rückgängigmachen' : 'Nichts zum Wiederholen', 'info');
    return;
  }
  if (entry.kind === 'cells') {
    applyLocalScores(entry.changes.map((c) => ({ taskId: c.taskId, studentId: c.studentId, qp: dir === 'undo' ? c.before : c.after })));
  }
  if (entry.kind === 'totals') {
    applyLocalTotals(entry.changes.map((c) => ({ studentId: c.studentId, qp: dir === 'undo' ? c.before : c.after })));
  }
  if (entry.kind === 'marks') {
    applyLocalMarks(entry.changes.map((c) => ({ studentId: c.studentId, value: dir === 'undo' ? c.before : c.after })));
  }
  const data = await examWrite(applyEntry(examId, entry, dir));
  if (!data) return;
  // Re-read stacks: applyEntry may have remapped task ids.
  const src = (dir === 'undo' ? get().undo : get().redo)[examId] ?? [];
  const moved = src[src.length - 1] as UndoEntry;
  const dst = (dir === 'undo' ? get().redo : get().undo)[examId] ?? [];
  const nextSrc = src.slice(0, -1);
  const nextDst = [...dst, moved].slice(-UNDO_LIMIT);
  if (dir === 'undo') set({ undo: { ...get().undo, [examId]: nextSrc }, redo: { ...get().redo, [examId]: nextDst } });
  else set({ redo: { ...get().redo, [examId]: nextSrc }, undo: { ...get().undo, [examId]: nextDst } });
}

/**
 * Re-initialises all renderer state after a data reset (import / wipe).
 * Navigation is blocked for security, so no page reload is used. Clears undo
 * history and every cached exam/class.
 */
export function hardReload(): void {
  pendingWrites = 0;
  set({
    ready: false,
    startup: null,
    settings: DEFAULT_SETTINGS,
    tree: [],
    route: { view: 'home' },
    exam: null,
    save: { state: 'idle', error: '' },
    flash: null,
    dialog: null,
    retentionDismissed: false,
    undo: {},
    redo: {},
    version: get().version + 1,
  });
  void init();
}
