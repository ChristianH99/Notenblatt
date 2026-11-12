#!/usr/bin/env node
/**
 * Builds the website (site/) into a folder of static files for GitHub Pages.
 *
 *   node scripts/build-site.mjs [--releases releases.json] [--out _site] [--allow-placeholders]
 *
 * --releases  GitHub releases as returned by `gh api repos/OWNER/REPO/releases`. Without it (or
 *             with no published release in it) the download buttons link to the releases page.
 * --allow-placeholders  Build even if a legal page (Impressum, Datenschutzerklärung) still has a
 *             placeholder in square brackets such as "[Telefonnummer]" (local preview only; the
 *             deploy never passes it, so those pages cannot go live unfinished).
 *
 * No dependencies: plain Node (runs the app's shared TypeScript modules directly).
 */
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The app's own release-notes parser and release helpers, so the website and the app split the
// notes, order the versions and find the installers the same way. package.json is "commonjs",
// so Node would load src/shared/*.ts as CommonJS; these hooks load them as TypeScript ES modules
// (Node's built-in type stripping) and resolve their extensionless relative imports.
const SHARED = pathToFileURL(path.join(ROOT, 'src', 'shared') + path.sep).href;
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.startsWith(SHARED) && /^\.\.?\//.test(specifier) && !path.posix.extname(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(SHARED) && url.endsWith('.ts')) {
      return { format: 'module-typescript', source: fs.readFileSync(fileURLToPath(url)), shortCircuit: true };
    }
    return next(url, context);
  },
});
const { parseMarkdown, splitReleaseNotes } = await import(new URL('markdown.ts', SHARED).href);
const { compareVersions, installerName, parseVersion } = await import(new URL('update.ts', SHARED).href);
const SRC = path.join(ROOT, 'site');
const REPO_URL = 'https://github.com/ChristianH99/Notenblatt';

// ---------- arguments ----------
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT = path.resolve(ROOT, arg('--out') ?? '_site');
const allowPlaceholders = args.includes('--allow-placeholders');

function fail(msg) {
  console.error(`build-site: ${msg}`);
  process.exit(1);
}

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmtDate(iso, lang) {
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(iso));
}
/** Calendar date in Berlin as YYYY-MM-DD (for <time datetime>, matching the shown date). */
function isoDate(iso) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Berlin' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
function fmtSize(bytes, lang) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 0 })} MB`;
}

/** Release notes Markdown → HTML. Everything is escaped; links keep only their text (as in the app). */
function notesHtml(md) {
  const inline = (parts) =>
    parts
      .map((p) => {
        const t = esc(p.text);
        if (p.kind === 'strong') return `<strong>${t}</strong>`;
        if (p.kind === 'em') return `<em>${t}</em>`;
        if (p.kind === 'code') return `<code>${t}</code>`;
        return t;
      })
      .join('');
  return parseMarkdown(md)
    .map((b) => {
      if (b.kind === 'heading') return b.level === 3 ? `<h4>${inline(b.content)}</h4>` : `<h3>${inline(b.content)}</h3>`; // below the release's h2
      if (b.kind === 'paragraph') return `<p>${inline(b.content)}</p>`;
      if (b.kind === 'code') return `<pre><code>${esc(b.text)}</code></pre>`;
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}>${b.items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`;
    })
    .join('\n');
}

// ---------- inputs ----------
/**
 * Contact email, written as HTML numeric entities so the plain address never appears in the
 * source (harvesting bots), while browsers and screen readers show and read it normally.
 * Never put it in a mailto: link, a meta tag or a comment.
 */
const EMAIL_HTML =
  '<span class="email" translate="no">&#97;&#112;&#112;&#115;&#46;&#104;&#97;&#101;&#117;&#115;&#115;&#108;&#101;&#114;&#46;&#99;&#104;&#114;&#64;&#103;&#109;&#97;&#105;&#108;&#46;&#99;&#111;&#109;</span>';
