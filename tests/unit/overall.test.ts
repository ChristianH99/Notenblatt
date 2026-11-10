import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeMarkStats, finalMark, formatFinalMark, formatMark, isValidMark, markIsLow, markRange, markVerbal, parseMark, studentAverage, unitHundredths } from '@shared/grading';
import { buildExamModel, resultText, statusText, sumText } from '@shared/examModel';
import { examCsv } from '@shared/csv';
import { buildOverview, formatAvg, formatWeight, overviewCsv, parseWeight } from '@shared/overview';
import type { Course, Exam, ExamData, GradeCategory, OverviewData, SchoolClass } from '@shared/types';

describe('marks', () => {
  it('parses NP and linear grades', () => {
    expect(parseMark('12', 'NP15')).toEqual({ ok: true, value: 12 });
    expect(parseMark(' 0 ', 'NP15')).toEqual({ ok: true, value: 0 });
    expect(parseMark('', 'NP15')).toEqual({ ok: true, value: null });
    expect(parseMark('16', 'NP15').ok).toBe(false);
    expect(parseMark('2,5', 'NP15').ok).toBe(false);
    expect(parseMark('2', 'LIN6')).toEqual({ ok: true, value: 20 });
    expect(parseMark('2,3', 'LIN6')).toEqual({ ok: true, value: 23 });
    expect(parseMark('2.30', 'LIN6')).toEqual({ ok: true, value: 23 });
    expect(parseMark('6', 'LIN6')).toEqual({ ok: true, value: 60 });
    const err = (s: string): string => {
      const r = parseMark(s, 'LIN6');
      return r.ok ? '' : r.error;
    };
    expect(err('0,9')).toMatch(/1,0 bis 6,0/);
    expect(err('6,1')).toMatch(/1,0 bis 6,0/);
    expect(err('2,35')).toMatch(/eine Nachkommastelle/);
    expect(err('gut')).toMatch(/1,0 bis 6,0/);
  });

  it('formats, ranges, groups', () => {
    expect(formatMark(12, 'NP15')).toBe('12');
    expect(formatMark(23, 'LIN6')).toBe('2,3');
    expect(markRange('NP15')).toEqual([0, 15]);
    expect(isValidMark('LIN6', 9)).toBe(false);
    expect(isValidMark('NP15', 15)).toBe(true);
    expect(markIsLow(3, 'NP15')).toBe(true);
    expect(markIsLow(44, 'LIN6')).toBe(false);
    expect(markVerbal(13, 'NP15')).toBe('sehr gut');
    expect(markVerbal(45, 'LIN6')).toBe('mangelhaft');
  });

  it('statistics for mark-only exams', () => {
    const s = computeMarkStats('NP15', [
      { status: 'present', value: 12 },
      { status: 'present', value: 3 },
      { status: 'present', value: null },
      { status: 'absent', value: 15 },
    ]);
    expect(s.participants).toBe(2);
    expect(s.absent).toBe(1);
    expect(s.gradeAvgHundredths).toBe(750);
    expect(s.lowPctTenths).toBe(500);
    expect(s.sumAvgTenths).toBeNull();
    const l = computeMarkStats('LIN6', [{ status: 'present', value: 23 }, { status: 'present', value: 46 }]);
    expect(l.gradeAvgHundredths).toBe(345);
    expect(l.counts).toEqual([0, 1, 0, 0, 1, 0]);
  });
});

