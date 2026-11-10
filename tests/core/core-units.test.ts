import { describe, expect, it } from 'vitest';
import { buildAccessibleTable, buildSummary } from '../../src/core/a11y';
import { resolveMotion } from '../../src/core/animation';
import { lttbIndices, normalizeRows } from '../../src/core/data';
import { escapeHtml, formatValue } from '../../src/core/format';
import { inlineToText, parseMarkdown, safeHref } from '../../src/core/sanitize';
import { isSafeColor, resolveTheme, statusForValue, themeToCssVars, toStatusLevel } from '../../src/core/theme';
import { buildKpiModel, buildProgressModel, buildStatusItems, paginate, sortRows } from '../../src/core/widgets';
import { assertValidDefinition } from '../../src/core/schema';
import { definitions } from '../../playground/fixtures';

describe('normalizeRows', () => {
  const fields = [
    { name: 'n', type: 'number' as const },
    { name: 't', type: 'time' as const },
    { name: 's', type: 'string' as const },
  ];

  it('coerces declared types and counts invalid cells', () => {
    const r = normalizeRows([{ n: '12.5', t: '2026-01-01T00:00:00Z', s: 3 }, { n: 'abc', t: 'nope', s: null }, { n: Infinity }], fields);
    expect(r.rows[0]).toEqual({ n: 12.5, t: Date.UTC(2026, 0, 1), s: '3' });
    expect(r.rows[1]).toMatchObject({ n: null, t: null, s: null });
    expect(r.rows[2]!.n).toBeNull();
    expect(r.invalidCells).toBe(3);
    expect(r.warnings.length).toBe(1);
  });

  it('caps rows keeping the newest, and never mutates input', () => {
    const input = Array.from({ length: 10 }, (_, i) => ({ n: i }));
    const r = normalizeRows(input, fields, 3);
    expect(r.rows.map((x) => x.n)).toEqual([7, 8, 9]);
    expect(input[0]).toEqual({ n: 0 });
  });

  it('rejects non-array data without throwing', () => {
    expect(normalizeRows({ rows: [] }, fields).rows).toEqual([]);
    expect(normalizeRows({ rows: [] }, fields).warnings[0]).toMatch(/형식/);
  });
});

describe('lttb', () => {
  it('keeps endpoints and the extreme spike', () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const ys = xs.map((x) => (x === 500 ? 1000 : Math.sin(x / 20)));
    const idx = lttbIndices(xs, ys, 50);
    expect(idx).toHaveLength(50);
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(999);
    expect(idx).toContain(500);
  });
});

describe('format', () => {
  it('formats by field semantics', () => {
    expect(formatValue(0.423, { name: 'x', type: 'number', format: 'percent' })).toBe('42.3%');
    expect(formatValue(1536, { name: 'x', type: 'number', format: 'bytes' })).toBe('1.5 KB');
    expect(formatValue(1250, { name: 'x', type: 'number', format: 'duration' })).toBe('1.3 s');
    expect(formatValue(12, { name: 'x', type: 'number', unit: 'ms' })).toBe('12 ms');
    expect(formatValue(null)).toBe('—');
    expect(formatValue(NaN)).toBe('—');
  });

  it('escapes HTML', () => {
    expect(escapeHtml('<img src=x onerror="a">&\'')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  });
});

describe('restricted markdown', () => {
  it('never produces HTML and drops tags', () => {
    const blocks = parseMarkdown('<script>alert(1)</script>Hello <b>world</b> <img src=x onerror=alert(1)>');
    expect(JSON.stringify(blocks)).not.toMatch(/<|script|onerror/);
    expect(blocks[0]).toEqual({ t: 'p', c: [{ t: 'text', v: 'Hello world' }] });
  });

  it('allows only https/mailto links', () => {
    expect(safeHref('https://a.example/x')).toBe('https://a.example/x');
    expect(safeHref('mailto:ops@example.com')).toBe('mailto:ops@example.com');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'http://plain', '/relative', 'https://a"onmouseover=x']) {
      expect(safeHref(bad), bad).toBeNull();
    }
    const [p] = parseMarkdown('[click](javascript:alert(1))');
    // The link is neutralised into inert text tokens.
    expect(p!.t === 'p' && p!.c.every((t) => t.t === 'text')).toBe(true);
  });

  it('parses the supported subset', () => {
    const b = parseMarkdown('### T\n- **a**\n- `b`\n\n> q\n\n```\ncode <x>\n```\n---');
    expect(b.map((x) => x.t)).toEqual(['h', 'ul', 'quote', 'pre', 'hr']);
    expect(b[3]).toEqual({ t: 'pre', v: 'code ' });
    if (b[1]!.t === 'ul') expect(inlineToText(b[1]!.items[0]!)).toBe('a');
  });
});

