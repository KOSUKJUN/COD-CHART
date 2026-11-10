import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installEChartsAdapter } from '../../src/adapters/echarts/adapter';
import { echarts } from '../../src/adapters/echarts/runtime';
import { createChart, type ChartHandle } from '../../src/core/chart';
import { contentsDefinitions } from '../../playground/contents-fixtures';

const handles: ChartHandle[] = [];
beforeAll(() => installEChartsAdapter());
afterEach(() => {
  handles.splice(0).forEach(h => h.destroy());
  document.body.innerHTML = '';
});

describe('Contents charts', () => {
  it.each(contentsDefinitions)('$id renders actual SVG chart marks', async (def) => {
    const el = document.createElement('div');
    el.style.width = '640px';
    el.style.height = '340px';
    document.body.appendChild(el);
    const h = createChart(el, { ...def, renderer: 'svg' }, { reducedMotion: true });
    handles.push(h);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(h.getState().status).toBe('ready');
    const series = echarts.getInstanceByDom(el)?.getOption().series;
    expect(Array.isArray(series)).toBe(true);
    if (!Array.isArray(series)) throw new Error('차트 시리즈를 찾을 수 없습니다.');
    expect(series.length).toBeGreaterThan(0);
    for (const s of series) expect(s.data?.length).toBeGreaterThan(0);
    expect(el.querySelectorAll('svg path, svg text').length).toBeGreaterThan(0);
    if (def.id === 'contents-gauge') expect(series).toHaveLength(5);
    if (def.id === 'contents-word-cloud') expect(el.textContent).toContain('악성코드');
  });

  it('returns the correct source row for polar nodes', async () => {
    const el = document.createElement('div');
    el.style.width = '640px';
    el.style.height = '340px';
    document.body.appendChild(el);
    const definition = contentsDefinitions.find(d => d.id === 'contents-polar')!;
    const h = createChart(el, { ...definition, renderer: 'svg' }, { reducedMotion: true });
    handles.push(h);
    await new Promise(resolve => setTimeout(resolve, 50));
    const events: unknown[] = [];
    h.on('point.click', e => events.push(e));
    echarts.getInstanceByDom(el)!.trigger('click', { componentType: 'series', seriesType: 'sunburst', data: { id: '1_2' }, name: 'Korea', value: 1 } as never);
    expect(events).toEqual([expect.objectContaining({ row: expect.objectContaining({ id: '1_2', name: 'Korea', value: 1 }) })]);
  });
});
