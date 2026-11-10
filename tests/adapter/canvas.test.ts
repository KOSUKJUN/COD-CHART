import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type * as Runtime from '../../src/adapters/echarts/runtime';

vi.mock('../../src/adapters/echarts/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof Runtime>();
  return {
    ...actual,
    echarts: {
      ...actual.echarts,
      init: vi.fn((el, theme, opts) => actual.echarts.init(el, theme, { ...opts, renderer: 'svg' })),
    },
  };
});

import { installEChartsAdapter } from '../../src/adapters/echarts/adapter';
import { echarts } from '../../src/adapters/echarts/runtime';
import { createChart } from '../../src/core/chart';
import { definitions } from '../../playground/fixtures';

beforeAll(() => installEChartsAdapter());
afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

it('disables dirty rectangle rendering for canvas while preserving selection', async () => {
  const el = document.createElement('div');
  el.style.width = '640px';
  el.style.height = '320px';
  document.body.appendChild(el);
  const chart = createChart(el, { ...definitions.column, renderer: 'canvas' }, { reducedMotion: true });
  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chart.getState().status).toBe('ready');
    expect(echarts.init).toHaveBeenCalledWith(el, null, expect.objectContaining({ renderer: 'canvas', useDirtyRect: false }));
    const instance = echarts.getInstanceByDom(el)!;
    instance.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex: 0 });
    expect(instance.getOption()).toMatchObject({ series: [{ selectedMap: { '1월': true } }] });
  } finally {
    chart.destroy();
  }
});