describe('weighted average (every exam with the weight of its category)', () => {
  const w = new Map([
    [1, 300],
    [2, 100],
  ]);
  it('NP and linear', () => {
    const r = studentAverage('NP15', w, [
      { categoryId: 1, value: 15 },
      { categoryId: 2, value: 9 },
      { categoryId: 2, value: 12 },
    ]);
    expect(r.overallHundredths).toBe(1320); // (3·15 + 9 + 12)/5
    expect(r.exact).toEqual({ num: 6600n, den: 500n });
    expect(r.perCategory.get(2)?.avgHundredths).toBe(1050);
    expect(r.count).toBe(3);
    // linear: written 2,0 ×3, oral 3,0 ×1 → 2,25
    expect(studentAverage('LIN6', w, [{ categoryId: 1, value: 20 }, { categoryId: 2, value: 30 }]).overallHundredths).toBe(225);
    expect(unitHundredths('LIN6')).toBe(10n);
  });
  it('unknown/zero-weight categories are ignored', () => {
    expect(studentAverage('NP15', w, [{ categoryId: 2, value: 7 }]).overallHundredths).toBe(700);
    expect(studentAverage('NP15', w, [{ categoryId: 9, value: 7 }])).toMatchObject({ overallHundredths: null, exact: null, count: 0 });
    expect(studentAverage('NP15', w, []).overallHundredths).toBeNull();
  });
  it('matches an independent fraction computation (property)', () => {
    const entry = fc.record({ categoryId: fc.constantFrom(1, 2, 3), value: fc.integer({ min: 0, max: 15 }) });
    const weights = fc.tuple(fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 1, max: 10000 }), fc.integer({ min: 1, max: 10000 }));
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 30 }), weights, (es, [a, b, c]) => {
        const wm = new Map([
          [1, a],
          [2, b],
          [3, c],
        ]);
        const r = studentAverage('NP15', wm, es);
        if (es.length === 0) {
          expect(r.overallHundredths).toBeNull();
          return;
        }
        let num = 0n;
        let den = 0n;
        for (const e of es) {
          num += BigInt(wm.get(e.categoryId)!) * BigInt(e.value);
          den += BigInt(wm.get(e.categoryId)!);
        }
        expect(r.overallHundredths).toBe(Number((num * 100n) / den));
      }),
      { numRuns: 1500 },
    );
  });
});

describe('final mark rounding', () => {
  const f = (num: number, den = 1): { num: bigint; den: bigint } => ({ num: BigInt(num), den: BigInt(den) });
  it('Notenpunkte: x,5 always up (better), below x,5 down', () => {
    expect(finalMark('NP15', f(95, 10), 'half_up', 0)).toBe(10);
    expect(finalMark('NP15', f(95, 10), 'half_favor', 0)).toBe(10);
    expect(finalMark('NP15', f(949, 100), 'half_up', 0)).toBe(9);
    expect(finalMark('NP15', f(15), 'half_up', 1)).toBe(15);
    expect(finalMark('NP15', null, 'half_up', 0)).toBeNull();
    expect(finalMark('NP15', f(99, 10), 'truncate', 0)).toBe(9);
    expect(formatFinalMark('NP15', 10, 0)).toBe('10');
  });
  it('grades 1–6, whole grade: half up vs. favouring the student at x,5', () => {
    // values in tenths of a grade: 25 = 2,5
    expect(finalMark('LIN6', f(25), 'half_up', 0)).toBe(30);
    expect(finalMark('LIN6', f(25), 'half_favor', 0)).toBe(20);
    expect(finalMark('LIN6', f(2499, 100), 'half_up', 0)).toBe(20); // 2,499 → 2
    expect(finalMark('LIN6', f(2501, 100), 'half_favor', 0)).toBe(30); // 2,501 → 3
    expect(finalMark('LIN6', f(10), 'half_favor', 0)).toBe(10);
    expect(finalMark('LIN6', f(60), 'half_up', 0)).toBe(60);
    expect(formatFinalMark('LIN6', 30, 0)).toBe('3');
  });
  it('grades 1–6 with one decimal', () => {
    expect(finalMark('LIN6', f(235, 10), 'half_up', 1)).toBe(24); // 2,35 → 2,4
    expect(finalMark('LIN6', f(235, 10), 'half_favor', 1)).toBe(23); // 2,35 → 2,3
    expect(finalMark('LIN6', f(234, 10), 'half_up', 1)).toBe(23);
    expect(finalMark('LIN6', f(236, 10), 'half_favor', 1)).toBe(24);
    expect(formatFinalMark('LIN6', 23, 1)).toBe('2,3');
    expect(formatFinalMark('LIN6', null, 1)).toBe('');
  });
  it('matches nearest-value search with the tie rule (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 0, max: 5000 }), fc.constantFrom<0 | 1>(0, 1), fc.constantFrom<'half_up' | 'half_favor'>('half_up', 'half_favor'), (den, raw, digits, rule) => {
        // linear value t in tenths within [10, 60]
        const num = BigInt(10 * den + (raw % (50 * den + 1)));
        const D = BigInt(den);
        const step = digits === 0 ? 10n : 1n;
        let best: bigint | null = null;
        let bestDist = 0n;
        for (let g = 10n; g <= 60n; g += step) {
          const dist = num > g * D ? num - g * D : g * D - num;
          // tie: half_up → higher number, half_favor → lower (better) grade
          if (best === null || dist < bestDist || (dist === bestDist && rule === 'half_up')) {
            best = g;
            bestDist = dist;
          }
        }
        expect(finalMark('LIN6', { num, den: D }, rule, digits)).toBe(Number(best));
      }),
      { numRuns: 3000 },
    );
  });
});

