/**
 * Weighted overall average of a student across all exams of a class, and the final mark.
 *
 * Values are integers on the class's grading system: NP (0–15) or grade × 10 (10–60).
 * Weights are integers in hundredths (300 = ×3).
 *
 * Every graded exam counts individually with the weight of its category:
 *   Ø = Σ w_k(e) · g_e / Σ w_k(e)
 * The average is kept as an exact fraction (BigInt); the display value (hundredths) and the
 * final mark are both rounded from the exact fraction by the course's rounding rule — never
 * from an already rounded value.
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
  /** Plain mean of the category in hundredths of a grade (NP: 1,94 → 194; linear: 2,35 → 235), rounded by the rule. */
  avgHundredths: number;
}

/** Exact weighted average in stored units (NP or grade × 10): num / den. */
export interface Fraction {
  num: bigint;
  den: bigint;
}

export interface StudentAverage {
  perCategory: Map<number, CategoryResult>;
  /** Weighted overall average in hundredths, rounded by the rule; null without any grade. */
  overallHundredths: number | null;
  exact: Fraction | null;
  count: number;
}

/** Hundredths per stored unit: NP 1 → 100; grade10 1 → 10. */
export function unitHundredths(system: Scheme): bigint {
  return system === 'NP15' ? 100n : 10n;
}

/**
 * num/den (num ≥ 0, den > 0) to an integer by the rounding rule. lowerIsBetter decides the tie
 * of half_favor: grades 1–6 go down at exactly x,5 (the better grade), NP go up.
 */
export function divRule(num: bigint, den: bigint, rule: RoundingRule, lowerIsBetter: boolean): bigint {
  if (rule === 'truncate') return num / den;
  if (rule === 'half_favor' && lowerIsBetter) return (2n * num + den - 1n) / (2n * den); // ceil(x − 1/2)
  return (2n * num + den) / (2n * den); // floor(x + 1/2)
}

export function studentAverage(system: Scheme, weights: Map<number, number>, entries: WeightedEntry[], rule: RoundingRule = 'truncate'): StudentAverage {
  const lower = system !== 'NP15';
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
    c.avgHundredths = Number(divRule(BigInt(c.sum) * k, BigInt(c.count), rule, lower));
  }
  if (used.length === 0) return { perCategory, overallHundredths: null, exact: null, count: 0 };
  let num = 0n;
  let den = 0n;
  for (const e of used) {
    const w = BigInt(weights.get(e.categoryId) as number);
    num += w * BigInt(e.value);
    den += w;
  }
  return { perCategory, overallHundredths: Number(divRule(num * k, den, rule, lower)), exact: { num, den }, count: used.length };
}

/**
 * Final mark from the exact average, in stored units: NP (whole) or grade × 10
 * (a multiple of 10 for whole grades, any tenth for one decimal). null without grades.
 */
export function finalMark(system: Scheme, exact: Fraction | null, rule: RoundingRule, digits: RoundingDigits): number | null {
  if (!exact) return null;
  const { num, den } = exact;
  if (system === 'NP15') {
    // Higher NP is better: x,5 goes up for both rounding rules.
    return Math.min(15, Math.max(0, Number(divRule(num, den, rule, false))));
  }
  // Linear: value t = num/den in tenths of a grade; lower is better.
  const g10 = digits === 1 ? Number(divRule(num, den, rule, true)) : 10 * Number(divRule(num, 10n * den, rule, true));
  return Math.min(60, Math.max(10, g10));
}

/** "13" (NP), "2" (whole grade), "2,3" (one decimal). */
export function formatFinalMark(system: Scheme, v: number | null, digits: RoundingDigits): string {
  if (v === null) return '';
  if (system === 'NP15') return String(v);
  return digits === 0 ? String(v / 10) : `${Math.trunc(v / 10)},${v % 10}`;
}
