import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  bandRange10,
  fullKey,
  idiv,
  idivRound,
  isMultipleOfStep,
  isStepQp,
  linBand,
  linGrade10,
  linIsLow,
  linKey,
  npGrade,
  npGroup,
  npGroupMembers,
  npKey,
  npUpperQp,
  stepValues,
  verbalOf,
  type StepQp,
} from '@shared/grading';
import { formatGrade10, formatQp } from '@shared/parse/number';
import { GOLDEN_NP_KEY_55 } from '../fixtures/golden';
import { refLin10, refNpHalf, refNpStrict } from './reference';

const qp = (points: number): number => Math.round(points * 4);

function keyText(maxPoints: number, step: StepQp = 2): Record<number, string> {
  const out: Record<number, string> = {};
  for (const r of npKey(qp(maxPoints), step)) {
    out[r.np] = r.reachable ? `${formatQp(r.maxQp as number)}–${formatQp(r.minQp as number)}` : '–';
  }
  return out;
}

describe('units', () => {
  it('idiv floors and validates', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(0, 5)).toBe(0);
    expect(() => idiv(-1, 2)).toThrow(RangeError);
    expect(() => idiv(1, 0)).toThrow(RangeError);
    expect(() => idiv(1.5, 1)).toThrow(RangeError);
  });
  it('idivRound rounds half up', () => {
    expect(idivRound(5, 2)).toBe(3);
    expect(idivRound(4, 3)).toBe(1);
    expect(idivRound(2, 3)).toBe(1);
  });
  it('steps', () => {
    expect(isStepQp(1) && isStepQp(2) && isStepQp(4)).toBe(true);
    expect(isStepQp(3)).toBe(false);
    expect(stepValues(4, 2)).toEqual([0, 2, 4]);
    expect(isMultipleOfStep(6, 4)).toBe(false);
  });
});

