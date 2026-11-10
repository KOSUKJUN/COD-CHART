import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installEChartsAdapter } from '../../src/adapters/echarts/adapter';
import { echarts } from '../../src/adapters/echarts/runtime';
import { createChart, type ChartHandle } from '../../src/core/chart';
import type { ChartEventPayload, ChartType } from '../../src/core/types';
import { definitions, type DemoChartType } from '../../playground/fixtures';

const ECHARTS_TYPES: DemoChartType[] = ['line', 'area', 'bar', 'stacked-bar', 'column', 'pie', 'donut', 'gauge', 'scatter', 'heatmap', 'treemap', 'radar', 'candlestick', 'boxplot', 'funnel', 'sankey', 'sunburst'];
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

function container() {
  const el = document.createElement('div');
  el.style.width = '640px';
  el.style.height = '320px';
  document.body.appendChild(el);
  return el;
}

const handles: ChartHandle[] = [];
beforeAll(() => installEChartsAdapter());
afterEach(() => {
  handles.splice(0).forEach((h) => h.destroy());
  document.body.innerHTML = '';
});

// jsdom has no canvas; the SVG renderer exercises the real ECharts pipeline.
const svg = (type: DemoChartType) => ({ ...definitions[type], renderer: 'svg' as const });

describe('createChart + EChartsAdapter (SVG renderer, jsdom)', () => {
  it.each(ECHARTS_TYPES)('%s: mounts, updates, resizes and destroys without leaks', async (type) => {
    const el = container();
    const h = createChart(el, svg(type), { reducedMotion: true });
    handles.push(h);
    const ready = vi.fn();
    h.on('ready', ready);
    await nextFrame();
    expect(h.getState().status).toBe('ready');
    expect(ready).toHaveBeenCalledTimes(1);
    const inst = echarts.getInstanceByDom(el);
    expect(inst).toBeDefined();
    expect(el.querySelector('svg')).not.toBeNull();
    const expectedSeries: Partial<Record<ChartType, string>> = { radar: 'radar', candlestick: 'candlestick', boxplot: 'boxplot', funnel: 'funnel', sankey: 'sankey', sunburst: 'sunburst' };
    if (expectedSeries[type]) {
      const option = inst!.getOption() as { series: { type: string; data?: unknown[]; nodes?: unknown[] }[] };
      expect(option.series[0]!.type).toBe(expectedSeries[type]);
      expect((option.series[0]!.data ?? option.series[0]!.nodes)!.length).toBeGreaterThan(0);
    }

    h.setData(h.getRows().slice(0, 3));
    await nextFrame();
    expect(echarts.getInstanceByDom(el)).toBe(inst); // data updates never re-create the instance
    h.resize(400, 200);

    h.destroy();
    expect(echarts.getInstanceByDom(el)).toBeUndefined();
    expect(h.isDestroyed()).toBe(true);
    h.setData([]); // no-op after destroy, never throws
  });

  it('structural changes reuse the instance; type changes within the engine swap the adapter', async () => {
    const el = container();
    const h = createChart(el, svg('column'), { reducedMotion: true });
    handles.push(h);
    await nextFrame();
    const inst = echarts.getInstanceByDom(el);
    h.update({ ...svg('column'), title: 'Renamed', options: { labels: false } });
    await nextFrame();
    expect(echarts.getInstanceByDom(el)).toBe(inst);
    h.update(svg('pie'));
    await nextFrame();
    expect(echarts.getInstanceByDom(el)).toBeDefined();
    expect(h.getDefinition()!.type).toBe('pie');
  });

  it('coalesces a burst of updates into one render', async () => {
    const el = container();
    const h = createChart(el, svg('line'), { reducedMotion: true });
    handles.push(h);
    await nextFrame();
    const renders = vi.fn();
    h.onRender(renders);
    for (let i = 0; i < 50; i++) h.appendData([{ timestamp: Date.now() + i * 1000, p50: i, p95: i * 2 }], 100);
    await nextFrame();
    expect(renders).toHaveBeenCalledTimes(1);
    expect(h.getRows().length).toBeLessThanOrEqual(100);
  });

  it('invalid definitions produce an error state, never an exception', async () => {
    const el = container();
    const errors: ChartEventPayload[] = [];
    const h = createChart(el, { ...svg('line'), encoding: { x: 'nope' } });
    handles.push(h);
    h.on('data.error', (e) => errors.push(e));
    expect(h.getState().status).toBe('error');
    expect(h.getState().message).toMatch(/encoding/);
    expect(echarts.getInstanceByDom(el)).toBeUndefined();
  });

  it('empty data → empty state with the configured message', async () => {
    const h = createChart(container(), { ...svg('column'), data: { ...definitions.column.data, rows: [] }, options: { emptyMessage: '없음' } });
    handles.push(h);
    await nextFrame();
    expect(h.getState()).toMatchObject({ status: 'empty', message: '없음' });
  });

  it('loads through the host data service and reports loading → ready', async () => {
    const statuses: string[] = [];
    const fetch = vi.fn(async () => ({ rows: definitions.column.data.rows! }));
    const def = { ...svg('column'), data: { fields: definitions.column.data.fields }, dataSource: { kind: 'rest' as const, endpointId: 'signups.monthly' } };
    const h = createChart(container(), def, { fetch, reducedMotion: true });
    handles.push(h);
    h.on('state.change', (p) => statuses.push(p.state!.status));
    await nextFrame();
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ endpointId: 'signups.monthly' }));
    expect(statuses).toContain('ready');
    expect(h.getRows()).toHaveLength(12);
  });

  it('attaches declarative actions to events and isolates handler failures', async () => {
    const el = container();
    const h = createChart(el, svg('bar'), { reducedMotion: true });
    handles.push(h);
    await nextFrame();
    const seen: ChartEventPayload[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.on('point.click', () => { throw new Error('consumer bug'); });
    h.on('point.click', (p) => seen.push(p));
    echarts.getInstanceByDom(el)!.trigger('click', { componentType: 'series', seriesType: 'bar', seriesIndex: 0, dataIndex: 1, name: '경기', value: 1 } as never);
    expect(seen[0]).toMatchObject({ type: 'point.click', chartId: 'bar-region', row: { region: '경기' }, action: { action: 'filter-dashboard', field: 'region' } });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('exports PNG/SVG only when the renderer supports it', async () => {
    const el = container();
    const h = createChart(el, svg('column'), { reducedMotion: true });
    handles.push(h);
    await nextFrame();
    expect(h.exportImage({ type: 'svg' })).toMatch(/^data:image\/svg/);
  });
});
