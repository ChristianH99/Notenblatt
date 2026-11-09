/** Display labels and file names derived from exam metadata. */
import { formatDateDe } from './parse/number';

export const EXAM_KINDS = ['Schulaufgabe', 'Kurzarbeit', 'Stegreifaufgabe', 'Test', 'Klausur'] as const;

interface ExamLike {
  kind: string;
  number: string;
  subject: string;
  examDate: string;
}

function numberBare(n: string): string {
  return n.trim().replace(/\.+$/, '');
}

/** "Kurzarbeit 2 · Biologie · 19.03.2025" */
export function examTitle(e: ExamLike): string {
  const nr = numberBare(e.number);
  const head = nr ? `${e.kind} ${nr}` : e.kind;
  return [head, e.subject, formatDateDe(e.examDate)].filter((p) => p.trim() !== '').join(' · ');
}

/** "Kurzarbeit 2 · 19.03.2025" – without the subject, for lists inside a course. */
export function examShortTitle(e: Omit<ExamLike, 'subject'>): string {
  return examTitle({ ...e, subject: '' });
}

/** "2. Kurzarbeit" (as in the Excel header). */
export function examHeading(e: ExamLike): string {
  const nr = e.number.trim();
  if (!nr) return e.kind;
  return `${/^\d+$/.test(nr) ? `${nr}.` : nr} ${e.kind}`;
}

/** File-name-safe text: no reserved or control characters, spaces → "-". */
export function clean(s: string): string {
  return [...s.normalize('NFC')]
    .filter((ch) => (ch.codePointAt(0) as number) >= 0x20)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/** "2025-03-19_F-A11a_Biologie_Kurzarbeit-2" (without extension). */
export function exportBaseName(e: ExamLike, className: string, suffix = ''): string {
  const nr = numberBare(e.number);
  const kind = clean(nr ? `${e.kind}-${nr}` : e.kind);
  const parts = [e.examDate, clean(className), clean(e.subject), kind].filter((p) => p !== '');
  return parts.join('_') + suffix;
}
