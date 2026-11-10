/**
 * Directly entered marks (exams with entry mode "grade", e.g. oral exams).
 * Values are integers: NP 0–15, or linear grade × 10 (10 … 60).
 */
import type { ParticipationStatus, RoundingRule, Scheme } from '../types';
import { linBand, linIsLow, VERBAL } from './lin6';
import { npGroup, npIsLow } from './np15';
import { computeStatsFromResults, type ExamStats } from './stats';

export type MarkParse = { ok: true; value: number | null } | { ok: false; error: string };

export function markRange(scheme: Scheme): [number, number] {
  return scheme === 'NP15' ? [0, 15] : [10, 60];
}

export function isValidMark(scheme: Scheme, v: number): boolean {
  const [lo, hi] = markRange(scheme);
  return Number.isInteger(v) && v >= lo && v <= hi;
}

/**
 * NP: whole numbers 0–15. Linear: 1–6 with at most one decimal ("2", "2,3", "2.3", "2,30").
 * Empty input deletes the mark.
 */
export function parseMark(raw: string, scheme: Scheme): MarkParse {
  const s = raw.trim();
  if (s === '') return { ok: true, value: null };
  if (scheme === 'NP15') {
    if (!/^\d{1,2}$/.test(s) || Number(s) > 15) return { ok: false, error: 'Bitte Notenpunkte von 0 bis 15 (ganze Zahl) eingeben' };
    return { ok: true, value: Number(s) };
  }
  const m = /^(\d)(?:[.,](\d)0*)?$/.exec(s);
  if (!m) {
    if (/^\d[.,]\d{2,}$/.test(s)) return { ok: false, error: 'Höchstens eine Nachkommastelle erlaubt' };
    return { ok: false, error: 'Bitte eine Note von 1,0 bis 6,0 eingeben' };
  }
  const v = Number(m[1]) * 10 + Number(m[2] ?? '0');
  if (v < 10 || v > 60) return { ok: false, error: 'Bitte eine Note von 1,0 bis 6,0 eingeben' };
  return { ok: true, value: v };
}

export function formatMark(v: number, scheme: Scheme): string {
  return scheme === 'NP15' ? String(v) : `${Math.trunc(v / 10)},${v % 10}`;
}

export function markGroup(v: number, scheme: Scheme): number {
  return scheme === 'NP15' ? npGroup(v) : linBand(v);
}

export function markIsLow(v: number, scheme: Scheme): boolean {
  return scheme === 'NP15' ? npIsLow(v) : linIsLow(v);
}

export function markVerbal(v: number, scheme: Scheme): string {
  return VERBAL[markGroup(v, scheme) - 1] as string;
}

/** Statistics for a mark-only exam, in the same shape as for point exams. */
export function computeMarkStats(scheme: Scheme, rows: { status: ParticipationStatus; value: number | null }[], rounding: RoundingRule = 'truncate'): ExamStats {
  return computeStatsFromResults(
    scheme,
    rows.map((r) => ({ status: r.status, grade: r.status === 'present' ? r.value : null })),
    rounding,
  );
}
