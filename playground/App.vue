<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { CvChart, type ChartDefinition, type ContentsChartDefinition, type ChartEventPayload, ECHARTS_VERSION } from '../src';
import { definitions, kpiRows } from './fixtures';
import { contentsDefinitions } from './contents-fixtures';
import SituationBoard from './views/SituationBoard.vue';
import MainScreen from './views/MainScreen.vue';
import './views/scene.css';

// `?theme=white` opens the preview in the COD-M white theme.
const controls = reactive({ motion: true, patterns: false, svg: false, live: true, oneByOne: false, tour: false, depth: new URLSearchParams(location.search).get('depth') === '1', zoom: false, light: new URLSearchParams(location.search).get('theme') === 'white' });

/** Which page to show: the component catalogue, or the same COD-M contents on the 상황판 / 메인화면. */
type View = 'components' | 'board' | 'main';
const VIEWS: { id: View; label: string }[] = [
  { id: 'components', label: '컴포넌트' },
  { id: 'board', label: '3D 상황판' },
  { id: 'main', label: '메인화면' },
];
const initialView = location.hash.slice(1) as View;
const view = ref<View>(VIEWS.some((v) => v.id === initialView) ? initialView : 'components');
function selectView(v: View) {
  view.value = v;
  history.replaceState(null, '', `#${v}`);
  charts.clear();
}
/** Host panel surface, as COD-M sets it per content (monitor_bg_color / monitor_opacity). */
const panel = reactive({ bgColor: '#0B1A33', opacity: 35 });
// COD-M white theme panels are white cards; switch the mock panel surface with the theme.
watch(() => controls.light, (light) => { panel.bgColor = light ? '#FFFFFF' : '#0B1A33'; panel.opacity = light ? 100 : 35; }, { immediate: true });

/** Every mounted chart — used by the "replay animation" button. */
type Replayable = { replayAnimation: () => void; $el?: Element };
const charts = new Set<Replayable>();
function track(el: unknown) {
  if (el) charts.add(el as Replayable);
}
const replaying = ref(false);
function replayAll() {
  for (const c of [...charts]) {
    // Function refs aren't told which instance unmounted; prune detached ones here.
    if (c.$el && !c.$el.isConnected) charts.delete(c);
    else c.replayAnimation();
  }
  replaying.value = true;
  setTimeout(() => (replaying.value = false), 3600);
}
// Draw order only shows on the entry animation — replay it so the toggle has a visible effect.
watch(() => controls.oneByOne, () => nextTick(() => controls.motion && replayAll()));
/** Normalised chart events go to the console (open DevTools to inspect them). */
function onEvent(p: ChartEventPayload) {
  console.debug('[playground]', p.chartId, p.type, p);
}

/** Apply dashboard-wide toggles to a definition (pure, reactive). */
function withControls(def: ChartDefinition): ChartDefinition {
  const engine = !['kpi', 'table', 'status-list', 'status-grid', 'text', 'progress'].includes(def.type);
  return {
    ...def,
    animation: { ...def.animation, enabled: controls.motion },
    theme: { ...def.theme, mode: controls.light ? 'light' : 'dark', effects: { ...def.theme?.effects, depth: controls.depth } },
    ...(engine ? { renderer: controls.svg ? 'svg' : 'canvas', options: { ...def.options, patterns: controls.patterns, ...(controls.tour ? { autoTour: true } : {}), ...(def.type === 'line' || def.type === 'area' ? { zoom: controls.zoom } : {}) } } : {}),
  };
}

function withContentsControls(def: ContentsChartDefinition): ContentsChartDefinition {
  return {
    ...def,
    renderer: controls.svg ? 'svg' : 'canvas',
    options: { ...def.options, ...(controls.tour ? { autoTour: true } : {}), ...(isLineLike(def) ? { zoom: controls.zoom, drawOrder: controls.oneByOne ? 'one-by-one' : 'together' } : {}) },
    animation: { ...def.animation, enabled: controls.motion },
    theme: { ...def.theme, mode: controls.light ? 'light' : 'dark', effects: { ...def.theme?.effects, depth: controls.depth } },
  };
}
function isLineLike(def: { type: string }) {
  return def.type === 'line' || def.type === 'area';
}