const OWNER = 'Christian Häußler';
let placeholderWarnings = 0;

const screens = JSON.parse(fs.readFileSync(path.join(SRC, 'assets', 'screens', 'screens.json'), 'utf8'));

let releases = [];
const relFile = arg('--releases');
if (relFile) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(ROOT, relFile), 'utf8'));
  // `gh api --paginate` without --slurp concatenates pages; accept a flat array or an array of pages.
  // Same rule as the app's update check: plain versions only, and the highest one is the latest
  // (not the most recently published one, e.g. a hotfix for an older line).
  releases = (Array.isArray(raw[0]) ? raw.flat() : raw).filter((r) => r && !r.draft && !r.prerelease && r.published_at && parseVersion(r.tag_name ?? ''));
  releases.sort((a, b) => compareVersions(b.tag_name, a.tag_name) || b.published_at.localeCompare(a.published_at));
}
const latest = releases[0] ?? null;

function asset(rel, arch) {
  const name = installerName(parseVersion(rel.tag_name).join('.'), arch);
  return rel.assets?.find((a) => a.name === name) ?? null;
}

// ---------- strings shared by every page ----------
const T = {
  de: {
    skip: 'Zum Inhalt springen',
    navLabel: 'Seitennavigation',
    nav: [
      ['index.html#funktionen', 'Funktionen'],
      ['index.html#schultag', 'Ein Schultag'],
      ['index.html#datenschutz', 'Datenschutz'],
      ['index.html#fragen', 'Fragen'],
      ['versionen.html', 'Versionen'],
    ],
    langLabel: 'English',
    langShort: 'EN',
    footerTagline: 'Prüfungen offline bewerten. Für Windows.',
    footerContact: 'Kontakt',
    footerIssues: 'Fehler melden oder Idee vorschlagen (GitHub)',
    footerLegal: 'Rechtliches',
    // The legal pages exist in German only (their wording is final); both languages link to them.
    imprint: 'Impressum',
    privacy: 'Datenschutzerklärung',
    footerDocs: 'Dokumentation',
    guide: 'Benutzerhandbuch',
    source: 'Quellcode auf GitHub',
    licenses: 'Lizenzen',
    credits: 'Schriften: Literata, Source Sans 3 (SIL Open Font License). Symbole: Lucide (ISC-Lizenz). Alle Namen und Noten in den Bildschirmfotos sind erfunden.',
    copyright: `© 2026 ${OWNER} · Notenblatt steht unter der MIT-Lizenz.`,
    noRelease: 'Noch keine Version veröffentlicht',
  },
  en: {
    skip: 'Skip to content',
    navLabel: 'Site navigation',
    nav: [
      ['index.html#features', 'Features'],
      ['index.html#school-day', 'A school day'],
      ['index.html#privacy', 'Privacy'],
      ['index.html#faq', 'Questions'],
      ['releases.html', 'Releases'],
    ],
    langLabel: 'Deutsch',
    langShort: 'DE',
    footerTagline: 'Grade exams offline. For Windows.',
    footerContact: 'Contact',
    footerIssues: 'Report a bug or suggest an idea (GitHub)',
    footerLegal: 'Legal',
    imprint: 'Impressum',
    privacy: 'Datenschutzerklärung',
    footerDocs: 'Documentation',
    guide: 'User guide',
    source: 'Source code on GitHub',
    licenses: 'Licences',
    credits: 'Fonts: Literata, Source Sans 3 (SIL Open Font License). Icons: Lucide (ISC licence). All names and grades in the screenshots are invented.',
    copyright: `© 2026 ${OWNER} · Notenblatt is released under the MIT licence.`,
    noRelease: 'No version published yet',
  },
};

/** Counterpart of each page in the other language (pages without one switch to the other start page). */
const PAIRS = [
  ['index.html', 'en/index.html'],
  ['versionen.html', 'en/releases.html'],
];

