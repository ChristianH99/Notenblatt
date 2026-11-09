/**
 * Owns the single DB connection and where/how it is stored.
 *
 * Two storage modes:
 *  - "wal":      default folder, not encrypted → SQLite file notenblatt.db in WAL mode (as before).
 *  - "snapshot": custom folder (e.g. a network share) and/or password protection →
 *                the DB lives in memory and every write saves the whole DB as ONE file
 *                (notenblatt.nbdb), optionally AES-256-GCM encrypted, written to
 *                "<file>.neu" and atomically renamed over the old file. A lock file with
 *                heartbeat prevents two devices from writing at the same time, and a
 *                change of the file by someone else is detected before each write.
 *
 * Why not SQLite directly on a share: WAL needs shared memory and does not work
 * across computers, and better-sqlite3 has no built-in encryption.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { BackupCounts, StorageInfo, StorageState } from '@shared/types';
import {
  BackupError,
  DB_MAGIC,
  decryptBackup,
  deriveKey,
  encryptBackup,
  hasMagic,
  openWithKey,
  openWithPassword,
  sealWithKey,
  verifyPassword,
  type KeyMaterial,
} from '../backup/crypto';
import { log } from '../log';
import { readConfig, writeConfig, type AppConfig } from '../storage/config';
import { FileLock, InUseError } from '../storage/lock';
import { dbFiles, openDatabase, openOrRecover, shredFile } from './files';
import { Repo, UserError } from './repo';
import { migrate, SCHEMA_VERSION, SchemaError } from './schema';

export const WAL_NAME = 'notenblatt.db';
export const SNAP_NAME = 'notenblatt.nbdb';

/**
 * A serialized WAL-mode DB has file-format bytes 18/19 = 2, which an in-memory
 * deserialized DB cannot read. Set them to 1 (rollback journal); WAL mode is
 * re-enabled when the file is opened normally.
 */
function toRollbackJournalHeader(buf: Buffer): Buffer {
  if (buf.length >= 20 && buf.subarray(0, 15).toString('latin1') === 'SQLite format 3') {
    buf[18] = 1;
    buf[19] = 1;
  }
  return buf;
}

