import { describe, expect, it } from 'vitest';
import { buildOption, buildTree, mergeEngineOptions, type Opt, type SlotMap } from '../../src/adapters/echarts/build';
import { resolveMotion } from '../../src/core/animation';
import { normalizeRows } from '../../src/core/data';
import { assertValidDefinition } from '../../src/core/schema';
import { PREMIUM_DARK_BLUE_PALETTE, resolveTheme } from '../../src/core/theme';
import type { ChartDefinition, ChartType, Row } from '../../src/core/types';
import { definitions, type DemoChartType } from '../../playground/fixtures';
import { contentsDefinitions } from '../../playground/contents-fixtures';

const ECHARTS_TYPES: DemoChartType[] = ['line', 'area', 'bar', 'stacked-bar', 'column', 'pie', 'donut', 'gauge', 'scatter', 'heatmap', 'treemap'];

function build(raw: unknown, rowsOverride?: Row[], slots?: SlotMap) {
  const definition = assertValidDefinition(raw);
  const rows = normalizeRows(rowsOverride ?? definition.data.rows ?? [], definition.data.fields).rows;
  return {
    definition,
    rows,
    ...buildOption({ definition, rows, theme: resolveTheme(definition.theme), motion: resolveMotion(definition.animation), locale: 'ko-KR', summary: 'S', slots }),
  };
}

const series = (o: Opt) => o.series as Opt[];
/** Data series only — without the CODVIL `fx:` emphasis overlays. */
const dataSeries = (o: Opt) => series(o).filter((s) => !String(s.id ?? '').startsWith('fx:'));

describe('buildOption — every ECharts MVP type', () => {
  it.each(ECHARTS_TYPES)('%s builds a themed, accessible option', (type) => {
    const { option } = build(definitions[type]);
    expect(option.backgroundColor).toBe('transparent');
    expect(option.aria).toMatchObject({ enabled: true, label: { description: 'S' } });
    expect(option.textStyle.color).toBe('#A9B9CC');
    expect(series(option).length).toBeGreaterThan(0);
    expect(option.tooltip.renderMode).toBe('html');
    expect(typeof option.tooltip.formatter).toBe('function');
    // JSON-safe apart from our own formatter functions.
    expect(() => JSON.stringify(option)).not.toThrow();
  });

  it('builds with empty data without throwing', () => {
    for (const type of ECHARTS_TYPES) expect(() => build(definitions[type], []), type).not.toThrow();
  });
});

