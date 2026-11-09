/**
 * Lock file next to a database on a (possibly shared) folder, so two devices
 * never write the same database at the same time.
 *
 * <db>.lock = JSON { host, user, pid, since, heartbeat }. The owner refreshes
 * the heartbeat every 30 s. A lock is stale if its heartbeat is older than
 * STALE_MS, or if it belongs to a process on this computer that no longer runs.
 */
import fs from 'node:fs';
import os from 'node:os';
import type { LockInfo } from '@shared/types';

export const STALE_MS = 2 * 60 * 1000;

export class InUseError extends Error {
  constructor(readonly lock: LockInfo) {
    super('DB_IN_USE');
    this.name = 'InUseError';
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readLock(file: string): LockInfo | null {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8')) as LockInfo;
    if (typeof v.host !== 'string' || typeof v.pid !== 'number' || typeof v.heartbeat !== 'string') return null;
    return v;
  } catch {
    return null;
  }
}

export class FileLock {
  private info: LockInfo;

  constructor(
    readonly file: string,
    private readonly now: () => number = Date.now,
  ) {
    const t = new Date(this.now()).toISOString();
    this.info = { host: os.hostname(), user: os.userInfo().username, pid: process.pid, since: t, heartbeat: t };
  }

  private isMine(l: LockInfo | null): boolean {
    return !!l && l.host === this.info.host && l.pid === this.info.pid && l.since === this.info.since;
  }

  isStale(l: LockInfo): boolean {
    const age = this.now() - Date.parse(l.heartbeat);
    if (!Number.isFinite(age) || age > STALE_MS) return true;
    return l.host === this.info.host && l.pid !== this.info.pid && !alive(l.pid);
  }

  /** Takes the lock; throws InUseError if another live device holds it (unless force). */
  acquire(force = false): void {
    const cur = readLock(this.file);
    if (cur && !this.isMine(cur) && !this.isStale(cur) && !force) throw new InUseError(cur);
    this.write();
  }

  private write(): void {
    this.info.heartbeat = new Date(this.now()).toISOString();
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.info));
    fs.renameSync(tmp, this.file);
  }

  /** Who holds the lock now: this process, someone else, or nobody (file missing/unreadable). */
  owner(): 'mine' | 'other' | 'none' {
    const l = readLock(this.file);
    if (!l) return 'none';
    return this.isMine(l) ? 'mine' : 'other';
  }

  /** True if the lock file still names this process (it was not taken over). */
  stillMine(): boolean {
    return this.owner() === 'mine';
  }

  /**
   * Refreshes the heartbeat; returns false only if another device took the lock over.
   * A missing lock file is re-created (throws if the folder is unreachable).
   */
  refresh(): boolean {
    if (this.owner() === 'other') return false;
    this.write();
    return true;
  }

  release(): void {
    try {
      if (this.stillMine()) fs.rmSync(this.file, { force: true });
    } catch {
      // folder unreachable — the lock goes stale on its own
    }
  }
}
