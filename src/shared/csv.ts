/** CSV export for German Excel: ";" separator, UTF-8 with BOM, decimal comma, CRLF. */
import { buildExamModel, resultText, statusText, sumText } from './examModel';
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
  return csvFile([
    ['Nr', 'Name', 'Vorname', ...data.tasks.map((t) => t.label), 'Summe', 'Note', 'Status'],
    ...data.students.map((st, i) => [
      String(st.nr),
      st.lastName,
      st.firstName,
      // A directly entered sum replaces the task values (they are not exported).
      ...(model.values[i] as (number | null)[]).map((v) => (v === null || model.totals[i] !== null ? '' : formatQp(v))),
      noDash(sumText(model, i)),
      noDash(resultText(model, i)),
      statusText(model, i),
    ]),
  ]);
}