describe('cartesian', () => {
  it('line: one series per measure, 2px lines, time axis, threshold markLine, zoom', () => {
    const { option } = build(definitions.line);
    expect(dataSeries(option).map((s) => s.name)).toEqual(['p50', 'p95']);
    expect(series(option)[0]!.lineStyle.width).toBe(2);
    expect(series(option)[0]!.sampling).toBe('lttb');
    expect(option.xAxis.type).toBe('time');
    expect(series(option)[0]!.markLine.data[0].yAxis).toBe(300);
    expect(option.dataZoom).toHaveLength(2);
    expect(option.legend.data).toEqual(['p50', 'p95']);
  });

  it('single series has no legend (the title names it)', () => {
    expect(build(definitions.column).option.legend).toBeUndefined();
  });

  it('bar is horizontal by default with rounded data-ends and inverse category axis', () => {
    const { option } = build(definitions.bar);
    expect(option.yAxis.type).toBe('category');
    expect(option.yAxis.inverse).toBe(true);
    expect(series(option)[0]!.itemStyle.borderRadius).toEqual([0, 4, 4, 0]);
  });

  it('stacked-bar: only the top segment is rounded; segments have a surface gap', () => {
    const { option } = build(definitions['stacked-bar']);
    const s = series(option);
    expect(s.every((x) => x.stack === 'total')).toBe(true);
    expect(s[0]!.itemStyle.borderRadius).toEqual([0, 0, 0, 0]);
    expect(s.at(-1)!.itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
    expect(s[0]!.itemStyle.borderColor).toBe('#0B1728');
  });

  it('percent stacking normalises each category to 1', () => {
    const { option } = build({ ...definitions['stacked-bar'], options: { stack: 'percent' } });
    const s = series(option);
    for (let i = 0; i < 4; i++) expect(s.reduce((a, x) => a + (x.data[i] as number), 0)).toBeCloseTo(1, 6);
    expect(option.yAxis.max).toBe(1);
  });

  it('folds more than 8 series into "기타" — never a 9th hue', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ k: 'a', g: `g${i}`, v: i + 1 }));
    const { option, warnings } = build({ ...definitions['stacked-bar'], data: { fields: [{ name: 'k', type: 'string' }, { name: 'g', type: 'string' }, { name: 'v', type: 'number' }] }, encoding: { x: 'k', y: 'v', color: 'g' } }, rows);
    expect(series(option)).toHaveLength(8);
    expect(series(option).at(-1)!.name).toBe('기타');
    expect(series(option).at(-1)!.data[0]).toBe(8 + 9 + 10 + 11 + 12);
    expect(warnings[0]).toMatch(/기타/);
  });

  it('colour follows the entity, not its rank, across updates', () => {
    const slots: SlotMap = new Map();
    const raw = definitions['stacked-bar'];
    const all = build(raw, undefined, slots);
    // Bars carry a value-end gradient; its first stop is the entity's palette colour.
    const colorOf = (o: Opt, name: string) => series(o).find((s) => s.name === name)!.itemStyle.color.colorStops[0].color;
    const partnerBefore = colorOf(all.option, '파트너');
    const filtered = build(raw, (raw.data.rows as Row[]).filter((r) => r.channel !== '온라인'), slots);
    expect(colorOf(filtered.option, '파트너')).toBe(partnerBefore);
    expect(partnerBefore).toBe(PREMIUM_DARK_BLUE_PALETTE[2]);
  });

  it('LTTB caps points when maxPoints is set', () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ timestamp: i * 1000, p50: Math.sin(i / 10), p95: 1 }));
    const { option, warnings } = build({ ...definitions.line, options: { maxPoints: 200 } }, rows);
    expect(series(option)[0]!.data).toHaveLength(200);
    expect(warnings.some((w) => w.includes('LTTB'))).toBe(true);
  });

  it('turns on large mode for big bar datasets', () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({ month: `m${i}`, signups: i }));
    expect(series(build(definitions.column, rows).option)[0]!.large).toBe(true);
  });
});

describe('tooltips escape untrusted text', () => {
  it('cartesian axis tooltip', () => {
    const { option } = build(definitions.bar);
    const html: string = option.tooltip.formatter([{ value: 1, seriesName: '<img src=x onerror=alert(1)>', color: '#fff', axisValueLabel: '<b>x</b>', seriesIndex: 0, dataIndex: 0 }]);
    expect(html).not.toMatch(/<img|<b>/);
    expect(html).toContain('&lt;img');
  });

  it('pie item tooltip', () => {
    const { option } = build(definitions.pie);
    const html: string = option.tooltip.formatter({ name: '<script>x</script>', value: 3, percent: 10, color: '#fff', seriesName: 's' });
    expect(html).not.toContain('<script>');
  });

  it('colours injected through marker styles are escaped too', () => {
    const { option } = build(definitions.pie);
    const html: string = option.tooltip.formatter({ name: 'a', value: 3, percent: 10, color: '"><script>', seriesName: 's' });
    expect(html).not.toContain('"><script>');
  });
});

