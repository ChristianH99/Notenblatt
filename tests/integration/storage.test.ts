import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { DbManager, SNAP_NAME, WAL_NAME } from '../../src/main/db/manager';
import { SCHEMA_VERSION } from '../../src/main/db/schema';
import { DB_MAGIC, openWithPassword, sealWithKey } from '../../src/main/backup/crypto';
import { UserError } from '../../src/main/db/repo';
import { readConfig, writeConfig } from '../../src/main/storage/config';
import { FileLock, InUseError, readLock, STALE_MS } from '../../src/main/storage/lock';

const SECRET = 'Zqxwvy';
const opts = { logN: 12, heartbeatMs: 3_600_000 };

let userData: string;
let share: string;
let mgr: DbManager;

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-ud-'));
  share = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-share-'));
  mgr = new DbManager(userData, opts);
});

afterEach(() => {
  mgr.shutdown(false);
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(share, { recursive: true, force: true });
});

function seed(m: DbManager): number {
  const classId = m.repo.createClass('7a', '2025/26');
  m.repo.addStudents(classId, [{ lastName: SECRET, firstName: 'Testperson' }]);
  m.persist();
  return classId;
}

function contains(file: string, needle: string): boolean {
  if (!fs.existsSync(file)) return false;
  const b = fs.readFileSync(file);
  return b.includes(Buffer.from(needle, 'utf8')) || b.includes(Buffer.from(needle, 'utf16le'));
}

describe('default storage', () => {
  it('starts as local WAL database', () => {
    expect(mgr.start()).toEqual({ state: 'ready' });
    expect(mgr.info()).toMatchObject({ isDefault: true, encrypted: false, mode: 'wal' });
    expect(mgr.file).toBe(path.join(userData, WAL_NAME));
    mgr.persist(); // no-op in WAL mode
  });
});

