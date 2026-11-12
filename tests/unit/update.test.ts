import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, splitReleaseNotes } from '@shared/markdown';
import { compareVersions, isUpdateUrl, parseVersion, pickUpdate } from '@shared/update';

const SHA = 'a'.repeat(64);

function release(over: Record<string, unknown> = {}, asset: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: 'v0.2.0',
    name: 'Notenblatt 0.2.0',
    body: '## Neu\n- Einführung',
    draft: false,
    prerelease: false,
    published_at: '2026-11-10T12:00:00Z',
    assets: [
      {
        name: 'Notenblatt-Setup-0.2.0-arm64.exe',
        state: 'uploaded',
        size: 10,
        digest: `sha256:${'b'.repeat(64)}`,
        browser_download_url: 'https://github.com/ChristianH99/Notenblatt/releases/download/v0.2.0/Notenblatt-Setup-0.2.0-arm64.exe',
      },
      {
        name: 'Notenblatt-Setup-0.2.0-x64.exe',
        state: 'uploaded',
        size: 1234,
        digest: `sha256:${SHA.toUpperCase()}`,
        browser_download_url: 'https://github.com/ChristianH99/Notenblatt/releases/download/v0.2.0/Notenblatt-Setup-0.2.0-x64.exe',
        ...asset,
      },
    ],
    ...over,
  };
}

describe('versions', () => {
  it('parses plain versions only', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion(' 10.0.1 ')).toEqual([10, 0, 1]);
    expect(parseVersion('1.2.3-beta.1')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });

  it('compares numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(() => compareVersions('x', '1.0.0')).toThrow();
  });
});

