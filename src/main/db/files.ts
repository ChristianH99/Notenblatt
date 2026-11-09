import fs from 'node:fs';
import Database from 'better-sqlite3';
import { migrate } from './schema';

export function dbFiles(file: string): string[] {
  return [file, `${file}-wal`, `${file}-shm`];
}

/** Best-effort physical erasure: overwrite with zeros, flush, then unlink. */
export function shredFile(file: string): void {
  let fd: number | null = null;
  try {
    const size = fs.statSync(file).size;
    fd = fs.openSync(file, 'r+');
    const chunk = Buffer.alloc(Math.min(size, 1 << 20));
    for (let off = 0; off < size; off += chunk.length) {
      fs.writeSync(fd, chunk, 0, Math.min(chunk.length, size - off), off);
    }
    fs.fsyncSync(fd);
  } catch {
    // file does not exist or is not writable — fall through to unlink
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // ignore
  }
}

export function configure(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('secure_delete = ON');
  db.pragma('synchronous = NORMAL');
}

/** Opens (and migrates) the DB; throws if the file is not a healthy SQLite DB. */
export function openDatabase(file: string): Database.Database {
  const db = new Database(file);
  try {
    configure(db);
    const check = db.pragma('quick_check', { simple: true });
    if (check !== 'ok') throw new Error('DB_QUICK_CHECK_FAILED');
    migrate(db);
    return db;
  } catch (e) {
    try {
      db.close();
    } catch {
      // ignore
    }
    throw e;
  }
}

export interface OpenResult {
  db: Database.Database;
  corrupt: { renamedTo: string } | null;
}

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Opens the DB. If it is damaged, the file (and -wal/-shm) is renamed to
 * "*.defekt-<timestamp>" and a fresh DB is created. Never throws for a damaged file.
 */
export function openOrRecover(file: string): OpenResult {
  try {
    return { db: openDatabase(file), corrupt: null };
  } catch {
    const suffix = `.defekt-${stamp()}`;
    let renamedTo = '';
    for (const f of dbFiles(file)) {
      if (fs.existsSync(f)) {
        const target = f + suffix;
        fs.renameSync(f, target);
        if (f === file) renamedTo = target;
      }
    }
    return { db: openDatabase(file), corrupt: { renamedTo } };
  }
}
