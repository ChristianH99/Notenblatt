/**
 * Per-row results and exam statistics. Every truncation works on exact
 * integer sums and counts, never on rounded floats.
 */
import type { ParticipationStatus, RoundingRule, Scheme } from '../types';
import { combinedGrade10, errorGrade10 } from './errors';
import { linBand, linGrade10, linIsLow } from './lin6';
import { npGrade, npGroup, npIsLow } from './np15';
import { idiv, idivRound, idivRule } from './units';

/** Error grading of an exam: weights of the points grade and the error grade (hundredths). */
export interface ErrorWeights {
  pointsWeightC: number;
  errorsWeightC: number;
}

export interface StatsInput {
  scheme: Scheme;
  /** Max points per task, in qp. */
  taskMaxQp: number[];
  /**
   * totalQp: directly entered sum; when set, the task values of the row are ignored.
   * halfErrors: error count × 2 (exams with error grading only).
   */
  rows: { status: ParticipationStatus; values: (number | null)[]; totalQp?: number | null; halfErrors?: number | null }[];
  /** Rounding of the grade averages (default: truncate). */
  rounding?: RoundingRule;
  /** Set for exams with error grading (grades 1–6 only). */
  errorWeights?: ErrorWeights | null;
}

export interface RowResult {
  status: ParticipationStatus;
  enteredCount: number;
  /** The sum was entered directly; task values are ignored. */
  override: boolean;
  missingCount: number;
  /** Has a result (present and at least one entry; with error grading: points and errors). */
  participant: boolean;
  /** Sum of points; set as soon as the points part has a result. */
  sumQp: number | null;
  /** NP 0…15 (NP15 scheme only). */
  np: number | null;
  /** Linear grade × 10 (LIN6 scheme only); with error grading the combined grade. */
  grade10: number | null;
  /** Error grading only: error count × 2, grade of the points part and of the errors (× 10). */
  halfErrors: number | null;
  pointsGrade10: number | null;
  errorsGrade10: number | null;
  /** NP grade group 1…6 or linear verbal band 1…6. */
  group: number | null;
  low: boolean;
}

export interface ExamStats {
  scheme: Scheme;
  maxQp: number;
  rows: RowResult[];
  participants: number;
  listed: number;
  absent: number;
  /** Per task: average in tenths of a point, truncated; null without values. */
  taskAvgTenths: (number | null)[];
  /** Per task: integer percent (rounded) of truncated average / max. */
  taskSharePct: (number | null)[];
  /** Average sum in tenths of a point, truncated. */
  sumAvgTenths: number | null;
  /** Average grade in hundredths (NP or linear grade), rounded by the course's rule. */
  gradeAvgHundredths: number | null;
  /** Error grading only: average grade of the points part and of the errors, in hundredths. */
  pointsGradeAvgHundredths: number | null;
  errorsGradeAvgHundredths: number | null;
  /** NP: index = NP 0…15. LIN: index = band − 1 (0…5). */
  counts: number[];
  /** Count per group/band 1…6 (index group − 1). */
  groupCounts: number[];
  /** Percent per group/band in tenths (rounded), null without participants. */
  groupPctTenths: (number | null)[];
  /** "Note 5 und 6" share in tenths of a percent (rounded). */
  lowPctTenths: number | null;
}

export function pctTenths(count: number, total: number): number | null {
  if (total <= 0) return null;
  return idivRound(count * 1000, total);
}

export function rowResult(
  scheme: Scheme,
  maxQp: number,
  status: ParticipationStatus,
  values: (number | null)[],
  totalQp: number | null = null,
): RowResult {
  let entered = 0;
  let sum = 0;
  const override = totalQp !== null;
  if (override) {
    sum = totalQp;
    entered = values.length;
  } else {
    for (const v of values) {
      if (v !== null) {
        entered++;
        sum += v;
      }
    }
  }
  const participant = status === 'present' && (entered > 0 || override) && maxQp > 0;
  const base: RowResult = {
    status,
    enteredCount: entered,
    override,
    missingCount: values.length - entered,
    participant,
    sumQp: null,
    np: null,
    grade10: null,
    halfErrors: null,
    pointsGrade10: null,
    errorsGrade10: null,
    group: null,
    low: false,
  };
  if (!participant) return base;
  base.sumQp = sum;
  if (scheme === 'NP15') {
    const np = npGrade(sum, maxQp);
    base.np = np;
    base.group = npGroup(np);
    base.low = npIsLow(np);
  } else {
    const g10 = linGrade10(sum, maxQp);
    base.grade10 = g10;
    base.group = linBand(g10);
    base.low = linIsLow(g10);
  }
  return base;
}

/**
 * Adds the error part to a row of a linear points exam. The row has a result only when both the
 * points and the error count are entered; the sum and the part grades are kept either way.
 */
export function withErrors(row: RowResult, halfErrors: number | null, w: ErrorWeights, rounding: RoundingRule): RowResult {
  const r: RowResult = { ...row, halfErrors: null, pointsGrade10: null, errorsGrade10: null };
  if (r.status !== 'present') return r;
  r.pointsGrade10 = row.participant ? row.grade10 : null;
  if (halfErrors !== null) {
    r.halfErrors = halfErrors;
    r.errorsGrade10 = errorGrade10(halfErrors);
  }
  if (r.pointsGrade10 === null || r.errorsGrade10 === null) {
    return { ...r, participant: false, grade10: null, group: null, low: false };
  }
  const g10 = combinedGrade10(r.pointsGrade10, r.errorsGrade10, w.pointsWeightC, w.errorsWeightC, rounding);
  return { ...r, grade10: g10, group: linBand(g10), low: linIsLow(g10) };
}

