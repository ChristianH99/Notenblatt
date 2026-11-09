/**
 * Encrypted container used for backups (.notenblatt) and for the encrypted
 * database file (notenblatt.nbdb). Only the magic differs.
 *
 * Layout (all integers unsigned):
 *   0  8   magic ("NBLTBKP\0" backup, "NBLTDB1\0" database)
 *   8  1   format version (1)
 *   9  1   scrypt log2(N)
 *   10 1   scrypt r
 *   11 1   scrypt p
 *   12 16  salt
 *   28 12  GCM nonce (random per write)
 *   40 16  GCM auth tag
 *   56 …   ciphertext = AES-256-GCM(gzip(SQLite DB bytes))
 * The header bytes 0…39 are authenticated as additional data.
 */
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const MAGIC = Buffer.from('NBLTBKP\0', 'latin1');
export const DB_MAGIC = Buffer.from('NBLTDB1\0', 'latin1');
export const FORMAT_VERSION = 1;
const HEADER_LEN = 40;
const TAG_LEN = 16;
const DEFAULT_LOG_N = 17;
const R = 8;
const P = 1;

export class BackupError extends Error {
  constructor(
    readonly code: 'format' | 'password' | 'version',
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

/** A derived key together with the parameters needed to write the header. */
export interface KeyMaterial {
  key: Buffer;
  salt: Buffer;
  logN: number;
  r: number;
  p: number;
}

function scrypt(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  const N = 2 ** logN;
  return new Promise((resolve, reject) => {
    crypto.scrypt(password.normalize('NFC'), salt, 32, { N, r, p, maxmem: 256 * N * r + 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function deriveKey(password: string, salt: Buffer = crypto.randomBytes(16), logN = DEFAULT_LOG_N, r = R, p = P): Promise<KeyMaterial> {
  return { key: await scrypt(password, salt, logN, r, p), salt, logN, r, p };
}

/** True if `password` produces the same key as `km` (constant time). */
export async function verifyPassword(password: string, km: KeyMaterial): Promise<boolean> {
  const other = await scrypt(password, km.salt, km.logN, km.r, km.p);
  return crypto.timingSafeEqual(other, km.key);
}

export function hasMagic(file: Buffer, magic: Buffer): boolean {
  return file.length >= magic.length && file.subarray(0, magic.length).equals(magic);
}

export function sealWithKey(plain: Buffer, km: KeyMaterial, magic: Buffer = MAGIC): Buffer {
  const nonce = crypto.randomBytes(12);
  const header = Buffer.alloc(HEADER_LEN);
  magic.copy(header, 0);
  header.writeUInt8(FORMAT_VERSION, 8);
  header.writeUInt8(km.logN, 9);
  header.writeUInt8(km.r, 10);
  header.writeUInt8(km.p, 11);
  km.salt.copy(header, 12);
  nonce.copy(header, 28);
  const cipher = crypto.createCipheriv('aes-256-gcm', km.key, nonce);
  cipher.setAAD(header);
  const ct = Buffer.concat([cipher.update(zlib.gzipSync(plain)), cipher.final()]);
  return Buffer.concat([header, cipher.getAuthTag(), ct]);
}

interface Header {
  header: Buffer;
  salt: Buffer;
  logN: number;
  r: number;
  p: number;
}

function readHeader(file: Buffer, magic: Buffer): Header {
  if (file.length < HEADER_LEN + TAG_LEN || !hasMagic(file, magic)) {
    throw new BackupError('format', 'Die Datei ist keine Notenblatt-Datei oder beschädigt.');
  }
  if (file.readUInt8(8) !== FORMAT_VERSION) {
    throw new BackupError('version', 'Diese Datei stammt aus einer neueren Programmversion.');
  }
  const logN = file.readUInt8(9);
  const r = file.readUInt8(10);
  const p = file.readUInt8(11);
  if (logN < 10 || logN > 20 || r < 1 || r > 32 || p < 1 || p > 16) {
    throw new BackupError('format', 'Die Datei ist keine Notenblatt-Datei oder beschädigt.');
  }
  return { header: file.subarray(0, HEADER_LEN), salt: Buffer.from(file.subarray(12, 28)), logN, r, p };
}

export function openWithKey(file: Buffer, km: KeyMaterial, magic: Buffer = MAGIC): Buffer {
  const h = readHeader(file, magic);
  const decipher = crypto.createDecipheriv('aes-256-gcm', km.key, file.subarray(28, 40));
  decipher.setAAD(h.header);
  decipher.setAuthTag(file.subarray(HEADER_LEN, HEADER_LEN + TAG_LEN));
  let gz: Buffer;
  try {
    gz = Buffer.concat([decipher.update(file.subarray(HEADER_LEN + TAG_LEN)), decipher.final()]);
  } catch {
    throw new BackupError('password', 'Das Passwort ist falsch oder die Datei ist beschädigt.');
  }
  try {
    return zlib.gunzipSync(gz);
  } catch {
    throw new BackupError('format', 'Die Datei ist beschädigt.');
  }
}

export async function openWithPassword(file: Buffer, password: string, magic: Buffer = MAGIC): Promise<{ plain: Buffer; km: KeyMaterial }> {
  const h = readHeader(file, magic);
  const km = await deriveKey(password, h.salt, h.logN, h.r, h.p);
  return { plain: openWithKey(file, km, magic), km };
}

export async function encryptBackup(plain: Buffer, password: string, logN = DEFAULT_LOG_N): Promise<Buffer> {
  return sealWithKey(plain, await deriveKey(password, undefined, logN), MAGIC);
}

export async function decryptBackup(file: Buffer, password: string): Promise<Buffer> {
  return (await openWithPassword(file, password, MAGIC)).plain;
}
