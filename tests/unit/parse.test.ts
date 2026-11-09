import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  formatDateDe,
  formatGrade10,
  formatHundredths,
  formatQp,
  formatTenths,
  parseDateDe,
  parsePoints,
  todayIso,
} from '@shared/parse/number';
import { compareNames, parseNameList } from '@shared/parse/names';
import {
  compareSchoolYearDesc,
  currentSchoolYear,
  isExpired,
  isValidSchoolYear,
  nextSchoolYear,
  schoolYearStart,
} from '@shared/schoolYear';
import { examHeading, examTitle, exportBaseName } from '@shared/labels';

const half = { stepQp: 2 as const };

describe('parsePoints', () => {
  it('accepts valid input', () => {
    expect(parsePoints('3,5', half)).toEqual({ ok: true, qp: 14 });
    expect(parsePoints('3.5', half)).toEqual({ ok: true, qp: 14 });
    expect(parsePoints(' 3 ', half)).toEqual({ ok: true, qp: 12 });
    expect(parsePoints(',5', half)).toEqual({ ok: true, qp: 2 });
    expect(parsePoints('3,50', half)).toEqual({ ok: true, qp: 14 });
    expect(parsePoints('0', half)).toEqual({ ok: true, qp: 0 });
    expect(parsePoints('3,', half)).toEqual({ ok: true, qp: 12 });
    expect(parsePoints('2,25', { stepQp: 1 })).toEqual({ ok: true, qp: 9 });
    expect(parsePoints('6', { ...half, maxQp: 24 })).toEqual({ ok: true, qp: 24 });
  });

  it('empty input deletes the entry', () => {
    expect(parsePoints('', half)).toEqual({ ok: true, qp: null });
    expect(parsePoints('   ', half)).toEqual({ ok: true, qp: null });
  });

  it('rejects invalid input with a message', () => {
    const err = (s: string, o = half as Parameters<typeof parsePoints>[1]): string => {
      const r = parsePoints(s, o);
      expect(r.ok).toBe(false);
      return r.ok ? '' : r.error;
    };
    expect(err('-1')).toMatch(/Negative/);
    expect(err('abc')).toMatch(/Zahl/);
    expect(err('1e2')).toMatch(/Zahl/);
    expect(err('3,,5')).toMatch(/Zahl/);
    expect(err(',')).toMatch(/Zahl/);
    expect(err('3,25')).toBe('Nur Schritte von 0,5 erlaubt');
    expect(err('3,1')).toBe('Nur Schritte von 0,5 erlaubt');
    expect(err('3,5', { stepQp: 4 })).toBe('Nur Schritte von 1 erlaubt');
    expect(err('7', { ...half, maxQp: 24, label: '3.1' })).toBe('Aufgabe 3.1: höchstens 6 Punkte');
    expect(err('7', { ...half, maxQp: 24 })).toBe('höchstens 6 Punkte');
    expect(err('0', { ...half, positive: true })).toMatch(/größer als 0/);
    expect(err('12345678')).toMatch(/zu groß/);
  });

  it('formatting round-trips', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400000 }), (qp) => {
        expect(parsePoints(formatQp(qp), { stepQp: 1 })).toEqual({ ok: true, qp });
      }),
    );
  });
});

describe('formatters', () => {
  it('format values', () => {
    expect(formatQp(14)).toBe('3,5');
    expect(formatQp(4)).toBe('1');
    expect(formatQp(0)).toBe('0');
    expect(formatQp(3)).toBe('0,75');
    expect(formatQp(-6)).toBe('-1,5');
    expect(formatTenths(48)).toBe('4,8');
    expect(formatTenths(40)).toBe('4');
    expect(formatGrade10(20)).toBe('2,0');
    expect(formatGrade10(24)).toBe('2,4');
    expect(formatHundredths(194)).toBe('1,94');
    expect(formatHundredths(205)).toBe('2,05');
    expect(formatHundredths(200)).toBe('2,00');
  });

  it('dates', () => {
    expect(formatDateDe('2025-03-19')).toBe('19.03.2025');
    expect(formatDateDe('bad')).toBe('bad');
    expect(parseDateDe('19.3.2025')).toBe('2025-03-19');
    expect(parseDateDe('19.03.25')).toBe('2025-03-19');
    expect(parseDateDe('31.02.2025')).toBeNull();
    expect(parseDateDe('2025-03-19')).toBeNull();
    expect(todayIso(new Date(2025, 2, 9))).toBe('2025-03-09');
  });
});

