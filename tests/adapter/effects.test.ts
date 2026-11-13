import { describe, expect, it } from 'vitest';
import { buildOption, type Opt } from '../../src/adapters/echarts/build';
import { BORDER_FLOW_PERIOD_MS, deltaText, fillGradient, glow, stagger, STAGGER_WINDOW_MS, webRoute } from '../../src/adapters/echarts/effects';
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
    expect(m).toMatchObject({ staggerMs: 120, sweepMs: 3000, sweepUpdateMs: 800, live: false });
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
    expect(few(4)).toBe(480); // 120ms steps
    const many = stagger(m, 1000) as (i: number) => number;
    expect(many(999)).toBeLessThanOrEqual(STAGGER_WINDOW_MS);
    expect((stagger(m, 5, 2) as (i: number) => number)(0)).toBe(520); // 2 × 260ms series offset
    expect(stagger(resolveMotion({ enabled: false }), 5)).toBe(0);
  });

  it('gradient and glow follow the theme switches', () => {
    const on = resolveTheme();
    const off = resolveTheme({ effects: { gradient: false, glow: false } });
    expect(fillGradient(on, '#4D8DFF', 'up')).toMatchObject({ type: 'linear', colorStops: [{ offset: 0 }, { offset: 0.35, color: '#4D8DFF' }, { offset: 1 }] });
    expect(fillGradient(off, '#4D8DFF', 'up')).toBe('#4D8DFF');
    expect(glow(on, '#4D8DFF', 2)).toMatchObject({ shadowBlur: 28 });
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
    expect(bar.animationDelay(2)).toBe(240);
    expect(bar.itemStyle.color.type).toBe('linear');
    expect(bar.emphasis.itemStyle.shadowBlur).toBeGreaterThan(0);
    expect(bar.label.valueAnimation).toBe(true);
  });

  it('lines glow; a live stream adds a ripple on the newest point', () => {
    const still = build(cpu([10, 20, 30]));
    expect(series(still)[0]!.lineStyle.shadowBlur).toBeGreaterThan(0);
    // A resting line gets only the data-flow light, travelling along its points after the entrance.
    const [flow, ...rest] = fx(still);
    expect(rest).toHaveLength(0);
    expect(flow).toMatchObject({ id: 'fx:flow:CPU', type: 'lines', silent: true, polyline: true, effect: { show: true, loop: true } });
    expect(flow!.data[0].coords).toEqual([[0, 10], [1, 20], [2, 30]]);
    expect(flow!.effect.delay).toBe(resolveMotion({}).entranceMs);
    expect(fx(build(cpu([10, 20, 30]), { reducedMotion: true }))).toHaveLength(0); // no travelling light without motion

    const live = build(cpu([10, 20, 30]), { updateIntervalMs: 2000 });
    const pulse = fx(live).find((s) => s.type === 'effectScatter');
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
    expect(breach.data.map((d: Opt) => d.itemStyle.color)).toEqual(['#FFB020', '#FF2E5B']);

    const bars = series(build(cpu([50, 95], 'column', thresholds)))[0]!;
    expect(bars.data[0]).toBe(50);
    expect(bars.data[1]).toMatchObject({ value: 95, itemStyle: { borderColor: '#FF2E5B' } });
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
    expect(main).toMatchObject({ animationDuration: 3000, animationEasing: 'cubicOut', animationDurationUpdate: 800, animationEasingUpdate: 'cubicInOut' });
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

  it('pie becomes a tilted thick disk: elliptical top faces over a side wall; legend source stays series 0', () => {
    const o = build({ ...definitions.pie, ...depth });
    const s = series(o);
    expect(s[0]).toMatchObject({ id: 'pie', radius: ['0%', '0%'], silent: true }); // legend/colour source, not drawn
    const pie3d = s.find((x) => x.id === 'pie3d')!;
    expect(pie3d.type).toBe('custom');
    // Second slice reaches the front half, so it has a visible curved wall.
    const el = pie3d.renderItem({ dataIndex: 1 }, { getWidth: () => 400, getHeight: () => 300 });
    const top = el.children.find((c: Opt) => c.type === 'group')!;
    expect(top.scaleY).toBeLessThan(1); // tilted: squashed to an ellipse
    const walls = el.children.filter((c: Opt) => c.type === 'polygon');
    expect(walls.length).toBeGreaterThan(0); // curved side band, not stacked layers
    expect(walls.every((w: Opt) => w.z2 < top.children[0].z2)).toBe(true); // tops above the wall
    expect(walls[0].style.fill).toMatchObject({ type: 'linear', global: true }); // one cylinder light across slices
    expect(s.some((x) => x.id === 'fx:sheen')).toBe(true); // shared highlight over the disc
    expect(s.some((x) => x.id === 'fx:hud')).toBe(false);
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

describe('pie border flow', () => {
  const pie = (extra: Opt = {}) => ({ ...definitions.donut!, type: 'pie', ...extra });
  const border = (o: Opt) => series(o).find((s) => s.id === 'fx:border');

  it('pie and donut get one soft streak (no head dot) running around the halo ring, forever', () => {
    for (const def of [pie(), definitions.donut!]) {
      const s = border(build(def));
      expect(s).toBeDefined();
      const el = s!.renderItem({}, { getWidth: () => 400, getHeight: () => 300 });
      expect(el.keyframeAnimation).toMatchObject({ loop: true });
      const [k0, k1] = el.keyframeAnimation.keyframes;
      expect(k0.rotation - k1.rotation).toBeCloseTo(Math.PI * 2); // one clockwise lap per period
      expect(el.children.every((c: Opt) => c.type === 'arc')).toBe(true); // a streak only, no head dot
      expect(Math.max(...el.children.map((c: Opt) => c.style.opacity))).toBeLessThanOrEqual(0.6); // soft
      const ring = series(build(def)).find((x) => x.id === 'fx:hud')!.renderItem({}, { getWidth: () => 400, getHeight: () => 300 }).children[0].shape.r;
      expect(el.children[0].shape.r).toBeCloseTo(ring); // rides the halo ring outside the pie
    }
  });

  it('continues from the current lap position on redraw instead of restarting at 12 o\'clock', () => {
    const s = border(build(pie()))!;
    const api = { getWidth: () => 400, getHeight: () => 300 };
    const phase = s.renderItem({}, api).keyframeAnimation.keyframes[0].rotation;
    const expected = -((Date.now() % BORDER_FLOW_PERIOD_MS) / BORDER_FLOW_PERIOD_MS) * Math.PI * 2;
    expect(Math.abs(phase - expected)).toBeLessThan(0.1);
  });

  it('is off with borderFlow: false, without motion, without glow, and on the 3D disc', () => {
    expect(border(build(pie({ options: { borderFlow: false } })))).toBeUndefined();
    expect(border(build(pie(), { reducedMotion: true }))).toBeUndefined();
    expect(border(build(pie({ theme: { effects: { glow: false } } })))).toBeUndefined();
    expect(border(build(pie({ theme: { effects: { depth: true } } })))).toBeUndefined();
  });

  it('polar pie gets the same comet on its halo ring', () => {
    const polar = (extra: Opt = {}) => ({
      schemaVersion: v, id: 'fx-polar', type: 'polar-pie',
      data: {
        fields: [{ name: 'id', type: 'string' }, { name: 'parent', type: 'string' }, { name: 'name', type: 'string' }, { name: 'value', type: 'number' }],
        rows: [{ id: '0', parent: '', name: 'World', value: 3 }, { id: '1', parent: '0', name: 'Asia', value: 2 }, { id: '2', parent: '0', name: 'Europe', value: 1 }],
      },
      encoding: { label: 'id', category: 'name', path: ['parent'], value: 'value' },
      ...extra,
    });
    const api = { getWidth: () => 400, getHeight: () => 300 };
    const s = border(build(polar()))!;
    expect(s).toBeDefined();
    const ring = series(build(polar())).find((x) => x.id === 'fx:hud')!.renderItem({}, api).children[0].shape.r;
    expect(s.renderItem({}, api).children[0].shape.r).toBeCloseTo(ring);
    expect(border(build(polar({ options: { borderFlow: false } })))).toBeUndefined();
  });

  it('spider: a soft streak wanders over the web on a closed route along rings and spokes', () => {
    const radar = (extra: Opt = {}) => ({ ...definitions.radar!, ...extra });
    const web = (o: Opt) => series(o).find((x) => x.id === 'fx:web');
    const s = web(build(radar()));
    expect(s).toBeDefined();
    const el = s!.renderItem({}, { getWidth: () => 400, getHeight: () => 300 });
    expect(el.children.length).toBeGreaterThan(3);
    expect(el.children.every((c: Opt) => c.style.opacity <= 0.6)).toBe(true); // soft, no bright head
    const kf = el.children.at(-1).keyframeAnimation;
    expect(kf.loop).toBe(true);
    const first = kf.keyframes[0], last = kf.keyframes.at(-1);
    expect(last.x).toBeCloseTo(first.x); // closed loop: no jump when it repeats
    expect(last.y).toBeCloseTo(first.y);
    expect(web(build(radar({ options: { borderFlow: false } })))).toBeUndefined();
    expect(web(build(radar(), { reducedMotion: true }))).toBeUndefined();
  });

  it('web route only steps between neighbouring web points and returns home', () => {
    const spokes = 6, rings = 5;
    const route = webRoute(spokes, rings, 42);
    expect(route[0]).toEqual(route.at(-1)!.map((v) => expect.closeTo(v, 9)));
    for (let n = 1; n < route.length; n++) {
      const [x0, y0] = route[n - 1]!, [x1, y1] = route[n]!;
      const r0 = Math.hypot(x0, y0), r1 = Math.hypot(x1, y1);
      const sameSpoke = Math.abs(Math.atan2(y0, x0) - Math.atan2(y1, x1)) < 1e-9;
      // Either one ring in/out along a spoke, or one edge along a ring.
      expect(sameSpoke ? Math.abs(r1 - r0) - 1 / rings : Math.abs(r1 - r0)).toBeCloseTo(0, 9);
    }
  });

  it('borderFlow must be a boolean', () => {
    expect(validateChartDefinition(pie({ options: { borderFlow: 'yes' } })).valid).toBe(false);
  });
});
