import { describe, expect, it } from 'vitest';
import { computeStats, pctTenths, type StatsInput } from '@shared/grading';
import { buildExamModel, resultText, statusText, sumText } from '@shared/examModel';
import { examCsv } from '@shared/csv';
import {
  formatGrade10,
  formatHundredths,
  formatPctTenths,
  formatQp,
  formatTenths,
  parsePoints,
} from '@shared/parse/number';
import type { ExamData, ParticipationStatus, Scheme } from '@shared/types';
import { GOLDEN_LABELS, GOLDEN_MAX, GOLDEN_RESULTS, GOLDEN_ROWS, GOLDEN_TASK_AVG, GOLDEN_TASK_SHARE } from '../fixtures/golden';

function q(s: string): number {
  const r = parsePoints(s, { stepQp: 1 });
  if (!r.ok || r.qp === null) throw new Error(s);
  return r.qp;
}

function goldenInput(scheme: Scheme, absentEmpty = false): StatsInput {
  const rows: StatsInput['rows'] = [];
  for (let nr = 1; nr <= 20; nr++) {
    const entries = GOLDEN_ROWS[nr];
    const values: (number | null)[] = GOLDEN_MAX.map((_, i) => (entries && i < 8 ? q(entries[i] as string) : null));
    rows.push({ status: !entries && absentEmpty ? 'absent' : 'present', values });
  }
  return { scheme, taskMaxQp: GOLDEN_MAX.map((m) => m * 4), rows };
}

describe('golden exam §3.6', () => {
  it('NP scheme', () => {
    const s = computeStats(goldenInput('NP15'));
    expect(s.maxQp).toBe(55 * 4);
    expect(s.participants).toBe(17);
    expect(s.listed).toBe(20);
    expect(s.taskAvgTenths.slice(0, 8).map((t) => formatTenths(t as number))).toEqual(GOLDEN_TASK_AVG);
    expect(s.taskSharePct.slice(0, 8).map(String)).toEqual(GOLDEN_TASK_SHARE);
    expect(s.taskAvgTenths.slice(8)).toEqual(new Array(9).fill(null));
    expect(s.taskSharePct.slice(8)).toEqual(new Array(9).fill(null));
    expect(formatTenths(s.sumAvgTenths as number)).toBe('15,6');
    expect(s.counts[3]).toBe(5);
    expect(s.counts[2]).toBe(7);
    expect(s.counts[1]).toBe(4);
    expect(s.counts[0]).toBe(1);
    expect(formatPctTenths(s.groupPctTenths[4] as number)).toBe('94,1');
    expect(formatPctTenths(s.groupPctTenths[5] as number)).toBe('5,9');
    expect(formatHundredths(s.gradeAvgHundredths as number)).toBe('1,94');
    expect(formatPctTenths(s.lowPctTenths as number)).toBe('100');
    for (let nr = 1; nr <= 20; nr++) {
      const r = s.rows[nr - 1];
      const exp = GOLDEN_RESULTS[nr];
      if (!exp) {
        expect(r?.participant).toBe(false);
        expect(r?.sumQp).toBeNull();
        continue;
      }
      expect(formatQp(r?.sumQp as number)).toBe(exp[0]);
      expect(r?.np).toBe(exp[1]);
      expect(r?.missingCount).toBe(9);
    }
  });

  it('linear scheme', () => {
    const s = computeStats(goldenInput('LIN6'));
    expect(formatHundredths(s.gradeAvgHundredths as number)).toBe('4,51');
    expect(s.counts).toEqual([0, 0, 0, 7, 10, 0]);
    expect(formatPctTenths(s.lowPctTenths as number)).toBe('58,8');
    for (const [nr, exp] of Object.entries(GOLDEN_RESULTS)) {
      expect(formatGrade10(s.rows[Number(nr) - 1]?.grade10 as number)).toBe(exp[2]);
    }
  });

  it('absent students are excluded and counted', () => {
    const s = computeStats(goldenInput('NP15', true));
    expect(s.participants).toBe(17);
    expect(s.absent).toBe(3);
    expect(s.listed).toBe(20);
  });
});

