/** Full point → grade tables ("Vollständiger Schlüssel"). */
import type { Scheme } from '../types';
import { linGrade10, verbalOf } from './lin6';
import { npGrade, npGroup } from './np15';
import { stepValues, type StepQp } from './units';

export interface FullKeyRow {
  qp: number;
  /** NP 0–15 or linear grade × 10. */
  grade: number;
  /** NP: grade group 1–6 as string. LIN: verbal grade. */
  text: string;
}

export function fullKey(scheme: Scheme, maxQp: number, stepQp: StepQp): FullKeyRow[] {
  if (maxQp <= 0) return [];
  return stepValues(maxQp, stepQp).map((qp) => {
    if (scheme === 'NP15') {
      const np = npGrade(qp, maxQp);
      return { qp, grade: np, text: String(npGroup(np)) };
    }
    const g = linGrade10(qp, maxQp);
    return { qp, grade: g, text: verbalOf(g) };
  });
}
