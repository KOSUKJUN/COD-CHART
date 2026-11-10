<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue';
import type { ChartServices } from '../core/chart';
import { buildAccessibleTable, buildSummary } from '../core/a11y';
import { formatValue } from '../core/format';
import { getDescriptor } from '../core/registry';
import { resolveTheme, themeToCssVars } from '../core/theme';
import type { ChartDefinition, ChartEventName, ChartEventPayload, ChartState, Row } from '../core/types';
import type { ContentsChartDefinition } from '../core/contents';
import { useChartConfig } from './context';
import { useChart } from './useChart';
import CvDataTable from './widgets/CvDataTable.vue';
import CvKpiCard from './widgets/CvKpiCard.vue';
import CvMarkdown from './widgets/Markdown';
import CvProgress from './widgets/CvProgress.vue';
import CvStatusList from './widgets/CvStatusList.vue';

defineOptions({ name: 'CvChart' });

const props = withDefaults(
  defineProps<{
    /** CODVIL chart definition (schema v1). Validated; invalid definitions render an error state. */
    definition: ChartDefinition | ContentsChartDefinition | Record<string, unknown>;
    /** Runtime rows (overrides `definition.data.rows`). Replace the array to update. */
    data?: Row[];
    /** Host-controlled loading flag (e.g. while the parent fetches). */
    loading?: boolean;
    /** Host-controlled error message. Shown as-is; pass only safe, user-facing text. */
    error?: string | null;
    services?: ChartServices;
    /** Overrides `definition.layout.height` (px or CSS length). */
    height?: number | string;
    /** Render the card header (title / description / actions). */
    header?: boolean;
    /** Show the "data table" toggle and PNG export actions. */
    actions?: boolean;
    /** Card chrome (surface, border, padding). Disable to embed in your own card. */
    framed?: boolean;
  }>(),
  { header: true, actions: true, framed: true, error: null },
);

const emit = defineEmits<{
  ready: [payload: ChartEventPayload];
  'point-click': [payload: ChartEventPayload];
  'legend-toggle': [payload: ChartEventPayload];
  'zoom-change': [payload: ChartEventPayload];
  'drill-change': [payload: ChartEventPayload];
  'row-click': [payload: ChartEventPayload];
  'item-select': [payload: ChartEventPayload];
  'state-change': [payload: ChartEventPayload];
  error: [payload: ChartEventPayload];
}>();

defineSlots<{
  actions?: () => unknown;
  empty?: (p: { message: string }) => unknown;
  error?: (p: { message: string; correlationId?: string; retry: () => void }) => unknown;
  loading?: () => unknown;
  footer?: (p: { state: ChartState }) => unknown;
}>();

type VueEventName =
  | 'ready' | 'point-click' | 'legend-toggle' | 'zoom-change' | 'drill-change'
  | 'row-click' | 'item-select' | 'state-change' | 'error';

const VUE_EVENT: Partial<Record<ChartEventName, VueEventName>> = {
  ready: 'ready', 'point.click': 'point-click', 'legend.toggle': 'legend-toggle', 'zoom.change': 'zoom-change',
  'drill.change': 'drill-change', 'row.click': 'row-click', 'item.select': 'item-select', 'state.change': 'state-change',
  'data.error': 'error', 'render.error': 'error',
};

const config = useChartConfig();
const canvasEl = ref<HTMLElement | null>(null);
const definitionRef = toRef(props, 'definition');
const { handle, state, rows, isEngine } = useChart(canvasEl, definitionRef, {
  data: toRef(props, 'data'),
  services: toRef(props, 'services'),
  onEvent: (p) => {
    const name = VUE_EVENT[p.type];
    if (name) (emit as (n: string, p: ChartEventPayload) => void)(name, p);
  },
});

const uid = useId();
const def = computed(() => (handle.value?.getDefinition() ?? null) as ChartDefinition | null);
const raw = computed(() => props.definition as Partial<ChartDefinition>);
const descriptor = computed(() => getDescriptor(String(raw.value.type ?? '')));
const locale = computed(() => raw.value.locale ?? props.services?.locale ?? config.locale ?? 'ko-KR');
const theme = computed(() => resolveTheme({ ...config.theme, ...props.services?.theme, ...raw.value.theme }));
const cssVars = computed(() => themeToCssVars(theme.value));

