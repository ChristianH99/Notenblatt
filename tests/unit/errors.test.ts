import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  combinedGrade10,
  computeStats,
  divRule,
  ERROR_GRADES10,
  errorGrade10,
  finalMark,
  formatErrors,
  idivRule,
  linGrade10,
  parseErrors,
  studentAverage,
} from '@shared/grading';
import { buildExamModel, errorsText, partText, resultText, statusText, sumText } from '@shared/examModel';
import { examCsv } from '@shared/csv';
import type { Course, ExamData, RoundingRule } from '@shared/types';

/** The table as given by the teacher ("Fehler: Note"). */
const TABLE: [string, string][] = [
  ['0', '1,0'], ['0,5', '1,1'], ['1', '1,3'], ['1,5', '1,4'], ['2', '1,6'], ['2,5', '1,7'], ['3', '1,9'], ['3,5', '2,0'],
  ['4', '2,2'], ['4,5', '2,3'], ['5', '2,5'], ['5,5', '2,6'], ['6', '2,8'], ['6,5', '2,9'], ['7', '3,1'], ['7,5', '3,2'],
  ['8', '3,4'], ['8,5', '3,5'], ['9', '3,7'], ['9,5', '3,8'], ['10', '4,2'], ['10,5', '4,4'], ['11', '4,7'], ['11,5', '4,9'],
  ['12', '5,2'], ['12,5', '5,4'], ['13', '5,7'], ['13,5', '5,9'], ['14', '6,0'],
];
const g10 = (t: string): number => Math.round(Number(t.replace(',', '.')) * 10);

describe('error grade table', () => {
  it('matches the given table for 0 … 14 errors in half steps', () => {
    for (const [f, note] of TABLE) {
      const p = parseErrors(f);
      expect(p.ok).toBe(true);
      const half = (p as { halfErrors: number }).halfErrors;
      expect(errorGrade10(half), `${f} Fehler`).toBe(g10(note));
      expect(formatErrors(half)).toBe(f);
    }
    expect(ERROR_GRADES10).toHaveLength(TABLE.length);
  });

  it('follows the rule: 0,3 per error up to 9, 0,5 from the 10th; a half error costs half of that, truncated', () => {
    for (let e = 0; e <= 13; e++) {
      const whole = (n: number): number => (n <= 9 ? 10 + 3 * n : 37 + 5 * (n - 9));
      expect(errorGrade10(2 * e)).toBe(Math.min(60, whole(e)));
      // in hundredths: + 15 (below 10 errors) or + 25, then truncated to tenths
      expect(errorGrade10(2 * e + 1)).toBe(Math.min(60, Math.floor((whole(e) * 10 + (e < 10 ? 15 : 25)) / 10)));
    }
  });

  it('gives 6,0 from 14 errors on and rejects invalid counts', () => {
    expect(errorGrade10(28)).toBe(60);
    expect(errorGrade10(29)).toBe(60);
    expect(errorGrade10(1999)).toBe(60);
    expect(() => errorGrade10(-1)).toThrow(RangeError);
    expect(() => errorGrade10(1.5)).toThrow(RangeError);
  });

  it('is monotonic', () => {
    for (let h = 1; h < 40; h++) expect(errorGrade10(h)).toBeGreaterThanOrEqual(errorGrade10(h - 1));
  });
});

describe('parseErrors', () => {
  it('accepts whole and half errors in German or English notation', () => {
    expect(parseErrors('3')).toEqual({ ok: true, halfErrors: 6 });
    expect(parseErrors(' 3,5 ')).toEqual({ ok: true, halfErrors: 7 });
    expect(parseErrors('3.50')).toEqual({ ok: true, halfErrors: 7 });
    expect(parseErrors(',5')).toEqual({ ok: true, halfErrors: 1 });
    expect(parseErrors('0')).toEqual({ ok: true, halfErrors: 0 });
    expect(parseErrors('999,5')).toEqual({ ok: true, halfErrors: 1999 });
    expect(parseErrors('')).toEqual({ ok: true, halfErrors: null });
  });
  it('rejects everything else', () => {
    expect(parseErrors('3,25')).toMatchObject({ ok: false, error: expect.stringMatching(/halbe/) });
    expect(parseErrors('-1')).toMatchObject({ ok: false, error: expect.stringMatching(/Negative/) });
    expect(parseErrors('1000')).toMatchObject({ ok: false, error: expect.stringMatching(/999,5/) });
    expect(parseErrors('x')).toMatchObject({ ok: false });
    expect(parseErrors(',')).toMatchObject({ ok: false });
  });
});