describe('weights', () => {
  it('format and parse', () => {
    expect(formatWeight(300)).toBe('3');
    expect(formatWeight(150)).toBe('1,5');
    expect(formatWeight(25)).toBe('0,25');
    expect(parseWeight('3')).toBe(300);
    expect(parseWeight('1,5')).toBe(150);
    expect(parseWeight('0.25')).toBe(25);
    expect(parseWeight('0')).toBeNull();
    expect(parseWeight('101')).toBeNull();
    expect(parseWeight('1,234')).toBeNull();
    expect(parseWeight('x')).toBeNull();
    expect(formatAvg(null)).toBe('');
    expect(formatAvg(1387)).toBe('13,87');
  });
});

const cls: SchoolClass = { id: 1, name: '10a', schoolYear: '2025/26', createdAt: '', updatedAt: '' };
const course: Course = { id: 7, classId: 1, subject: 'Mathe', gradingSystem: 'NP15', rounding: 'half_up', showFinal: true, finalDigits: 0, pointsWeightC: 100, errorsWeightC: 100, createdAt: '', updatedAt: '' };
const cats: GradeCategory[] = [
  { id: 2, courseId: 7, name: 'Mündlich', weightC: 100, defaultMode: 'grade', position: 1 },
  { id: 1, courseId: 7, name: 'Schriftlich', weightC: 300, defaultMode: 'points', position: 0 },
];
const students = [
  { id: 10, classId: 1, lastName: 'Berg', firstName: 'Bo' },
  { id: 11, classId: 1, lastName: 'Arnold', firstName: 'Ann' },
];
const baseExam = (over: Partial<Exam>): Exam => ({
  id: 1, courseId: 7, classId: 1, kind: 'Ex', number: '', subject: 'Mathe', examDate: '2025-10-01', teacher: '', scheme: 'NP15', stepQp: 2, notes: '',
  categoryId: 1, entryMode: 'points', errorGrading: false, perTask: true, ...over,
});
const es = (over: Partial<ExamData> & { exam: Exam }): ExamData => ({
  schoolClass: cls,
  course,
  tasks: [],
  students: [
    { ...students[1]!, nr: 1, status: 'present' },
    { ...students[0]!, nr: 2, status: 'present' },
  ],
  scores: [],
  marks: [],
  totals: [],
  errors: [],
  ...over,
});

