/** Grade overview of one course: every member × every exam, per-category and weighted overall averages. */
import { buildExamModel } from './examModel';
import { formatMark } from './grading/marks';
import { finalMark, formatFinalMark, studentAverage, type StudentAverage, type WeightedEntry } from './grading/overall';
import { csvFile } from './csv';
import { examTitle } from './labels';
import { formatGrade10, formatHundredths } from './parse/number';
import { compareNames } from './parse/names';
import type { Exam, GradeCategory, OverviewData, Scheme, Student } from './types';

export interface OverviewColumn {
  exam: Exam;
  title: string;
  category: GradeCategory | null;
  /** Counts towards the overall average. */
  included: boolean;
  /** Why it is not included (German), or null. */
  reason: string | null;
  /** Class average of this exam in hundredths (rounded by the course's rule), null without results. */
  avgHundredths: number | null;
}

export interface OverviewCell {
  /** NP or grade × 10, null if no result. */
  value: number | null;
  text: string;
  absent: boolean;
}

export interface OverviewRow {
  student: Student;
  nr: number;
  cells: OverviewCell[];
  avg: StudentAverage;
  /** Rounded final mark (NP or grade × 10), null without grades or without a final mark. */
  final: number | null;
  finalText: string;
}

export interface Overview {
  system: Scheme;
  /** A final mark column is shown. */
  showFinal: boolean;
  categories: GradeCategory[];
  columns: OverviewColumn[];
  rows: OverviewRow[];
}

export function formatAvg(hundredths: number | null): string {
  return hundredths === null ? '' : formatHundredths(hundredths);
}

export function formatWeight(weightC: number): string {
  const int = Math.trunc(weightC / 100);
  const frac = weightC % 100;
  if (frac === 0) return String(int);
  return `${int},${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** "3" → 300, "1,5" → 150, "0,25" → 25. Range 0,01 … 100. */
export function parseWeight(raw: string): number | null {
  const m = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*$/.exec(raw);
  if (!m) return null;
  const v = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return v >= 1 && v <= 10000 ? v : null;
}

export function buildOverview(d: OverviewData): Overview {
  const system = d.course.gradingSystem;
  const cats = [...d.categories].sort((a, b) => a.position - b.position || a.id - b.id);
  const catPos = new Map(cats.map((c, i) => [c.id, i]));
  const exams = [...d.exams].sort(
    (a, b) =>
      (catPos.get(a.exam.categoryId ?? -1) ?? 999) - (catPos.get(b.exam.categoryId ?? -1) ?? 999) ||
      a.exam.examDate.localeCompare(b.exam.examDate) ||
      a.exam.id - b.exam.id,
  );
  const models = exams.map(buildExamModel);
  const columns: OverviewColumn[] = models.map((m) => {
    const e = m.data.exam;
    const category = cats.find((c) => c.id === e.categoryId) ?? null;
    let reason: string | null = null;
    if (!category) reason = 'Keine Kategorie zugeordnet';
    else if (e.scheme !== system) reason = system === 'NP15' ? 'Bewertung in Noten 1–6, Fach rechnet in Notenpunkten' : 'Bewertung in Notenpunkten, Fach rechnet in Noten 1–6';
    return { exam: e, title: examTitle(e), category, included: reason === null, reason, avgHundredths: m.stats.gradeAvgHundredths };
  });
  const weights = new Map(cats.map((c) => [c.id, c.weightC]));
  const students = [...d.students].sort(compareNames);
  const rows: OverviewRow[] = students.map((st, i) => {
    const entries: WeightedEntry[] = [];
    const cells = models.map((m, ci): OverviewCell => {
      const idx = m.data.students.findIndex((x) => x.id === st.id);
      const r = idx >= 0 ? m.stats.rows[idx] : undefined;
      if (!r) return { value: null, text: '', absent: false };
      if (r.status === 'absent') return { value: null, text: '–', absent: true };
      if (!r.participant) return { value: null, text: '', absent: false };
      const scheme = m.data.exam.scheme;
      const value = scheme === 'NP15' ? (r.np as number) : (r.grade10 as number);
      const col = columns[ci] as OverviewColumn;
      if (col.included && col.category) entries.push({ categoryId: col.category.id, value });
      return { value, text: scheme === 'NP15' ? formatMark(value, scheme) : formatGrade10(value), absent: false };
    });
    const avg = studentAverage(system, weights, entries, d.course.rounding);
    const final = d.course.showFinal ? finalMark(system, avg.exact, d.course.rounding, d.course.finalDigits) : null;
    return { student: st, nr: i + 1, cells, avg, final, finalText: formatFinalMark(system, final, d.course.finalDigits) };
  });
  return { system, showFinal: d.course.showFinal, categories: cats, columns, rows };
}

/** CSV of the overview (same format as the exam CSV: ";" separator, BOM, decimal comma). */
export function overviewCsv(d: OverviewData): string {
  const o = buildOverview(d);
  const header = [
    'Nr',
    'Name',
    'Vorname',
    ...o.columns.map((c) => `${c.category ? `${c.category.name}: ` : ''}${c.title}${c.included ? '' : ' (nicht gewertet)'}`),
    ...o.categories.map((c) => `Ø ${c.name} (×${formatWeight(c.weightC)})`),
    'Ø gesamt',
    ...(o.showFinal ? ['Endnote'] : []),
  ];
  return csvFile([
    header,
    ...o.rows.map((r) => [
      String(r.nr),
      r.student.lastName,
      r.student.firstName,
      ...r.cells.map((c) => (c.absent ? 'fehlt' : c.text)),
      ...o.categories.map((c) => formatAvg(r.avg.perCategory.get(c.id)?.avgHundredths ?? null)),
      formatAvg(r.avg.overallHundredths),
      ...(o.showFinal ? [r.finalText] : []),
    ]),
  ]);
}
