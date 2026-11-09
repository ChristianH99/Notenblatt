/**
 * Third-party notices for everything that ships inside the app.
 *
 * Shipped npm packages are found by scanning the import statements in src/ (bundled
 * or loaded at runtime) and following their runtime dependencies. Added by hand: the
 * Electron runtime, SQLite (compiled into better-sqlite3) and the copied Fluent icons.
 *
 * - collectNotices(root): used by the renderer build (virtual:about) for the info page.
 * - CLI: `node scripts/licenses.mjs` writes THIRD_PARTY_NOTICES.md (without versions, so
 *   routine updates do not change it); `--check` fails if the file is out of date.
 */
import fs from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTICES_FILE = 'THIRD_PARTY_NOTICES.md';

/** Specifiers that are not npm packages shipped with the app. */
const NOT_SHIPPED = new Set(['electron']);
const ALIASES = /^@(shared|renderer)\//;

const SQLITE_BLESSING = `The author disclaims copyright to this source code. In place of a legal notice, here is a blessing:

    May you do good and not evil.
    May you find forgiveness for yourself and forgive others.
    May you share freely, never taking more than you give.`;

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|mts|js|mjs)$/.test(e.name) ? [p] : [];
  });
}

/** Package names imported (not type-only) anywhere in src/. */
function importedPackages(root) {
  const names = new Set();
  const re = /(?:^|\n)\s*import\s+(type\s)?[^'"]*?from\s*['"]([^'"]+)['"]|(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  for (const file of sourceFiles(path.join(root, 'src'))) {
    const code = fs.readFileSync(file, 'utf8');
    for (const m of code.matchAll(re)) {
      if (m[1]) continue; // import type
      const spec = m[2] ?? m[3] ?? m[4];
      // relative, aliases and scheme specifiers (node:, virtual:) are not npm packages
      if (!spec || spec.startsWith('.') || /^[a-z]+:/.test(spec) || ALIASES.test(spec)) continue;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (builtinModules.includes(name) || NOT_SHIPPED.has(name)) continue;
      names.add(name);
    }
  }
  return [...names];
}

/** Node-style lookup of a package directory, starting at `fromDir`. */
function findPackage(name, fromDir) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`Package not found: ${name} (from ${fromDir})`);
  }
}

function licenseText(dir, name) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^(licen[cs]e|copying|notice)([.-]|$)/i.test(f))
    .sort((a, b) => Number(/^notice/i.test(a)) - Number(/^notice/i.test(b)) || a.localeCompare(b));
  if (files.length === 0) throw new Error(`No license file in ${name}`);
  return files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim()).join('\n\n');
}

function repoUrl(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const url = pkg.homepage || r || '';
  return url.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^github:/, 'https://github.com/');
}

function npmEntry(dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type;
  if (!license) throw new Error(`No license field in ${pkg.name}`);
  return { pkg, entry: { name: pkg.name, version: pkg.version, license, url: repoUrl(pkg), text: licenseText(dir, pkg.name) } };
}

/** @returns {import('./licenses.d.mts').ThirdPartyNotice[]} */
export function collectNotices(root = ROOT) {
  const byName = new Map();
  const queue = importedPackages(root).map((name) => findPackage(name, root));
  while (queue.length > 0) {
    const dir = queue.shift();
    const { pkg, entry } = npmEntry(dir);
    if (byName.has(entry.name)) continue;
    byName.set(entry.name, entry);
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
      try {
        queue.push(findPackage(dep, dir));
      } catch (e) {
        if (!pkg.optionalDependencies?.[dep]) throw e;
      }
    }
  }

  const electron = npmEntry(findPackage('electron', root)).entry;
  electron.note =
    'Laufzeitumgebung von Notenblatt. Electron enthält Chromium, Node.js und weitere Komponenten; deren Lizenzen liegen im Installationsordner in der Datei LICENSES.chromium.html.';
  electron.noteEn =
    'Runtime of Notenblatt. Electron includes Chromium, Node.js and further components; their licenses are installed next to the app in LICENSES.chromium.html.';

  const require = createRequire(path.join(root, 'package.json'));
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  const sqliteVersion = db.prepare('SELECT sqlite_version()').pluck().get();
  db.close();
  const sqlite = {
    name: 'SQLite',
    version: sqliteVersion,
    license: 'Public Domain',
    url: 'https://sqlite.org/copyright.html',
    note: 'In better-sqlite3 enthalten.',
    noteEn: 'Compiled into better-sqlite3.',
    text: SQLITE_BLESSING,
  };

  const iconsLicense = fs.readFileSync(path.join(root, 'src/renderer/icons/LICENSE.md'), 'utf8').replace(/\r\n/g, '\n');
  const icons = {
    name: 'Fluent UI System Icons',
    version: /@fluentui\/svg-icons ([\d.]+)\./.exec(iconsLicense)?.[1] ?? '',
    license: 'MIT',
    url: 'https://github.com/microsoft/fluentui-system-icons',
    note: 'Einzelne Symbole wurden in Notenblatt übernommen.',
    noteEn: 'Individual icons are copied into Notenblatt.',
    text: iconsLicense.slice(iconsLicense.indexOf('MIT License')).trim(),
  };

  const sorted = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return [electron, ...sorted, sqlite, icons];
}

export function renderMarkdown(notices) {
  const lines = [
    '# Third-party notices',
    '',
    'Notenblatt is copyright (c) Christian Häußler and released under the MIT License (see [LICENSE](LICENSE)).',
    'It includes the third-party software listed below. The app shows the same list, with exact versions, under',
    'Einstellungen → Über Notenblatt.',
    '',
    '<!-- Generated by `npm run licenses` from the shipped dependencies. Do not edit by hand. -->',
    '',
    '| Component | License | Source |',
    '|---|---|---|',
    ...notices.map((n) => `| ${n.name} | ${n.license} | ${n.url} |`),
  ];
  for (const n of notices) {
    lines.push('', `## ${n.name}`, '');
    if (n.noteEn) lines.push(n.noteEn, '');
    lines.push(`License: ${n.license} · Source: ${n.url}`, '', '```text', n.text, '```');
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(ROOT, NOTICES_FILE);
  const next = renderMarkdown(collectNotices());
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== next) {
      console.error(`${NOTICES_FILE} is out of date. Run "npm run licenses" and commit the result.`);
      process.exit(1);
    }
    console.log(`${NOTICES_FILE} is up to date.`);
  } else {
    fs.writeFileSync(file, next);
    console.log(`${NOTICES_FILE} written.`);
  }
}