describe('custom folder (shared drive)', () => {
  it('moves the data to a folder, deletes the old copy, and reopens from there', () => {
    mgr.start();
    seed(mgr);
    expect(mgr.inspectDir(share)).toEqual({ exists: false, encrypted: false, writable: true });
    mgr.relocate(share);
    expect(mgr.info()).toMatchObject({ dir: share, isDefault: false, mode: 'snapshot', encrypted: false });
    expect(fs.existsSync(path.join(share, SNAP_NAME))).toBe(true);
    expect(fs.existsSync(path.join(userData, WAL_NAME))).toBe(false);
    expect(readConfig(userData).dbDir).toBe(share);
    expect(readLock(path.join(share, `${SNAP_NAME}.lock`))?.pid).toBe(process.pid);

    // every write is saved to the share
    const id = mgr.repo.createClass('8b', '2025/26');
    mgr.persist();
    mgr.shutdown();
    expect(fs.existsSync(path.join(share, `${SNAP_NAME}.lock`))).toBe(false);

    const m2 = new DbManager(userData, opts);
    expect(m2.start()).toEqual({ state: 'ready' });
    expect(m2.repo.classTree().map((c) => c.id)).toContain(id);
    expect(m2.repo.classTree()[0]?.categories.length).toBe(2);
    m2.shutdown();
    mgr = m2;
  });

  it('refuses to overwrite an existing database unless asked; can open it instead', () => {
    mgr.start();
    seed(mgr);
    mgr.relocate(share);
    mgr.shutdown();
    // second device, own local data
    const ud2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-ud2-'));
    const other = new DbManager(ud2, opts);
    other.start();
    other.repo.createClass('Nur lokal', '2025/26');
    expect(other.inspectDir(share).exists).toBe(true);
    expect(() => other.relocate(share)).toThrow(/bereits eine Notenblatt-Datenbank/);
    expect(other.openOther(share)).toEqual({ state: 'ready' });
    expect(other.repo.classTree().map((c) => c.name)).toEqual(['7a']);
    other.shutdown();
    fs.rmSync(ud2, { recursive: true, force: true });
  });

  it('moves back to the default folder', () => {
    mgr.start();
    seed(mgr);
    mgr.relocate(share);
    mgr.relocate(null);
    expect(mgr.info()).toMatchObject({ isDefault: true, mode: 'wal' });
    expect(fs.existsSync(path.join(share, SNAP_NAME))).toBe(false);
    expect(mgr.repo.classTree()).toHaveLength(1);
    expect(() => mgr.relocate(null)).toThrow(UserError);
    expect(() => mgr.relocate(userData)).toThrow(UserError);
    expect(() => mgr.relocate(path.join(share, 'gibt-es-nicht'))).toThrow(/nicht erreichbar/);
  });

  it('reports an unreachable folder and a missing database without crashing', () => {
    writeConfig(userData, { version: 1, dbDir: path.join(share, 'offline') });
    expect(mgr.start()).toMatchObject({ state: 'unavailable', canCreate: false });
    expect(() => mgr.repo).toThrow(UserError);
    writeConfig(userData, { version: 1, dbDir: share });
    expect(mgr.start()).toMatchObject({ state: 'unavailable', canCreate: true });
    expect(mgr.createHere()).toEqual({ state: 'ready' });
    expect(fs.existsSync(path.join(share, SNAP_NAME))).toBe(true);
    expect(mgr.useDefault()).toEqual({ state: 'ready' });
    expect(mgr.info().isDefault).toBe(true);
  });

  it('blocks a second device while the lock is fresh; allows takeover; detects the takeover', () => {
    mgr.start();
    seed(mgr);
    mgr.relocate(share);
    // Simulate another device holding the lock.
    const lockFile = path.join(share, `${SNAP_NAME}.lock`);
    const foreign = { host: 'ANDERES-GERAET', user: 'kollegin', pid: 4242, since: new Date().toISOString(), heartbeat: new Date().toISOString() };
    fs.writeFileSync(lockFile, JSON.stringify(foreign));
    // our running instance notices on the next write
    mgr.repo.createClass('x', '2025/26');
    expect(() => mgr.persist()).toThrow(/anderen Gerät/);
    mgr.shutdown(false);

    const ud2 = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-ud2-'));
    writeConfig(ud2, { version: 1, dbDir: share });
    const m2 = new DbManager(ud2, opts);
    const s = m2.start();
    expect(s.state).toBe('inUse');
    expect(s.state === 'inUse' && s.lock.host).toBe('ANDERES-GERAET');
    expect(m2.forceOpen()).toEqual({ state: 'ready' });
    expect(readLock(lockFile)?.pid).toBe(process.pid);
    m2.shutdown();
    fs.rmSync(ud2, { recursive: true, force: true });
  });

  it('detects a file changed by someone else before overwriting it', () => {
    mgr.start();
    seed(mgr);
    mgr.relocate(share);
    const f = path.join(share, SNAP_NAME);
    fs.appendFileSync(f, Buffer.alloc(10)); // foreign write
    mgr.repo.createClass('y', '2025/26');
    expect(() => mgr.persist()).toThrow(/anderen Gerät/);
  });

  it('keeps unsaved changes and retries when the folder is temporarily unreachable', () => {
    mgr.start();
    seed(mgr);
    mgr.relocate(share);
    const f = path.join(share, SNAP_NAME);
    const moved = `${share}-weg`;
    mgr.repo.createClass('z', '2025/26');
    fs.renameSync(share, moved); // share disappears
    expect(() => mgr.persist()).toThrow(/nicht erreichbar/);
    expect(mgr.hasUnsavedChanges).toBe(true);
    fs.renameSync(moved, share); // back again
    mgr.tick();
    expect(mgr.hasUnsavedChanges).toBe(false);
    expect(fs.existsSync(f)).toBe(true);
  });
});

describe('lock file', () => {
  it('stale locks are taken over, fresh foreign locks are not', () => {
    const f = path.join(share, 'x.lock');
    let now = Date.now();
    const a = new FileLock(f, () => now);
    a.acquire();
    expect(a.stillMine()).toBe(true);
    const foreign = { host: 'B', user: 'u', pid: 1, since: new Date(now).toISOString(), heartbeat: new Date(now).toISOString() };
    fs.writeFileSync(f, JSON.stringify(foreign));
    expect(a.refresh()).toBe(false);
    expect(() => new FileLock(f, () => now).acquire()).toThrow(InUseError);
    now += STALE_MS + 1000;
    const c = new FileLock(f, () => now);
    c.acquire();
    expect(c.stillMine()).toBe(true);
    c.release();
    expect(fs.existsSync(f)).toBe(false);
    fs.writeFileSync(f, 'kaputt');
    expect(readLock(f)).toBeNull();
  });
});