describe('theme', () => {
  it('ignores unsafe override values at resolve time too', () => {
    const t = resolveTheme({ overrides: { accentBlue: 'url(x)' as string, success: '#00ff00' } });
    expect(t.tokens.accentBlue).toBe('#4D8DFF');
    expect(t.tokens.success).toBe('#00ff00');
    expect(isSafeColor('#abc')).toBe(true);
  });

  it('exposes CSS variables for every token and palette slot', () => {
    const vars = themeToCssVars(resolveTheme());
    expect(vars['--cv-bg-surface']).toBe('#0B1728');
    expect(vars['--cv-series-8']).toBeDefined();
  });

  it('maps severities and thresholds', () => {
    expect(toStatusLevel('HIGH')).toBe('critical');
    expect(toStatusLevel('whatever')).toBe('info');
    const th = [{ value: 90, status: 'critical' as const }, { value: 70 }];
    expect(statusForValue(50, th)).toBe('ok');
    expect(statusForValue(75, th)).toBe('warning');
    expect(statusForValue(95, th)).toBe('critical');
  });
});

describe('motion policy', () => {
  it('honours reduced motion, product setting and definition, in that order', () => {
    expect(resolveMotion({ enabled: true }, { reducedMotion: true }).enabled).toBe(false);
    expect(resolveMotion({}, { productMotionEnabled: false }).enabled).toBe(false);
    expect(resolveMotion({ preset: 'none' }).enabled).toBe(false);
    expect(resolveMotion({ enabled: false }).updateMs).toBe(0);
    expect(resolveMotion({}).entranceMs).toBe(500);
  });

  it('shortens or drops update tweens for fast streams', () => {
    expect(resolveMotion({}, { updateIntervalMs: 5000 }).updateMs).toBe(400);
    expect(resolveMotion({}, { updateIntervalMs: 500 }).updateMs).toBe(200);
    expect(resolveMotion({}, { updateIntervalMs: 100 }).updateMs).toBe(0);
  });
});

describe('accessibility', () => {
  it('builds a summary and an equivalent table for every MVP type', () => {
    for (const [type, raw] of Object.entries(definitions)) {
      const def = assertValidDefinition(raw);
      const rows = normalizeRows(def.data.rows ?? [], def.data.fields).rows;
      const s = buildSummary(def, rows);
      expect(s.length, type).toBeGreaterThan(5);
      const t = buildAccessibleTable(def, rows);
      expect(t.rows.length).toBe(Math.min(rows.length, 200));
    }
  });

  it('summarises cartesian extremes', () => {
    const def = assertValidDefinition(definitions.column);
    const rows = normalizeRows(def.data.rows, def.data.fields).rows;
    expect(buildSummary(def, rows)).toMatch(/월별 신규 가입.*데이터 12개.*최댓값/);
  });
});

describe('widget models', () => {
  it('KPI computes delta, direction and sentiment', () => {
    const def = assertValidDefinition({ ...definitions.kpi, options: { goodDirection: 'down' } });
    const m = buildKpiModel(def, [{ activeUsers: 100 }, { activeUsers: 120 }]);
    expect(m.value).toBe(120);
    expect(m.delta).toMatchObject({ abs: 20, direction: 'up', sentiment: 'negative' });
    expect(m.delta!.ratio).toBeCloseTo(0.2);
    expect(m.delta!.srText).toMatch(/증가/);
  });

  it('progress clamps and derives status from thresholds', () => {
    const def = assertValidDefinition(definitions.progress);
    expect(buildProgressModel(def, [{ used: 9_600_000 }]).status).toBe('critical');
    expect(buildProgressModel(def, [{ used: 20_000_000 }]).ratio).toBe(1);
    expect(buildProgressModel(def, [{ used: -5 }]).ratio).toBe(0);
    expect(buildProgressModel(def, [{ used: 1 }]).markers).toHaveLength(2);
  });

  it('status list sorts by severity then recency', () => {
    const def = assertValidDefinition(definitions['status-list']);
    const now = Date.UTC(2026, 0, 1);
    const items = buildStatusItems(def, [
      { title: 'a', severity: 'info', at: new Date(now - 1000).toISOString() },
      { title: 'b', severity: 'critical', at: new Date(now - 9000).toISOString() },
      { title: 'c', severity: 'critical', at: new Date(now - 2000).toISOString() },
    ], now);
    expect(items.map((i) => i.title)).toEqual(['c', 'b', 'a']);
    expect(items[0]!.icon).toBeTruthy();
  });

  it('table sorts with nulls last and paginates', () => {
    const rows = [{ v: 2 }, { v: null }, { v: 10 }, { v: 1 }];
    expect(sortRows(rows, 'v', 'asc').map((r) => r.v)).toEqual([1, 2, 10, null]);
    expect(sortRows(rows, 'v', 'desc').map((r) => r.v)).toEqual([10, 2, 1, null]);
    expect(paginate([1, 2, 3, 4, 5], 9, 2)).toEqual({ rows: [5], page: 3, pageCount: 3 });
  });
});