describe('rounding rules', () => {
  it('idivRule: x,5 goes up (half_up), to the better value (half_favor) or is cut off (truncate)', () => {
    expect(idivRule(45, 2, 'half_up', true)).toBe(23);
    expect(idivRule(45, 2, 'half_favor', true)).toBe(22); // grades: lower is better
    expect(idivRule(45, 2, 'half_favor', false)).toBe(23); // NP: higher is better
    expect(idivRule(45, 2, 'truncate', true)).toBe(22);
    expect(idivRule(47, 2, 'truncate', false)).toBe(23);
    expect(idivRule(46, 2, 'half_favor', true)).toBe(23);
  });

  it('idivRule and divRule agree with an exact nearest-value search', () => {
    fc.assert(
      fc.property(fc.nat(100000), fc.integer({ min: 1, max: 1000 }), fc.constantFrom<RoundingRule>('half_up', 'half_favor', 'truncate'), fc.boolean(), (a, b, rule, lower) => {
        const fl = Math.floor(a / b);
        const twice = 2 * (a - fl * b); // compare remainder with b/2 without floats
        let want = fl;
        if (rule !== 'truncate' && (twice > b || (twice === b && !(rule === 'half_favor' && lower)))) want = fl + 1;
        expect(idivRule(a, b, rule, lower)).toBe(want);
        expect(Number(divRule(BigInt(a), BigInt(b), rule, lower))).toBe(want);
      }),
    );
  });

  it('combined grade: weighted mean of points grade and error grade, rounded to tenths', () => {
    // 2,3 and 2,2 at 1 : 1 → 2,25
    expect(combinedGrade10(23, 22, 100, 100, 'half_up')).toBe(23);
    expect(combinedGrade10(23, 22, 100, 100, 'half_favor')).toBe(22);
    expect(combinedGrade10(23, 22, 100, 100, 'truncate')).toBe(22);
    // 2 : 1 → (2·2,3 + 2,2) / 3 = 2,266… → 2,3 / 2,2
    expect(combinedGrade10(23, 22, 200, 100, 'half_up')).toBe(23);
    expect(combinedGrade10(23, 22, 200, 100, 'truncate')).toBe(22);
    expect(combinedGrade10(10, 60, 150, 50, 'half_up')).toBe(23); // (1,5·1 + 0,5·6) / 2 = 2,25 → 2,3
    expect(combinedGrade10(60, 60, 1, 10000, 'half_favor')).toBe(60);
  });

  it('overall averages and final marks follow the rule', () => {
    const w = new Map([[1, 100]]);
    const entries = [{ categoryId: 1, value: 22 }, { categoryId: 1, value: 23 }, { categoryId: 1, value: 23 }]; // 2,2666…
    expect(studentAverage('LIN6', w, entries, 'truncate').overallHundredths).toBe(226);
    expect(studentAverage('LIN6', w, entries, 'half_up').overallHundredths).toBe(227);
    expect(studentAverage('LIN6', w, entries).perCategory.get(1)?.avgHundredths).toBe(226);
    const half = [{ categoryId: 1, value: 22 }, { categoryId: 1, value: 23 }, { categoryId: 1, value: 22 }, { categoryId: 1, value: 23 }]; // 2,25 exactly
    expect(studentAverage('LIN6', w, half, 'half_favor').overallHundredths).toBe(225);
    const f = (num: number, den = 1): { num: bigint; den: bigint } => ({ num: BigInt(num), den: BigInt(den) });
    expect(finalMark('LIN6', f(29), 'truncate', 0)).toBe(20); // 2,9 → 2
    expect(finalMark('LIN6', f(239, 10), 'truncate', 1)).toBe(23); // 2,39 → 2,3
    expect(finalMark('NP15', f(129, 10), 'truncate', 0)).toBe(12);
  });
});

