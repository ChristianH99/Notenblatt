/**
 * Weighted overall average of a student across all exams of a class, and the final mark.
 *
 * Values are integers on the class's grading system: NP (0–15) or grade × 10 (10–60).
 * Weights are integers in hundredths (300 = ×3).
 *
 * Every graded exam counts individually with the weight of its category:
 *   Ø = Σ w_k(e) · g_e / Σ w_k(e)
 * The average is kept as an exact fraction (BigInt); the display value is truncated to
 * hundredths (consistent with the per-exam averages), the final mark is rounded from the
 * exact fraction — never from an already truncated value.
 */
import type { RoundingDigits, RoundingRule, Scheme } from '../types';

export interface WeightedEntry {
  categoryId: number;
  /** NP or grade × 10. */
  value: number;
}

export interface CategoryResult {
  sum: number;
  count: number;
  /** Plain mean of the category in hundredths of a grade (NP: 1,94 → 194; linear: 2,35 → 235), truncated. */
  avgHundredths: number;
}

/** Exact weighted average in stored units (NP or grade × 10): num / den. */
export interface Fraction {
  num: bigint;
  den: bigint;
}

export interface StudentAverage {
  perCategory: Map<number, CategoryResult>;
  /** Weighted overall average in hundredths, truncated; null without any grade. */
  overallHundredths: number | null;
  exact: Fraction | null;
  count: number;
}

/** Hundredths per stored unit: NP 1 → 100; grade10 1 → 10. */
export function unitHundredths(system: Scheme): bigint {
  return system === 'NP15' ? 100n : 10n;
}

export function studentAverage(system: Scheme, weights: Map<number, number>, entries: WeightedEntry[]): StudentAverage {
  const k = unitHundredths(system);
  const perCategory = new Map<number, CategoryResult>();
  const used = entries.filter((e) => (weights.get(e.categoryId) ?? 0) > 0);
  for (const e of used) {
    const c = perCategory.get(e.categoryId) ?? { sum: 0, count: 0, avgHundredths: 0 };
    c.sum += e.value;
    c.count += 1;
    perCategory.set(e.categoryId, c);
  }
  for (const c of perCategory.values()) {
    c.avgHundredths = Number((BigInt(c.sum) * k) / BigInt(c.count));
  }
  if (used.length === 0) return { perCategory, overallHundredths: null, exact: null, count: 0 };
  let num = 0n;
  let den = 0n;
  for (const e of used) {
    const w = BigInt(weights.get(e.categoryId) as number);
    num += w * BigInt(e.value);
    den += w;
  }
  return { perCategory, overallHundredths: Number((num * k) / den), exact: { num, den }, count: used.length };
}

/** floor(a / b) for b > 0 and a ≥ 0. */
function fdiv(a: bigint, b: bigint): bigint {
  return a / b;
}

/**
 * Final mark from the exact average, in stored units: NP (whole) or grade × 10
 * (a multiple of 10 for whole grades, any tenth for one decimal). null for rule "none".
 */
export function finalMark(system: Scheme, exact: Fraction | null, rule: RoundingRule, digits: RoundingDigits): number | null {
  if (!exact || rule === 'none') return null;
  const { num, den } = exact;
  if (system === 'NP15') {
    // Higher NP is better: x,5 goes up for both rules.
    const v = Number(fdiv(2n * num + den, 2n * den));
    return Math.min(15, Math.max(0, v));
  }
  // Linear: value t = num/den in tenths of a grade; lower is better.
  let g10: number;
  if (digits === 1) {
    g10 =
      rule === 'half_up'
        ? Number(fdiv(2n * num + den, 2n * den)) // floor(t + 1/2)
        : Number(fdiv(2n * num + den - 1n, 2n * den)); // ceil(t − 1/2)
  } else {
    g10 =
      10 *
      (rule === 'half_up'
        ? Number(fdiv(num + 5n * den, 10n * den)) // floor(g + 1/2)
        : Number(fdiv(num + 5n * den - 1n, 10n * den))); // ceil(g − 1/2)
  }
  return Math.min(60, Math.max(10, g10));
}

/** "13" (NP), "2" (whole grade), "2,3" (one decimal). */
export function formatFinalMark(system: Scheme, v: number | null, digits: RoundingDigits): string {
  if (v === null) return '';
  if (system === 'NP15') return String(v);
  return digits === 0 ? String(v / 10) : `${Math.trunc(v / 10)},${v % 10}`;
}
