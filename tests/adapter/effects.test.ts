import { describe, expect, it } from 'vitest';
import { buildOption, type Opt } from '../../src/adapters/echarts/build';
import { deltaText, fillGradient, glow, stagger, STAGGER_WINDOW_MS } from '../../src/adapters/echarts/effects';
import { resolveMotion, type MotionEnvironment } from '../../src/core/animation';
import { normalizeRows } from '../../src/core/data';
import { assertValidDefinition, validateChartDefinition } from '../../src/core/schema';
import { resolveTheme } from '../../src/core/theme';
import { definitions } from '../../playground/fixtures';

const v = definitions.line.schemaVersion;

function build(raw: unknown, env: MotionEnvironment = {}) {
  const definition = assertValidDefinition(raw);
  const rows = normalizeRows(definition.data.rows ?? [], definition.data.fields).rows;
  return buildOption({ definition, rows, theme: resolveTheme(definition.theme), motion: resolveMotion(definition.animation, env), locale: 'ko-KR', summary: 'S' }).option;
}
const series = (o: Opt) => o.series as Opt[];
const fx = (o: Opt) => series(o).filter((s) => String(s.id).startsWith('fx:'));

const cpu = (values: number[], type = 'line', extra: Opt = {}) => ({
  schemaVersion: v, id: `fx-${type}`, type,
  data: {
    fields: [{ name: 't', type: 'string' }, { name: 'cpu', type: 'number', label: 'CPU', unit: '%' }],
    rows: values.map((cpu, i) => ({ t: `t${i}`, cpu })),
  },
  encoding: { x: 't', y: 'cpu' },
  ...extra,
});

describe('motion spec', () => {
  it('defines a sequential stagger, a slower gauge sweep and a live flag', () => {
    const m = resolveMotion({});
    expect(m).toMatchObject({ staggerMs: 40, sweepMs: 1200, sweepUpdateMs: 800, live: false });
    expect(resolveMotion({}, { updateIntervalMs: 2000 }).live).toBe(true);
  });

  it('throttled streams shorten the gauge sweep with the update tween', () => {
    expect(resolveMotion({}, { updateIntervalMs: 500 }).sweepUpdateMs).toBe(400); // update 200ms × 2
    expect(resolveMotion({}, { updateIntervalMs: 100 }).sweepUpdateMs).toBe(0);
  });

  it('reduced motion turns every tween off but keeps live emphasis (as a static marker)', () => {
    const m = resolveMotion({}, { reducedMotion: true, updateIntervalMs: 1000 });
    expect(m).toMatchObject({ enabled: false, sweepMs: 0, staggerMs: 0, live: true });
  });
});

describe('effect primitives', () => {
  it('stagger spreads items inside the window and offsets series', () => {
    const m = resolveMotion({});
    const few = stagger(m, 5) as (i: number) => number;
    expect(few(0)).toBe(0);
    expect(few(4)).toBe(160); // 40ms steps
    const many = stagger(m, 1000) as (i: number) => number;
    expect(many(999)).toBeLessThanOrEqual(STAGGER_WINDOW_MS);
    expect((stagger(m, 5, 2) as (i: number) => number)(0)).toBe(180);
    expect(stagger(resolveMotion({ enabled: false }), 5)).toBe(0);
  });

  it('gradient and glow follow the theme switches', () => {
    const on = resolveTheme();
    const off = resolveTheme({ effects: { gradient: false, glow: false } });
    expect(fillGradient(on, '#4D8DFF', 'up')).toMatchObject({ type: 'linear', colorStops: [{ color: '#4D8DFF' }, {}] });
    expect(fillGradient(off, '#4D8DFF', 'up')).toBe('#4D8DFF');
    expect(glow(on, '#4D8DFF', 2)).toMatchObject({ shadowBlur: 20 });
    expect(glow(off, '#4D8DFF')).toEqual({});
  });

  it('deltaText formats change vs. previous', () => {
    expect(deltaText(110, 100, 'ko-KR')).toBe('▲ 10%');
    expect(deltaText(95, 100, 'ko-KR')).toBe('▼ 5%');
    expect(deltaText(5, 0, 'ko-KR')).toBe('');
  });

  it('theme.effects is validated', () => {
    expect(validateChartDefinition({ ...cpu([1]), theme: { effects: { glow: false } } }).valid).toBe(true);
    expect(validateChartDefinition({ ...cpu([1]), theme: { effects: { sparkle: true } } }).valid).toBe(false);
    expect(validateChartDefinition({ ...cpu([1]), theme: { effects: { glow: 'yes' } } }).valid).toBe(false);
  });
});