describe('statistics with error grading', () => {
  const w = { pointsWeightC: 100, errorsWeightC: 100 };
  // One task, max 20 points.
  const stats = (rows: { status?: 'present' | 'absent'; p: number | null; e: number | null }[], rounding: RoundingRule = 'half_up') =>
    computeStats({
      scheme: 'LIN6',
      taskMaxQp: [80],
      rows: rows.map((r) => ({ status: r.status ?? 'present', values: [r.p === null ? null : r.p * 4], halfErrors: r.e })),
      rounding,
      errorWeights: w,
    });

  it('combines both parts per row; a row counts only when both are entered', () => {
    const s = stats([
      { p: 20, e: 0 }, // 1,0 and 1,0 → 1,0
      { p: 13, e: 8 }, // 6 − 5·13/20 = 2,75 → 2,7 ; 4 errors 2,2 → 2,45 → 2,5
      { p: 10, e: null }, // points only
      { p: null, e: 4 }, // errors only
      { status: 'absent', p: 5, e: 2 },
    ]);
    expect(s.rows.map((r) => r.grade10)).toEqual([10, 25, null, null, null]);
    expect(s.rows.map((r) => r.pointsGrade10)).toEqual([10, 27, 35, null, null]);
    expect(s.rows.map((r) => r.errorsGrade10)).toEqual([10, 22, null, 16, null]);
    expect(s.rows.map((r) => r.participant)).toEqual([true, true, false, false, false]);
    expect(s.rows[1]).toMatchObject({ group: 3, low: false, halfErrors: 8 });
    expect(s.participants).toBe(2);
    expect(s.gradeAvgHundredths).toBe(175); // (1,0 + 2,5) / 2
    expect(s.pointsGradeAvgHundredths).toBe(240); // (1,0 + 2,7 + 3,5) / 3
    expect(s.errorsGradeAvgHundredths).toBe(160); // (1,0 + 2,2 + 1,6) / 3
    // The sum and the task averages already count the row with points only.
    expect(s.sumAvgTenths).toBe(143); // (20 + 13 + 10) / 3 = 14,33
    expect(s.taskAvgTenths).toEqual([143]);
    expect(s.counts).toEqual([1, 0, 1, 0, 0, 0]);
  });

  it('uses the rounding rule for the combined grade and the averages', () => {
    expect(stats([{ p: 13, e: 8 }], 'half_favor').rows[0]?.grade10).toBe(24);
    expect(stats([{ p: 13, e: 8 }], 'truncate').rows[0]?.grade10).toBe(24);
    // 0,5 errors = 1,1 → combined (1,0 + 1,1) / 2 = 1,05: kaufmännisch 1,1, truncated 1,0
    const two = (rule: RoundingRule) => stats([{ p: 20, e: 0 }, { p: 20, e: 1 }, { p: 20, e: 1 }], rule);
    expect(two('truncate').gradeAvgHundredths).toBe(100);
    expect(two('half_up').gradeAvgHundredths).toBe(107); // 1,0 1,1 1,1
  });

  it('is ignored for Notenpunkte and without weights', () => {
    const np = computeStats({ scheme: 'NP15', taskMaxQp: [80], rows: [{ status: 'present', values: [40], halfErrors: 4 }], errorWeights: w });
    expect(np.rows[0]).toMatchObject({ participant: true, halfErrors: null, errorsGrade10: null });
    expect(np.pointsGradeAvgHundredths).toBeNull();
    const plain = computeStats({ scheme: 'LIN6', taskMaxQp: [80], rows: [{ status: 'present', values: [80], halfErrors: 4 }] });
    expect(plain.rows[0]).toMatchObject({ participant: true, grade10: 10, errorsGrade10: null });
  });

  it('a combined grade is never better than the better part or worse than the worse part', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 1, max: 10000 }), (p, e, wp, we) => {
        const a = linGrade10(p, 80);
        const b = errorGrade10(e);
        for (const rule of ['half_up', 'half_favor', 'truncate'] as const) {
          const c = combinedGrade10(a, b, wp, we, rule);
          expect(c).toBeGreaterThanOrEqual(Math.min(a, b));
          expect(c).toBeLessThanOrEqual(Math.max(a, b));
        }
      }),
    );
  });
});

