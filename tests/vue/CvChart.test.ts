import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { CvChart, createCodvilChart } from '../../src';
import { echarts } from '../../src/adapters/echarts/runtime';
import { definitions, MVP_TYPES, type DemoChartType } from '../../playground/fixtures';
import type { ChartType } from '../../src/core/types';

const frame = () => new Promise((r) => setTimeout(r, 30));
const wrappers: VueWrapper[] = [];

beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
});
afterAll(() => vi.restoreAllMocks());

function render(definition: unknown, props: Record<string, unknown> = {}) {
  const w = mount(CvChart, {
    props: { definition: definition as Record<string, unknown>, ...props },
    attachTo: document.body,
    global: { plugins: [createCodvilChart({ reducedMotion: true })] },
  });
  wrappers.push(w);
  return w;
}
const svg = (type: DemoChartType) => ({ ...definitions[type], ...((['kpi', 'table', 'status-list', 'text', 'progress'] as ChartType[]).includes(type) ? {} : { renderer: 'svg' }) });

afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
});

describe('<CvChart> renders all 16 MVP components', () => {
  it.each(MVP_TYPES)('%s', async (type) => {
    const w = render(svg(type));
    await frame();
    await flushPromises();
    expect(w.find('.cv-chart__title').text()).toBe(definitions[type]!.title);
    expect(w.attributes('role')).toBe('figure');
    expect(w.find('.cv-overlay--error').exists()).toBe(false);
    expect(w.find('.cv-overlay--loading').exists()).toBe(false);
    expect(w.find('.cv-sr-only').text().length).toBeGreaterThan(3); // a11y summary
    expect(w.element.getAttribute('style')).toContain('--cv-bg-surface');
  });
});

describe('native widgets', () => {
  it('KPI shows value, unit, delta with screen-reader text', async () => {
    const w = render(definitions.kpi);
    await frame();
    expect(w.find('.cv-kpi__unit').text()).toBe('명');
    expect(w.find('.cv-delta').attributes('aria-label')).toMatch(/이전 대비/);
    expect(w.find('.cv-kpi__spark path').exists()).toBe(true);
  });

  it('table sorts on header click (aria-sort) and emits row-click', async () => {
    const w = render(definitions.table);
    await frame();
    const amountTh = w.findAll('th').find((th) => th.text().includes('금액'))!;
    await amountTh.find('button').trigger('click');
    expect(amountTh.attributes('aria-sort')).toBe('descending');
    const amounts = w.findAll('tbody tr').map((tr) => Number(tr.findAll('td')[2]!.text().replace(/[^\d]/g, '')));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(w.findAll('tbody tr')).toHaveLength(8);
    await w.find('tbody tr').trigger('click');
    expect(w.emitted('row-click')?.[0]?.[0]).toMatchObject({ type: 'row.click', chartId: 'table-orders' });
    await w.find('[aria-label="다음 페이지"]').trigger('click');
    expect(w.find('[aria-current="page"]').text()).toBe('2 / 5');
  });

  it('status list: icon + label badges, severity filter, selection event', async () => {
    const w = render(definitions['status-list']);
    await frame();
    const first = w.find('.cv-status__item');
    expect(first.find('.cv-status-badge').text()).toMatch(/▲\s*Critical/);
    expect(first.find('time').attributes('datetime')).toMatch(/Z$/);
    await w.findAll('.cv-chip').find((c) => c.text().includes('Warning'))!.trigger('click');
    expect(w.findAll('.cv-status__item').every((i) => i.classes('cv-level--warning'))).toBe(true);
    await w.find('.cv-status__item').trigger('click');
    expect(w.emitted('item-select')?.[0]?.[0]).toMatchObject({ type: 'item.select', value: 'warning' });
  });

  it('text card renders markdown without executing or inserting HTML', async () => {
    const w = render({ ...definitions.text, options: { content: '**bold** <img src=x onerror="window.__xss=1"><script>window.__xss=2</script> [x](javascript:alert(1))' } });
    await frame();
    expect(w.find('.cv-md strong').text()).toBe('bold');
    expect(w.find('.cv-md img').exists()).toBe(false);
    expect(w.find('.cv-md script').exists()).toBe(false);
    expect(w.find('.cv-md a').exists()).toBe(false);
    expect((window as { __xss?: number }).__xss).toBeUndefined();
    expect(w.find('.cv-overlay--empty').exists()).toBe(false);
  });

  it('progress exposes progressbar semantics and status', async () => {
    const w = render(definitions.progress);
    await frame();
    const bar = w.find('[role="progressbar"]');
    expect(bar.attributes('aria-valuenow')).toBe('8420000');
    expect(bar.attributes('aria-valuetext')).toMatch(/Warning/);
    expect(w.findAll('.cv-progress__marker')).toHaveLength(2);
  });
});