const height = computed(() => {
  const h = props.height ?? raw.value.layout?.height ?? descriptor.value?.defaults.height ?? 320;
  return typeof h === 'number' ? `${h}px` : h;
});
const minHeight = computed(() => (raw.value.layout?.minHeight ? `${raw.value.layout.minHeight}px` : undefined));

const isText = computed(() => raw.value.type === 'text');
const errorMessage = computed(() => props.error ?? (state.value.status === 'error' ? state.value.message ?? '오류가 발생했습니다.' : null));
const isLoading = computed(() => props.loading || state.value.status === 'loading' || state.value.status === 'idle');
const isEmpty = computed(() => !errorMessage.value && !isLoading.value && !isText.value && rows.value.length === 0);
const blockingLoad = computed(() => isLoading.value && rows.value.length === 0 && !errorMessage.value && !isText.value);
const emptyMessage = computed(() => raw.value.options?.emptyMessage ?? '표시할 데이터가 없습니다.');
const canRetry = computed(() => !!raw.value.dataSource && raw.value.dataSource.kind !== 'static');

const showTable = ref(false);
const a11yTable = computed(() => (def.value ? buildAccessibleTable(def.value, rows.value) : null));
const summary = computed(() => (def.value ? buildSummary(def.value, rows.value, locale.value) : ''));

const widget = computed(() => {
  switch (raw.value.type) {
    case 'kpi': return CvKpiCard;
    case 'progress': return CvProgress;
    case 'status-list': return CvStatusList;
    case 'table': return CvDataTable;
    default: return null;
  }
});

function onWidgetEvent(p: Omit<ChartEventPayload, 'chartId'>) {
  const name = VUE_EVENT[p.type];
  const full: ChartEventPayload = { ...p, chartId: handle.value?.id ?? String(raw.value.id ?? ''), action: def.value?.events?.[p.type] };
  if (name) (emit as (n: string, p: ChartEventPayload) => void)(name, full);
}

function retry() {
  handle.value?.refresh();
}