describe('chart effects', () => {
  it('bars enter sequentially with a value-end gradient and glow on hover', () => {
    const bar = series(build(cpu([10, 20, 30], 'column')))[0]!;
    expect(typeof bar.animationDelay).toBe('function');
    expect(bar.animationDelay(2)).toBe(80);
    expect(bar.itemStyle.color.type).toBe('linear');
    expect(bar.emphasis.itemStyle.shadowBlur).toBeGreaterThan(0);
    expect(bar.label.valueAnimation).toBe(true);
  });

  it('lines glow; a live stream adds a ripple on the newest point', () => {
    const still = build(cpu([10, 20, 30]));
    expect(series(still)[0]!.lineStyle.shadowBlur).toBeGreaterThan(0);
    expect(fx(still)).toHaveLength(0);

    const live = build(cpu([10, 20, 30]), { updateIntervalMs: 2000 });
    const [pulse] = fx(live);
    expect(pulse).toMatchObject({ type: 'effectScatter', silent: true, name: 'CPU' });
    expect(pulse!.data[0].value).toEqual([2, 30]);
  });

  it('without motion the live marker is a static ring, not a ripple', () => {
    const [pulse] = fx(build(cpu([10, 20]), { updateIntervalMs: 2000, reducedMotion: true }));
    expect(pulse!.type).toBe('scatter');
  });

  it('threshold breaches are ringed (line) or lit (bar) in their status colour', () => {
    const thresholds = { options: { thresholds: [{ value: 70, status: 'warning' }, { value: 90, status: 'critical' }] } };
    const line = build(cpu([50, 75, 95], 'line', thresholds));
    const breach = fx(line).find((s) => s.id === 'fx:breach:CPU')!;
    expect(breach.data.map((d: Opt) => d.value)).toEqual([[1, 75], [2, 95]]);
    expect(breach.data.map((d: Opt) => d.itemStyle.color)).toEqual(['#F6B84A', '#FF637D']);

    const bars = series(build(cpu([50, 95], 'column', thresholds)))[0]!;
    expect(bars.data[0]).toBe(50);
    expect(bars.data[1]).toMatchObject({ value: 95, itemStyle: { borderColor: '#FF637D' } });
  });

  it('hover tooltip skips overlays and shows change vs. the previous point and status', () => {
    const o = build(cpu([80, 100], 'line', { options: { thresholds: [{ value: 90, status: 'critical' }] } }));
    const html: string = o.tooltip.formatter([
      { seriesIndex: 0, dataIndex: 1, value: 100, seriesName: 'CPU', color: '#000', axisValueLabel: 't1' },
      { seriesIndex: 1, seriesId: 'fx:breach:CPU', dataIndex: 0, value: [1, 100], seriesName: 'CPU', color: '#000' },
    ]);
    expect(html.match(/CPU/g)).toHaveLength(1);
    expect(html).toContain('▲ 25%');
    expect(html).toContain('Critical');
  });

  it('gauge: tip marker rotates with a slow physical sweep; readout counts in sync', () => {
    const [main] = series(build(definitions.gauge));
    expect(main).toMatchObject({ animationDuration: 1200, animationEasing: 'cubicOut', animationDurationUpdate: 800, animationEasingUpdate: 'cubicInOut' });
    expect(main!.pointer.show).toBe(true);
    expect(main!.detail.valueAnimation).toBe(true);
    expect(main!.progress.itemStyle.shadowBlur).toBeGreaterThan(0);
  });

  it('effects can be switched off per theme', () => {
    const bar = series(build({ ...cpu([10, 20], 'column'), theme: { effects: { gradient: false, glow: false } } }))[0]!;
    expect(typeof bar.itemStyle.color).toBe('string');
    expect(bar.emphasis.itemStyle).toEqual({});
  });
});