describe('part-to-whole', () => {
  it('pie is a single 2D series; donut adds a centre series', () => {
    const pie = build(definitions.pie);
    expect(series(pie.option)).toHaveLength(1);
    expect(series(pie.option)[0]!.type).toBe('pie');
    expect(pie.lookup(0, 0)?.name).toBe(series(pie.option)[0]!.data[0].name);

    const donut = build(definitions.donut);
    expect(series(donut.option)).toHaveLength(2);
    expect(series(donut.option)[1]!.id).toBe('__center');
  });

  it('radar uses the required value channel to build metric values', () => {
    const { option, definition } = build(definitions.radar);
    expect(definition.encoding?.value).toBe('score');
    expect(option.radar.indicator.map((indicator: Opt) => indicator.name)).toEqual(['CPU', 'Memory', 'Disk', 'Network']);
    expect(series(option)[0]!.data[0].value).toEqual([75, 85, 65, 90]);
  });

  describe('additional chart types', () => {
    it('builds candlesticks in open, close, low, high order', () => {
      const { option, lookup } = build(definitions.candlestick);
      expect(series(option)[0]!.data[0]).toEqual([100, 102, 99, 105]);
      expect(lookup(0, 0)?.row?.date).toBe('2024-01-01');
      expect(() => build({ ...definitions.candlestick, encoding: { x: 'date', y: 'close' } })).toThrow(/encoding.y/);
    });

    it('calculates boxplot quartiles per category', () => {
      const { option, lookup } = build(definitions.boxplot);
      expect(option.xAxis.data).toEqual(['API-A', 'API-B']);
      expect(series(option)[0]!.data).toEqual([[50, 60, 75, 85, 100], [65, 75, 90, 110, 125]]);
      expect(lookup(0, 1)?.rows).toHaveLength(5);
    });

    it('aggregates sankey links that share a source and target', () => {
      const { option } = build(definitions.sankey, [
        { source: 'A', target: 'B', value: 2 },
        { source: 'A', target: 'B', value: 3 },
        { source: 'C', target: 'B', value: 4 },
      ]);
      expect(series(option)[0]!.links).toEqual([
        { source: 'A', target: 'B', value: 5 },
        { source: 'C', target: 'B', value: 4 },
      ]);
    });
  });

  it('pie sorts descending and folds the tail beyond 8 slices', () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({ browser: `b${i}`, sessions: i + 1 }));
    const { option } = build(definitions.pie, rows);
    const data = series(option)[0]!.data as Opt[];
    expect(data).toHaveLength(8);
    expect(data[0]!.value).toBe(11);
    expect(data.at(-1)).toMatchObject({ name: '기타', value: 1 + 2 + 3 + 4 });
  });

  it('donut adds a centred total that is silent and excluded from the legend', () => {
    const { option } = build(definitions.donut);
    const center = series(option)[1]!;
    expect(center.silent).toBe(true);
    expect(center.label.valueAnimation).toBe(true); // total counts up / tweens on change
    expect(center.label.formatter({ value: center.data[0].value })).toContain('1,002');
    expect(option.legend.data).not.toContain('');
  });

  it('negative values are ignored for pies', () => {
    const { option } = build(definitions.pie, [{ browser: 'a', sessions: -5 }, { browser: 'b', sessions: 5 }]);
    expect((series(option)[0]!.data as Opt[]).map((d) => d.name)).toEqual(['b']);
  });
});