// ---------- release-dependent values ----------
function releaseVars(lang) {
  const releasesPage = `${REPO_URL}/releases`;
  if (!latest) {
    return {
      VERSION: '', DATE: '', X64: releasesPage, ARM64: releasesPage, X64_SIZE: '', ARM64_SIZE: '',
      DOWNLOAD_META: T[lang].noRelease,
    };
  }
  const x64 = asset(latest, 'x64');
  const arm = asset(latest, 'arm64');
  const version = latest.tag_name.replace(/^v/, '');
  const date = fmtDate(latest.published_at, lang);
  return {
    VERSION: version,
    DATE: date,
    X64: x64?.browser_download_url ?? latest.html_url,
    ARM64: arm?.browser_download_url ?? latest.html_url,
    X64_SIZE: x64 ? fmtSize(x64.size, lang) : '',
    ARM64_SIZE: arm ? fmtSize(arm.size, lang) : '',
    DOWNLOAD_META: lang === 'de' ? `Version ${version} vom ${date}` : `Version ${version}, ${date}`,
  };
}

/** Changelog section: every published release with its notes in the page's language. */
function changelog(lang) {
  if (!releases.length) {
    return lang === 'de'
      ? `<p class="lead">Es ist noch keine Version veröffentlicht. Sobald es eine gibt, steht sie hier mit allen Änderungen.</p>`
      : `<p class="lead">No version has been published yet. Once there is one, it is listed here with all changes.</p>`;
  }
  return releases
    .map((r) => {
      const v = r.tag_name.replace(/^v/, '');
      const parts = splitReleaseNotes(r.body ?? '');
      let body = lang === 'en' ? parts.en : parts.de;
      let note = '';
      if (lang === 'en' && !body && parts.de) {
        body = parts.de;
        note = '<p class="release-note-lang">These notes are only available in German.</p>';
      }
      const html = body ? notesHtml(body) : `<p>${lang === 'de' ? 'Für diese Version gibt es keine Beschreibung.' : 'There is no description for this version.'}</p>`;
      const x64 = asset(r, 'x64');
      const arm = asset(r, 'arm64');
      const dl = [
        x64 && `<a href="${esc(x64.browser_download_url)}">Windows x64 <span class="muted">(${fmtSize(x64.size, lang)})</span></a>`,
        arm && `<a href="${esc(arm.browser_download_url)}">Windows ARM64 <span class="muted">(${fmtSize(arm.size, lang)})</span></a>`,
        `<a href="${esc(r.html_url)}">${lang === 'de' ? 'Release auf GitHub' : 'Release on GitHub'}</a>`,
      ]
        .filter(Boolean)
        .join('');
      const isLatest = r === latest ? `<span class="badge">${lang === 'de' ? 'aktuell' : 'latest'}</span>` : '';
      return `<article class="release" id="v${esc(v)}">
  <header class="release-head">
    <h2>Version ${esc(v)} ${isLatest}</h2>
    <p class="muted"><time datetime="${isoDate(r.published_at)}">${fmtDate(r.published_at, lang)}</time></p>
  </header>
  <div class="release-body prose">${note}${note ? `<div class="prose" lang="de">${html}</div>` : html}</div>
  <p class="release-links">${dl}</p>
</article>`;
    })
    .join('\n');
}

// ---------- images ----------
/** <img data-screen="name" alt="…" sizes="…"> → src, srcset (1x/2x files), width, height, lazy loading. */
function expandScreens(html, root) {
  return html.replace(/<img\b([^>]*?)\bdata-screen="([^"]+)"([^>]*)>/g, (_, pre, name, post) => {
    const m = screens[name];
    if (!m) fail(`unknown screenshot "${name}" (not in site/assets/screens/screens.json)`);
    const attrs = `${pre}${post}`;
    if (!/\balt="[^"]+"/.test(attrs)) fail(`screenshot "${name}" has no alt text`);
    const eager = /\bdata-eager\b/.test(attrs);
    const rest = attrs.replace(/\s*\bdata-eager\b/, '').trim();
    const base = `${root}assets/screens/${name}`;
    return `<img src="${base}-1x.webp" srcset="${base}-1x.webp ${m.width}w, ${base}.webp ${m.width * 2}w" width="${m.width}" height="${m.height}" ${
      eager ? 'fetchpriority="high"' : 'loading="lazy"'
    } decoding="async" ${rest}>`;
  });
}