describe('states', () => {
  it('invalid definition → error overlay with the validation message; dashboard keeps working', async () => {
    const bad = render({ ...definitions.column, encoding: { x: 'month', y: 'month' } });
    const good = render(svg('column'));
    await frame();
    expect(bad.find('.cv-overlay--error').text()).toMatch(/number 필드/);
    expect(good.find('.cv-overlay--error').exists()).toBe(false);
  });

  it('empty data → empty overlay; host loading flag → skeleton', async () => {
    const w = render(svg('column'), { data: [] });
    await frame();
    expect(w.find('.cv-overlay--empty').exists()).toBe(true);
    await w.setProps({ loading: true });
    expect(w.find('.cv-overlay--loading').exists()).toBe(true);
  });

  it('skeleton stays invisible for fast loads and reveals only after 400ms', async () => {
    vi.useFakeTimers();
    try {
      const w = render(svg('column'), { data: [], loading: true });
      await w.vm.$nextTick();
      const overlay = () => w.find('.cv-overlay--loading');
      expect(overlay().exists()).toBe(true); // announced to AT immediately
      expect(overlay().classes()).not.toContain('is-revealed');
      vi.advanceTimersByTime(399);
      await w.vm.$nextTick();
      expect(overlay().classes()).not.toContain('is-revealed');
      vi.advanceTimersByTime(1);
      await w.vm.$nextTick();
      expect(overlay().classes()).toContain('is-revealed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('data service errors show a safe message, trace id and retry', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(Object.assign(new Error('internal stack'), {})).mockResolvedValue({ rows: definitions.column.data.rows });
    const def = { ...svg('column'), data: { fields: definitions.column.data.fields }, dataSource: { kind: 'rest', endpointId: 'signups' } };
    const w = render(def, { services: { fetch } });
    await frame();
    await flushPromises();
    expect(w.find('.cv-overlay--error').text()).toMatch(/불러오지 못했습니다/);
    expect(w.text()).not.toMatch(/internal stack/);
    await w.find('.cv-overlay--error button').trigger('click');
    await flushPromises();
    await frame();
    expect(w.find('.cv-overlay--error').exists()).toBe(false);
  });

  it('table toggle swaps in an accessible data table', async () => {
    const w = render(svg('line'));
    await frame();
    await w.find('[aria-label="데이터 표 보기"]').trigger('click');
    expect(w.find('.cv-chart__table table').exists()).toBe(true);
    expect(w.findAll('.cv-chart__table thead th').map((t) => t.text())).toEqual(['timestamp', 'p50', 'p95']);
  });
});

describe('reactivity & lifecycle', () => {
  it('data prop updates patch the same ECharts instance', async () => {
    const w = render(svg('column'), { data: definitions.column.data.rows });
    await frame();
    const el = w.find('.cv-chart__canvas').element as HTMLElement;
    const inst = echarts.getInstanceByDom(el);
    await w.setProps({ data: definitions.column.data.rows!.slice(0, 4) });
    await frame();
    expect(echarts.getInstanceByDom(el)).toBe(inst);
  });

  it('switching from an engine chart to a native widget re-creates the handle', async () => {
    const w = render(svg('column'));
    await frame();
    await w.setProps({ definition: definitions.kpi });
    await nextTick();
    await frame();
    expect(w.find('.cv-kpi').exists()).toBe(true);
    expect(w.find('.cv-chart__canvas').exists()).toBe(false);
  });

  it('unmount disposes the ECharts instance', async () => {
    const w = render(svg('pie'));
    await frame();
    const el = w.find('.cv-chart__canvas').element as HTMLElement;
    expect(echarts.getInstanceByDom(el)).toBeDefined();
    w.unmount();
    wrappers.splice(wrappers.indexOf(w), 1);
    expect(echarts.getInstanceByDom(el)).toBeUndefined();
  });

  it('exposes only the stable CODVIL handle API', async () => {
    const w = render(svg('column'));
    await frame();
    const api = w.vm as unknown as Record<string, unknown>;
    for (const k of ['refresh', 'resize', 'setData', 'appendData', 'exportImage', 'getState', 'getIssues']) expect(typeof api[k]).toBe('function');
    expect(api.chart).toBeUndefined();
  });
});