describe('name list parsing', () => {
  it('handles comma, tab and space formats', () => {
    const r = parseNameList('Müller, Anna\nSchmidt\tBen\n\n  Weber Cem Ali  \r\nNur\n\t\n', false);
    expect(r.map((n) => [n.lastName, n.firstName])).toEqual([
      ['Müller', 'Anna'],
      ['Schmidt', 'Ben'],
      ['Weber', 'Cem Ali'],
      ['Nur', ''],
    ]);
    expect(r[2]?.line).toBe(4);
  });

  it('swaps columns and flags duplicates', () => {
    const r = parseNameList('Anna, Müller\nAnna, Müller\nBen\tSchmidt', true, [{ lastName: 'schmidt', firstName: 'ben' }]);
    expect(r.map((n) => [n.lastName, n.firstName, n.duplicate])).toEqual([
      ['Müller', 'Anna', false],
      ['Müller', 'Anna', true],
      ['Schmidt', 'Ben', true],
    ]);
    expect(parseNameList('Solo', true)[0]).toMatchObject({ lastName: 'Solo', firstName: '' });
  });

  it('sorts with German collation', () => {
    const names = [
      { lastName: 'Zeller', firstName: 'A' },
      { lastName: 'Ärger', firstName: 'B' },
      { lastName: 'Adler', firstName: 'C' },
      { lastName: 'Ärger', firstName: 'A' },
      { lastName: 'Bauer', firstName: 'A', id: 2 },
      { lastName: 'Bauer', firstName: 'A', id: 1 },
    ];
    const sorted = [...names].sort(compareNames).map((n) => `${n.lastName} ${n.firstName}`);
    expect(sorted).toEqual(['Adler C', 'Ärger A', 'Ärger B', 'Bauer A', 'Bauer A', 'Zeller A']);
  });
});

describe('school year', () => {
  it('switches on 1 August', () => {
    expect(currentSchoolYear(new Date(2025, 6, 31))).toBe('2024/25');
    expect(currentSchoolYear(new Date(2025, 7, 1))).toBe('2025/26');
    expect(currentSchoolYear(new Date(2099, 8, 1))).toBe('2099/00');
  });
  it('parses and validates', () => {
    expect(schoolYearStart('2025/26')).toBe(2025);
    expect(schoolYearStart('x')).toBeNull();
    expect(isValidSchoolYear('2025/26')).toBe(true);
    expect(isValidSchoolYear('2025/2026')).toBe(true);
    expect(isValidSchoolYear('2025/27')).toBe(false);
    expect(isValidSchoolYear('2025')).toBe(false);
    expect(nextSchoolYear('2025/26')).toBe('2026/27');
    expect(nextSchoolYear('?')).toBe('?');
  });
  it('expiry after N months past 31 July', () => {
    expect(isExpired('2024/25', 12, new Date(2026, 6, 31))).toBe(false);
    expect(isExpired('2024/25', 12, new Date(2026, 7, 1))).toBe(true);
    expect(isExpired('2024/25', 6, new Date(2026, 1, 1))).toBe(true);
    expect(isExpired('?', 6)).toBe(false);
  });
  it('sorts newest first', () => {
    expect(['2023/24', '2025/26', '2024/25'].sort(compareSchoolYearDesc)).toEqual(['2025/26', '2024/25', '2023/24']);
    expect(compareSchoolYearDesc('b', 'a')).toBeLessThan(0);
  });
});

describe('labels', () => {
  const e = { kind: 'Kurzarbeit', number: '2.', subject: 'Biologie', examDate: '2025-03-19' };
  it('titles', () => {
    expect(examTitle(e)).toBe('Kurzarbeit 2 · Biologie · 19.03.2025');
    expect(examTitle({ ...e, number: '' })).toBe('Kurzarbeit · Biologie · 19.03.2025');
    expect(examHeading(e)).toBe('2. Kurzarbeit');
    expect(examHeading({ ...e, number: '3' })).toBe('3. Kurzarbeit');
    expect(examHeading({ ...e, number: '' })).toBe('Kurzarbeit');
    expect(examHeading({ ...e, number: 'B' })).toBe('B Kurzarbeit');
  });
  it('file names', () => {
    expect(exportBaseName(e, 'F-A11a')).toBe('2025-03-19_F-A11a_Biologie_Kurzarbeit-2');
    expect(exportBaseName({ ...e, number: '', subject: 'Bio/Chemie: "x"' }, '10 b?', '_Notenspiegel')).toBe(
      '2025-03-19_10-b_BioChemie-x_Kurzarbeit_Notenspiegel',
    );
  });
});