// ---------- page assembly ----------
const layout = fs.readFileSync(path.join(SRC, 'layout.html'), 'utf8');

function render(rel, lang) {
  const file = path.join(SRC, 'pages', rel);
  const raw = fs.readFileSync(file, 'utf8');
  const fm = /^<!--\s*(\{[\s\S]*?\})\s*-->\s*/.exec(raw);
  if (!fm) fail(`${rel}: missing front matter comment`);
  const meta = JSON.parse(fm[1]);
  let content = raw.slice(fm[0].length);

  const outRel = rel.replace(/^de\//, '');
  const depth = outRel.split('/').length - 1;
  const root = '../'.repeat(depth);
  const t = T[lang];
  const pair = PAIRS.find((p) => p.includes(outRel));
  const other = pair ? (pair[0] === outRel ? pair[1] : pair[0]) : lang === 'de' ? 'en/index.html' : 'index.html';
  /** Relative link from this page to a path given from the site root ("impressum/", "en/index.html#faq"). */
  const link = (target) => {
    const [p, hash] = target.split('#');
    // relative() returns '' for the page's own folder (a folder link from inside it): use '.'.
    let rel = path.posix.relative(path.posix.dirname(`/${outRel}`), `/${p}`) || (p.endsWith('/') ? '.' : path.posix.basename(p));
    if (p.endsWith('/')) rel += '/';
    return hash ? `${rel}#${hash}` : rel;
  };
  const home = lang === 'de' ? '' : 'en/';

  const nav = t.nav
    .map(([href, label]) => {
      const [file, hash] = href.split('#');
      const target = home + file;
      // On the start page itself, section links are plain anchors.
      const to = target === outRel && hash ? `#${hash}` : link(hash ? `${target}#${hash}` : target);
      const current = target === outRel && !hash ? ' aria-current="page"' : '';
      return `<li><a href="${to}"${current}>${label}</a></li>`;
    })
    .join('');
  const legalCurrent = (p) => (outRel === `${p}index.html` ? ' aria-current="page"' : '');

  const vars = {
    ...releaseVars(lang),
    LANG: lang,
    ROOT: root,
    TITLE: esc(meta.title),
    DESCRIPTION: esc(meta.description),
    CANONICAL: `https://christianh99.github.io/Notenblatt/${outRel === 'index.html' ? '' : outRel.replace(/index\.html$/, '')}`,
    ALT_LANG: lang === 'de' ? 'en' : 'de',
    ALT_HREF: link(other),
    // Only real translations are announced as alternates; the German-only legal pages have none.
    ALT_LINK: pair ? `<link rel="alternate" hreflang="${lang === 'de' ? 'en' : 'de'}" href="${link(other)}">` : '',
    ALT_LABEL: t.langLabel,
    ALT_SHORT: t.langShort,
    SKIP: t.skip,
    NAV_LABEL: t.navLabel,
    NAV: nav,
    HOME: link(`${home}index.html`),
    FOOTER_TAGLINE: t.footerTagline,
    FOOTER_CONTACT: t.footerContact,
    FOOTER_ISSUES: t.footerIssues,
    FOOTER_LEGAL: t.footerLegal,
    IMPRINT_HREF: link('impressum/'),
    IMPRINT: t.imprint,
    IMPRINT_CURRENT: legalCurrent('impressum/'),
    PRIVACY_HREF: link('datenschutz/'),
    PRIVACY: t.privacy,
    PRIVACY_CURRENT: legalCurrent('datenschutz/'),
    EMAIL: EMAIL_HTML,
    FOOTER_DOCS: t.footerDocs,
    GUIDE: t.guide,
    SOURCE: t.source,
    LICENSES: t.licenses,
    CREDITS: t.credits,
    COPYRIGHT: t.copyright,
    REPO: REPO_URL,
  };

  let html = layout.replace('{{CONTENT}}', () => content);
  // Two passes: values may themselves contain {{…}} (e.g. the copyright line).
  for (let pass = 0; pass < 2; pass++) {
    html = html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  }
  // Optional blocks: <!--if:release-->…<!--else-->…<!--end--> (else part optional).
  html = html.replace(/<!--if:release-->([\s\S]*?)(?:<!--else-->([\s\S]*?))?<!--end-->/g, (_, yes, no) => (latest ? yes : (no ?? '')));
  html = expandScreens(html, root);

  // Checks on the page's own text, before the release notes go in. Those are GitHub text, not
  // template: a "{{…}}", "mailto:" or unrelated email address in them is shown as written.
  const CHANGELOG = '{{CHANGELOG}}';
  const hasChangelog = html.includes(CHANGELOG);
  const own = html.replace(CHANGELOG, '');
  if (meta.legal) {
    const ph = own.match(/\[[^\]<>]{2,80}\]/g);
    if (ph) {
      if (!allowPlaceholders) fail(`${outRel}: placeholder ${ph.join(', ')} still in the text. Fill it in in site/pages/${rel} before deploying.`);
      placeholderWarnings += ph.length;
    }
  }
  if (/mailto:|@gmail\.com|haeussler\.chr/i.test(own)) fail(`${outRel}: plain email address or mailto: link in the output`);
  const left = /\{\{[^}]*\}\}/.exec(own);
  if (left) fail(`${rel}: unreplaced placeholder ${left[0]}`);

  if (hasChangelog) {
    const log = changelog(lang);
    // The contact address must still never appear in plain text, not even from the notes.
    if (/haeussler\.chr/i.test(log)) fail(`${outRel}: the release notes contain the contact email address in plain text`);
    html = html.replace(CHANGELOG, () => log);
  }

  // External links: no opener access and no referrer for the target site.
  html = html.replace(/<a\b(?![^>]*\brel=)([^>]*\bhref="https?:\/\/[^"]*")/g, '<a rel="noopener noreferrer"$1');
  return { outRel, html };
}

