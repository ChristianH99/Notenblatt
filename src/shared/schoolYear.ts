/** School year helpers. The school year switches on 1 August and ends on 31 July. */

export function currentSchoolYear(now: Date = new Date()): string {
  const y = now.getFullYear();
  const start = now.getMonth() >= 7 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

/** First year of "2025/26" → 2025, or null for unparsable input. */
export function schoolYearStart(sy: string): number | null {
  const m = /^\s*(\d{4})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(sy);
  return m ? Number(m[1]) : null;
}

export function isValidSchoolYear(sy: string): boolean {
  const m = /^\s*(\d{4})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(sy);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return (m[2] as string).length === 2 ? (a + 1) % 100 === b : a + 1 === b;
}

/** "2025/26" → "2026/27". */
export function nextSchoolYear(sy: string): string {
  const s = schoolYearStart(sy);
  if (s === null) return sy;
  return `${s + 1}/${String((s + 2) % 100).padStart(2, '0')}`;
}

/**
 * True if the school year ended (31 July) more than `months` months before `now`.
 */
export function isExpired(sy: string, months: number, now: Date = new Date()): boolean {
  const s = schoolYearStart(sy);
  if (s === null) return false;
  // End of school year = 31 July (s+1), i.e. start of 1 August (s+1) in local time.
  const limit = new Date(s + 1, 7 + months, 1);
  return now.getTime() >= limit.getTime();
}

/** Sort key for "newest first": larger start year first. */
export function compareSchoolYearDesc(a: string, b: string): number {
  return (schoolYearStart(b) ?? 0) - (schoolYearStart(a) ?? 0) || b.localeCompare(a);
}