describe('overview builder', () => {
  const data: OverviewData = {
    schoolClass: cls,
    course,
    categories: cats,
    students,
    exams: [
      es({ exam: baseExam({ id: 3, entryMode: 'grade', categoryId: 2, examDate: '2025-12-01', kind: 'Abfrage' }), marks: [{ studentId: 11, value: 9 }] }),
      es({
        exam: baseExam({ id: 1 }),
        tasks: [{ id: 100, examId: 1, position: 0, label: '1', maxQp: 60 }],
        scores: [
          { taskId: 100, studentId: 11, qp: 60 },
          { taskId: 100, studentId: 10, qp: 0 },
        ],
      }),
      es({ exam: baseExam({ id: 4, categoryId: null, entryMode: 'grade', kind: 'Ohne' }), marks: [{ studentId: 11, value: 1 }] }),
      es({
        exam: baseExam({ id: 5, entryMode: 'grade', categoryId: 2, kind: 'Fehlt' }),
        students: [
          { ...students[1]!, nr: 1, status: 'present' },
          { ...students[0]!, nr: 2, status: 'absent' },
        ],
      }),
    ],
  };

  it('orders columns by category and date, sorts students, computes averages', () => {
    const o = buildOverview(data);
    expect(o.categories.map((c) => c.name)).toEqual(['Schriftlich', 'Mündlich']);
    expect(o.columns.map((c) => c.exam.id)).toEqual([1, 5, 3, 4]);
    expect(o.columns[3]).toMatchObject({ included: false, reason: 'Keine Kategorie zugeordnet' });
    expect(o.rows.map((r) => r.student.lastName)).toEqual(['Arnold', 'Berg']);
    const ann = o.rows[0]!;
    expect(ann.cells.map((c) => c.text)).toEqual(['15', '', '9', '1']);
    expect(formatAvg(ann.avg.overallHundredths)).toBe('13,50'); // (3·15 + 9)/4
    const bo = o.rows[1]!;
    expect(bo.cells.map((c) => c.text)).toEqual(['0', '–', '', '']);
    expect(bo.cells[1]?.absent).toBe(true);
    expect(formatAvg(bo.avg.overallHundredths)).toBe('0,00');
  });

  it('excludes exams in another grading system, and a student not in an exam', () => {
    const lin = { ...data, course: { ...course, gradingSystem: 'LIN6' as const } };
    const o = buildOverview(lin);
    expect(o.columns.every((c) => !c.included)).toBe(true);
    expect(o.columns[0]?.reason).toMatch(/Notenpunkten/);
    const np = buildOverview({ ...data, exams: [es({ exam: baseExam({ id: 9, scheme: 'LIN6', entryMode: 'grade' }) })] });
    expect(np.columns[0]?.reason).toMatch(/Noten 1–6/);
    const missing = buildOverview({ ...data, exams: [es({ exam: baseExam({ id: 9, entryMode: 'grade' }), students: [] })] });
    expect(missing.rows[0]?.cells[0]).toEqual({ value: null, text: '', absent: false });
  });

  it('CSV of the overview', () => {
    const csv = overviewCsv(data);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Nr;Name;Vorname;Schriftlich: Ex · Mathe · 01.10.2025;Mündlich: Fehlt · Mathe · 01.10.2025;Mündlich: Abfrage · Mathe · 01.12.2025;Ohne · Mathe · 01.10.2025 (nicht gewertet);Ø Schriftlich (×3);Ø Mündlich (×1);Ø gesamt;Endnote',
    );
    expect(lines[1]).toBe('1;Arnold;Ann;15;;9;1;15,00;9,00;13,50;14'); // 13,5 → 14 (kaufmännisch)
    expect(lines[2]).toBe('2;Berg;Bo;0;fehlt;;;0,00;;0,00;0');
  });

  it('exam model and CSV for a mark-only exam', () => {
    const d = es({
      exam: baseExam({ id: 3, entryMode: 'grade', scheme: 'LIN6' }),
      marks: [{ studentId: 11, value: 23 }],
      students: [
        { ...students[1]!, nr: 1, status: 'present' },
        { ...students[0]!, nr: 2, status: 'absent' },
      ],
    });
    const m = buildExamModel(d);
    expect(m.marks).toEqual([23, null]);
    expect(resultText(m, 0)).toBe('2,3');
    expect(sumText(m, 0)).toBe('');
    expect(resultText(m, 1)).toBe('–');
    expect(statusText(m, 1)).toBe('fehlt');
    expect(examCsv(d)).toBe('﻿Nr;Name;Vorname;Note;Status\r\n1;Arnold;Ann;2,3;teilgenommen\r\n2;Berg;Bo;;fehlt\r\n');
  });
});