// ---------- write ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(SRC, 'assets'), path.join(OUT, 'assets'), { recursive: true, filter: (p) => !p.endsWith('screens.json') });

const pages = [
  ['de/index.html', 'de'],
  ['de/versionen.html', 'de'],
  ['de/impressum/index.html', 'de'],
  ['de/datenschutz/index.html', 'de'],
  ['en/index.html', 'en'],
  ['en/releases.html', 'en'],
];
for (const [rel, lang] of pages) {
  const { outRel, html } = render(rel, lang);
  const dest = path.join(OUT, outRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}

// Every local href/src must exist in the output.
for (const [rel] of pages) {
  const outRel = rel.replace(/^de\//, '');
  const html = fs.readFileSync(path.join(OUT, outRel), 'utf8');
  for (const m of html.matchAll(/\b(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|data:)/.test(ref)) continue;
    const target = path.join(OUT, path.dirname(outRel), ref.endsWith('/') ? `${ref}index.html` : ref);
    if (!fs.existsSync(target)) fail(`${outRel}: broken link ${ref}`);
  }
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const part of m[1].split(',')) {
      const ref = part.trim().split(/\s+/)[0];
      if (!fs.existsSync(path.join(OUT, path.dirname(outRel), ref))) fail(`${outRel}: broken srcset ${ref}`);
    }
  }
}

console.log(`build-site: ${pages.length} pages → ${path.relative(ROOT, OUT) || '.'}${latest ? ` (latest release ${latest.tag_name})` : ' (no published release)'}${placeholderWarnings ? ` — WARNING: ${placeholderWarnings} placeholder(s) in the legal pages` : ''}`);
