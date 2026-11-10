<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { CvChart, type ChartDefinition, type ContentsChartDefinition, type ChartEventPayload, ECHARTS_VERSION } from '../src';
import { definitions, kpiRows } from './fixtures';
import { contentsDefinitions } from './contents-fixtures';

const controls = reactive({ motion: true, patterns: false, svg: true, live: true });
const log = ref<{ id: number; time: string; type: string; detail: string }[]>([]);
let seq = 0;

function onEvent(p: ChartEventPayload) {
  const detail =
    p.type === 'legend.toggle' ? `${p.name} → ${p.selected?.[p.name ?? ''] ? 'on' : 'off'}`
    : p.type === 'zoom.change' ? `${p.range?.start.toFixed(0)}% – ${p.range?.end.toFixed(0)}%`
    : p.type === 'drill.change' ? (p.path?.join(' › ') || '(root)')
    : p.row ? Object.entries(p.row).slice(0, 3).map(([k, v]) => `${k}=${String(v)}`).join(', ')
    : String(p.name ?? p.value ?? '');
  const action = p.action ? `  ⇢ ${p.action.action}${p.action.field ? `(${p.action.field})` : ''}` : '';
  log.value = [{ id: ++seq, time: new Date().toLocaleTimeString('ko-KR'), type: `${p.chartId} · ${p.type}`, detail: detail + action }, ...log.value].slice(0, 40);
}

/** Apply dashboard-wide toggles to a definition (pure, reactive). */
function withControls(def: ChartDefinition): ChartDefinition {
  const engine = !['kpi', 'table', 'status-list', 'text', 'progress'].includes(def.type);
  return {
    ...def,
    animation: { ...def.animation, enabled: controls.motion },
    ...(engine ? { renderer: controls.svg ? 'svg' : 'canvas', options: { ...def.options, patterns: controls.patterns } } : {}),
  };
}

function withContentsControls(def: ContentsChartDefinition): ContentsChartDefinition {
  return { ...def, renderer: controls.svg ? 'svg' : 'canvas', animation: { ...def.animation, enabled: controls.motion } };
}

const contentsWithControls = computed(() => contentsDefinitions.map(withContentsControls));

const errorRateDef: ChartDefinition = {
  schemaVersion: '1.0.0', id: 'kpi-error-rate', type: 'kpi', title: '결제 오류율',
  data: { fields: [{ name: 'rate', type: 'number', label: '오류율', format: 'percent', precision: 2 }], rows: [0.012, 0.011, 0.014, 0.013, 0.017, 0.016, 0.019, 0.024].map((rate) => ({ rate })) },
  encoding: { value: 'rate' }, options: { goodDirection: 'down', thresholds: [{ value: 0.02, status: 'warning' }, { value: 0.05, status: 'critical' }] },
};
const revenueKpiDef: ChartDefinition = {
  schemaVersion: '1.0.0', id: 'kpi-revenue', type: 'kpi', title: '오늘 매출',
  data: { fields: [{ name: 'today', type: 'number', label: '매출', format: 'compact', unit: '원' }, { name: 'yesterday', type: 'number' }, { name: 'h', type: 'number' }], rows: kpiRows.map((r, i) => ({ h: (r.activeUsers as number) * 1200, today: i === kpiRows.length - 1 ? 1_482_000_000 : null, yesterday: i === kpiRows.length - 1 ? 1_310_000_000 : null })) },
  encoding: { value: 'today', compare: 'yesterday', trend: 'h' },
};

const liveLine = computed<ChartDefinition>(() => ({
  ...definitions.line,
  id: 'line-latency-live',
  title: controls.live ? 'API 응답 지연 · 실시간' : 'API 응답 지연',
  description: controls.live ? '스트림 · 1초 간격 · 최근 72분' : 'p50 / p95, 최근 36시간',
  ...(controls.live
    ? { data: { fields: definitions.line.data.fields }, dataSource: { kind: 'stream', endpointId: 'latency.live', transport: 'sse', windowSize: 72, flushIntervalMs: 250 } }
    : {}),
}));

const restBar = computed<ChartDefinition>(() => ({
  ...definitions.bar,
  description: 'REST · 15초 폴링',
  data: { fields: definitions.bar.data.fields },
  dataSource: { kind: 'rest', endpointId: 'revenue.by-region', refresh: { mode: 'poll', intervalMs: 15_000 } },
}));