describe('pickUpdate', () => {
  it('offers the installer for this architecture', () => {
    const o = pickUpdate(release(), '0.1.0', 'x64');
    expect(o).toEqual({
      version: '0.2.0',
      name: 'Notenblatt 0.2.0',
      notes: '## Neu\n- Einführung',
      publishedAt: '2026-11-10T12:00:00Z',
      asset: {
        name: 'Notenblatt-Setup-0.2.0-x64.exe',
        url: 'https://github.com/ChristianH99/Notenblatt/releases/download/v0.2.0/Notenblatt-Setup-0.2.0-x64.exe',
        size: 1234,
        sha256: SHA,
      },
    });
    expect(pickUpdate(release(), '0.1.0', 'arm64')?.asset.size).toBe(10);
  });

  it('falls back to a default title', () => {
    expect(pickUpdate(release({ name: '  ', body: null }), '0.1.0', 'x64')).toMatchObject({ name: 'Notenblatt 0.2.0', notes: '' });
  });

  it('never offers pre-releases, drafts or odd tags', () => {
    expect(pickUpdate(release({ prerelease: true }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({ draft: true }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({ tag_name: 'v0.2.0-rc.1' }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({ tag_name: 42 }), '0.1.0', 'x64')).toBeNull();
  });

  it('offers only newer versions', () => {
    expect(pickUpdate(release(), '0.2.0', 'x64')).toBeNull();
    expect(pickUpdate(release(), '0.3.0', 'x64')).toBeNull();
    expect(pickUpdate(release(), 'dev', 'x64')).toBeNull();
  });

  it('needs an uploaded installer with digest, size and a GitHub URL', () => {
    expect(pickUpdate(release({ assets: [] }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({ assets: 'x' }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({ assets: [null, 1] }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({}, { state: 'starter' }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({}, { digest: null }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({}, { digest: 'sha1:abc' }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({}, { size: 0 }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({}, { size: '5' }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({}, { browser_download_url: 'https://example.com/x.exe' }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({}, { browser_download_url: 'http://github.com/x.exe' }), '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate(release({}, { browser_download_url: 'not a url' }), '0.1.0', 'x64')).toBeNull();
  });

  it('ignores anything that is not a release', () => {
    expect(pickUpdate(null, '0.1.0', 'x64')).toBeNull();
    expect(pickUpdate('x', '0.1.0', 'x64')).toBeNull();
  });

  it('allows only GitHub hosts over https', () => {
    expect(isUpdateUrl('https://api.github.com/repos/x/y/releases/latest')).toBe(true);
    expect(isUpdateUrl('https://release-assets.githubusercontent.com/abc')).toBe(true);
    expect(isUpdateUrl('https://github.com.evil.example/x')).toBe(false);
    expect(isUpdateUrl('http://github.com/x')).toBe(false);
    expect(isUpdateUrl('file:///C:/x')).toBe(false);
  });
});

describe('release notes markdown', () => {
  it('parses inline markup and drops links, images and HTML', () => {
    expect(parseInline('**Neu**: `Strg+B` und *kursiv*, __fett__ _schräg_')).toEqual([
      { kind: 'strong', text: 'Neu' },
      { kind: 'text', text: ': ' },
      { kind: 'code', text: 'Strg+B' },
      { kind: 'text', text: ' und ' },
      { kind: 'em', text: 'kursiv' },
      { kind: 'text', text: ', ' },
      { kind: 'strong', text: 'fett' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'schräg' },
    ]);
    expect(parseInline('Siehe [Hilfe](https://x.y) ![Bild](a.png) <b>x</b>')).toEqual([{ kind: 'text', text: 'Siehe Hilfe Bild x' }]);
    expect(parseInline('snake_case_name bleibt')).toEqual([{ kind: 'text', text: 'snake_case_name bleibt' }]);
    expect(parseInline('')).toEqual([]);
  });

  it('parses blocks', () => {
    const md = [
      '# Notenblatt 0.2.0',
      '',
      'Erste Zeile',
      'zweite Zeile',
      '## Neu ##',
      '- Einführung',
      '* Updates',
      '  mit Fortsetzung',
      '1. eins',
      '2) zwei',
      'Absatz nach Liste',
      '---',
      '```',
      '<script>x</script>',
      '```',
      '#### Klein',
    ].join('\r\n');
    expect(parseMarkdown(md)).toEqual([
      { kind: 'heading', level: 1, content: [{ kind: 'text', text: 'Notenblatt 0.2.0' }] },
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Erste Zeile zweite Zeile' }] },
      { kind: 'heading', level: 2, content: [{ kind: 'text', text: 'Neu' }] },
      { kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'Einführung' }], [{ kind: 'text', text: 'Updates mit Fortsetzung' }]] },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'eins' }], [{ kind: 'text', text: 'zwei' }]] },
      { kind: 'paragraph', content: [{ kind: 'text', text: 'Absatz nach Liste' }] },
      { kind: 'code', text: '<script>x</script>' },
      { kind: 'heading', level: 3, content: [{ kind: 'text', text: 'Klein' }] },
    ]);
  });

  it('splits bilingual notes at the <!-- en --> line', () => {
    expect(splitReleaseNotes('## Neu\r\n- Hilfe\r\n\r\n<!-- en -->\r\n## New\r\n- Help\r\n')).toEqual({ de: '## Neu\r\n- Hilfe', en: '## New\r\n- Help' });
    expect(splitReleaseNotes('  <!--EN-->  \nOnly English')).toEqual({ de: '', en: 'Only English' });
    expect(splitReleaseNotes('Nur Deutsch\n')).toEqual({ de: 'Nur Deutsch', en: null });
    expect(splitReleaseNotes('Deutsch\n<!-- en -->\n  ')).toEqual({ de: 'Deutsch', en: null });
    // Only a line of its own counts; the marker inside text does not split.
    expect(splitReleaseNotes('Text <!-- en --> mehr').en).toBeNull();
  });

  it('ignores the <!-- en --> line inside a fenced code block', () => {
    const md = ['Schreibweise:', '```', 'Deutsch', '<!-- en -->', 'English', '```', 'Ende', '<!-- en -->', 'End'].join('\r\n');
    expect(splitReleaseNotes(md)).toEqual({ de: 'Schreibweise:\r\n```\r\nDeutsch\r\n<!-- en -->\r\nEnglish\r\n```\r\nEnde', en: 'End' });
    expect(splitReleaseNotes('```\n<!-- en -->\n```').en).toBeNull();
  });

  it('starts a list right after a paragraph and handles empty notes', () => {
    expect(parseMarkdown('Text\n- a').map((b) => b.kind)).toEqual(['paragraph', 'list']);
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('```\nunclosed')).toEqual([{ kind: 'code', text: 'unclosed' }]);
  });
});
