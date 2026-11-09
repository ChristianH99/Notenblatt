/** Turns raw ExamData into an aligned grid model with computed statistics. */
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
  stats: ExamStats;
  maxQp: number;
}

export function scoreKey(taskId: number, studentId: number): string {
  return `${taskId}:${studentId}`;
}

export function buildExamModel(data: ExamData): ExamModel {
  if (data.exam.entryMode === 'grade') {
    const mm = new Map(data.marks.map((m) => [m.studentId, m.value]));
    const marks = data.students.map((st) => mm.get(st.id) ?? null);
    const stats = computeMarkStats(
      data.exam.scheme,
      data.students.map((st, i) => ({ status: st.status, value: marks[i] ?? null })),
    );
    return { data, values: data.students.map(() => []), marks, totals: data.students.map(() => null), stats, maxQp: 0 };
  }
  const map = new Map<string, number>();
  for (const s of data.scores) map.set(scoreKey(s.taskId, s.studentId), s.qp);
  const values = data.students.map((st) => data.tasks.map((t) => map.get(scoreKey(t.id, st.id)) ?? null));
  const tm = new Map((data.totals ?? []).map((t) => [t.studentId, t.qp]));
  const totals = data.students.map((st) => tm.get(st.id) ?? null);
  const stats = computeStats({
    scheme: data.exam.scheme,
    taskMaxQp: data.tasks.map((t) => t.maxQp),
    rows: data.students.map((st, i) => ({ status: st.status, values: values[i] as (number | null)[], totalQp: totals[i] ?? null })),
  });
  return { data, values, marks: [], totals, stats, maxQp: stats.maxQp };
}

/** Result text of a row: "12" (NP) or "2,4" (linear), "" without result, "–" if absent. */
export function resultText(model: ExamModel, row: number): string {
  const r = model.stats.rows[row];
  if (!r) return '';
  if (r.status === 'absent') return '–';
  if (!r.participant) return '';
  return model.data.exam.scheme === 'NP15' ? String(r.np) : formatGrade10(r.grade10 as number);
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
  return r.participant ? 'teilgenommen' : 'nicht erfasst';
}
