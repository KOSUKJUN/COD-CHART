/**
 * Security boundary helpers.
 *
 * 1. Restricted markdown → token tree. Raw HTML is never produced; renderers build
 *    DOM nodes from tokens (no innerHTML / v-html anywhere in the library).
 * 2. Engine escape-hatch sanitiser — strips functions, HTML formatters, external
 *    images/links and prototype-pollution keys from `engineOptions`.
 */

// ── Markdown subset ────────────────────────────────────────────────────────

export type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: InlineToken[] }
  | { t: 'em'; c: InlineToken[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: InlineToken[] };

export type BlockToken =
  | { t: 'h'; level: 1 | 2 | 3; c: InlineToken[] }
  | { t: 'p'; c: InlineToken[] }
  | { t: 'ul' | 'ol'; items: InlineToken[][] }
  | { t: 'quote'; c: InlineToken[] }
  | { t: 'pre'; v: string }
  | { t: 'hr' };

export const MAX_MARKDOWN_LENGTH = 20_000;

/** Only absolute https / mailto links. Everything else (javascript:, data:, http:, relative) is dropped to text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https:\/\/[^\s<>"']+$/i.test(h)) return h;
  if (/^mailto:[^\s<>"'@]+@[^\s<>"']+$/i.test(h)) return h;
  return null;
}

/** Strip any HTML-looking tags — they are shown as nothing, never interpreted. */
function stripTags(s: string): string {
  return s
    // Executable/embedding elements are removed with their content, not just their tags.
    .replace(/<(script|style|iframe|object|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '');
}

export function parseInline(src: string): InlineToken[] {
  const out: InlineToken[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^`([^`]+)`/))) {
      flush();
      out.push({ t: 'code', v: m[1]! });
    } else if ((m = rest.match(/^\*\*(.+?)\*\*/))) {
      flush();
      out.push({ t: 'strong', c: parseInline(m[1]!) });
    } else if ((m = rest.match(/^\*(?!\s)(.+?)\*/)) || (m = rest.match(/^_(?!\s)(.+?)_/))) {
      flush();
      out.push({ t: 'em', c: parseInline(m[1]!) });
    } else if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      flush();
      const href = safeHref(m[2]!);
      if (href) out.push({ t: 'link', href, c: parseInline(m[1]!) });
      else out.push({ t: 'text', v: m[1]! });
    } else {
      buf += src[i];
      i++;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

export function parseMarkdown(input: unknown): BlockToken[] {
  if (typeof input !== 'string' || !input.trim()) return [];
  const src = stripTags(input.slice(0, MAX_MARKDOWN_LENGTH)).replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const blocks: BlockToken[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let m: RegExpMatchArray | null;
    if (/^```/.test(line)) {
      flushPara();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!);
      blocks.push({ t: 'pre', v: code.join('\n') });
    } else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara();
      blocks.push({ t: 'h', level: m[1]!.length as 1 | 2 | 3, c: parseInline(m[2]!) });
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushPara();
      blocks.push({ t: 'hr' });
    } else if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      flushPara();
      const ordered = /^\s*\d/.test(line);
      const re = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      const items: InlineToken[][] = [];
      while (i < lines.length && re.test(lines[i]!)) items.push(parseInline(lines[i++]!.match(re)![1]!));
      i--;
      blocks.push({ t: ordered ? 'ol' : 'ul', items });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      blocks.push({ t: 'quote', c: parseInline(m[1]!) });
    } else if (!line.trim()) {
      flushPara();
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  return blocks;
}

export function inlineToText(tokens: InlineToken[]): string {
  return tokens.map((t) => ('v' in t ? t.v : inlineToText(t.c))).join('');
}

// ── Engine option sanitiser ────────────────────────────────────────────────

export interface SanitizeResult<T> {
  value: T;
  removed: string[];
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'link', 'sublink', 'target', 'subtarget']);
const MAX_DEPTH = 12;
const MAX_NODES = 20_000;

/**
 * Deep-clone a JSON-ish engine option, removing anything that could execute code,
 * inject HTML, or make the browser contact a third party:
 *  - functions, symbols, class instances
 *  - `formatter` strings containing markup (`<`), any `html`-mode tooltip renderer override
 *  - string values using `image://`, `javascript:`, `data:text/html`, `url(`
 *  - link/target keys, prototype-pollution keys
 */
export function sanitizeEngineOptions(input: unknown): SanitizeResult<Record<string, unknown>> {
  const removed: string[] = [];
  let nodes = 0;
  const walk = (v: unknown, path: string, depth: number): unknown => {
    if (++nodes > MAX_NODES) {
      removed.push(`${path} (too large)`);
      return undefined;
    }
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      if (/^\s*(image:\/\/|javascript:|vbscript:|data:text\/html)/i.test(v) || /url\s*\(/i.test(v)) {
        removed.push(path);
        return undefined;
      }
      return v;
    }
    if (depth > MAX_DEPTH) {
      removed.push(`${path} (too deep)`);
      return undefined;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`, depth + 1)).filter((x) => x !== undefined);
    if (typeof v === 'object') {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) {
        removed.push(path);
        return undefined;
      }
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (FORBIDDEN_KEYS.has(k)) {
          removed.push(p);
          continue;
        }
        if (k === 'formatter' && typeof child === 'string' && /</.test(child)) {
          removed.push(p);
          continue;
        }
        if ((k === 'renderMode' || k === 'appendTo' || k === 'appendToBody') && path.endsWith('tooltip')) {
          removed.push(p);
          continue;
        }
        const w = walk(child, p, depth + 1);
        if (w !== undefined) out[k] = w;
      }
      return out;
    }
    removed.push(path);
    return undefined;
  };
  const value = walk(input ?? {}, '', 0);
  return { value: (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>, removed };
}

/** Deep merge for plain objects; arrays and primitives in `patch` replace. */
export function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    const cur = out[k];
    if (isPlainObject(cur) && isPlainObject(v)) out[k] = deepMerge(cur, v);
    else out[k] = v;
  }
  return out as T;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}