function stamp(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function isDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function exists(f: string): boolean {
  try {
    fs.statSync(f);
    return true;
  } catch {
    return false;
  }
}

/** Overwrite a file's content with zeros in place (it is replaced right afterwards). */
function zeroInPlace(file: string): void {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r+');
    try {
      const chunk = Buffer.alloc(Math.min(size, 1 << 20));
      for (let off = 0; off < size; off += chunk.length) fs.writeSync(fd, chunk, 0, Math.min(chunk.length, size - off), off);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // best effort
  }
}

function writeDurable(file: string, data: Buffer): void {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeSync(fd, data, 0, data.length, 0);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

const UNREACHABLE = 'Der Speicherort ist nicht erreichbar. Die Änderung ist im Programm vorhanden und wird gespeichert, sobald der Speicherort wieder erreichbar ist.';
const CONFLICT = 'Die Datenbank wurde zwischenzeitlich auf einem anderen Gerät geöffnet oder geändert. Änderungen werden nicht mehr gespeichert – bitte Notenblatt neu starten.';

export interface ManagerOptions {
  /** scrypt cost (log2 N); tests use a smaller value. */
  logN?: number;
  heartbeatMs?: number;
}

export class DbManager {
  private db: Database.Database | null = null;
  private repoInst: Repo | null = null;
  corrupt: { renamedTo: string } | null = null;
  status: StorageState = { state: 'unavailable', reason: '', canCreate: false };
  private mode: 'wal' | 'snapshot' = 'wal';
  private km: KeyMaterial | null = null;
  private awaitingPassword = false;
  private lock: FileLock | null = null;
  private lastStat: { mtimeMs: number; size: number } | null = null;
  private dirty = false;
  private conflict = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly userData: string,
    private readonly opts: ManagerOptions = {},
  ) {}

  // ───────────── locations ─────────────

  get config(): AppConfig {
    return readConfig(this.userData);
  }

  private setDbDir(dir: string | null): void {
    writeConfig(this.userData, { ...this.config, dbDir: dir });
  }

  get dir(): string {
    return this.config.dbDir ?? this.userData;
  }

  get isDefaultDir(): boolean {
    return this.config.dbDir === null;
  }

  get walFile(): string {
    return path.join(this.userData, WAL_NAME);
  }

  get snapFile(): string {
    return path.join(this.dir, SNAP_NAME);
  }

  /** The current database file. */
  get file(): string {
    return this.mode === 'wal' ? this.walFile : this.snapFile;
  }

  info(): StorageInfo {
    return {
      dir: this.dir,
      isDefault: this.isDefaultDir,
      encrypted: this.km !== null || this.awaitingPassword,
      mode: this.mode,
      file: this.file,
    };
  }

  get ready(): boolean {
    return this.status.state === 'ready' && this.repoInst !== null;
  }

  get repo(): Repo {
    if (!this.repoInst) throw new UserError('Die Datenbank ist nicht geöffnet.');
    return this.repoInst;
  }

  // ───────────── opening ─────────────

  /** Opens the configured database. Never throws for unreachable/locked/damaged files. */
  start(force = false): StorageState {
    this.shutdown(false);
    this.corrupt = null;
    this.km = null;
    this.awaitingPassword = false;
    this.conflict = false;
    fs.mkdirSync(this.userData, { recursive: true });

    if (this.isDefaultDir && !exists(this.snapFile)) {
      this.mode = 'wal';
      try {
        const r = openOrRecover(this.walFile);
        this.attach(r.db);
        this.corrupt = r.corrupt;
      } catch (e) {
        if (!(e instanceof SchemaError)) throw e;
        this.setIncompatible(e);
      }
      return this.status;
    }

    this.mode = 'snapshot';
    const dir = this.dir;
    if (!isDir(dir)) {
      this.status = { state: 'unavailable', reason: `Der Speicherort „${dir}“ ist nicht erreichbar.`, canCreate: false };
      return this.status;
    }
    const neu = `${this.snapFile}.neu`;
    if (!exists(this.snapFile) && exists(neu)) fs.renameSync(neu, this.snapFile);
    if (!exists(this.snapFile)) {
      this.status = { state: 'unavailable', reason: `Im Ordner „${dir}“ wurde keine Notenblatt-Datenbank gefunden.`, canCreate: true };
      return this.status;
    }
    const lock = new FileLock(`${this.snapFile}.lock`);
    try {
      lock.acquire(force);
    } catch (e) {
      if (e instanceof InUseError) {
        this.status = { state: 'inUse', lock: e.lock };
        return this.status;
      }
      this.status = { state: 'unavailable', reason: `Der Speicherort „${dir}“ ist nicht beschreibbar.`, canCreate: false };
      return this.status;
    }
    this.lock = lock;
    let buf: Buffer;
    try {
      buf = fs.readFileSync(this.snapFile);
    } catch {
      this.releaseLock();
      this.status = { state: 'unavailable', reason: `Die Datenbank in „${dir}“ konnte nicht gelesen werden.`, canCreate: false };
      return this.status;
    }
    this.startTimer();
    if (hasMagic(buf, DB_MAGIC)) {
      this.awaitingPassword = true;
      this.status = { state: 'locked' };
      return this.status;
    }
    try {
      this.openMemory(buf);
    } catch (e) {
      if (e instanceof SchemaError) this.setIncompatible(e);
      else this.recoverCorruptSnapshot();
    }
    return this.status;
  }

  /** The database is left exactly as it is; the lock is released so another (newer) device can use it. */
  private setIncompatible(e: SchemaError): void {
    log('warn', 'DB_INCOMPATIBLE', { reason: e.reason });
    this.km = null;
    this.awaitingPassword = false;
    this.stopTimer();
    this.releaseLock();
    this.status = { state: 'incompatible', reason: e.reason };
  }

  /** Convenience for tests/one-shot use: start() and require "ready". */
  open(): Repo {
    const s = this.start();
    if (s.state !== 'ready') throw new Error(`DB_NOT_READY:${s.state}`);
    return this.repo;
  }

  async unlock(password: string): Promise<StorageState> {
    if (!this.awaitingPassword) return this.status;
    const buf = fs.readFileSync(this.snapFile);
    let plain: Buffer;
    let km: KeyMaterial;
    try {
      ({ plain, km } = await openWithPassword(buf, password, DB_MAGIC));
    } catch (e) {
      if (e instanceof BackupError && e.code === 'version') throw new UserError(e.message);
      throw new UserError('Das Passwort ist falsch oder die Datei ist beschädigt.');
    }
    this.km = km;
    this.awaitingPassword = false;
    try {
      this.openMemory(plain);
    } catch (e) {
      this.km = null;
      if (e instanceof SchemaError) this.setIncompatible(e);
      else throw new UserError('Die Datenbank ist beschädigt.');
    } finally {
      plain.fill(0);
    }
    return this.status;
  }

  /** "Trotzdem öffnen": takes over a lock held by another device. */
  forceOpen(): StorageState {
    return this.start(true);
  }

  /** Creates a new, empty (unencrypted) database at the configured custom folder. */
  createHere(): StorageState {
    if (this.status.state !== 'unavailable' || !this.status.canCreate) return this.status;
    const lock = new FileLock(`${this.snapFile}.lock`);
    lock.acquire();
    this.lock = lock;
    this.mode = 'snapshot';
    this.openMemory(null);
    this.persist();
    this.startTimer();
    return this.status;
  }

  /** Switches back to the default folder without moving anything. */
  useDefault(): StorageState {
    this.shutdown(false);
    this.setDbDir(null);
    return this.start();
  }

  private attach(db: Database.Database): void {
    this.db = db;
    this.repoInst = new Repo(db);
    this.status = { state: 'ready' };
  }

  private openMemory(buf: Buffer | null): void {
    const db = buf ? new Database(toRollbackJournalHeader(buf)) : new Database(':memory:');
    try {
      db.pragma('foreign_keys = ON');
      db.pragma('secure_delete = ON');
      if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('DB_QUICK_CHECK_FAILED');
      const before = db.pragma('user_version', { simple: true }) as number;
      migrate(db);
      this.attach(db);
      this.lastStat = this.statSnap();
      if (before !== SCHEMA_VERSION && buf) this.persist();
    } catch (e) {
      try {
        db.close();
      } catch {
        // ignore
      }
      throw e;
    }
  }

  private recoverCorruptSnapshot(): void {
    const target = `${this.snapFile}.defekt-${stamp()}`;
    fs.renameSync(this.snapFile, target);
    this.lastStat = null;
    this.openMemory(null);
    this.persist();
    this.corrupt = { renamedTo: target };
    log('warn', 'DB_CORRUPT_RENAMED', {});
  }

  // ───────────── saving ─────────────

  private statSnap(): { mtimeMs: number; size: number } | null {
    try {
      const s = fs.statSync(this.snapFile);
      return { mtimeMs: s.mtimeMs, size: s.size };
    } catch {
      return null;
    }
  }

  private serializePlain(): Buffer {
    return toRollbackJournalHeader((this.db as Database.Database).serialize());
  }

  /** Writes the current DB to `target` atomically (encrypted with `km` if given). */
  private writeSnapshotTo(target: string, km: KeyMaterial | null, opts: { zeroOld?: boolean } = {}): void {
    const raw = this.serializePlain();
    const out = km ? sealWithKey(raw, km, DB_MAGIC) : raw;
    if (km) raw.fill(0);
    const tmp = `${target}.neu`;
    writeDurable(tmp, out);
    if (opts.zeroOld && exists(target)) zeroInPlace(target);
    fs.renameSync(tmp, target);
  }

  /**
   * Saves the in-memory DB (snapshot mode only; no-op for the local WAL file).
   * Throws a UserError-like message if the folder is unreachable or the file
   * was changed by another device. The data stays in memory and is retried.
   */
  persist(opts: { zeroOld?: boolean } = {}): void {
    if (this.mode !== 'snapshot' || !this.db) return;
    this.dirty = true;
    if (this.conflict) throw new UserError(CONFLICT);
    try {
      if (!isDir(this.dir)) throw new Error('UNREACHABLE');
      if (this.lock && !this.lock.refresh()) {
        this.conflict = true;
        throw new UserError(CONFLICT);
      }
      const now = this.statSnap();
      if (this.lastStat && now && (now.mtimeMs !== this.lastStat.mtimeMs || now.size !== this.lastStat.size)) {
        this.conflict = true;
        throw new UserError(CONFLICT);
      }
      this.writeSnapshotTo(this.snapFile, this.km, opts);
      this.lastStat = this.statSnap();
      this.dirty = false;
    } catch (e) {
      if (e instanceof UserError) throw e;
      log('warn', 'PERSIST_FAILED', { code: (e as NodeJS.ErrnoException).code ?? 'ERROR' });
      throw new UserError(UNREACHABLE);
    }
  }

  get hasUnsavedChanges(): boolean {
    return this.mode === 'snapshot' && this.dirty;
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), this.opts.heartbeatMs ?? 30_000);
    this.timer.unref?.();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Heartbeat: refresh the lock, retry pending saves. */
  tick(): void {
    if (!this.lock) return;
    try {
      if (!this.lock.refresh()) this.conflict = true;
    } catch {
      // folder temporarily unreachable
    }
    if (this.dirty && !this.conflict) {
      try {
        this.persist();
      } catch {
        // retried on the next tick
      }
    }
  }

  private releaseLock(): void {
    this.lock?.release();
    this.lock = null;
  }

  /** Closes the DB. With `save`, a pending snapshot is written first (best effort). */
  shutdown(save = true): boolean {
    this.stopTimer();
    let ok = true;
    if (save && this.hasUnsavedChanges && !this.conflict) {
      try {
        this.persist();
      } catch {
        ok = false;
      }
    }
    if (this.db) {
      try {
        if (this.mode === 'wal') this.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // ignore
      }
      this.db.close();
    }
    this.db = null;
    this.repoInst = null;
    this.releaseLock();
    this.dirty = false;
    this.lastStat = null;
    this.status = { state: 'unavailable', reason: 'Die Datenbank ist geschlossen.', canCreate: false };
    return ok;
  }

  close(): void {
    this.shutdown(true);
  }

  private requireReady(): Database.Database {
    if (!this.ready || !this.db) throw new UserError('Die Datenbank ist nicht geöffnet.');
    return this.db;
  }

  // ───────────── location and encryption changes ─────────────

  /** Reports whether a folder already contains a Notenblatt database (and whether it is encrypted). */
  inspectDir(dir: string): { exists: boolean; encrypted: boolean; writable: boolean } {
    const f = path.join(dir, SNAP_NAME);
    let encrypted = false;
    const ex = exists(f);
    if (ex) {
      try {
        const fd = fs.openSync(f, 'r');
        const head = Buffer.alloc(8);
        fs.readSync(fd, head, 0, 8, 0);
        fs.closeSync(fd);
        encrypted = head.equals(DB_MAGIC);
      } catch {
        // unreadable
      }
    }
    let writable: boolean;
    try {
      fs.accessSync(dir, fs.constants.W_OK);
      writable = isDir(dir);
    } catch {
      writable = false;
    }
    return { exists: ex, encrypted, writable };
  }

  private currentFiles(): string[] {
    return this.mode === 'wal' ? dbFiles(this.walFile) : [this.snapFile, `${this.snapFile}.neu`];
  }

  /**
   * Moves the data to another folder (null = default folder). The old copy is
   * overwritten and deleted. Encryption is kept.
   */
  relocate(targetDir: string | null, overwrite = false): StorageState {
    this.requireReady();
    const tDir = targetDir ?? this.userData;
    const sameDir = path.resolve(tDir).toLowerCase() === path.resolve(this.dir).toLowerCase();
    if (sameDir && (targetDir === null) === this.isDefaultDir) throw new UserError('Die Daten liegen bereits an diesem Speicherort.');
    if (targetDir !== null && path.resolve(targetDir).toLowerCase() === path.resolve(this.userData).toLowerCase()) {
      throw new UserError('Für den Standardordner wählen Sie bitte „Standardordner verwenden“.');
    }
    if (!isDir(tDir)) throw new UserError(`Der Ordner „${tDir}“ ist nicht erreichbar.`);
    const newMode = targetDir === null && !this.km ? 'wal' : 'snapshot';
    const tFile = newMode === 'wal' ? this.walFile : path.join(tDir, SNAP_NAME);
    if (exists(tFile) && !overwrite) throw new UserError('Am Zielort liegt bereits eine Notenblatt-Datenbank.');

    let newLock: FileLock | null = null;
    if (newMode === 'snapshot') {
      newLock = new FileLock(`${tFile}.lock`);
      try {
        newLock.acquire();
      } catch (e) {
        if (e instanceof InUseError) throw new UserError(`Die Datenbank am Zielort wird gerade auf „${e.lock.host}“ verwendet.`);
        throw new UserError(`In den Ordner „${tDir}“ kann nicht geschrieben werden.`);
      }
    }
    const plain = this.serializePlain();
    try {
      if (newMode === 'snapshot') {
        this.writeSnapshotTo(tFile, this.km, { zeroOld: true });
      } else {
        for (const f of dbFiles(this.walFile)) shredFile(f);
        writeDurable(this.walFile, plain);
      }
    } catch (e) {
      newLock?.release();
      plain.fill(0);
      if (e instanceof UserError) throw e;
      throw new UserError(`Die Daten konnten nicht nach „${tDir}“ geschrieben werden.`);
    }

    const oldFiles = this.currentFiles();
    const km = this.km;
    this.stopTimer();
    this.db?.close();
    this.db = null;
    this.repoInst = null;
    this.releaseLock();
    this.setDbDir(targetDir);
    this.mode = newMode;
    this.km = km;
    if (newMode === 'wal') {
      this.attach(openDatabase(this.walFile));
    } else {
      this.lock = newLock;
      this.lastStat = null;
      this.openMemory(plain);
      this.startTimer();
    }
    plain.fill(0);
    for (const f of oldFiles) if (path.resolve(f) !== path.resolve(this.file)) shredFile(f);
    log('info', 'DB_RELOCATED', {});
    return this.status;
  }

  /** Opens an existing database in another folder; the current data stays where it is. */
  openOther(targetDir: string | null): StorageState {
    this.shutdown(true);
    this.setDbDir(targetDir);
    return this.start();
  }

  async enableEncryption(password: string): Promise<void> {
    this.requireReady();
    if (this.km) throw new UserError('Die Datenbank ist bereits verschlüsselt.');
    const km = await deriveKey(password, undefined, this.opts.logN);
    if (this.mode === 'wal') {
      const target = path.join(this.userData, SNAP_NAME);
      this.writeSnapshotTo(target, km);
      const plain = this.serializePlain();
      this.stopTimer();
      this.db?.close();
      this.db = null;
      for (const f of dbFiles(this.walFile)) shredFile(f);
      this.mode = 'snapshot';
      this.km = km;
      const lock = new FileLock(`${target}.lock`);
      lock.acquire(true);
      this.lock = lock;
      this.lastStat = null;
      this.openMemory(plain);
      plain.fill(0);
      this.startTimer();
    } else {
      const old = this.km;
      this.km = km;
      try {
        this.persist({ zeroOld: true });
      } catch (e) {
        this.km = old;
        throw e;
      }
    }
    log('info', 'DB_ENCRYPTION_ON', {});
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    this.requireReady();
    if (!this.km) throw new UserError('Die Datenbank ist nicht verschlüsselt.');
    if (!(await verifyPassword(oldPassword, this.km))) throw new UserError('Das bisherige Passwort ist falsch.');
    const old = this.km;
    this.km = await deriveKey(newPassword, undefined, this.opts.logN);
    try {
      this.persist();
    } catch (e) {
      this.km = old;
      throw e;
    }
  }

  async disableEncryption(password: string): Promise<void> {
    this.requireReady();
    if (!this.km) throw new UserError('Die Datenbank ist nicht verschlüsselt.');
    if (!(await verifyPassword(password, this.km))) throw new UserError('Das Passwort ist falsch.');
    if (this.isDefaultDir) {
      const plain = this.serializePlain();
      for (const f of dbFiles(this.walFile)) shredFile(f);
      writeDurable(this.walFile, plain);
      plain.fill(0);
      const snap = this.snapFile;
      this.stopTimer();
      this.db?.close();
      this.db = null;
      this.releaseLock();
      this.km = null;
      this.mode = 'wal';
      this.attach(openDatabase(this.walFile));
      shredFile(snap);
      shredFile(`${snap}.lock`);
    } else {
      const old = this.km;
      this.km = null;
      try {
        this.persist();
      } catch (e) {
        this.km = old;
        throw e;
      }
    }
    log('info', 'DB_ENCRYPTION_OFF', {});
  }

  /** "Alle Daten löschen": removes the database wherever it is and starts empty in the default folder. */
  wipe(): Repo {
    const files = [
      ...dbFiles(this.walFile),
      this.snapFile,
      `${this.snapFile}.neu`,
      `${this.snapFile}.lock`,
      path.join(this.userData, SNAP_NAME),
      path.join(this.userData, `${SNAP_NAME}.neu`),
      path.join(this.userData, `${SNAP_NAME}.lock`),
    ];
    this.shutdown(false);
    for (const f of files) shredFile(f);
    this.setDbDir(null);
    this.start();
    return this.repo;
  }

  // ───────────── backup ─────────────

  /** Consistent snapshot of the whole DB, encrypted. */
  async exportEncrypted(password: string, logN?: number): Promise<Buffer> {
    const snapshot = toRollbackJournalHeader(this.repo.db.serialize());
    try {
      return await encryptBackup(snapshot, password, logN);
    } finally {
      snapshot.fill(0);
    }
  }

  /** Decrypts and validates a backup. Throws BackupError; changes nothing. */
  static async inspect(file: Buffer, password: string): Promise<{ payload: Buffer; counts: BackupCounts }> {
    const payload = toRollbackJournalHeader(await decryptBackup(file, password));
    let mem: Database.Database | null = null;
    try {
      mem = new Database(payload);
      const check = mem.pragma('quick_check', { simple: true });
      const version = mem.pragma('user_version', { simple: true }) as number;
      if (check !== 'ok') throw new Error('check');
      if (version > SCHEMA_VERSION) throw new BackupError('version', 'Diese Datensicherung stammt aus einer neueren Programmversion.');
      const n = (t: string): number => (mem!.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
      return { payload, counts: { classes: n('school_class'), students: n('student'), exams: n('exam') } };
    } catch (e) {
      if (e instanceof BackupError) throw e;
      throw new BackupError('format', 'Die Datensicherung ist beschädigt.');
    } finally {
      mem?.close();
    }
  }

  /** Replaces all data with a validated backup payload (keeps location and encryption). */
  replaceWith(payload: Buffer): Repo {
    if (this.mode === 'wal') {
      this.shutdown(false);
      for (const f of dbFiles(this.walFile)) shredFile(f);
      fs.writeFileSync(this.walFile, payload);
      this.attach(openDatabase(this.walFile));
      this.corrupt = null;
      return this.repo;
    }
    this.requireReady();
    this.db?.close();
    this.db = null;
    this.repoInst = null;
    this.openMemory(payload);
    this.persist();
    return this.repo;
  }

  /** For tests: decrypts the snapshot file with the current key. */
  readSnapshotPlain(): Buffer {
    const buf = fs.readFileSync(this.snapFile);
    return this.km ? openWithKey(buf, this.km, DB_MAGIC) : buf;
  }
}
