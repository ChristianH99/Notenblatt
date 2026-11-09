/**
 * Scheme A: "Notenpunkte 0–15" (from Notentabelle_Excel.xlsx).
 *
 * Upper bound for NP g (0…14): U(g) = floor(M · k_g / 120) points, U(15) = M.
 * In quarter points: Uq(g) = 4 · floor(Mq · k_g / 480).
 * Grade: highest g in 15…1 with Pq > Uq(g − 1), otherwise 0.
 */
import { idiv, type StepQp } from './units';

/** k_g for g = 0 … 14 (index = g). */
export const NP_K: readonly number[] = [24, 32, 40, 48, 54, 60, 66, 72, 78, 84, 90, 96, 102, 108, 114];

/** Upper bound of NP grade g, in qp. */
export function npUpperQp(g: number, maxQp: number): number {
  if (g === 15) return maxQp;
  const k = NP_K[g];
  if (k === undefined) throw new RangeError(`NP grade out of range: ${g}`);
  return 4 * idiv(maxQp * k, 480);
}

/** NP grade 0…15 for a total of pointsQp out of maxQp. */
export function npGrade(pointsQp: number, maxQp: number): number {
  for (let g = 15; g >= 1; g--) {
    if (pointsQp > npUpperQp(g - 1, maxQp)) return g;
  }
  return 0;
}

/** Grade group ("Note" 1–6) of an NP value. */
export function npGroup(np: number): number {
  if (np >= 13) return 1;
  if (np >= 10) return 2;
  if (np >= 7) return 3;
  if (np >= 4) return 4;
  if (np >= 1) return 5;
  return 6;
}

/** NP values belonging to group 1…6, highest first. */
export function npGroupMembers(group: number): number[] {
  if (group === 6) return [0];
  const top = 15 - (group - 1) * 3;
  return [top, top - 1, top - 2];
}

export interface NpKeyRow {
  np: number;
  /** Smallest reachable total for this NP (qp), or null if unreachable. */
  minQp: number | null;
  /** Largest total for this NP (qp), or null if unreachable. */
  maxQp: number | null;
  reachable: boolean;
}

/** Key table rows for NP 15 … 0. */
export function npKey(maxQp: number, stepQp: StepQp): NpKeyRow[] {
  const rows: NpKeyRow[] = [];
  for (let g = 15; g >= 0; g--) {
    const hi = npUpperQp(g, maxQp);
    const lo = g === 0 ? 0 : (idiv(npUpperQp(g - 1, maxQp), stepQp) + 1) * stepQp;
    const reachable = lo <= hi;
    rows.push({ np: g, minQp: reachable ? lo : null, maxQp: reachable ? hi : null, reachable });
  }
  return rows;
}

/** Low result in the NP scheme (shown in dark red; counts for "Note 5 und 6"). */
export function npIsLow(np: number): boolean {
  return np <= 3;
}
