/**
 * Scheme B: "Noten 1,0–6,0 (linear)" (from Notenschlüssel_linear.xls).
 *
 * grade×10 = floor((60 · Mq − 50 · Pq) / Mq), integer division only.
 */
import { idiv, stepValues, type StepQp } from './units';

/** Linear grade × 10 (10 … 60). */
export function linGrade10(pointsQp: number, maxQp: number): number {
  if (maxQp <= 0) throw new RangeError('maxQp must be positive');
  if (pointsQp < 0 || pointsQp > maxQp) throw new RangeError('points out of range');
  return idiv(60 * maxQp - 50 * pointsQp, maxQp);
}

export const VERBAL: readonly string[] = [
  'sehr gut',
  'gut',
  'befriedigend',
  'ausreichend',
  'mangelhaft',
  'ungenügend',
];

/** Verbal band 1…6 of a grade×10 value. */
export function linBand(grade10: number): number {
  if (grade10 <= 14) return 1;
  if (grade10 <= 24) return 2;
  if (grade10 <= 34) return 3;
  if (grade10 <= 44) return 4;
  if (grade10 <= 54) return 5;
  return 6;
}

export function verbalOf(grade10: number): string {
  return VERBAL[linBand(grade10) - 1] as string;
}

/** Grade range of band b as grade×10, e.g. band 1 → [10, 14]. */
export function bandRange10(band: number): [number, number] {
  if (band === 1) return [10, 14];
  if (band === 6) return [55, 60];
  return [band * 10 - 5, band * 10 + 4];
}

/** "Note 5 und 6" in the linear scheme: grade ≥ 4,5. */
export function linIsLow(grade10: number): boolean {
  return grade10 >= 45;
}

export interface LinKeyRow {
  band: number;
  verbal: string;
  range10: [number, number];
  /** Smallest/largest total in qp yielding this band, null if none. */
  minQp: number | null;
  maxQp: number | null;
}

/** Key table rows for bands 1…6, computed by evaluating every step value. */
export function linKey(maxQp: number, stepQp: StepQp): LinKeyRow[] {
  const rows: LinKeyRow[] = [1, 2, 3, 4, 5, 6].map((band) => ({
    band,
    verbal: VERBAL[band - 1] as string,
    range10: bandRange10(band),
    minQp: null,
    maxQp: null,
  }));
  for (const p of stepValues(maxQp, stepQp)) {
    const row = rows[linBand(linGrade10(p, maxQp)) - 1] as LinKeyRow;
    if (row.minQp === null || p < row.minQp) row.minQp = p;
    if (row.maxQp === null || p > row.maxQp) row.maxQp = p;
  }
  return rows;
}