describe('exam model and CSV with error grading', () => {
  const course: Course = {
    id: 1, classId: 1, subject: 'Englisch', gradingSystem: 'LIN6', rounding: 'half_up', showFinal: true, finalDigits: 1,
    pointsWeightC: 100, errorsWeightC: 100, createdAt: '', updatedAt: '',
  };
  const data: ExamData = {
    exam: {
      id: 1, courseId: 1, classId: 1, kind: 'Schulaufgabe', number: '1', subject: 'Englisch', examDate: '2025-10-01', teacher: '',
      scheme: 'LIN6', stepQp: 2, notes: '', categoryId: null, entryMode: 'points', errorGrading: true, perTask: true,
    },
    schoolClass: { id: 1, name: '9b', schoolYear: '2025/26', createdAt: '', updatedAt: '' },
    course,
    tasks: [{ id: 1, examId: 1, position: 0, label: '1', maxQp: 80 }],
    students: [
      { id: 1, classId: 1, lastName: 'Albers', firstName: 'A', nr: 1, status: 'present' },
      { id: 2, classId: 1, lastName: 'Brandt', firstName: 'B', nr: 2, status: 'present' },
      { id: 3, classId: 1, lastName: 'Conrad', firstName: 'C', nr: 3, status: 'absent' },
    ],
    scores: [{ taskId: 1, studentId: 1, qp: 52 }, { taskId: 1, studentId: 2, qp: 40 }],
    marks: [],
    totals: [],
    errors: [{ studentId: 1, halfErrors: 7 }],
  };

  it('shows both part grades, the error count and the combined grade', () => {
    const m = buildExamModel(data);
    // Albers: 13 of 20 → 2,7 ; 3,5 errors → 2,0 ; (2,7 + 2,0) / 2 = 2,35 → kaufmännisch 2,4
    expect([partText(m, 0, 'points'), errorsText(m, 0), partText(m, 0, 'errors'), resultText(m, 0), statusText(m, 0)]).toEqual(['2,7', '3,5', '2,0', '2,4', 'teilgenommen']);
    expect([sumText(m, 1), partText(m, 1, 'points'), errorsText(m, 1), resultText(m, 1), statusText(m, 1)]).toEqual(['10', '3,5', '', '', 'unvollständig']);
    expect([partText(m, 2, 'points'), errorsText(m, 2), resultText(m, 2), statusText(m, 2)]).toEqual(['–', '–', '–', 'fehlt']);
  });

  it('ignores the error count when error grading is off', () => {
    const m = buildExamModel({ ...data, exam: { ...data.exam, errorGrading: false } });
    expect([resultText(m, 0), errorsText(m, 0)]).toEqual(['2,7', '']);
  });

  it('exports the parts in the CSV', () => {
    const lines = examCsv(data).replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe('Nr;Name;Vorname;1;Summe;Note Punkte;Fehler;Note Fehler;Note;Status');
    expect(lines[1]).toBe('1;Albers;A;13;13;2,7;3,5;2,0;2,4;teilgenommen');
    expect(lines[2]).toBe('2;Brandt;B;10;10;3,5;;;;unvollständig');
    expect(lines[3]).toBe('3;Conrad;C;;;;;;;fehlt');
  });
});
