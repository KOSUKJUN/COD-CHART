import {
  computed, nextTick, onBeforeUnmount, onMounted, shallowRef, toRaw, watch, type Ref, type ShallowRef,
} from 'vue';
import { createChart, type ChartHandle, type ChartServices } from '../core/chart';
import { getDescriptor } from '../core/registry';
import type { ChartEventHandler, ChartState, Row } from '../core/types';
import { useChartConfig } from './context';

export interface UseChartOptions {
  /** Runtime rows. Compared by reference — replace the array (or use `appendData`) to update. */
  data?: Ref<Row[] | undefined>;
  services?: Ref<ChartServices | undefined>;
  /** Receives every normalised event. */
  onEvent?: ChartEventHandler;
}

export interface UseChartReturn {
  handle: ShallowRef<ChartHandle | null>;
  state: ShallowRef<ChartState>;
  rows: ShallowRef<Row[]>;
  /** True when the definition renders through an engine (needs a container element). */
  isEngine: Ref<boolean>;
}

/** Definitions are JSON; strip Vue proxies so the core sees plain data. */
function plain<T>(v: T): T {
  try {
    return structuredClone(toRaw(v));
  } catch {
    return JSON.parse(JSON.stringify(v)) as T;
  }
}

/**
 * Owns a ChartHandle for the component's lifetime. Created on mount (client only —
 * SSR-safe), destroyed on unmount, releasing the engine instance, observers, timers
 * and data subscriptions. Re-created only if the rendering engine/renderer changes.
 */
export function useChart(
  container: Ref<HTMLElement | null | undefined>,
  definition: Ref<unknown>,
  options: UseChartOptions = {},
): UseChartReturn {
  const config = useChartConfig();
  const handle = shallowRef<ChartHandle | null>(null);
  const state = shallowRef<ChartState>({ status: 'idle', warnings: [] });
  const rows = shallowRef<Row[]>([]);
  let offs: (() => void)[] = [];
  let mounted = false;

  const engineKey = computed(() => {
    const d = definition.value as { type?: string; renderer?: string } | null;
    const engine = getDescriptor(d?.type ?? '')?.engine ?? 'invalid';
    return engine === 'echarts' ? `echarts:${d?.renderer ?? 'canvas'}` : engine;
  });
  const isEngine = computed(() => engineKey.value.startsWith('echarts'));

  const teardown = () => {
    offs.splice(0).forEach((off) => off());
    handle.value?.destroy();
    handle.value = null;
  };

  const create = () => {
    teardown();
    const svc = options.services?.value;
    const services: ChartServices = {
      ...config, ...svc,
      theme: { ...config.theme, ...svc?.theme, overrides: { ...config.theme?.overrides, ...svc?.theme?.overrides } },
    };
    const headless = !isEngine.value;
    const h = createChart(headless ? null : container.value ?? null, plain(definition.value), services, { headless });
    handle.value = h;
    state.value = h.getState();
    offs = [
      h.on('state.change', (p) => (state.value = p.state ?? h.getState())),
      h.onRender(() => (rows.value = h.getRows())),
    ];
    if (options.onEvent) offs.push(h.on('*', options.onEvent));
    if (options.data?.value) h.setData(toRaw(options.data.value));
  };

  onMounted(() => {
    mounted = true;
    create();
  });

  // Engine switch (e.g. 'line' → 'kpi'): wait for the template to swap the container.
  watch(engineKey, async () => {
    if (!mounted) return;
    await nextTick();
    create();
  });

  // Definition: deep-watched, but the core diffs a structural key, so cosmetic churn
  // never re-creates the engine instance; data-only changes merge and tween.
  watch(definition, (d) => handle.value?.update(plain(d)), { deep: true });
  if (options.data) watch(options.data, (d) => d && handle.value?.setData(toRaw(d)));

  onBeforeUnmount(() => {
    mounted = false;
    teardown();
  });

  return { handle, state, rows, isEngine };
}
