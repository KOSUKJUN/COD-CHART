import { describe, expect, it } from 'vitest';
import { buildOption, type Opt } from '../../src/adapters/echarts/build';
import { BREATHING_SERIES, DRIFT, driftPlan, driftSettle, driftStart } from '../../src/adapters/echarts/effects';
import { resolveMotion, type MotionEnvironment } from '../../src/core/animation';
import { normalizeRows } from '../../src/core/data';
import { validateChartDefinition } from '../../src/core/schema';
import { resolveTheme } from '../../src/core/theme';
import { definitions } from '../../playground/fixtures';
import { contentsDefinitions } from '../../playground/contents-fixtures';

function build(raw: unknown, hidden: string[] = [], env: MotionEnvironment = {}) {
  const { definition } = validateChartDefinition(raw);
  const rows = normalizeRows(definition!.data.rows ?? [], definition!.data.fields).rows;
  return buildOption({
    definition: definition!, rows, theme: resolveTheme(definition!.theme), motion: resolveMotion(definition!.animation, env),
    locale: 'ko-KR', summary: 'S', hidden: new Set(hidden),
  });
}
const series = (o: Opt) => o.series as Opt[];
const content = (id: string) => contentsDefinitions.find((d) => d.id === id)!;
const api = { getWidth: () => 420, getHeight: () => 240 };

describe('legend filtering', () => {
  it('every legend is clickable and keeps hidden items greyed across redraws', () => {
    const { option } = build(content('contents-gauge'), ['Babal']);
    expect(option.legend.selectedMode).toBe(true);
    expect(option.legend.selected).toMatchObject({ Babal: false, Angel: true });
  });

  it('gauge rings re-pack over visible items; the hidden ring stays as a zero-size placeholder', () => {
    const all = series(build(content('contents-gauge')).option);
    const filtered = series(build(content('contents-gauge'), ['Angel']).option);
    expect(filtered.find((s) => s.name === 'Angel')!.radius).toEqual(['0%', '0%']);
    // The next ring moves out into the freed outer slot.
    expect(filtered.find((s) => s.name === 'Babal')!.radius[1]).toBe(all.find((s) => s.name === 'Angel')!.radius[1]);
    // Colour follows the entity, not its position.
    expect(filtered.find((s) => s.name === 'Babal')!.data[0].itemStyle.color).toBe(all.find((s) => s.name === 'Babal')!.data[0].itemStyle.color);
  });

  it('donut centre total excludes hidden slices', () => {
    const full = series(build(definitions.donut).option).find((s) => s.id === '__center')!.data[0].value;
    const name = series(build(definitions.donut).option)[0]!.data[0].name;
    const less = series(build(definitions.donut, [name]).option).find((s) => s.id === '__center')!.data[0].value;
    expect(less).toBeLessThan(full);
  });

  it('packed bubbles re-pack without the hidden group', () => {
    const groups = series(build(content('contents-bubble'), ['Weeks']).option);
    expect(groups[1]!.renderItem({ dataIndex: 0 }, api)).toBeNull();
    expect(groups[0]!.renderItem({ dataIndex: 0 }, api)).not.toBeNull();
  });
});

