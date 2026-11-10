/**
 * Error grading ("Fehlerbewertung"): a points exam graded 1,0–6,0 can also count errors
 * (e.g. language errors). The errors give a second grade from a fixed table; the exam grade is
 * the weighted mean of the points grade and the error grade, rounded to one decimal by the
 * course's rounding rule. Error counts are integers in half errors (3,5 errors = 7).
 *
 * Table: each error costs 0,3 of a grade up to 9 errors, from the 10th error on 0,5.
 * A half error costs half of that (0,15 below 10 errors, 0,25 from 10 on), truncated to one
 * decimal: 3,5 errors → 1,9 + 0,15 = 2,05 → 2,0. From 14 errors on: 6,0.
 */
import type { RoundingRule } from '../types';
import { idivRule } from './units';

/** Grade × 10 for 0, 0,5, 1 … 14 errors (index = half errors). */
export const ERROR_GRADES10: readonly number[] = [
  10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28, 29, 31, 32, 34, 35, 37, 38, 42, 44, 47, 49, 52, 54, 57, 59, 60,
];

/** Largest accepted error count, in half errors (999,5 errors). */
export const MAX_HALF_ERRORS = 1999;

export function errorGrade10(halfErrors: number): number {
  if (!Number.isInteger(halfErrors) || halfErrors < 0) throw new RangeError(`errorGrade10: invalid count ${halfErrors}`);
  return ERROR_GRADES10[Math.min(halfErrors, ERROR_GRADES10.length - 1)] as number;
}

/**
 * Exam grade × 10 from the points grade and the error grade (both × 10), weighted
 * points : errors (weights in hundredths), rounded to tenths by the rule (lower grade is better).
 */
export function combinedGrade10(pointsGrade10: number, errorsGrade10: number, pointsWeightC: number, errorsWeightC: number, rule: RoundingRule): number {
  return idivRule(pointsWeightC * pointsGrade10 + errorsWeightC * errorsGrade10, pointsWeightC + errorsWeightC, rule, true);
}

export type ErrorParse = { ok: true; halfErrors: number | null } | { ok: false; error: string };

/** "3", "3,5", "3.5", ",5" → half errors. Empty input deletes the entry. */
export function parseErrors(raw: string): ErrorParse {
  const s = raw.trim();
  if (s === '') return { ok: true, halfErrors: null };
  if (/^-/.test(s)) return { ok: false, error: 'Negative Werte sind nicht erlaubt' };
  const m = /^(\d*)(?:[.,](\d*))?$/.exec(s);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return { ok: false, error: 'Bitte die Anzahl der Fehler eingeben' };
  const frac = (m[2] ?? '').replace(/0+$/, '');
  if (frac !== '' && frac !== '5') return { ok: false, error: 'Fehler: nur ganze oder halbe Fehler erlaubt' };
  if ((m[1] ?? '').replace(/^0+/, '').length > 3) return { ok: false, error: 'Fehler: höchstens 999,5' };
  return { ok: true, halfErrors: Number(m[1] || '0') * 2 + (frac === '5' ? 1 : 0) };
}

/** 7 → "3,5", 6 → "3". */
export function formatErrors(halfErrors: number): string {
  return `${Math.floor(halfErrors / 2)}${halfErrors % 2 === 1 ? ',5' : ''}`;
}
