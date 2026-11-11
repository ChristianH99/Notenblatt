/**
 * The small part of Markdown used in release notes, parsed into plain data that the
 * renderer shows as text. No HTML is ever produced, so nothing from GitHub can run.
 * Supported: headings, paragraphs, bullet and numbered lists, `code`, **bold**, *italic*,
 * [links](…) (shown as their text) and fenced code blocks. Everything else is shown verbatim.
 */

export type Inline = { kind: 'text' | 'strong' | 'em' | 'code'; text: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'code'; text: string };

/** Inline markup → spans. Links keep their text, HTML tags and images are dropped. */
export function parseInline(src: string): Inline[] {
  const s = src
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '');
  const out: Inline[] = [];
  const push = (kind: Inline['kind'], text: string): void => {
    if (!text) return;
    const last = out[out.length - 1];
    if (kind === 'text' && last?.kind === 'text') last.text += text;
    else out.push({ kind, text });
  };
  const re = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])/g;
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    push('text', s.slice(at, m.index));
    if (m[1] !== undefined) push('code', m[1]);
    else if (m[2] !== undefined || m[3] !== undefined) push('strong', (m[2] ?? m[3]) as string);
    else push('em', (m[4] ?? m[5]) as string);
    at = m.index + m[0].length;
  }
  push('text', s.slice(at));
  return out;
}

const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = (): void => {
    if (para.length) blocks.push({ kind: 'paragraph', content: parseInline(para.join(' ')) });
    if (list) blocks.push({ kind: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    para = [];
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i] as string); i++) code.push(lines[i] as string);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    if (!line.trim() || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const level = Math.min(3, (h[1] as string).length) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, content: parseInline(h[2] as string) });
      continue;
    }
    const b = BULLET.exec(line);
    const n = b ? null : NUMBERED.exec(line);
    if (b || n) {
      const ordered = !!n;
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(((b ?? n) as RegExpExecArray)[1] as string);
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      // Continuation of the last list item.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (list) flush();
    para.push(line.trim());
  }
  flush();
  return blocks;
}