describe('calm effects', () => {
  it('bars carry no moving overlay', () => {
    expect(series(build(content('contents-column')).option).some((s) => String(s.id).startsWith('fx:glint'))).toBe(false);
  });

  it('pies unfold slower; their HUD rings are static decoration', () => {
    const { option } = build(definitions.pie);
    expect(series(option)[0]!.animationDuration).toBe(Math.round(resolveMotion({}).entranceMs * 1.5));
    const el = series(option).find((s) => s.id === 'fx:hud')!.renderItem({}, api);
    expect(JSON.stringify(el)).not.toContain('keyframeAnimation');
  });

  it('bubbles and words are still at rest and marked to breathe on hover (motion on only)', () => {
    const bubbles = series(build(content('contents-bubble')).option);
    const words = series(build(content('contents-word-cloud')).option)[0]!;
    expect(bubbles.every((s) => s.breathe === true && BREATHING_SERIES(s.id))).toBe(true);
    expect(words).toMatchObject({ id: 'word-cloud', breathe: true });
    expect(bubbles[0]!.stateAnimation).toMatchObject({ easing: 'cubicOut' }); // no overshoot
    const circle = bubbles[0]!.renderItem({ dataIndex: 0 }, api).children[0];
    expect(circle.emphasis.scaleX).toBeUndefined(); // size is the breathing loop's job
    expect(JSON.stringify(bubbles[0]!.renderItem({ dataIndex: 0 }, api))).not.toContain('keyframeAnimation');
    expect(series(build(content('contents-bubble'), [], { reducedMotion: true }).option)[0]!.breathe).toBe(false);
  });

  it('drift: each item loops a sampled sine on x and y from rest, neighbours out of phase; settles back', () => {
    const anims: { props: Opt[]; easing?: string }[] = [];
    const settled: unknown[] = [];
    const el = {
      x: 100, y: 50, scaleX: 1, scaleY: 1,
      getBoundingRect: () => ({ width: 40, height: 40 }),
      animate: (_p: string, loop: boolean) => {
        expect(loop).toBe(true);
        const rec = { props: [] as Opt[], easing: undefined as string | undefined };
        anims.push(rec);
        const api = { when: (_t: number, props: Opt) => { rec.props.push(props); return api; }, start: (e?: string) => { rec.easing = e; } };
        return api;
      },
      animateTo: (props: Opt) => settled.push(props),
      stopAnimation: () => settled.push('stop'),
    };
    const rest = driftStart(el, 3);
    expect(rest).toEqual({ x: 100, y: 50 });
    expect(anims).toHaveLength(2); // x and y loops
    const xs = anims[0]!.props.map((p) => p.x as number);
    expect(xs).toHaveLength(DRIFT.samples + 1);
    expect(xs[0]).toBeCloseTo(100); // starts exactly at rest: no jump
    expect(xs.at(-1)).toBeCloseTo(100); // seamless loop
    const plan = driftPlan(3, 40);
    expect(Math.max(...xs.map((x) => Math.abs(x - 100)))).toBeLessThanOrEqual(plan.amp * 2 + 1e-9);
    expect(anims[0]!.easing).toBe('linear'); // shape comes from the sampled sine, not an easing curve
    expect(driftPlan(4, 40).tx).not.toBe(plan.tx);
    driftSettle(el, rest);
    expect(settled).toEqual(['stop', { x: 100, y: 50, scaleX: 1, scaleY: 1 }]);
  });
});

describe('range navigator option (line / area)', () => {
  it('options.zoom switches the slider under the chart on and off', () => {
    const line = content('contents-line');
    expect(build(line).option.dataZoom).toBeUndefined();
    const on = build({ ...line, options: { zoom: true } }).option;
    expect(on.dataZoom.map((z: Opt) => z.type)).toEqual(['inside', 'slider']);
    expect(build({ ...content('contents-area'), options: { zoom: true } }).option.dataZoom).toBeDefined();
    // Explicit false beats the zoom interaction of the live latency chart.
    expect(build({ ...definitions.line, options: { ...definitions.line.options, zoom: false } }).option.dataZoom).toBeUndefined();
    expect(validateChartDefinition({ ...line, options: { zoom: 'yes' } }).valid).toBe(false);
  });
});