function exportPng() {
  const url = handle.value?.exportImage({ type: 'png', pixelRatio: 2 });
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(raw.value.id ?? 'chart')}.png`;
  a.click();
}

defineExpose({
  /** Stable CODVIL API — the engine instance is never exposed. */
  refresh: () => handle.value?.refresh(),
  resize: (w?: number, h?: number) => handle.value?.resize(w, h),
  setData: (r: Row[]) => handle.value?.setData(r),
  appendData: (r: Row[], windowSize?: number) => handle.value?.appendData(r, windowSize),
  exportImage: (o?: Parameters<NonNullable<typeof handle.value>['exportImage']>[0]) => handle.value?.exportImage(o) ?? null,
  getState: () => state.value,
  getIssues: () => handle.value?.getIssues() ?? [],
});
</script>

<template>
  <section
    class="cv-root cv-chart"
    :class="[`cv-chart--${raw.type}`, { 'cv-chart--framed': framed, 'is-table': showTable }]"
    :style="cssVars"
    role="figure"
    :aria-labelledby="raw.title ? `${uid}-title` : undefined"
    :aria-label="raw.title ? undefined : descriptor?.displayName"
    :aria-describedby="`${uid}-summary`"
    :aria-busy="isLoading"
  >
    <header v-if="header && (raw.title || raw.description || actions || $slots.actions)" class="cv-chart__header">
      <div class="cv-chart__heading">
        <h3 v-if="raw.title" :id="`${uid}-title`" class="cv-chart__title">{{ raw.title }}</h3>
        <p v-if="raw.description" class="cv-chart__desc">{{ raw.description }}</p>
      </div>
      <div class="cv-chart__actions">
        <span v-if="isLoading && rows.length > 0" class="cv-live" role="status">
          <span class="cv-live__dot" aria-hidden="true" />갱신 중
        </span>
        <slot name="actions" />
        <template v-if="actions && !isText">
          <button
            type="button"
            class="cv-btn cv-btn--icon"
            :aria-pressed="showTable"
            :title="showTable ? '차트 보기' : '데이터 표 보기'"
            :aria-label="showTable ? '차트 보기' : '데이터 표 보기'"
            @click="showTable = !showTable"
          >
            <svg v-if="!showTable" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3.5h12M2 8h12M2 12.5h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" /></svg>
            <svg v-else viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5V9M6.5 13.5V4M10.5 13.5V7M14 13.5H2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" /></svg>
          </button>
          <button v-if="isEngine" type="button" class="cv-btn cv-btn--icon" title="PNG로 저장" aria-label="PNG로 저장" :disabled="rows.length === 0" @click="exportPng">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8m0 0L4.75 7.25M8 10.5l3.25-3.25M2.5 13.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
          </button>
        </template>
      </div>
    </header>

    <div class="cv-chart__body" :style="{ height, minHeight }">
      <!-- Engine canvas stays mounted under overlays and the table view. -->
      <div v-if="isEngine" ref="canvasEl" class="cv-chart__canvas" :class="{ 'is-hidden': showTable }" />
      <div v-if="!showTable" class="cv-chart__widget">
        <div v-if="isText" class="cv-text"><CvMarkdown :source="raw.options?.content ?? ''" /></div>
        <component
          :is="widget"
          v-else-if="widget && def && rows.length > 0"
          :definition="def"
          :rows="rows"
          :locale="locale"
          @event="onWidgetEvent"
        />
      </div>

      <div v-if="showTable && a11yTable" class="cv-chart__table">
        <table class="cv-table cv-table--compact">
          <caption class="cv-sr-only">{{ a11yTable.caption }}</caption>
          <thead>
            <tr><th v-for="c in a11yTable.columns" :key="c.key" scope="col" :class="{ 'is-num': c.numeric }">{{ c.label }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in a11yTable.rows" :key="i">
              <td v-for="c in a11yTable.columns" :key="c.key" :class="{ 'is-num': c.numeric }">{{ formatValue(r[c.key], c.field, { locale }) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="a11yTable.truncated" class="cv-chart__note">처음 {{ a11yTable.rows.length }}개 / 전체 {{ a11yTable.totalRows.toLocaleString() }}개 행</p>
      </div>

      <Transition name="cv-fade">
        <div v-if="blockingLoad" class="cv-overlay cv-overlay--loading" role="status" aria-label="불러오는 중">
          <slot name="loading">
            <div class="cv-skeleton" :class="`cv-skeleton--${descriptor?.family ?? 'cartesian'}`" aria-hidden="true">
              <span v-for="i in 7" :key="i" :style="{ '--i': i }" />
            </div>
          </slot>
        </div>
        <div v-else-if="errorMessage" class="cv-overlay cv-overlay--error" role="alert">
          <slot name="error" :message="errorMessage" :correlation-id="state.correlationId" :retry="retry">
            <div class="cv-state">
              <span class="cv-state__icon cv-status--critical" aria-hidden="true">!</span>
              <p class="cv-state__msg">{{ errorMessage }}</p>
              <p v-if="state.correlationId" class="cv-state__meta">추적 ID: <code>{{ state.correlationId }}</code></p>
              <button v-if="canRetry" type="button" class="cv-btn" @click="retry">다시 시도</button>
            </div>
          </slot>
        </div>
        <div v-else-if="isEmpty && !showTable" class="cv-overlay cv-overlay--empty">
          <slot name="empty" :message="emptyMessage">
            <div class="cv-state">
              <svg class="cv-state__art" viewBox="0 0 48 32" aria-hidden="true"><path d="M4 28h40M10 22v6M18 16v12M26 20v8M34 12v16" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" stroke-dasharray="2 3" /></svg>
              <p class="cv-state__msg">{{ emptyMessage }}</p>
            </div>
          </slot>
        </div>
      </Transition>
    </div>

    <p :id="`${uid}-summary`" class="cv-sr-only">{{ summary }}</p>

    <footer v-if="state.warnings.length || $slots.footer" class="cv-chart__footer">
      <slot name="footer" :state="state">
        <details class="cv-notices">
          <summary><span aria-hidden="true">ⓘ</span> 알림 {{ state.warnings.length }}건</summary>
          <ul><li v-for="(w, i) in state.warnings" :key="i">{{ w }}</li></ul>
        </details>
      </slot>
    </footer>
  </section>
</template>
