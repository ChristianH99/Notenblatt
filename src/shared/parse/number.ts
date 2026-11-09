/** Parsing and formatting of point values, grades and percentages (German notation). */
import { idiv, type StepQp } from '../grading/units';

export type ParseResult = { ok: true; qp: number | null } | { ok: false; error: string };

const FRACTION_QP: Record<string, number> = { '': 0, '25': 1, '5': 2, '75': 3 };
const MAX_INT_DIGITS = 6;

export interface ParseOptions {
  stepQp: StepQp;
  /** Upper bound in qp (inclusive). */
  maxQp?: number;
  /** Task label for the "höchstens" message. */
  label?: string;
  /** Used for the max-points row: zero is not allowed. */
  positive?: boolean;
}

export function stepText(stepQp: StepQp): string {
  return formatQp(stepQp);
}

/**
 * Parses "3,5", "3.5", ",5", "3,50", " 3 ". Empty input means "delete".
 */
export function parsePoints(raw: string, opts: ParseOptions): ParseResult {
  const s = raw.trim();
  if (s === '') return { ok: true, qp: null };
  if (/^-/.test(s)) return { ok: false, error: 'Negative Werte sind nicht erlaubt' };
  const m = /^(\d*)(?:[.,](\d*))?$/.exec(s);
  const intPart = m?.[1] ?? '';
  const fracRaw = m?.[2] ?? '';
  if (!m || (intPart === '' && fracRaw === '')) {
    return { ok: false, error: 'Bitte eine Zahl eingeben' };
  }
  if (intPart.replace(/^0+/, '').length > MAX_INT_DIGITS) {
    return { ok: false, error: 'Der Wert ist zu groß' };
  }
  const frac = fracRaw.replace(/0+$/, '');
  const fracQp = FRACTION_QP[frac];
  if (fracQp === undefined) {
    return { ok: false, error: `Nur Schritte von ${stepText(opts.stepQp)} erlaubt` };
  }
  const qp = Number(intPart || '0') * 4 + fracQp;
  if (qp % opts.stepQp !== 0) {
    return { ok: false, error: `Nur Schritte von ${stepText(opts.stepQp)} erlaubt` };
  }
  if (opts.positive && qp === 0) {
    return { ok: false, error: 'Die Höchstpunktzahl muss größer als 0 sein' };
  }
  if (opts.maxQp !== undefined && qp > opts.maxQp) {
    const who = opts.label !== undefined ? `Aufgabe ${opts.label}: ` : '';
    return { ok: false, error: `${who}höchstens ${formatQp(opts.maxQp)} Punkte` };
  }
  return { ok: true, qp };
}

/** 14 → "3,5", 4 → "1", 0 → "0". No grouping, no trailing ",0". */
export function formatQp(qp: number): string {
  const neg = qp < 0;
  const a = Math.abs(qp);
  const int = idiv(a, 4);
  const frac = ['', ',25', ',5', ',75'][a % 4] as string;
  return `${neg ? '-' : ''}${int}${frac}`;
}

/** Tenths of a point → "4,8", "4" (no trailing ",0"). */
export function formatTenths(t: number): string {
  const int = idiv(t, 10);
  const d = t % 10;
  return d === 0 ? String(int) : `${int},${d}`;
}

/** Grade × 10 → "2,0". */
export function formatGrade10(g: number): string {
  return `${idiv(g, 10)},${g % 10}`;
}

/** Hundredths → "1,94" (always two decimals). */
export function formatHundredths(h: number): string {
  const int = idiv(h, 100);
  const d = h % 100;
  return `${int},${d < 10 ? '0' : ''}${d}`;
}

/** Tenths of a percent → "94,1" / "100" (no trailing ",0"). */
export function formatPctTenths(t: number): string {
  return formatTenths(t);
}

/** ISO date → "19.03.2025". */
export function formatDateDe(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** "19.3.2025" / "19.03.25" → ISO, or null if not a valid date. */
export function parseDateDe(s: string): string | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\s*$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if ((m[3] as string).length === 2) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Local date today as ISO. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