describe('3D style (theme.effects.depth)', () => {
  const depth = { theme: { effects: { depth: true } } };

  /** Minimal custom-series API: 1 data unit = 10px; category band = 60px. */
  const fakeApi = (row: unknown[]) => ({
    value: (i: number) => row[i],
    size: () => [60, 60],
    coord: ([x, y]: [number, number]) => [x * 60 + 30, 300 - y * 10],
  });

  it('is off by default and validated', () => {
    expect(resolveTheme().effects.depth).toBe(false);
    expect(validateChartDefinition({ ...cpu([1]), ...depth }).valid).toBe(true);
    expect(validateChartDefinition({ ...cpu([1]), theme: { effects: { depth: 'on' } } }).valid).toBe(false);
  });

  it('bars become cuboids: front, side and top faces growing from the baseline', () => {
    const [bar] = series(build({ ...cpu([10, 20], 'column'), ...depth }));
    expect(bar).toMatchObject({ type: 'custom', id: 's:CPU', encode: { x: 0, y: [2, 3] } });
    expect(bar!.data).toEqual([[0, 10, 0, 10], [1, 20, 0, 20]]);
    const el = bar!.renderItem({ dataIndex: 1 }, fakeApi(bar!.data[1]));
    expect(el.type).toBe('group');
    // front, side, top — plus the value label (few bars → labels shown)
    expect(el.children.map((c: Opt) => c.type)).toEqual(['rect', 'polygon', 'polygon', 'text']);
    expect(el.children[3].style.text).toContain('20');
    expect(el.enterFrom).toEqual({ scaleY: 0 });
    expect(el.originY).toBe(300); // baseline
  });

  it('stacked 3D bars carry their own bases and are not re-stacked by ECharts', () => {
    const def = { ...definitions['stacked-bar'], ...depth };
    const s = series(build(def));
    expect(s.every((x) => x.stack === undefined)).toBe(true);
    const first = s[0]!.data[0] as number[];
    const second = s[1]!.data[0] as number[];
    expect(second[2]).toBe(first[3]); // second segment starts where the first ends
  });

  it('pie becomes a thick disk; the interactive pie stays series 0 on top', () => {
    const o = build({ ...definitions.pie, ...depth });
    const s = series(o);
    expect(s[0]).toMatchObject({ id: 'pie', z: 3 });
    const wall = s.filter((x) => String(x.id).startsWith('fx:depth'));
    expect(wall.length).toBeGreaterThan(3);
    expect(wall.every((x) => x.silent && x.z < 3)).toBe(true);
  });

  it('points become lit spheres; tooltip markers keep the solid colour', () => {
    const o = build({ ...definitions.scatter, ...depth });
    const s = series(o)[0]!;
    expect(s.itemStyle.color.type).toBe('radial');
    const html: string = o.tooltip.formatter({ seriesIndex: 0, dataIndex: 0, value: [1, 2, 3], seriesName: s.name, color: { type: 'radial' } });
    expect(html).not.toContain('[object Object]');
  });

  it('other types are raised with a drop shadow', () => {
    for (const type of ['heatmap', 'treemap', 'funnel', 'gauge'] as const) {
      const o = build({ ...definitions[type], ...depth });
      const s = series(o)[0]!;
      const style = type === 'gauge' ? s.progress.itemStyle : s.itemStyle;
      expect(style.shadowOffsetY, type).toBeGreaterThan(0);
    }
  });
});