// Non-line contents keep their object identity on every feed tick, so only the line/area charts re-render.
const staticContents = computed(() => contentsDefinitions.map(withContentsControls));
// While "실시간 추가" is on, the line/area contents take the live feed and slide left (options.realtime).
const contentsWithControls = computed(() => staticContents.value.map((c) =>
  controls.live && isLineLike(c) ? { ...c, contentsData: feedData.value, options: { ...c.options, realtime: true } } : c));

const bubbleXY: ChartDefinition = {
  schemaVersion: '1.0.0', id: 'bubble-xy', type: 'bubble', title: 'Bubble · X / Y / 크기',
  description: 'X: 점수 · Y: 탐지 건수 · 원 크기: 영향도',
  data: {
    fields: [
      { name: 'group', type: 'string' }, { name: 'name', type: 'string' },
      { name: 'score', type: 'number', label: '점수' }, { name: 'count', type: 'number', label: '탐지 건수' },
      { name: 'impact', type: 'number', label: '영향도' },
    ],
    rows: [
      { group: '서버', name: '서버 A', score: 18, count: 28, impact: 30 },
      { group: '서버', name: '서버 B', score: 35, count: 70, impact: 75 },
      { group: '서버', name: '서버 C', score: 52, count: 45, impact: 52 },
      { group: '서버', name: '서버 D', score: 76, count: 83, impact: 92 },
      { group: '서버', name: '서버 E', score: 87, count: 36, impact: 38 },
      { group: '네트워크', name: '네트워크 A', score: 24, count: 58, impact: 48 },
      { group: '네트워크', name: '네트워크 B', score: 43, count: 19, impact: 21 },
      { group: '네트워크', name: '네트워크 C', score: 63, count: 67, impact: 69 },
      { group: '네트워크', name: '네트워크 D', score: 81, count: 56, impact: 55 },
      { group: '네트워크', name: '네트워크 E', score: 96, count: 95, impact: 98 },
      { group: '사용자', name: '사용자 A', score: 12, count: 88, impact: 40 },
      { group: '사용자', name: '사용자 B', score: 31, count: 40, impact: 34 },
      { group: '사용자', name: '사용자 C', score: 57, count: 91, impact: 80 },
      { group: '사용자', name: '사용자 D', score: 70, count: 25, impact: 28 },
      { group: '사용자', name: '사용자 E', score: 91, count: 75, impact: 65 },
    ],
  },
  encoding: { category: 'group', label: 'name', x: 'score', y: 'count', value: 'impact' },
  interactions: ['tooltip', 'selection', 'legend-toggle'],
};

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

