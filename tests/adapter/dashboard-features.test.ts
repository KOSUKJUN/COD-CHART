import { describe, expect, it } from 'vitest';
import { buildOption, type Opt } from '../../src/adapters/echarts/build';
import { resolveMotion } from '../../src/core/animation';
import { normalizeRows } from '../../src/core/data';
import { assertValidDefinition, validateChartDefinition } from '../../src/core/schema';
import { resolveTheme } from '../../src/core/theme';

function build(raw: unknown, extra: { stale?: boolean } = {}) {
  const definition = assertValidDefinition(raw);
  const rows = normalizeRows(definition.data.rows ?? [], definition.data.fields).rows;
  return buildOption({ definition, rows, theme: resolveTheme(definition.theme), motion: resolveMotion(definition.animation), locale: 'ko-KR', summary: 'S', ...extra });
}
const paths = (raw: unknown) => validateChartDefinition(raw).issues.map((i) => i.path);
const v = '1.0.0';

describe('options.autoTour', () => {
  const pie = (options: Record<string, unknown>) => ({
    schemaVersion: v, id: 'p', type: 'pie', options,
    data: { fields: [{ name: 'k', type: 'string' }, { name: 'n', type: 'number' }], rows: [{ k: 'a', n: 1 }, { k: 'b', n: 2 }] },
    encoding: { category: 'k', value: 'n' },
  });
  it('hands the adapter a tour interval (default 3 s)', () => {
    expect(build(pie({ autoTour: true })).option.__tour).toEqual({ intervalMs: 3000 });
    expect(build(pie({ autoTour: { intervalMs: 5000 } })).option.__tour).toEqual({ intervalMs: 5000 });
    expect(build(pie({})).option.__tour).toBeUndefined();
  });
  it('validates its shape', () => {
    expect(paths(pie({ autoTour: { intervalMs: 200 } }))).toContain('options.autoTour');
    expect(paths(pie({ autoTour: 'on' }))).toContain('options.autoTour');
  });
});

describe('options.ranking (bar race)', () => {
  const bar = (options: Record<string, unknown>, n = 12) => ({
    schemaVersion: v, id: 'r', type: 'bar', options,
    data: { fields: [{ name: 'ip', type: 'string' }, { name: 'hits', type: 'number' }], rows: Array.from({ length: n }, (_, i) => ({ ip: `10.0.0.${i}`, hits: 100 + i })) },
    encoding: { x: 'ip', y: 'hits' },
  });
  it('sorts in real time and shows only the top N rows', () => {
    const o = build(bar({ ranking: { top: 5 } })).option;
    const s = (o.series as Opt[])[0]!;
    expect(s.realtimeSort).toBe(true);
    expect(s.label).toMatchObject({ show: true });
    expect(o.yAxis).toMatchObject({ type: 'category', inverse: true, max: 4 });
  });
  it('defaults to the top 10, capped by the number of rows', () => {
    expect(build(bar({ ranking: true })).option.yAxis.max).toBe(9);
    expect(build(bar({ ranking: true }, 4)).option.yAxis.max).toBe(3);
  });
  it('rejects a bad top', () => {
    expect(paths(bar({ ranking: { top: 0 } }))).toContain('options.ranking');
  });
});

describe("heatmap options.pattern: 'week-hour'", () => {
  it('buckets timestamps into a full 7 × 24 grid (Monday first), summing values; y is not needed', () => {
    const mon10 = new Date(2026, 10, 9, 10, 15).getTime(); // a Monday, 10:15 local
    const raw = {
      schemaVersion: v, id: 'w', type: 'heatmap', options: { pattern: 'week-hour' },
      data: { fields: [{ name: 'at', type: 'time' }, { name: 'n', type: 'number' }], rows: [{ at: mon10, n: 3 }, { at: mon10 + 60_000, n: 4 }] },
      encoding: { x: 'at', value: 'n' },
    };
    expect(paths(raw)).toEqual([]);
    const o = build(raw).option;
    expect(o.yAxis.data).toEqual(['월', '화', '수', '목', '금', '토', '일']);
    expect(o.xAxis.data).toHaveLength(24);
    const data = (o.series as Opt[])[0]!.data as { value: number[] }[];
    expect(data).toHaveLength(7 * 24);
    expect(data.find((d) => d.value[0] === 10 && d.value[1] === 0)!.value[2]).toBe(7);
    expect(data.filter((d) => (d.value[2] ?? 0) > 0)).toHaveLength(1);
  });
});

describe('real time over a time axis', () => {
  const t0 = new Date(2026, 10, 12, 13, 0, 0).getTime();
  const raw = (realtime: boolean) => ({
    schemaVersion: v, id: 't', type: 'line', options: { realtime },
    data: { fields: [{ name: 't', type: 'time' }, { name: 'ms', type: 'number' }], rows: Array.from({ length: 30 }, (_, i) => ({ t: t0 + i * 1000, ms: 100 + i })) },
    encoding: { x: 't', y: 'ms' },
  });
  it('pins the x window to the data, keys points by time and draws sliding round-time labels', () => {
    const o = build(raw(true)).option;
    expect(o.xAxis).toMatchObject({ type: 'time', min: t0, max: t0 + 29_000 });
    const line = (o.series as Opt[]).find((s) => s.type === 'line')!;
    expect(line.data[0]).toEqual({ name: String(t0), value: [t0, 100] });
    const labels = (o.series as Opt[]).find((s) => s.id === 'fx:xlabels')!;
    const ticks = labels.data.map((d: Opt) => d.value[0] as number);
    expect(ticks.every((x: number) => x % 5000 === 0)).toBe(true); // 29 s window → 5 s steps
    expect(o.__realtime.xIndexOf(t0 + 10_400)).toBe(10);
  });
  it('leaves non-real-time time charts alone', () => {
    const o = build(raw(false)).option;
    expect((o.series as Opt[]).some((s) => s.id === 'fx:xlabels')).toBe(false);
    expect(o.__realtime).toBeUndefined();
  });
});

describe('stale (late live data)', () => {
  const live = {
    schemaVersion: v, id: 's', type: 'line', options: { realtime: true },
    data: { fields: [{ name: 'x', type: 'string' }, { name: 'y', type: 'number' }], rows: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }] },
    encoding: { x: 'x', y: 'y' },
  };
  it('greys out and stills the newest-point marker', () => {
    const marker = (o: Opt) => (o.series as Opt[]).find((s) => String(s.id).startsWith('fx:live'))!;
    expect(marker(build(live).option).type).toBe('effectScatter');
    const late = marker(build(live, { stale: true }).option);
    expect(late.type).toBe('scatter');
    expect(late.data[0].itemStyle.color).toBe(resolveTheme().tokens.textMuted);
  });
  it('validates staleAfterMs / alarm', () => {
    expect(paths({ ...live, options: { staleAfterMs: false, alarm: true } })).toEqual([]);
    expect(paths({ ...live, options: { staleAfterMs: 10 } })).toContain('options.staleAfterMs');
  });
});

describe('status-grid', () => {
  it('is a registered native widget using the status-list encoding', () => {
    const raw = {
      schemaVersion: v, id: 'g', type: 'status-grid',
      data: { fields: [{ name: 'name', type: 'string' }, { name: 'level', type: 'string' }], rows: [{ name: 'CAM-001', level: 'ok' }] },
      encoding: { title: 'name', severity: 'level' },
    };
    expect(paths(raw)).toEqual([]);
    expect(paths({ ...raw, encoding: { title: 'name' } })).toContain('encoding.severity');
  });
});
