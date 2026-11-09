/**
 * Minimal logger. Only event codes and numeric IDs are ever logged — never
 * names, scores or other personal data. Output goes to stderr only (no file).
 */
type Level = 'info' | 'warn' | 'error';

export function log(level: Level, code: string, meta: Record<string, string | number>): void {
  const safe: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(meta)) {
    // Allow numbers and short identifier-like strings (method names, error codes) only.
    if (typeof v === 'number' || /^[A-Za-z0-9_.-]{1,64}$/.test(v)) safe[k] = v;
  }
  if (level === 'info' && process.env.NODE_ENV === 'production') return;
  process.stderr.write(`[notenblatt] ${level} ${code} ${JSON.stringify(safe)}\n`);
}