// ── Line/area options demo ──────────────────────────────────────────────
// A COD-M style traffic content that gains one 5-minute bucket every 2 s while "실시간 추가" is on.
// Each tick passes the newest 10 buckets as fresh contentsData — the chart slides left.
const FEED_SERIES = ['INBOUND BPS', 'OUTBOUND BPS', 'INBOUND PPS', 'OUTBOUND PPS', 'SESSIONS'];
const FEED_WINDOW = 10;
const feed = reactive({ minute: 17 * 60, times: [] as string[], values: FEED_SERIES.map(() => [] as number[]) });
function pushBucket() {
  const m = feed.minute;
  feed.minute += 5;
  feed.times.push(`${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  feed.values.forEach((vals, si) => {
    const base = [190, 150, 120, 85, 55][si]!;
    const prev = vals.at(-1) ?? base;
    // Random walk pulled back toward the series' base level.
    vals.push(Math.max(5, Math.round(prev + (Math.random() - 0.5) * 40 + (base - prev) * 0.25)));
  });
  if (feed.times.length > FEED_WINDOW) { feed.times.shift(); feed.values.forEach((v) => v.shift()); }
}
for (let i = 0; i < FEED_WINDOW; i++) pushBucket();
let feedTimer: ReturnType<typeof setInterval> | undefined;
watch(() => controls.live, (on) => {
  clearInterval(feedTimer);
  if (on) feedTimer = setInterval(pushBucket, 2000);
}, { immediate: true });
const feedData = computed(() => ({
  timesArr: [...feed.times],
  data: FEED_SERIES.map((key, si) => ({ key, values: feed.values[si]!.map((y, x) => ({ x, y })) })),
}));

// ── Dashboard features demo ─────────────────────────────────────────────
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// Real-time over a time axis (1 point/s) with thresholds → scroll, panel alarm, data delay.
const latency = ref<{ t: number; p50: number; p95: number }[]>([]);
{
  const now = Date.now();
  let p50 = 120, p95 = 230;
  for (let i = 29; i >= 0; i--) {
    p50 = Math.max(60, p50 + rnd(-12, 12)); p95 = Math.max(p50 + 40, p95 + rnd(-25, 25));
    latency.value.push({ t: now - i * 1000, p50: Math.round(p50), p95: Math.round(p95) });
  }
}
function pushLatency() {
  const last = latency.value[latency.value.length - 1]!;
  // Drift with occasional spikes so the alarm thresholds (300 / 380 ms) are crossed now and then.
  const spike = Math.random() < 0.18 ? rnd(80, 160) : 0;
  const p50 = Math.max(60, Math.round(last.p50 + rnd(-12, 12) + (120 - last.p50) * 0.2));
  const p95 = Math.max(p50 + 40, Math.round(last.p95 + rnd(-25, 25) + (230 - last.p95) * 0.3 + spike));
  latency.value = [...latency.value.slice(-29), { t: Date.now(), p50, p95 }];
}
const latencyDef = computed<ChartDefinition>(() => withControls({
  schemaVersion: '1.0.0', id: 'feat-latency', type: 'line', title: 'API 응답 지연 · 실시간(시간 축)',
  description: '1초마다 추가 · 임계치 300/380ms · "실시간 추가"를 끄면 5초 뒤 데이터 지연 표시',
  data: { fields: [{ name: 't', type: 'time' }, { name: 'p50', type: 'number', label: 'p50', unit: 'ms' }, { name: 'p95', type: 'number', label: 'p95', unit: 'ms' }], rows: latency.value },
  encoding: { x: 't', y: ['p50', 'p95'] },
  options: { realtime: true, thresholds: [{ value: 300, status: 'warning', label: '주의' }, { value: 380, status: 'critical', label: '위험' }] },
  interactions: ['tooltip', 'legend-toggle'],
}));

// Top-N ranking (bar race): attack sources, re-scored every 3 s.
const SOURCES = ['185.220.101.4', '45.95.147.12', '103.75.190.8', '91.240.118.17', '61.177.172.60', '193.32.162.9', '222.186.42.7', '80.94.95.15', '159.203.88.2', '118.25.6.39', '170.64.150.3', '141.98.11.20'];
const attacks = ref(SOURCES.map((ip) => ({ ip, hits: Math.round(rnd(200, 1400)) })));
function rescoreAttacks() {
  attacks.value = attacks.value.map((a) => ({ ...a, hits: Math.max(50, Math.round(a.hits + rnd(-180, 260))) }));
}
const rankingDef = computed<ChartDefinition>(() => withControls({
  schemaVersion: '1.0.0', id: 'feat-ranking', type: 'bar', title: '공격 출발지 Top 10',
  description: 'options.ranking — 3초마다 갱신, 순위가 바뀌면 막대가 자리를 바꿉니다',
  data: { fields: [{ name: 'ip', type: 'string', label: '출발지 IP' }, { name: 'hits', type: 'number', label: '탐지', unit: '건' }], rows: attacks.value },
  encoding: { x: 'ip', y: 'hits' },
  options: { ranking: { top: 10 }, legend: false },
}));

// Device status tiles: 240 devices; a few change state every 3 s.
const LEVELS = ['정상', '정상', '정상', '정상', '정상', '정상', '정상', '정상', '정상', '정상', '정상', '주의', '주의', '위험', '정보'];
const LEVEL_KEY: Record<string, string> = { 정상: 'ok', 주의: 'warning', 위험: 'critical', 정보: 'info' };
const devices = ref(Array.from({ length: 240 }, (_, i) => {
  const kind = ['CAM', 'NVR', 'SW', 'AP'][i % 4]!;
  const lv = LEVELS[Math.floor(Math.random() * LEVELS.length)]!;
  return { name: `${kind}-${String(i + 1).padStart(3, '0')}`, level: LEVEL_KEY[lv]!, note: lv === '정상' ? '' : lv === '위험' ? '응답 없음' : lv === '주의' ? '패킷 손실 3%' : '펌웨어 업데이트 가능' };
}));
function shuffleDevices() {
  devices.value = devices.value.map((d) => (Math.random() < 0.03 ? { ...d, level: LEVEL_KEY[LEVELS[Math.floor(Math.random() * LEVELS.length)]!]! } : d));
}
const gridDef = computed<ChartDefinition>(() => withControls({
  schemaVersion: '1.0.0', id: 'feat-grid', type: 'status-grid', title: '장비 상태 · 240대',
  description: '장비 위치는 고정 · 위험은 깜빡임 · 칩으로 상태별 필터',
  data: { fields: [{ name: 'name', type: 'string' }, { name: 'level', type: 'string' }, { name: 'note', type: 'string' }], rows: devices.value },
  encoding: { title: 'name', severity: 'level', description: 'note' },
}));

// Week × hour pattern: 4 weeks of hourly event counts (busy on weekday business hours).
const weekRows = (() => {
  const out: { at: number; events: number }[] = [];
  const start = Date.now() - 28 * 86_400_000;
  for (let h = 0; h < 28 * 24; h++) {
    const at = start + h * 3_600_000;
    const d = new Date(at), wd = (d.getDay() + 6) % 7, hr = d.getHours();
    const busy = wd < 5 && hr >= 9 && hr <= 18 ? 3 : hr >= 1 && hr <= 4 ? 1.6 : 1; // night scans too
    out.push({ at, events: Math.round(rnd(4, 14) * busy) });
  }
  return out;
})();
const weekDef = computed<ChartDefinition>(() => withControls({
  schemaVersion: '1.0.0', id: 'feat-week', type: 'heatmap', title: '탐지 패턴 · 요일 × 시간',
  description: "options.pattern: 'week-hour' — 최근 4주 합계",
  data: { fields: [{ name: 'at', type: 'time' }, { name: 'events', type: 'number', label: '탐지', unit: '건' }], rows: weekRows },
  encoding: { x: 'at', value: 'events' },
  options: { pattern: 'week-hour' },
}));

let featureTimers: ReturnType<typeof setInterval>[] = [];
watch(() => controls.live, (on) => {
  featureTimers.forEach(clearInterval);
  featureTimers = on ? [setInterval(pushLatency, 1000), setInterval(rescoreAttacks, 3000), setInterval(shuffleDevices, 3000)] : [];
}, { immediate: true });

const d = computed(() => ({
  kpi: withControls(definitions.kpi!),
  errorRate: withControls(errorRateDef),
  revenue: withControls(revenueKpiDef),
  progress: withControls(definitions.progress!),
  donut: withControls(definitions.donut!),
  stacked: withControls(definitions['stacked-bar']!),
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
</script>

<template>
  <div class="pg" :class="{ 'is-light': controls.light }">
    <header class="pg-top">
      <div class="pg-brand">
        <span class="pg-logo" aria-hidden="true"><i /><i /><i /></span>
        <div>
          <h1>CODVIL Chart</h1>
          <p>Vue 3 · Apache ECharts {{ ECHARTS_VERSION }} · Cyber Neon {{ controls.light ? '· White' : '· Black' }} · MVP 22종</p>
        </div>
      </div>
      <nav class="pg-views" aria-label="화면 선택">
        <button v-for="v in VIEWS" :key="v.id" type="button" :aria-pressed="view === v.id" @click="selectView(v.id)">{{ v.label }}</button>
      </nav>
      <div class="pg-controls" role="group" aria-label="대시보드 설정">
        <template v-if="view !== 'components'">
          <label class="pg-field">패널 배경 <input v-model="panel.bgColor" type="color" /></label>
          <label class="pg-field">투명도 <input v-model.number="panel.opacity" type="range" min="0" max="100" step="5" /><span class="cv-num">{{ panel.opacity }}%</span></label>
        </template>
        <label class="pg-switch" title="선형·영역 차트에 2초마다 새 구간을 추가해 왼쪽으로 밀며 그립니다 (options.realtime)"><input v-model="controls.live" type="checkbox" /><span />실시간 추가</label>
        <label class="pg-switch" title="선형·영역 차트의 선을 한 줄씩 차례로 그립니다 (options.drawOrder: 'one-by-one')"><input v-model="controls.oneByOne" type="checkbox" /><span />한 줄씩 그리기</label>
        <label class="pg-switch" title="벽면 화면용: 몇 초마다 차트의 항목을 차례로 강조하고 값을 보여 줍니다"><input v-model="controls.tour" type="checkbox" /><span />자동 순환</label>
        <label class="pg-switch"><input v-model="controls.motion" type="checkbox" /><span />애니메이션</label>
        <label class="pg-switch"><input v-model="controls.patterns" type="checkbox" /><span />색각 보조 패턴</label>
        <label class="pg-switch"><input v-model="controls.svg" type="checkbox" /><span />SVG 렌더러</label>
        <label class="pg-switch"><input v-model="controls.depth" type="checkbox" /><span />3D 모드</label>
        <label class="pg-switch" title="선형·영역 차트 아래의 구간 탐색 슬라이더"><input v-model="controls.zoom" type="checkbox" /><span />하단 차트 검색</label>
        <label class="pg-switch"><input v-model="controls.light" type="checkbox" /><span />화이트 테마</label>
        <button
          type="button"
          class="pg-action"
          :class="{ 'is-playing': replaying }"
          :disabled="!controls.motion"
          :title="controls.motion ? '모든 차트의 진입 애니메이션을 처음부터 다시 재생합니다' : '애니메이션을 켜야 재생할 수 있습니다'"
          @click="replayAll"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.8h2.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
          애니메이션 다시 보기
        </button>
      </div>
    </header>

    <SituationBoard v-if="view === 'board'" :bg-color="panel.bgColor" :opacity="panel.opacity" :apply="withContentsControls" :track="track" />
    <MainScreen v-else-if="view === 'main'" :bg-color="panel.bgColor" :opacity="panel.opacity" :apply="withContentsControls" :track="track" />

    <main v-else class="pg-sections">
      <section class="pg-section" aria-labelledby="sec-legacy">
        <header class="pg-section__head">
          <h2 id="sec-legacy"><span class="pg-tag pg-tag--legacy">기존</span>COD-M 차트 대체 · 11종</h2>
          <p>지금 COD-M에서 하이차트로 그리는 콘텐츠 유형입니다. COD-PRO 콘텐츠 데이터를 그대로 넣습니다.</p>
        </header>
        <div class="pg-grid">
          <CvChart :ref="track" v-for="content in contentsWithControls" :key="content.id" :class="['bubble', 'word-cloud'].includes(content.type) ? 'c6' : 'c4'" :definition="content" :height="340" @point-click="onEvent" />
        </div>
      </section>

      <section class="pg-section" aria-labelledby="sec-new">
        <header class="pg-section__head">
          <h2 id="sec-new"><span class="pg-tag pg-tag--new">신규</span>추가된 차트 · 13종</h2>
          <p>COD-M에 없던 유형과 형태입니다. 단일 게이지, 다각형 레이더, X/Y 버블은 각각 기존의 다중 링 게이지, 폴라 컬럼형 spider, packed bubble과 모양이 다른 별도 형태입니다.</p>
        </header>
        <div class="pg-grid">
          <CvChart :ref="track" class="c4" :definition="d.donut" :height="320" @point-click="onEvent" @legend-toggle="onEvent" />
          <CvChart :ref="track" class="c4" :definition="d.stacked" :height="320" @legend-toggle="onEvent" />
          <CvChart :ref="track" class="c4" :definition="d.gauge" :height="320" />

          <CvChart :ref="track" class="c6" :definition="d.scatter" :height="340" @legend-toggle="onEvent" @zoom-change="onEvent" />
          <CvChart :ref="track" class="c6" :definition="withControls(bubbleXY)" :height="340" @point-click="onEvent" @legend-toggle="onEvent" />

          <CvChart :ref="track" class="c6" :definition="d.heatmap" :height="340" @point-click="onEvent" />
          <CvChart :ref="track" class="c6" :definition="d.treemap" :height="340" @point-click="onEvent" @drill-change="onEvent" />

          <CvChart :ref="track" class="c4" :definition="d.radar" :height="340" @legend-toggle="onEvent" />
          <CvChart :ref="track" class="c4" :definition="d.candlestick" :height="340" @legend-toggle="onEvent" />
          <CvChart :ref="track" class="c4" :definition="d.boxplot" :height="340" @legend-toggle="onEvent" />

          <CvChart :ref="track" class="c4" :definition="d.funnel" :height="380" @point-click="onEvent" @legend-toggle="onEvent" />
          <CvChart :ref="track" class="c4" :definition="d.sankey" :height="380" @point-click="onEvent" />
          <CvChart :ref="track" class="c4" :definition="d.sunburst" :height="380" @point-click="onEvent" />
        </div>
      </section>

      <section class="pg-section" aria-labelledby="sec-widgets">
        <header class="pg-section__head">
          <h2 id="sec-widgets"><span class="pg-tag pg-tag--new">신규</span>테이블·위젯 · 5종</h2>
          <p>차트 엔진 없이 DOM으로 그리는 위젯입니다. KPI 카드(3가지 예시), 진행률, 데이터 표, 상태 목록, 텍스트가 있습니다.</p>
        </header>
        <div class="pg-grid">
          <CvChart :ref="track" class="c3" :definition="d.kpi" @point-click="onEvent" />
          <CvChart :ref="track" class="c3" :definition="d.errorRate" />
          <CvChart :ref="track" class="c3" :definition="d.revenue" />
          <CvChart :ref="track" class="c3" :definition="d.progress" />

          <CvChart :ref="track" class="c8" :definition="d.table" :height="400" @row-click="onEvent" />
          <CvChart :ref="track" class="c4" :definition="d.status" :height="400" @item-select="onEvent" />
          <CvChart :ref="track" class="c4" :definition="d.text" :height="260" />
        </div>
      </section>

      <section class="pg-section" aria-labelledby="sec-dashboard">
        <header class="pg-section__head">
          <h2 id="sec-dashboard"><span class="pg-tag">상황판</span>관제 화면 기능</h2>
          <p>
            상단 "자동 순환"을 켜면 모든 차트가 몇 초마다 항목을 차례로 강조합니다(마우스를 올리면 멈춤).
            임계치를 넘으면 패널 테두리가 경고색으로 바뀌고(위험은 깜빡임), 실시간 데이터가 끊기면 "데이터 지연"이 표시됩니다.
          </p>
        </header>
        <div class="pg-grid">
          <CvChart :ref="track" class="c8" :definition="latencyDef" :height="300" @legend-toggle="onEvent" />
          <CvChart :ref="track" class="c4" :definition="rankingDef" :height="300" @point-click="onEvent" />
          <CvChart :ref="track" class="c6" :definition="gridDef" :height="300" @item-select="onEvent" />
          <CvChart :ref="track" class="c6" :definition="weekDef" :height="300" @point-click="onEvent" />
        </div>
      </section>
    </main>
  </div>
</template>