describe('statistics edge cases', () => {
  const noNaN = (s: ReturnType<typeof computeStats>): void => {
    expect(JSON.stringify(s)).not.toMatch(/NaN|Infinity/);
  };
  const base = (rows: { status: ParticipationStatus; values: (number | null)[] }[], max = [8, 8]): StatsInput => ({
    scheme: 'NP15',
    taskMaxQp: max,
    rows,
  });

  it('zero participants', () => {
    const s = computeStats(base([{ status: 'present', values: [null, null] }]));
    expect(s.participants).toBe(0);
    expect(s.sumAvgTenths).toBeNull();
    expect(s.gradeAvgHundredths).toBeNull();
    expect(s.lowPctTenths).toBeNull();
    expect(s.taskAvgTenths).toEqual([null, null]);
    expect(s.groupPctTenths).toEqual(new Array(6).fill(null));
    noNaN(s);
    const empty = computeStats(base([]));
    expect(empty.listed).toBe(0);
    noNaN(empty);
  });

  it('all absent', () => {
    const s = computeStats(base([
      { status: 'absent', values: [4, 4] },
      { status: 'absent', values: [null, null] },
    ]));
    expect(s.participants).toBe(0);
    expect(s.absent).toBe(2);
    expect(s.rows[0]?.sumQp).toBeNull();
    noNaN(s);
  });

  it('one participant, partially filled, unanswered task', () => {
    const s = computeStats(base([{ status: 'present', values: [6, null] }]));
    expect(s.participants).toBe(1);
    expect(s.rows[0]?.missingCount).toBe(1);
    expect(s.rows[0]?.sumQp).toBe(6);
    expect(s.taskAvgTenths).toEqual([15, null]);
    expect(s.taskSharePct).toEqual([75, null]);
    expect(s.groupPctTenths.reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(1000);
    noNaN(s);
  });

  it('all scores 0 / all at max', () => {
    const zero = computeStats({ ...base([{ status: 'present', values: [0, 0] }, { status: 'present', values: [0, 0] }]), scheme: 'LIN6' });
    expect(zero.gradeAvgHundredths).toBe(600);
    expect(zero.lowPctTenths).toBe(1000);
    expect(zero.taskSharePct).toEqual([0, 0]);
    const full = computeStats(base([{ status: 'present', values: [8, 8] }]));
    expect(full.rows[0]?.np).toBe(15);
    expect(full.gradeAvgHundredths).toBe(1500);
    expect(full.lowPctTenths).toBe(0);
    expect(full.taskSharePct).toEqual([100, 100]);
  });

  it('single task and 40 tasks', () => {
    const one = computeStats(base([{ status: 'present', values: [3] }], [4]));
    expect(one.maxQp).toBe(4);
    expect(one.rows[0]?.np).toBe(npOf(3, 4));
    const forty = computeStats(base([{ status: 'present', values: new Array(40).fill(2) }], new Array(40).fill(4)));
    expect(forty.maxQp).toBe(160);
    expect(forty.rows[0]?.sumQp).toBe(80);
    expect(forty.taskAvgTenths).toHaveLength(40);
  });

  it('pctTenths', () => {
    expect(pctTenths(1, 0)).toBeNull();
    expect(pctTenths(1, 3)).toBe(333);
    expect(pctTenths(2, 3)).toBe(667);
  });
});

function npOf(p: number, m: number): number {
  return computeStats({ scheme: 'NP15', taskMaxQp: [m], rows: [{ status: 'present', values: [p] }] }).rows[0]?.np as number;
}

function goldenExamData(): ExamData {
  return {
    exam: {
      id: 1, courseId: 1, classId: 1, kind: 'Kurzarbeit', number: '2.', subject: 'Biologie', examDate: '2025-03-19',
      teacher: '', scheme: 'NP15', stepQp: 2, notes: '', categoryId: null, entryMode: 'points', errorGrading: false, perTask: true,
    },
    schoolClass: { id: 1, name: 'F-A11a', schoolYear: '2024/25', createdAt: '', updatedAt: '' },
    course: { id: 1, classId: 1, subject: 'Biologie', gradingSystem: 'NP15', rounding: 'truncate', showFinal: true, finalDigits: 0, pointsWeightC: 100, errorsWeightC: 100, createdAt: '', updatedAt: '' },
    tasks: GOLDEN_LABELS.slice(0, 3).map((label, i) => ({ id: i + 1, examId: 1, position: i, label, maxQp: (GOLDEN_MAX[i] as number) * 4 })),
    students: [
      { id: 1, classId: 1, lastName: 'Müller', firstName: 'Anna', nr: 1, status: 'present' },
      { id: 2, classId: 1, lastName: 'Schmidt; "Jr"', firstName: 'Ben', nr: 2, status: 'present' },
      { id: 3, classId: 1, lastName: 'Weber', firstName: 'Cem', nr: 3, status: 'absent' },
    ],
    marks: [],
    totals: [],
    errors: [],
    scores: [
      { taskId: 1, studentId: 1, qp: 14 },
      { taskId: 2, studentId: 1, qp: 6 },
      { taskId: 3, studentId: 1, qp: 9 },
      { taskId: 1, studentId: 3, qp: 4 },
    ],
  };
}

describe('exam model and CSV', () => {
  it('builds texts', () => {
    const m = buildExamModel(goldenExamData());
    expect(sumText(m, 0)).toBe('7,25');
    expect(resultText(m, 0)).toBe(String(m.stats.rows[0]?.np));
    expect(sumText(m, 1)).toBe('');
    expect(resultText(m, 1)).toBe('');
    expect(sumText(m, 2)).toBe('–');
    expect(resultText(m, 2)).toBe('–');
    expect(statusText(m, 0)).toBe('teilgenommen');
    expect(statusText(m, 1)).toBe('nicht erfasst');
    expect(statusText(m, 2)).toBe('fehlt');
    expect(sumText(m, 9)).toBe('');
    expect(resultText(m, 9)).toBe('');
    expect(statusText(m, 9)).toBe('');
  });

  it('linear result text', () => {
    const d = goldenExamData();
    d.exam.scheme = 'LIN6';
    expect(resultText(buildExamModel(d), 0)).toMatch(/^\d,\d$/);
  });

  it('CSV with BOM, ; separator, decimal comma, quoting', () => {
    const csv = examCsv(goldenExamData());
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Nr;Name;Vorname;1.;2.;3.1;Summe;Note;Status');
    expect(lines[1]).toMatch(/^1;Müller;Anna;3,5;1,5;2,25;7,25;\d+;teilgenommen$/);
    expect(lines[2]).toBe('2;"Schmidt; ""Jr""";Ben;;;;;;nicht erfasst');
    expect(lines[3]).toBe('3;Weber;Cem;1;;;;;fehlt');
    expect(lines[4]).toBe('');
  });
});