describe('gauge', () => {
  it('colours progress by threshold status and shows icon + label', () => {
    const { option } = build(definitions.gauge);
    const main = series(option)[0]!;
    expect(main.progress.itemStyle.color).toBe('#F6B84A'); // 72 ≥ 70 → warning
    expect(main.detail.formatter(72)).toMatch(/Warning/);
    expect(series(option)[1]!.axisLine.lineStyle.color).toHaveLength(3); // ok | warning | critical zones
  });

  describe('concentric gauge group', () => {
    const definition = contentsDefinitions.find(d => d.id === 'contents-gauge')!;

    it('renders every value as a concentric, clockwise ring from the top', () => {
      const result = build(definition);
      const rings = series(result.option);
      expect(rings).toHaveLength(5);
      expect(rings.map(r => r.center)).toEqual(Array(5).fill(['50%', '45%']));
      expect(rings.map(r => r.radius)).toEqual([
        ['72.8%', '80%'], ['63.8%', '71%'], ['54.8%', '62%'], ['45.8%', '53%'], ['36.8%', '44%'],
      ]);
      expect(rings.every(r => r.type === 'pie' && r.startAngle === 90 && r.clockwise)).toBe(true);
      expect(rings.map(r => r.data[0].value)).toEqual([11, 32, 45, 17, 65]);
      expect(result.lookup(1, 0)).toMatchObject({ row: { label: 'Babal', value: 32 }, value: 32 });
      expect(result.lookup(1, 1)).toBeUndefined();
    });

    describe('bubble chart', () => {
      it('uses values as the vertical coordinate for Contents data, not array index', () => {
        const input = contentsDefinitions.find(d => d.id === 'contents-bubble')!;
        const result = build(input);
        const bubbles = series(result.option);
        expect(result.option.xAxis.type).toBe('category');
        expect(result.option.yAxis.type).toBe('value');
        expect(bubbles[0]!.data[0]).toEqual({ name: 'Today_1', value: ['Today', 51, 51] });
        expect(bubbles[0]!.data[1]).toEqual({ name: 'Today_2', value: ['Today', 24, 24] });
        expect(bubbles[0]!.symbolSize([0, 0, 90])).toBeGreaterThan(bubbles[0]!.symbolSize([0, 0, 20]));
        expect(result.lookup(0, 0)?.row).toMatchObject({ label: 'Today_1', value: 51 });
      });

      describe('word cloud', () => {
        it('limits large inputs by weight and reports excluded words', () => {
          const def = contentsDefinitions.find(d => d.id === 'contents-word-cloud')!;
          const input = { ...def, contentsData: Array.from({ length: 120 }, (_, i) => ({ name: `word${i}`, weight: i + 1 })) };
          const result = build(input);
          expect(series(result.option)[0]!.data).toHaveLength(100);
          expect(result.lookup(0, 0)?.row).toMatchObject({ name: 'word119', weight: 120 });
          expect(result.warnings.join(' ')).toContain('100개');
        });
      });

      it('supports independent numeric x/y coordinates and bubble size', () => {
        const input = {
          schemaVersion: '1.0.0', id: 'bubble-xy', type: 'bubble',
          data: { fields: [
            { name: 'group', type: 'string' }, { name: 'name', type: 'string' },
            { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'size', type: 'number' },
          ], rows: [{ group: 'A', name: 'One', x: 10, y: 30, size: 50 }] },
          encoding: { category: 'group', label: 'name', x: 'x', y: 'y', value: 'size' },
        };
        const result = build(input);
        expect(result.option.xAxis.type).toBe('value');
        expect(series(result.option)[0]!.data[0]).toEqual({ name: 'One', value: [10, 30, 50] });
        expect(result.option.tooltip.formatter({ seriesIndex: 0, dataIndex: 0, color: '#000' })).toContain('50');
        expect(() => build({ ...input, encoding: { ...input.encoding, y: undefined } })).toThrow();
        expect(() => build({ ...input, encoding: { ...input.encoding, y: ['y'] } })).toThrow();
      });
    });

    it('honors custom ranges and clamps geometry while preserving source values', () => {
      const result = build({ ...definition, options: { min: 20, max: 40 } });
      expect(series(result.option).map(r => r.data.map((d: Opt) => d.value))).toEqual([
        [0, 20], [12, 8], [20, 0], [0, 20], [20, 0],
      ]);
      expect(result.lookup(2, 0)?.value).toBe(45);
      expect(result.option.tooltip.formatter({ seriesIndex: 2, dataIndex: 0 })).toContain('45');
    });

    it('keeps ring radii ordered and positive for many entries', () => {
      const data = Array.from({ length: 60 }, (_, i) => ({ col0: `item-${i}`, col1: i }));
      const rings = series(build({ ...definition, contentsData: data }).option);
      expect(rings).toHaveLength(60);
      for (const ring of rings) {
        expect(parseFloat(ring.radius[0])).toBeGreaterThan(0);
        expect(parseFloat(ring.radius[0])).toBeLessThan(parseFloat(ring.radius[1]));
      }
    });
  });

  it('respects min/max', () => {
    const { option } = build({ ...definitions.gauge, options: { min: 10, max: 50 } }, [{ cpu: 20 }]);
    expect(series(option)[0]).toMatchObject({ min: 10, max: 50 });
  });
});

