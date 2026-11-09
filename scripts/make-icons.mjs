/**
 * Generates resources/icon.png (256 px) and resources/icon.ico (16–256 px) without any
 * dependency: a plain monochrome grid symbol in the accent colour.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ACCENT = [0x24, 0x5b, 0x85];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Draws the icon at size s: rounded square outline-free tile with a 3×3 white grid. */
function draw(s) {
  const px = Buffer.alloc(s * s * 4);
  const m = Math.round(s * 0.06); // outer margin
  const r = Math.max(1, Math.round(s * 0.08)); // corner radius
  const line = Math.max(1, Math.round(s / 24));
  const inner0 = m + Math.round(s * 0.14);
  const inner1 = s - m - Math.round(s * 0.14);
  const cells = 3;
  const step = (inner1 - inner0) / cells;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      // rounded rect test
      const dx = Math.max(m + r - x - 0.5, 0, x + 0.5 - (s - m - r));
      const dy = Math.max(m + r - y - 0.5, 0, y + 0.5 - (s - m - r));
      const inside = x >= m && x < s - m && y >= m && y < s - m && dx * dx + dy * dy <= r * r;
      if (!inside) continue;
      let white = false;
      if (x >= inner0 && x <= inner1 && y >= inner0 && y <= inner1) {
        for (let k = 0; k <= cells; k++) {
          const g = Math.round(inner0 + k * step);
          if (Math.abs(x - g) < line / 2 + 0.01 || Math.abs(y - g) < line / 2 + 0.01) white = true;
        }
        // header row tint: first row filled
        if (y >= inner0 && y <= Math.round(inner0 + step)) white = true;
      }
      const [cr, cg, cb] = white ? [255, 255, 255] : ACCENT;
      px[i] = cr;
      px[i + 1] = cg;
      px[i + 2] = cb;
      px[i + 3] = 255;
    }
  }
  return px;
}

function png(s) {
  const px = draw(s);
  const raw = Buffer.alloc(s * (s * 4 + 1));
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0;
    px.copy(raw, y * (s * 4 + 1) + 1, y * s * 4, (y + 1) * s * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(sizes) {
  const images = sizes.map(png);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const o = i * 16;
    dir[o] = s >= 256 ? 0 : s;
    dir[o + 1] = s >= 256 ? 0 : s;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(images[i].length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, dir, ...images]);
}

const out = path.resolve('resources');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), png(256));
fs.writeFileSync(path.join(out, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('resources/icon.png and resources/icon.ico written');