describe('bar and pie accents (A, B, E, F, G)', () => {
  const entrance = (raw: unknown, env: MotionEnvironment = {}) => {
    const { definition } = validateChartDefinition(raw);
    const rows = normalizeRows(definition!.data.rows ?? [], definition!.data.fields).rows;
    return buildOption({ definition: definition!, rows, theme: resolveTheme(definition!.theme), motion: resolveMotion(definition!.animation, env), locale: 'ko-KR', summary: 'S', entrance: true });
  };
  const ids = (o: Opt) => series(o).map((s) => String(s.id));

  it('A — bars flash once on landing: entrance renders only, never on data updates or without motion', () => {
    const col = content('contents-column');
    expect(ids(entrance(col).option).filter((id) => id.startsWith('fx:land:'))).toHaveLength(5);
    expect(ids(build(col).option).some((id) => id.startsWith('fx:land:'))).toBe(false); // update render
    expect(ids(entrance(col, { reducedMotion: true }).option).some((id) => id.startsWith('fx:land:'))).toBe(false);
    const flash = series(entrance(col).option).find((s) => String(s.id).startsWith('fx:land:'))!;
    const api = { barLayout: () => Array.from({ length: 5 }, (_, i) => ({ offset: i * 10, width: 8 })), coord: (p: number[]) => [p[0]! * 50, 200 - p[1]!] };
    const el = flash.renderItem({ dataIndex: 0 }, api);
    expect(el.style.opacity).toBe(0); // invisible until it lands
    expect(el.keyframeAnimation).toMatchObject({ loop: false });
    expect(el.keyframeAnimation.delay).toBeGreaterThan(resolveMotion({}).entranceMs * 0.8);
  });

  it('B — plain bars carry a hover count-up spec; stacked bars do not', () => {
    const bar = series(build(content('contents-column')).option).find((s) => s.type === 'bar')!;
    expect(bar.hoverValue).toMatchObject({ horizontal: false });
    expect(bar.hoverValue.format(1234)).toMatch(/1,234/);
    const stacked = series(build(definitions['stacked-bar']).option).find((s) => s.type === 'bar')!;
    expect(stacked.hoverValue).toBeUndefined();
  });

  it('E/G/F — pie: no native scale (adapter pops/recedes), one continuous sweep with a leading edge on entrance', () => {
    const pie = series(build(definitions.donut).option)[0]!;
    expect(pie.emphasis).toMatchObject({ scale: false, focus: 'self' });
    expect(pie.animationDelay).toBe(0);
    expect(ids(entrance(definitions.donut).option)).toContain('fx:sweep');
    expect(ids(build(definitions.donut).option)).not.toContain('fx:sweep');
    const centre = series(build(definitions.donut).option).find((s) => s.id === '__center')!;
    expect(centre.hoverFormatter('Chrome', 41.2)({ value: 410 })).toContain('Chrome · 41.2%');
  });
});

describe('3D pie hover (G, H)', () => {
  it('exposes slice geometry for the lift and dims the others via blur', () => {
    const s = series(build({ ...definitions.pie, theme: { effects: { depth: true } } }).option);
    const pie3d = s.find((x) => x.id === 'pie3d')!;
    expect(pie3d.emphasis).toMatchObject({ focus: 'self' });
    const g = pie3d.sliceGeom(0, 400, 300);
    expect(g).toMatchObject({ tilt: 0.58 });
    expect(g.R).toBeGreaterThan(0);
    // First slice starts at 12 o'clock and runs clockwise: its mid-angle is between -90° and +270°.
    expect(g.mid).toBeGreaterThan(-Math.PI / 2);
    const el = pie3d.renderItem({ dataIndex: 0 }, { getWidth: () => 400, getHeight: () => 300 });
    const top = el.children.filter((c: Opt) => c.type === 'group').at(-1).children[0];
    expect(top.blur).toMatchObject({ style: { opacity: 0.55 } });
  });
});

describe('on-chart hover value (all charts)', () => {
  it('every chart carries its value formatter for the count-up label', () => {
    for (const id of ['contents-line', 'contents-pie', 'contents-gauge', 'contents-bubble', 'contents-word-cloud', 'contents-polar']) {
      const fmt = build(content(id)).option.__valueFormat;
      expect(typeof fmt).toBe('function');
      expect(fmt(1234)).toMatch(/1,234/);
    }
  });
});

describe('pie callout', () => {
  it("the hovered slice's own label gives way to the callout bubble", () => {
    const pie = series(build(definitions.pie).option)[0]!;
    expect(pie.emphasis).toMatchObject({ label: { show: false }, labelLine: { show: false } });
  });
});