describe('Notenpunkte 0–15 key', () => {
  it('M = 55 matches the workbook', () => {
    const k = keyText(55);
    for (const [np, min, max] of GOLDEN_NP_KEY_55) expect(k[np]).toBe(`${max}–${min}`);
  });

  it('M = 30 matches the workbook', () => {
    const expected =
      '15: 30–28,5 · 14: 28–27,5 · 13: 27–25,5 · 12: 25–24,5 · 11: 24–22,5 · 10: 22–21,5 · 9: 21–19,5 · 8: 19–18,5 · 7: 18–16,5 · 6: 16–15,5 · 5: 15–13,5 · 4: 13–12,5 · 3: 12–10,5 · 2: 10–8,5 · 1: 8–6,5 · 0: 6–0';
    const k = keyText(30);
    for (const part of expected.split(' · ')) {
      const [np, range] = part.split(': ') as [string, string];
      expect(k[Number(np)]).toBe(range);
    }
  });

  it('M = 37,5', () => {
    const rows = npKey(qp(37.5), 2);
    expect(formatQp(rows[0]?.minQp as number)).toBe('35,5');
    const k = keyText(37.5);
    expect(k[3]).toBe('15–12,5');
    expect(k[0]).toBe('7–0');
  });

  it('M = 1: only 15 and 0 reachable', () => {
    const rows = npKey(qp(1), 2);
    const reachable = rows.filter((r) => r.reachable).map((r) => r.np);
    expect(reachable).toEqual([15, 0]);
    expect(keyText(1)[15]).toBe('1–0,5');
    expect(keyText(1)[0]).toBe('0–0');
    expect(npGrade(qp(0.5), qp(1))).toBe(15);
    expect(npGrade(0, qp(1))).toBe(0);
  });

  it('M = 0,5: 15 and 0 reachable', () => {
    const rows = npKey(2, 2);
    expect(rows.filter((r) => r.reachable).map((r) => r.np)).toEqual([15, 0]);
    expect(keyText(0.5)[15]).toBe('0,5–0,5');
  });

  it('M = 5: NP 14, 13, 12 unreachable', () => {
    const rows = npKey(qp(5), 2);
    const unreachable = rows.filter((r) => !r.reachable).map((r) => r.np);
    expect(unreachable).toEqual(expect.arrayContaining([14, 13, 12]));
    for (const r of rows) {
      if (r.reachable) expect(npGrade(r.minQp as number, qp(5))).toBe(r.np);
    }
  });

  it('M = 999 (very large)', () => {
    const m = qp(999);
    expect(npGrade(m, m)).toBe(15);
    expect(npGrade(0, m)).toBe(0);
    for (const r of npKey(m, 2)) {
      expect(r.reachable).toBe(true);
      expect(npGrade(r.minQp as number, m)).toBe(r.np);
      expect(npGrade(r.maxQp as number, m)).toBe(r.np);
    }
  });

  it('rejects NP out of range', () => {
    expect(() => npUpperQp(16, 4)).toThrow(RangeError);
  });

  it('grade groups', () => {
    expect([15, 13, 12, 10, 9, 7, 6, 4, 3, 1, 0].map(npGroup)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
    expect(npGroupMembers(1)).toEqual([15, 14, 13]);
    expect(npGroupMembers(5)).toEqual([3, 2, 1]);
    expect(npGroupMembers(6)).toEqual([0]);
  });
});

describe('Linear 1,0–6,0', () => {
  it('reference values for M = 30', () => {
    const cases: [number, string, string][] = [
      [0, '6,0', 'ungenügend'],
      [3, '5,5', 'ungenügend'],
      [3.5, '5,4', 'mangelhaft'],
      [12, '4,0', 'ausreichend'],
      [21, '2,5', 'befriedigend'],
      [21.5, '2,4', 'gut'],
      [27, '1,5', 'gut'],
      [27.5, '1,4', 'sehr gut'],
      [30, '1,0', 'sehr gut'],
    ];
    for (const [p, g, v] of cases) {
      const g10 = linGrade10(qp(p), qp(30));
      expect(formatGrade10(g10)).toBe(g);
      expect(verbalOf(g10)).toBe(v);
    }
  });

  it('M = 7', () => {
    const cases: [number, string][] = [
      [0, '6,0'], [0.5, '5,6'], [1, '5,2'], [2, '4,5'], [3.5, '3,5'], [5.5, '2,0'], [6.5, '1,3'], [7, '1,0'],
    ];
    for (const [p, g] of cases) expect(formatGrade10(linGrade10(qp(p), qp(7)))).toBe(g);
  });

  it('M = 18,75 with 0,25 steps', () => {
    const m = qp(18.75);
    expect(formatGrade10(linGrade10(qp(0.25), m))).toBe('5,9');
    expect(formatGrade10(linGrade10(qp(9.25), m))).toBe('3,5');
    expect(formatGrade10(linGrade10(qp(18.5), m))).toBe('1,0');
  });

  it('float regression: 22/25, 44/50, 66/75 → 1,6', () => {
    expect(linGrade10(qp(22), qp(25))).toBe(16);
    expect(linGrade10(qp(44), qp(50))).toBe(16);
    expect(linGrade10(qp(66), qp(75))).toBe(16);
    // Demonstrate that the naive float formula is wrong here.
    expect(Math.floor((6 - (5 * 22) / 25) * 10) / 10).toBe(1.5);
  });

  it('naive float formula is wrong 24× for integer M ≤ 200 (32× incl. half-point M); engine never', () => {
    let naiveWrong = 0;
    let naiveWrongIntM = 0;
    for (let m = 2; m <= 800; m += 2) {
      for (let p = 0; p <= m; p += 2) {
        const naive = Math.round(Math.floor((6 - (5 * (p / 4)) / (m / 4)) * 10));
        const exact = refLin10(p, m);
        if (naive !== exact) {
          naiveWrong++;
          if (m % 4 === 0) naiveWrongIntM++;
        }
        expect(linGrade10(p, m)).toBe(exact);
      }
    }
    expect(naiveWrongIntM).toBe(24);
    expect(naiveWrong).toBe(32);
  });

  it('validates input', () => {
    expect(() => linGrade10(1, 0)).toThrow(RangeError);
    expect(() => linGrade10(5, 4)).toThrow(RangeError);
    expect(() => linGrade10(-1, 4)).toThrow(RangeError);
  });

  it('bands and ranges', () => {
    expect([10, 14, 15, 24, 25, 34, 35, 44, 45, 54, 55, 60].map(linBand)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(bandRange10(1)).toEqual([10, 14]);
    expect(bandRange10(3)).toEqual([25, 34]);
    expect(bandRange10(6)).toEqual([55, 60]);
    expect(linIsLow(45)).toBe(true);
    expect(linIsLow(44)).toBe(false);
  });

  it('linKey ranges cover all step values', () => {
    const rows = linKey(qp(30), 2);
    expect(rows[0]).toMatchObject({ minQp: qp(27.5), maxQp: qp(30) });
    expect(rows[5]).toMatchObject({ minQp: 0, maxQp: qp(3) });
    const small = linKey(2, 2); // M = 0,5
    expect(small.filter((r) => r.minQp !== null).map((r) => r.band)).toEqual([1, 6]);
  });
});

describe('exhaustive comparison with BigInt reference', () => {
  it('0,5 steps, M = 0,5 … 150, literal Excel formulation', () => {
    let checked = 0;
    for (let m = 2; m <= 600; m += 2) {
      for (let p = 0; p <= m; p += 2) {
        expect(npGrade(p, m)).toBe(refNpHalf(p, m));
        expect(linGrade10(p, m)).toBe(refLin10(p, m));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(22000);
  });

  it('0,25 steps, M = 0,25 … 150, strict formulation', () => {
    for (let m = 1; m <= 600; m += 1) {
      for (let p = 0; p <= m; p += 1) {
        const a = npGrade(p, m);
        const b = refNpStrict(p, m);
        if (a !== b) expect([p, m, a]).toEqual([p, m, b]);
        const c = linGrade10(p, m);
        const d = refLin10(p, m);
        if (c !== d) expect([p, m, c]).toEqual([p, m, d]);
      }
    }
  });

  it('key tables agree with direct grading for every M (0,5 steps)', () => {
    for (let m = 2; m <= 600; m += 2) {
      for (const r of npKey(m, 2)) {
        if (!r.reachable) continue;
        expect(npGrade(r.minQp as number, m)).toBe(r.np);
        expect(npGrade(r.maxQp as number, m)).toBe(r.np);
        if ((r.minQp as number) > 0) expect(npGrade((r.minQp as number) - 2, m)).toBeLessThan(r.np);
      }
    }
  });
});

describe('properties', () => {
  const step = fc.constantFrom<StepQp>(1, 2, 4);
  const exam = step.chain((s) =>
    fc.integer({ min: 1, max: 1000 }).chain((n) =>
      fc.tuple(fc.constant(s), fc.constant(n * s), fc.integer({ min: 0, max: n }), fc.integer({ min: 0, max: n })),
    ),
  );

  it('more points never give a worse grade', () => {
    fc.assert(
      fc.property(exam, ([s, m, a, b]) => {
        const [lo, hi] = a <= b ? [a * s, b * s] : [b * s, a * s];
        expect(npGrade(hi, m)).toBeGreaterThanOrEqual(npGrade(lo, m));
        expect(linGrade10(hi, m)).toBeLessThanOrEqual(linGrade10(lo, m));
      }),
      { numRuns: 3000 },
    );
  });

  it('P = 0 → 0 NP / 6,0 and P = M → 15 NP / 1,0', () => {
    fc.assert(
      fc.property(exam, ([, m]) => {
        expect(npGrade(0, m)).toBe(0);
        expect(linGrade10(0, m)).toBe(60);
        expect(npGrade(m, m)).toBe(15);
        expect(linGrade10(m, m)).toBe(10);
      }),
    );
  });

  it('linear grades lie in [1,0; 6,0] and NP group matches the Note column', () => {
    fc.assert(
      fc.property(exam, ([s, m, a]) => {
        const g = linGrade10(a * s, m);
        expect(g).toBeGreaterThanOrEqual(10);
        expect(g).toBeLessThanOrEqual(60);
        const np = npGrade(a * s, m);
        expect(np).toBeGreaterThanOrEqual(0);
        expect(np).toBeLessThanOrEqual(15);
        expect(npGroupMembers(npGroup(np))).toContain(np);
        const row = fullKey('NP15', m, s).find((r) => r.qp === a * s);
        expect(row?.text).toBe(String(npGroup(np)));
      }),
      { numRuns: 1000 },
    );
  });
});

describe('fullKey', () => {
  it('NP and linear tables', () => {
    const np = fullKey('NP15', qp(30), 2);
    expect(np).toHaveLength(61);
    expect(np[0]).toEqual({ qp: 0, grade: 0, text: '6' });
    expect(np[60]).toEqual({ qp: 120, grade: 15, text: '1' });
    const lin = fullKey('LIN6', qp(30), 2);
    expect(lin[55]).toEqual({ qp: 110, grade: 14, text: 'sehr gut' });
    expect(fullKey('LIN6', 0, 2)).toEqual([]);
  });
});