describe('encryption', () => {
  it('encrypts the local database; no plaintext remains; password needed on start', async () => {
    mgr.start();
    seed(mgr);
    await mgr.enableEncryption('geheim-123');
    expect(mgr.info()).toMatchObject({ encrypted: true, mode: 'snapshot', isDefault: true });
    expect(fs.existsSync(path.join(userData, WAL_NAME))).toBe(false);
    const snap = path.join(userData, SNAP_NAME);
    expect(contains(snap, SECRET)).toBe(false);
    expect(fs.readFileSync(snap).subarray(0, 7).toString('latin1')).toBe('NBLTDB1');
    mgr.shutdown();

    const m2 = new DbManager(userData, opts);
    expect(m2.start()).toEqual({ state: 'locked' });
    expect(m2.info().encrypted).toBe(true);
    await expect(m2.unlock('falsch-falsch')).rejects.toThrow(/Passwort ist falsch/);
    expect(await m2.unlock('geheim-123')).toEqual({ state: 'ready' });
    expect(m2.repo.listStudents(m2.repo.classTree()[0]!.id)[0]?.lastName).toBe(SECRET);
    m2.shutdown();
    mgr = m2;
  });

  it('change password and disable encryption (default folder → back to WAL)', async () => {
    mgr.start();
    seed(mgr);
    await mgr.enableEncryption('geheim-123');
    await expect(mgr.changePassword('falsch-123', 'neu-12345')).rejects.toThrow(/bisherige Passwort/);
    await mgr.changePassword('geheim-123', 'neu-12345');
    mgr.shutdown();
    const m2 = new DbManager(userData, opts);
    m2.start();
    await expect(m2.unlock('geheim-123')).rejects.toThrow(UserError);
    await m2.unlock('neu-12345');
    await expect(m2.disableEncryption('geheim-123')).rejects.toThrow(/Passwort ist falsch/);
    await m2.disableEncryption('neu-12345');
    expect(m2.info()).toMatchObject({ encrypted: false, mode: 'wal' });
    expect(fs.existsSync(path.join(userData, SNAP_NAME))).toBe(false);
    expect(m2.repo.classTree()).toHaveLength(1);
    m2.shutdown();
    mgr = m2;
  });

  it('encrypted database on a shared folder; deleted names leave no trace in the decrypted file', async () => {
    mgr.start();
    const classId = seed(mgr);
    mgr.relocate(share);
    await mgr.enableEncryption('geheim-123');
    const f = path.join(share, SNAP_NAME);
    expect(contains(f, SECRET)).toBe(false);
    expect(mgr.readSnapshotPlain().includes(Buffer.from(SECRET))).toBe(true);
    const ids = mgr.repo.listStudents(classId).map((s) => s.id);
    mgr.repo.deleteStudents(ids);
    mgr.repo.secureCleanup();
    mgr.persist();
    expect(mgr.readSnapshotPlain().includes(Buffer.from(SECRET))).toBe(false);
    // disable on a custom folder → plain snapshot stays there
    await mgr.disableEncryption('geheim-123');
    expect(mgr.info()).toMatchObject({ encrypted: false, mode: 'snapshot', isDefault: false });
    expect(fs.readFileSync(f).subarray(0, 15).toString('latin1')).toBe('SQLite format 3');
  });

  it('refuses double encryption and password changes on an unencrypted DB', async () => {
    mgr.start();
    await expect(mgr.changePassword('a', 'b')).rejects.toThrow(UserError);
    await expect(mgr.disableEncryption('a')).rejects.toThrow(UserError);
    await mgr.enableEncryption('geheim-123');
    await expect(mgr.enableEncryption('geheim-123')).rejects.toThrow(UserError);
  });

  it('backup import and wipe work in snapshot mode', async () => {
    mgr.start();
    seed(mgr);
    const backup = await mgr.exportEncrypted('sicher-123', 12);
    mgr.relocate(share);
    await mgr.enableEncryption('geheim-123');
    mgr.repo.createClass('weg', '2025/26');
    const { payload } = await DbManager.inspect(backup, 'sicher-123');
    mgr.replaceWith(payload);
    expect(mgr.repo.classTree().map((c) => c.name)).toEqual(['7a']);
    expect(mgr.info().encrypted).toBe(true);
    mgr.wipe();
    expect(mgr.info()).toMatchObject({ isDefault: true, encrypted: false, mode: 'wal' });
    expect(fs.existsSync(path.join(share, SNAP_NAME))).toBe(false);
    expect(mgr.repo.isEmpty()).toBe(true);
  });

  it('a damaged plain snapshot is renamed and replaced by an empty database', () => {
    writeConfig(userData, { version: 1, dbDir: share });
    fs.writeFileSync(path.join(share, SNAP_NAME), Buffer.alloc(4096, 0x41));
    expect(mgr.start()).toEqual({ state: 'ready' });
    expect(mgr.corrupt?.renamedTo).toMatch(/notenblatt\.nbdb\.defekt-/);
    expect(mgr.repo.isEmpty()).toBe(true);
  });
});

