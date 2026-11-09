/**
 * All point values are integers in quarter points (qp): 1 point = 4 qp.
 * Nothing that decides a grade ever uses floating-point division.
 */

export const QP_PER_POINT = 4;

/** Allowed point steps, in qp: 1 = 0,25 · 2 = 0,5 · 4 = 1. */
export type StepQp = 1 | 2 | 4;
export const STEPS: readonly StepQp[] = [4, 2, 1];

export function isStepQp(n: number): n is StepQp {
  return n === 1 || n === 2 || n === 4;
}

/** Integer floor division for non-negative numerator and positive denominator. */
export function idiv(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b <= 0 || a < 0) {
    throw new RangeError(`idiv: invalid operands ${a}/${b}`);
  }
  return (a - (a % b)) / b;
}

/** Round-half-up of a/b for non-negative a and positive b (integers). */
export function idivRound(a: number, b: number): number {
  return idiv(2 * a + b, 2 * b);
}

/** All step values 0, step, 2·step … maxQp (maxQp must be a multiple of step). */
export function stepValues(maxQp: number, stepQp: StepQp): number[] {
  const out: number[] = [];
  for (let v = 0; v <= maxQp; v += stepQp) out.push(v);
  return out;
}

export function isMultipleOfStep(qp: number, stepQp: StepQp): boolean {
  return qp % stepQp === 0;
}
