import { describe, expect, it } from 'vitest';
import { buildOption, type Opt } from '../../src/adapters/echarts/build';
import { resolveMotion } from '../../src/core/animation';
import { normalizeRows } from '../../src/core/data';
import { assertValidDefinition, validateChartDefinition } from '../../src/core/schema';
import { resolveTheme } from '../../src/core/theme';

/** A COD-M style traffic content: `n` series over `times` 5-minute buckets. */
function traffic(type: 'line' | 'area', options: Record<string, unknown>, times = ['17:00', '17:05', '17:10', '17:15'], n = 3) {
  return {
    schemaVersion: '1.0.0', id: `t-${type}`, type,
    contentsData: {
      timesArr: times,
      data: Array.from({ length: n }, (_, si) => ({ key: `S${si}`, values: times.map((_, x) => ({ x, y: 10 * (si + 1) + x })) })),
    },
    options,
  };
}

function build(raw: unknown, hidden?: Set<string>) {
  const definition = assertValidDefinition(raw);
  const rows = normalizeRows(definition.data.rows ?? [], definition.data.fields).rows;
  return buildOption({ definition, rows, theme: resolveTheme(definition.theme), motion: resolveMotion(definition.animation), locale: 'ko-KR', summary: 'S', hidden, entrance: true });
}

const lines = (o: Opt) => (o.series as Opt[]).filter((s) => s.type === 'line');
const fx = (o: Opt, prefix: string) => (o.series as Opt[]).filter((s) => String(s.id ?? '').startsWith(prefix));

describe('options.drawOrder', () => {
  it("'one-by-one' starts each line only after the previous one has finished", () => {
    for (const type of ['line', 'area'] as const) {
      const r = build(traffic(type, { drawOrder: 'one-by-one' }));
      const ls = lines(r.option);
      const draw = ls[0]!.animationDuration as number;
      expect(draw).toBe(1800); // 2 s default entrance × 0.9
      // Each next line waits for the previous one to finish plus a 1 s pause.
      const step = draw + 1000;
      expect(ls.map((s) => s.animationDelay)).toEqual([0, step, 2 * step]);
      expect(ls.every((s) => s.animationDuration === draw)).toBe(true);
      // The whole entrance is reported so the adapter can hold data updates until it ends.
      expect(r.entranceMs).toBe(3 * draw + 2 * 1000);
    }
  });

  it('skips legend-hidden lines in the drawing order (no empty pauses)', () => {
    const ls = lines(build(traffic('line', { drawOrder: 'one-by-one' }), new Set(['S1'])).option);
    const step = (ls[0]!.animationDuration as number) + 1000;
    expect(ls.map((s) => s.animationDelay)).toEqual([0, 0, step]); // S1 hidden: S2 follows S0 directly
  });

  it("default 'together' keeps the short series stagger", () => {
    const ls = lines(build(traffic('line', {})).option);
    expect(ls.map((s) => s.animationDelay)).toEqual([0, 260, 520]);
    expect(ls[0]!.animationDuration).toBeUndefined();
  });

  it('starts the flowing light of a line only after that line has drawn', () => {
    const r = build(traffic('line', { drawOrder: 'one-by-one' }));
    const draw = lines(r.option)[0]!.animationDuration as number;
    const step = draw + 1000;
    expect(fx(r.option, 'fx:flow:').map((s) => s.effect.delay)).toEqual([draw, step + draw, 2 * step + draw]);
  });

  it('is ignored without motion', () => {
    const raw = { ...traffic('line', { drawOrder: 'one-by-one' }), animation: { enabled: false } };
    const r = build(raw);
    expect(lines(r.option).every((s) => s.animationDelay === 0)).toBe(true);
    expect(r.entranceMs).toBeUndefined();
  });
});

describe('options.realtime', () => {
  it('pulses the newest point of every line even without a stream data source', () => {
    expect(fx(build(traffic('line', {})).option, 'fx:live:')).toHaveLength(0);
    const live = fx(build(traffic('line', { realtime: true })).option, 'fx:live:');
    expect(live).toHaveLength(3);
    expect(live[0]!.data[0].value[0]).toBe(4); // the last bucket's x (sequence numbers start at 1)
  });

  it('{ windowSize } keeps only the newest x values', () => {
    const o = build(traffic('area', { realtime: { windowSize: 2 } }, ['17:00', '17:05', '17:10', '17:15', '17:20'])).option;
    // Real time runs on a numeric x over sequence numbers; points carry their label as name.
    expect(o.xAxis).toMatchObject({ type: 'value', min: 1, max: 2 });
    expect(lines(o)[0]!.data).toEqual([{ name: '17:15', value: [1, 13] }, { name: '17:20', value: [2, 14] }]);
  });

  it('validates its shape', () => {
    const issue = (options: unknown) => validateChartDefinition(traffic('line', options as Record<string, unknown>)).issues.map((i) => i.path);
    expect(issue({ realtime: true })).toEqual([]);
    expect(issue({ realtime: { windowSize: 60 } })).toEqual([]);
    expect(issue({ realtime: 'yes' })).toContain('options.realtime');
    expect(issue({ realtime: { windowSize: 1 } })).toContain('options.realtime');
    expect(issue({ drawOrder: 'random' })).toContain('options.drawOrder');
  });
});

describe('one-by-one loop and real-time x labels', () => {
  it("one-by-one asks the adapter to keep cycling the draw; 'together' does not", () => {
    expect(build(traffic('line', { drawOrder: 'one-by-one' })).loop).toEqual({ holdMs: expect.any(Number) });
    expect(build(traffic('line', {})).loop).toBeUndefined();
  });

  it('real-time draws its own x labels (keyed by label, so they slide) over transparent native ones', () => {
    const o = build(traffic('line', { realtime: true })).option;
    expect(o.xAxis.axisLabel.color).toBe('transparent'); // still reserves the layout space
    const labels = (o.series as Opt[]).find((s) => s.id === 'fx:xlabels')!;
    expect(labels).toMatchObject({ type: 'custom', silent: true, tooltip: { show: false } });
    expect(labels.data.map((d: Opt) => d.name)).toEqual(['17:00', '17:05', '17:10', '17:15']);
    expect(fx(build(traffic('line', {})).option, 'fx:xlabels')).toHaveLength(0);
  });

  it('keeps each x label on the same sequence number across updates (stable label thinning)', () => {
    const xSeq = new Map<string, number>();
    const seqOf = (times: string[]) => {
      const definition = assertValidDefinition(traffic('line', { realtime: true }, times));
      const rows = normalizeRows(definition.data.rows ?? [], definition.data.fields).rows;
      const o = buildOption({ definition, rows, theme: resolveTheme(), motion: resolveMotion(undefined), locale: 'ko-KR', summary: 'S', xSeq }).option;
      return Object.fromEntries(((o.series as Opt[]).find((s) => s.id === 'fx:xlabels')!.data as Opt[]).map((d) => [d.name, d.value[2]]));
    };
    const a = seqOf(['17:00', '17:05', '17:10']);
    const b = seqOf(['17:05', '17:10', '17:15']);
    expect(b['17:05']).toBe(a['17:05']);
    expect(b['17:10']).toBe(a['17:10']);
    expect(b['17:15']).toBe(a['17:10'] + 1);
  });
});