/**
 * Statistics when the grade of each row is given directly (mark-only exams).
 * grade = NP (NP15) or grade × 10 (LIN6); null = no mark.
 */
export function computeStatsFromResults(
  scheme: Scheme,
  input: { status: ParticipationStatus; grade: number | null }[],
  rounding: RoundingRule = 'truncate',
): ExamStats {
  const rows: RowResult[] = input.map((r) => {
    const participant = r.status === 'present' && r.grade !== null;
    const base: RowResult = {
      status: r.status,
      enteredCount: r.grade === null ? 0 : 1,
      override: false,
      missingCount: 0,
      participant,
      sumQp: null,
      np: null,
      grade10: null,
      halfErrors: null,
      pointsGrade10: null,
      errorsGrade10: null,
      group: null,
      low: false,
    };
    if (!participant) return base;
    const g = r.grade as number;
    if (scheme === 'NP15') {
      base.np = g;
      base.group = npGroup(g);
      base.low = npIsLow(g);
    } else {
      base.grade10 = g;
      base.group = linBand(g);
      base.low = linIsLow(g);
    }
    return base;
  });
  return aggregate(scheme, 0, rows, [], [], rounding, false);
}

/** Average of grade × 10 values in hundredths, rounded by the rule (lower is better); null without values. */
function avg10(values: (number | null)[], rounding: RoundingRule): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? idivRule(v.reduce((a, b) => a + b, 0) * 10, v.length, rounding, true) : null;
}

function aggregate(
  scheme: Scheme,
  maxQp: number,
  rows: RowResult[],
  taskAvgTenths: (number | null)[],
  taskSharePct: (number | null)[],
  rounding: RoundingRule,
  errorGrading: boolean,
): ExamStats {
  const parts = rows.filter((r) => r.participant);
  const n = parts.length;
  const counts = new Array<number>(scheme === 'NP15' ? 16 : 6).fill(0);
  const groupCounts = new Array<number>(6).fill(0);
  // With error grading a row can have its points before its errors: the sum counts on its own.
  const sums = rows.filter((r) => r.status === 'present' && r.sumQp !== null).map((r) => r.sumQp as number);
  let gradeTotal = 0;
  let low = 0;
  for (const r of parts) {
    if (scheme === 'NP15') {
      const np = r.np as number;
      counts[np] = (counts[np] as number) + 1;
      gradeTotal += np;
    } else {
      const band = r.group as number;
      counts[band - 1] = (counts[band - 1] as number) + 1;
      gradeTotal += r.grade10 as number;
    }
    const g = r.group as number;
    groupCounts[g - 1] = (groupCounts[g - 1] as number) + 1;
    if (r.low) low++;
  }
  return {
    scheme,
    maxQp,
    rows,
    participants: n,
    listed: rows.length,
    absent: rows.filter((r) => r.status === 'absent').length,
    taskAvgTenths,
    taskSharePct,
    sumAvgTenths: sums.length ? idiv(sums.reduce((a, b) => a + b, 0) * 10, 4 * sums.length) : null,
    // NP: hundredths of NP = total·100/n. Linear: grade10 total → hundredths = total·10/n.
    gradeAvgHundredths: n ? idivRule(gradeTotal * (scheme === 'NP15' ? 100 : 10), n, rounding, scheme !== 'NP15') : null,
    pointsGradeAvgHundredths: errorGrading ? avg10(rows.map((r) => r.pointsGrade10), rounding) : null,
    errorsGradeAvgHundredths: errorGrading ? avg10(rows.map((r) => r.errorsGrade10), rounding) : null,
    counts,
    groupCounts,
    groupPctTenths: groupCounts.map((c) => pctTenths(c, n)),
    lowPctTenths: pctTenths(low, n),
  };
}

export function computeStats(input: StatsInput): ExamStats {
  const { scheme, taskMaxQp } = input;
  const maxQp = taskMaxQp.reduce((a, b) => a + b, 0);
  const rounding = input.rounding ?? 'truncate';
  const ew = scheme === 'LIN6' ? (input.errorWeights ?? null) : null;
  const rows = input.rows.map((r) => {
    const row = rowResult(scheme, maxQp, r.status, r.values, r.totalQp ?? null);
    return ew ? withErrors(row, r.halfErrors ?? null, ew, rounding) : row;
  });

  const taskAvgTenths: (number | null)[] = [];
  const taskSharePct: (number | null)[] = [];
  taskMaxQp.forEach((tMax, ti) => {
    let s = 0;
    let c = 0;
    input.rows.forEach((r, ri) => {
      const v = r.values[ti];
      const rr = rows[ri] as RowResult;
      // Rows with a directly entered sum have no valid task values.
      if (rr.sumQp !== null && !rr.override && v !== null && v !== undefined) {
        s += v;
        c++;
      }
    });
    if (c === 0) {
      taskAvgTenths.push(null);
      taskSharePct.push(null);
    } else {
      const avg = idiv(s * 10, 4 * c);
      taskAvgTenths.push(avg);
      // share = (avg/10) / (tMax/4) · 100 = avg · 40 / tMax
      taskSharePct.push(idivRound(avg * 40, tMax));
    }
  });

  return aggregate(scheme, maxQp, rows, taskAvgTenths, taskSharePct, rounding, ew !== null);
}
