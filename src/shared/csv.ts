/** CSV export for German Excel: ";" separator, UTF-8 with BOM, decimal comma, CRLF. */
import { buildExamModel, errorsText, hasErrorGrading, partText, resultText, statusText, sumText } from './examModel';
import { formatQp } from './parse/number';
import type { ExamData } from './types';

function field(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Joins rows of fields into the final file content (BOM + CRLF). */
export function csvFile(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map(field).join(';')).join('\r\n') + '\r\n';
}

const noDash = (s: string): string => (s === '–' ? '' : s);

export function examCsv(data: ExamData): string {
  const model = buildExamModel(data);
  if (data.exam.entryMode === 'grade') {
    return csvFile([
      ['Nr', 'Name', 'Vorname', 'Note', 'Status'],
      ...data.students.map((st, i) => [String(st.nr), st.lastName, st.firstName, noDash(resultText(model, i)), statusText(model, i)]),
    ]);
  }
  const errors = hasErrorGrading(data);
  // Total-only exams: the single task holds the total, so only the sum is exported.
  const tasks = data.exam.perTask ? data.tasks : [];
  return csvFile([
    ['Nr', 'Name', 'Vorname', ...tasks.map((t) => t.label), 'Summe', ...(errors ? ['Note Punkte', 'Fehler', 'Note Fehler'] : []), 'Note', 'Status'],
    ...data.students.map((st, i) => [
      String(st.nr),
      st.lastName,
      st.firstName,
      // A directly entered sum replaces the task values (they are not exported).
      ...(model.values[i] as (number | null)[]).slice(0, tasks.length).map((v) => (v === null || model.totals[i] !== null ? '' : formatQp(v))),
      noDash(sumText(model, i)),
      ...(errors ? [noDash(partText(model, i, 'points')), noDash(errorsText(model, i)), noDash(partText(model, i, 'errors'))] : []),
      noDash(resultText(model, i)),
      statusText(model, i),
    ]),
  ]);
}
