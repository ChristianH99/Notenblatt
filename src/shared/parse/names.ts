/** Parsing of pasted student name lists ("Namen einfügen…"). */
import type { NameInput } from '../types';

export interface ParsedName extends NameInput {
  /** 1-based line number in the pasted text. */
  line: number;
  duplicate: boolean;
}

function splitLine(line: string): NameInput | null {
  const t = line.trim();
  if (t === '') return null;
  if (line.includes('\t')) {
    const cols = line.split('\t').map((c) => c.trim()).filter((c) => c !== '');
    if (cols.length === 0) return null;
    return { lastName: cols[0] as string, firstName: cols[1] ?? '' };
  }
  const comma = t.indexOf(',');
  if (comma >= 0) {
    return { lastName: t.slice(0, comma).trim(), firstName: t.slice(comma + 1).trim() };
  }
  const parts = t.split(/\s+/);
  return { lastName: parts[0] as string, firstName: parts.slice(1).join(' ') };
}

export function nameKey(n: NameInput): string {
  return `${n.lastName.toLocaleLowerCase('de')}\u0000${n.firstName.toLocaleLowerCase('de')}`;
}

/**
 * Accepts one student per line as "Nachname, Vorname", "Nachname<TAB>Vorname"
 * or "Nachname Vorname". Empty lines are skipped, whitespace trimmed.
 * Duplicates (within the paste or against `existing`) are flagged, not removed.
 */
export function parseNameList(text: string, swap: boolean, existing: NameInput[] = []): ParsedName[] {
  const seen = new Set(existing.map(nameKey));
  const out: ParsedName[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const n = splitLine(raw);
    if (!n || n.lastName === '') return;
    const name: NameInput = swap && n.firstName !== '' ? { lastName: n.firstName, firstName: n.lastName } : n;
    const key = nameKey(name);
    out.push({ ...name, line: i + 1, duplicate: seen.has(key) });
    seen.add(key);
  });
  return out;
}

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** German collation: last name, then first name. */
export function compareNames(a: NameInput & { id?: number }, b: NameInput & { id?: number }): number {
  return (
    collator.compare(a.lastName, b.lastName) ||
    collator.compare(a.firstName, b.firstName) ||
    (a.id ?? 0) - (b.id ?? 0)
  );
}
