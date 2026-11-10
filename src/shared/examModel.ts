/** Turns raw ExamData into an aligned grid model with computed statistics. */
import { formatErrors } from './grading/errors';
import { computeMarkStats } from './grading/marks';
import { computeStats, type ExamStats } from './grading/stats';
import { formatGrade10, formatQp } from './parse/number';
import type { ExamData } from './types';

export interface ExamModel {
  data: ExamData;
  /** values[row][taskIndex] in qp or null. */
  values: (number | null)[][];
  /** marks[row] for mark-only exams (NP or grade × 10), else empty. */
  marks: (number | null)[];
  /** totals[row]: directly entered sum in qp, or null. */
  totals: (number | null)[];
  /** errors[row]: error count × 2 (exams with error grading), or null. */
  errors: (number | null)[];
  stats: ExamStats;
  maxQp: number;
}

export function scoreKey(taskId: number, studentId: number): string {
  return `${taskId}:${studentId}`;
}

/** The exam is graded with an additional error count (only possible with grades 1–6). */
export function hasErrorGrading(data: ExamData): boolean {
  return data.exam.entryMode === 'points' && data.exam.errorGrading && data.exam.scheme === 'LIN6';
}

export function buildExamModel(data: ExamData): ExamModel {
  const rounding = data.course.rounding;
  if (data.exam.entryMode === 'grade') {
    const mm = new Map(data.marks.map((m) => [m.studentId, m.value]));
    const marks = data.students.map((st) => mm.get(st.id) ?? null);
    const stats = computeMarkStats(
      data.exam.scheme,
      data.students.map((st, i) => ({ status: st.status, value: marks[i] ?? null })),
      rounding,
    );
    const none = data.students.map(() => null);
    return { data, values: data.students.map(() => []), marks, totals: none, errors: none, stats, maxQp: 0 };
  }
  const map = new Map<string, number>();
  for (const s of data.scores) map.set(scoreKey(s.taskId, s.studentId), s.qp);
  const values = data.students.map((st) => data.tasks.map((t) => map.get(scoreKey(t.id, st.id)) ?? null));
  const tm = new Map((data.totals ?? []).map((t) => [t.studentId, t.qp]));
  const totals = data.students.map((st) => tm.get(st.id) ?? null);
  const withErrors = hasErrorGrading(data);
  const em = new Map((data.errors ?? []).map((x) => [x.studentId, x.halfErrors]));
  const errors = data.students.map((st) => (withErrors ? (em.get(st.id) ?? null) : null));
  const stats = computeStats({
    scheme: data.exam.scheme,
    taskMaxQp: data.tasks.map((t) => t.maxQp),
    rows: data.students.map((st, i) => ({ status: st.status, values: values[i] as (number | null)[], totalQp: totals[i] ?? null, halfErrors: errors[i] ?? null })),
    rounding,
    errorWeights: withErrors ? { pointsWeightC: data.course.pointsWeightC, errorsWeightC: data.course.errorsWeightC } : null,
  });
  return { data, values, marks: [], totals, errors, stats, maxQp: stats.maxQp };
}

/** Result text of a row: "12" (NP) or "2,4" (linear), "" without result, "–" if absent. */
export function resultText(model: ExamModel, row: number): string {
  const r = model.stats.rows[row];
  if (!r) return '';
  if (r.status === 'absent') return '–';
  if (!r.participant) return '';
  return model.data.exam.scheme === 'NP15' ? String(r.np) : formatGrade10(r.grade10 as number);
}

/** Error grading: grade of the points part or of the errors ("2,4"), "" without one, "–" if absent. */
export function partText(model: ExamModel, row: number, part: 'points' | 'errors'): string {
  const r = model.stats.rows[row];
  if (!r) return '';
  if (r.status === 'absent') return '–';
  const g = part === 'points' ? r.pointsGrade10 : r.errorsGrade10;
  return g === null ? '' : formatGrade10(g);
}

/** Error count of a row ("3,5"), "" without one, "–" if absent. */
export function errorsText(model: ExamModel, row: number): string {
  if (model.data.students[row]?.status === 'absent') return '–';
  const e = model.errors[row] ?? null;
  return e === null ? '' : formatErrors(e);
}

export function sumText(model: ExamModel, row: number): string {
  const r = model.stats.rows[row];
  if (!r) return '';
  if (r.status === 'absent') return '–';
  return r.sumQp === null ? '' : formatQp(r.sumQp);
}

export function statusText(model: ExamModel, row: number): string {
  const r = model.stats.rows[row];
  if (!r) return '';
  if (r.status === 'absent') return 'fehlt';
  if (r.participant) return 'teilgenommen';
  // Error grading: points or errors entered, but not both.
  return r.sumQp !== null || r.halfErrors !== null ? 'unvollständig' : 'nicht erfasst';
}