describe('database from another program version', () => {
  const TOO_NEW = SCHEMA_VERSION + 1;
  const files = (dir: string): string[] => fs.readdirSync(dir).sort();
  const bytes = (file: string): Buffer => fs.readFileSync(file);
  const setVersionRaw = (file: string, v: number): void => {
    const db = new Database(file);
    db.pragma(`user_version = ${v}`);
    db.close();
  };

  it('local database from a newer version: refused, file untouched, not treated as damaged', () => {
    mgr.start();
    seed(mgr);
    mgr.shutdown();
    const file = path.join(userData, WAL_NAME);
    setVersionRaw(file, TOO_NEW);
    const before = bytes(file);
    const list = files(userData);

    const m2 = new DbManager(userData, opts);
    expect(m2.start()).toEqual({ state: 'incompatible', reason: 'tooNew' });
    expect(m2.corrupt).toBeNull();
    expect(() => m2.repo).toThrow();
    m2.shutdown(false);
    mgr = m2;
    expect(files(userData)).toEqual(list);
    expect(bytes(file).equals(before)).toBe(true);
  });

  it('shared database from a newer version: refused, file and lock left for the other device', () => {
    mgr.start();
    seed(mgr);
    mgr.relocate(share);
    mgr.shutdown();
    const file = path.join(share, SNAP_NAME);
    setVersionRaw(file, TOO_NEW);
    const before = bytes(file);

    const m2 = new DbManager(userData, opts);
    expect(m2.start()).toEqual({ state: 'incompatible', reason: 'tooNew' });
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
    m2.shutdown(false);
    mgr = m2;
    expect(files(share)).toEqual([SNAP_NAME]);
    expect(bytes(file).equals(before)).toBe(true);
  });

  it('encrypted database from a newer version: refused after unlocking, file untouched', async () => {
    mgr.start();
    seed(mgr);
    await mgr.enableEncryption('geheim-123');
    mgr.shutdown();
    // re-seal the snapshot as a newer version would have written it
    const file = path.join(userData, SNAP_NAME);
    const { plain, km } = await openWithPassword(bytes(file), 'geheim-123', DB_MAGIC);
    const db = new Database(plain);
    db.pragma(`user_version = ${TOO_NEW}`);
    fs.writeFileSync(file, sealWithKey(db.serialize(), km, DB_MAGIC));
    db.close();
    const before = bytes(file);

    const m2 = new DbManager(userData, opts);
    expect(m2.start()).toEqual({ state: 'locked' });
    expect(await m2.unlock('geheim-123')).toEqual({ state: 'incompatible', reason: 'tooNew' });
    m2.shutdown(false);
    mgr = m2;
    expect(bytes(file).equals(before)).toBe(true);
  });

  it('a failing migration leaves the database unchanged and is not treated as damaged', () => {
    // An old database whose first migration cannot run (its table already exists).
    const file = path.join(userData, WAL_NAME);
    const db = new Database(file);
    db.exec(`CREATE TABLE school_class (x TEXT); INSERT INTO school_class VALUES ('${SECRET}')`);
    db.close();
    const list = files(userData);
    const before = bytes(file);

    expect(mgr.start()).toEqual({ state: 'incompatible', reason: 'migrationFailed' });
    expect(mgr.corrupt).toBeNull();
    mgr.shutdown(false);
    expect(files(userData)).toEqual(list);
    expect(bytes(file).equals(before)).toBe(true);
    const check = new Database(file, { readonly: true });
    expect(check.pragma('user_version', { simple: true })).toBe(0);
    expect(check.prepare('SELECT x FROM school_class').pluck().get()).toBe(SECRET);
    check.close();
  });
});