describe('heatmap', () => {
  it('uses the sequential ramp, cell gaps, and dark ink on light cells', () => {
    const { option } = build({ ...definitions.heatmap, options: { labels: true } });
    expect(option.visualMap.inRange.color[0]).toBe('#1F4B7E');
    const data = series(option)[0]!.data as Opt[];
    const max = Math.max(...data.map((d) => d.value[2]));
    expect(data.find((d) => d.value[2] === max)!.label.color).toBe('#07111F');
    expect(series(option)[0]!.itemStyle.borderWidth).toBe(2);
  });
});

describe('treemap', () => {
  it('builds a summed, sorted hierarchy with a node → rows index', () => {
    const { roots, nodeRows } = buildTree(definitions.treemap.data.rows!, ['env', 'tier', 'name'], 'gb');
    expect(roots[0]!.name).toBe('Production');
    expect(roots[0]!.value).toBe(920 + 410 + 1280 + 1650 + 780 + 160);
    expect(nodeRows.get('Analytics')!.length).toBe(3);
  });

  it('enables drilldown with a breadcrumb', () => {
    const { option } = build(definitions.treemap);
    expect(series(option)[0]).toMatchObject({ nodeClick: 'zoomToNode', breadcrumb: { show: true }, roam: false });
  });
});

describe('scatter', () => {
  it('warns beyond the all-pairs-safe colour count and scales size by area', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ account: `a${i}`, tier: `t${i % 5}`, seats: i, arr: i * 2, tickets: i }));
    const { option, warnings } = build(definitions.scatter, rows);
    expect(series(option)).toHaveLength(5);
    expect(warnings.some((w) => w.includes('색각'))).toBe(true);
    const size = series(option)[0]!.symbolSize as (v: unknown[]) => number;
    expect(size([0, 0, 0])).toBe(8);
    expect(size([0, 0, 39])).toBe(30);
  });
});

describe('motion', () => {
  it('maps the motion policy to ECharts animation options', () => {
    const def = assertValidDefinition(definitions.column);
    const off = buildOption({ definition: def, rows: [], theme: resolveTheme(), motion: resolveMotion({}, { reducedMotion: true }), locale: 'ko-KR', summary: '' });
    expect(off.option.animation).toBe(false);
    const on = build(definitions.column).option;
    expect(on).toMatchObject({ animation: true, animationDuration: 500, animationDurationUpdate: 400 });
  });
});

describe('engineOptions escape hatch', () => {
  it('deep-merges objects and merges series by index', () => {
    const def: ChartDefinition = { ...definitions.column, engineOptions: { echarts: { grid: { left: 40 }, series: [{ barMaxWidth: 12 }] } } };
    const { option } = build(def);
    expect(option.grid.left).toBe(40);
    expect(option.grid.outerBoundsMode).toBe('same');
    expect(series(option)[0]!.barMaxWidth).toBe(12);
    expect(series(option)[0]!.type).toBe('bar');
  });

  it('mergeEngineOptions ignores prototype keys', () => {
    const merged = mergeEngineOptions({ a: 1 }, JSON.parse('{"__proto__":{"x":1},"b":2}'));
    expect(merged).toEqual({ a: 1, b: 2 });
    expect(({} as Opt).x).toBeUndefined();
  });
});