const d = computed(() => ({
  kpi: withControls(definitions.kpi!),
  errorRate: withControls(errorRateDef),
  revenue: withControls(revenueKpiDef),
  progress: withControls(definitions.progress!),
  line: withControls(liveLine.value),
  donut: withControls(definitions.donut!),
  area: withControls(definitions.area!),
  stacked: withControls(definitions['stacked-bar']!),
  bar: withControls(restBar.value),
  column: withControls(definitions.column!),
  pie: withControls(definitions.pie!),
  scatter: withControls(definitions.scatter!),
  heatmap: withControls(definitions.heatmap!),
  treemap: withControls(definitions.treemap!),
  gauge: withControls(definitions.gauge!),
  radar: withControls(definitions.radar!),
  candlestick: withControls(definitions.candlestick!),
  boxplot: withControls(definitions.boxplot!),
  funnel: withControls(definitions.funnel!),
  sankey: withControls(definitions.sankey!),
  sunburst: withControls(definitions.sunburst!),
  table: withControls(definitions.table!),
  status: withControls(definitions['status-list']!),
  text: withControls(definitions.text!),
}));

const brokenDef = { ...definitions.column, id: 'broken', title: '잘못된 정의 예시', encoding: { x: 'month', y: 'missingField' } };
</script>

<template>
  <div class="pg">
    <header class="pg-top">
      <div class="pg-brand">
        <span class="pg-logo" aria-hidden="true"><i /><i /><i /></span>
        <div>
          <h1>CODVIL Chart</h1>
          <p>Vue 3 · Apache ECharts {{ ECHARTS_VERSION }} · Premium Dark Blue · MVP 22종</p>
        </div>
      </div>
      <div class="pg-controls" role="group" aria-label="대시보드 설정">
        <label class="pg-switch"><input v-model="controls.live" type="checkbox" /><span />실시간 스트림</label>
        <label class="pg-switch"><input v-model="controls.motion" type="checkbox" /><span />애니메이션</label>
        <label class="pg-switch"><input v-model="controls.patterns" type="checkbox" /><span />색각 보조 패턴</label>
        <label class="pg-switch"><input v-model="controls.svg" type="checkbox" /><span />SVG 렌더러</label>
      </div>
    </header>

    <main class="pg-grid">
      <CvChart class="c3" :definition="d.kpi" @point-click="onEvent" />
      <CvChart class="c3" :definition="d.errorRate" />
      <CvChart class="c3" :definition="d.revenue" />
      <CvChart class="c3" :definition="d.progress" />

      <CvChart class="c8" :definition="d.line" :height="300" @legend-toggle="onEvent" @zoom-change="onEvent" />
      <CvChart class="c4" :definition="d.donut" :height="300" @point-click="onEvent" @legend-toggle="onEvent" />

      <CvChart class="c6" :definition="d.area" @legend-toggle="onEvent" />
      <CvChart class="c6" :definition="d.stacked" @legend-toggle="onEvent" />

      <CvChart class="c4" :definition="d.bar" @point-click="onEvent" />
      <CvChart class="c4" :definition="d.column" @point-click="onEvent" />
      <CvChart class="c4" :definition="d.pie" @point-click="onEvent" @legend-toggle="onEvent" />

      <CvChart class="c6" :definition="d.scatter" :height="340" @legend-toggle="onEvent" @zoom-change="onEvent" />
      <CvChart class="c6" :definition="d.heatmap" :height="340" @point-click="onEvent" />

      <CvChart class="c8" :definition="d.treemap" :height="340" @point-click="onEvent" @drill-change="onEvent" />
      <CvChart class="c4" :definition="d.gauge" :height="340" />

      <CvChart class="c4" :definition="d.radar" :height="340" @legend-toggle="onEvent" />
      <CvChart class="c4" :definition="d.candlestick" :height="340" @legend-toggle="onEvent" />
      <CvChart class="c4" :definition="d.boxplot" :height="340" @legend-toggle="onEvent" />

      <CvChart class="c6" :definition="d.funnel" :height="340" @point-click="onEvent" @legend-toggle="onEvent" />
      <CvChart class="c6" :definition="d.sankey" :height="400" @point-click="onEvent" />

      <CvChart class="c8" :definition="d.sunburst" :height="400" @point-click="onEvent" />

      <CvChart v-for="content in contentsWithControls" :key="content.id" class="c4" :definition="content" :height="340" @point-click="onEvent" />

      <CvChart class="c8" :definition="d.table" :height="400" @row-click="onEvent" />
      <CvChart class="c4" :definition="d.status" :height="400" @item-select="onEvent" />

      <CvChart class="c4" :definition="d.text" :height="260" />
      <CvChart class="c4" :definition="brokenDef" :height="260" />
      <section class="c4 pg-log cv-root" aria-labelledby="log-title">
        <h3 id="log-title">이벤트 로그</h3>
        <p class="pg-log__hint">차트를 클릭·범례 토글·확대·드릴다운하면 정규화된 이벤트가 표시됩니다.</p>
        <ol v-if="log.length" class="pg-log__list">
          <li v-for="e in log" :key="e.id">
            <span class="pg-log__time">{{ e.time }}</span>
            <span class="pg-log__type">{{ e.type }}</span>
            <span class="pg-log__detail">{{ e.detail }}</span>
          </li>
        </ol>
        <p v-else class="pg-log__empty">아직 이벤트가 없습니다.</p>
      </section>
    </main>
  </div>
</template>
