/**
 * Independent reference implementation using BigInt rationals and the literal
 * Excel formulations. Deliberately shares no code with src/shared/grading.
 */

class Q {
  constructor(
    readonly n: bigint,
    readonly d: bigint,
  ) {
    if (d <= 0n) throw new Error('denominator');
  }
  static of(n: bigint, d = 1n): Q {
    return new Q(n, d);
  }
  mul(o: Q): Q {
    return new Q(this.n * o.n, this.d * o.d);
  }
  div(o: Q): Q {
    const n = this.n * o.d;
    const d = this.d * o.n;
    return d < 0n ? new Q(-n, -d) : new Q(n, d);
  }
  add(o: Q): Q {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q): Q {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  /** Excel ROUNDDOWN(x, digits) for x ≥ 0 (truncation toward zero). */
  rounddown(digits: number): Q {
    const f = 10n ** BigInt(digits);
    const scaled = (this.n * f) / this.d; // BigInt division truncates toward zero
    return new Q(scaled, f);
  }
  cmp(o: Q): number {
    const a = this.n * o.d;
    const b = o.n * this.d;
    return a < b ? -1 : a > b ? 1 : 0;
  }
}

/** M and P given as quarter-point integers. */
function pts(qp: number): Q {
  return Q.of(BigInt(qp), 4n);
}

const PCT: Record<number, number> = {
  14: 95, 13: 90, 12: 85, 11: 80, 10: 75, 9: 70, 8: 65, 7: 60, 6: 55, 5: 50, 4: 45, 3: 40,
};

/** Upper bound U(g) in points, Excel: ROUNDDOWN(M * pct, 0); for 2/1/0 thirds-based. */
function upper(g: number, M: Q): Q {
  if (g === 15) return M;
  let frac: Q;
  if (g === 2) frac = Q.of(1n, 3n);
  else if (g === 1) frac = Q.of(4n, 15n);
  else if (g === 0) frac = Q.of(1n, 5n);
  else frac = Q.of(BigInt(PCT[g] as number), 100n);
  return M.mul(frac).rounddown(0);
}

/** Excel formulation for 0,5 steps: min(g) = U(g−1) + 0,5, grade = max g with P ≥ min(g). */
export function refNpHalf(pQp: number, mQp: number): number {
  const M = pts(mQp);
  const P = pts(pQp);
  for (let g = 15; g >= 1; g--) {
    const min = upper(g - 1, M).add(Q.of(1n, 2n));
    if (P.cmp(min) >= 0) return g;
  }
  return 0;
}

/** Strict formulation for any step: grade = max g with P > U(g−1). */
export function refNpStrict(pQp: number, mQp: number): number {
  const M = pts(mQp);
  const P = pts(pQp);
  for (let g = 15; g >= 1; g--) {
    if (P.cmp(upper(g - 1, M)) > 0) return g;
  }
  return 0;
}

/** Excel: Note = ROUNDDOWN(6 − 5 · P / M, 1), returned as grade × 10. */
export function refLin10(pQp: number, mQp: number): number {
  const M = pts(mQp);
  const P = pts(pQp);
  const g = Q.of(6n).sub(Q.of(5n).mul(P).div(M)).rounddown(1);
  return Number(g.mul(Q.of(10n)).n / g.mul(Q.of(10n)).d);
}
