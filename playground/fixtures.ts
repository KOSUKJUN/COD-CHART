/**
 * Deterministic fixtures for the 16 MVP components. Shared by the playground and tests.
 * Data is synthetic (seeded PRNG) — no real customer or security data.
 */
import type { ChartDefinition, ChartType, Row } from '../src/core/types';

export function rng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE = Date.UTC(2026, 10, 10, 0, 0, 0);
const HOUR = 3_600_000;

export function trafficSeries(hours = 48, seed = 7): Row[] {
  const r = rng(seed);
  const out: Row[] = [];
  for (let h = 0; h < hours; h++) {
    const t = new Date(BASE - (hours - h) * HOUR).toISOString();
    const daily = Math.sin(((h % 24) / 24) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5;
    out.push({ timestamp: t, service: 'API', rps: Math.round(820 + daily * 1400 + r() * 160) });
    out.push({ timestamp: t, service: 'Web', rps: Math.round(540 + daily * 900 + r() * 120) });
    out.push({ timestamp: t, service: 'Batch', rps: Math.round(260 + (1 - daily) * 380 + r() * 80) });
  }
  return out;
}

export const latencyRows = (n = 36, seed = 11): Row[] => {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    timestamp: new Date(BASE - (n - i) * HOUR).toISOString(),
    p50: Math.round(80 + r() * 20 + Math.sin(i / 4) * 10),
    p95: Math.round(210 + r() * 60 + Math.sin(i / 4) * 35 + (i > 26 && i < 31 ? 140 : 0)),
  }));
};

export const regionRevenue: Row[] = [
  { region: '서울', revenue: 482_000_000 },
  { region: '경기', revenue: 391_500_000 },
  { region: '부산', revenue: 176_200_000 },
  { region: '대구', revenue: 121_800_000 },
  { region: '인천', revenue: 118_400_000 },
  { region: '광주', revenue: 84_100_000 },
  { region: '대전', revenue: 79_600_000 },
];

export const quarterlyByChannel: Row[] = ['Q1', 'Q2', 'Q3', 'Q4'].flatMap((q, qi) => [
  { quarter: `2026 ${q}`, channel: '온라인', orders: 4200 + qi * 650 },
  { quarter: `2026 ${q}`, channel: '매장', orders: 3100 + qi * 120 },
  { quarter: `2026 ${q}`, channel: '파트너', orders: 1400 + qi * 380 },
  { quarter: `2026 ${q}`, channel: '기업영업', orders: 900 + qi * 210 },
]);

export const monthlySignups: Row[] = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'].map((m, i) => ({
  month: m,
  signups: Math.round(1800 + i * 140 + Math.sin(i / 1.7) * 380),
}));

export const severityShare: Row[] = [
  { severity: 'Critical', count: 38 },
  { severity: 'High', count: 112 },
  { severity: 'Medium', count: 264 },
  { severity: 'Low', count: 431 },
  { severity: 'Info', count: 157 },
];

export const browserShare: Row[] = [
  { browser: 'Chrome', sessions: 61_200 },
  { browser: 'Safari', sessions: 18_900 },
  { browser: 'Edge', sessions: 11_400 },
  { browser: 'Samsung', sessions: 5_300 },
  { browser: 'Firefox', sessions: 2_600 },
  { browser: '기타', sessions: 1_100 },
];

export function scatterRows(n = 160, seed = 3): Row[] {
  const r = rng(seed);
  const tiers = ['Enterprise', 'Growth', 'Starter'];
  return Array.from({ length: n }, (_, i) => {
    const tier = tiers[i % 3]!;
    const base = tier === 'Enterprise' ? 3 : tier === 'Growth' ? 1.6 : 0.6;
    const seats = Math.round((5 + r() * 95) * base);
    return { account: `ACC-${1000 + i}`, tier, seats, arr: Math.round(seats * (900 + r() * 700) * (0.7 + base * 0.2)), tickets: Math.round(2 + r() * 40) };
  });
}

export function heatmapRows(seed = 5): Row[] {
  const r = rng(seed);
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const out: Row[] = [];
  days.forEach((d, di) => {
    for (let h = 0; h < 24; h += 2) {
      const work = di < 5 && h >= 8 && h <= 20 ? 1 : 0.35;
      out.push({ day: d, hour: `${String(h).padStart(2, '0')}시`, events: Math.round((30 + r() * 70) * work + (h === 14 && di === 2 ? 60 : 0)) });
    }
  });
  return out;
}

export const storageTree: Row[] = [
  ['Production', 'Database', 'orders', 920], ['Production', 'Database', 'users', 410], ['Production', 'Database', 'events', 1280],
  ['Production', 'Object storage', 'media', 1650], ['Production', 'Object storage', 'backups', 780],
  ['Production', 'Cache', 'redis', 160],
  ['Analytics', 'Warehouse', 'clickhouse', 2100], ['Analytics', 'Warehouse', 'raw-logs', 1350], ['Analytics', 'Lake', 'parquet', 990],
  ['Staging', 'Database', 'orders', 210], ['Staging', 'Object storage', 'media', 330],
  ['Shared', 'Logs', 'app', 540], ['Shared', 'Logs', 'audit', 280], ['Shared', 'Artifacts', 'images', 460],
].map(([env, tier, name, gb]) => ({ env, tier, name, gb }));

export function alertRows(now = BASE): Row[] {
  return [
    { title: 'API 게이트웨이 p95 지연 임계 초과', severity: 'critical', at: new Date(now - 4 * 60_000).toISOString(), source: 'gw-prod-02 · 812ms > 500ms' },
    { title: '결제 서비스 오류율 상승', severity: 'warning', at: new Date(now - 18 * 60_000).toISOString(), source: 'payments · 2.4%' },
    { title: '비정상 로그인 시도 급증', severity: 'critical', at: new Date(now - 26 * 60_000).toISOString(), source: 'auth · 1,240건 / 5분' },
    { title: '디스크 사용률 82%', severity: 'warning', at: new Date(now - 52 * 60_000).toISOString(), source: 'db-replica-1' },
    { title: '인증서 30일 내 만료 예정', severity: 'info', at: new Date(now - 3 * HOUR).toISOString(), source: '*.example.com' },
    { title: '야간 배치 완료', severity: 'ok', at: new Date(now - 6 * HOUR).toISOString(), source: 'etl-nightly · 42분' },
    { title: '캐시 적중률 저하', severity: 'info', at: new Date(now - 7 * HOUR).toISOString(), source: 'redis · 71%' },
  ];
}

export const orderTable: Row[] = Array.from({ length: 37 }, (_, i) => {
  const r = rng(100 + i);
  const statuses = ['결제완료', '배송중', '배송완료', '환불요청'];
  return {
    orderId: `ORD-${String(240000 + i * 7).padStart(6, '0')}`,
    customer: ['김하늘', '이도윤', '박서연', '최지호', '정유나', '강민준', '윤채원'][i % 7],
    amount: Math.round(18_000 + r() * 420_000),
    items: 1 + Math.floor(r() * 6),
    status: statuses[Math.floor(r() * 4)],
    orderedAt: new Date(BASE - i * 2.3 * HOUR).toISOString(),
  };
});

export const kpiRows: Row[] = latencyRows(24, 21).map((r, i) => ({ timestamp: r.timestamp, activeUsers: 12_000 + i * 140 + Math.round(Math.sin(i / 3) * 600) }));

const v = '1.0.0';

export const definitions = {
  kpi: {
    schemaVersion: v, id: 'kpi-active-users', type: 'kpi', title: '동시 접속자',
    data: { fields: [{ name: 'timestamp', type: 'time' }, { name: 'activeUsers', type: 'number', label: '동시 접속자', unit: '명', format: 'integer' }], rows: kpiRows },
    encoding: { value: 'activeUsers' }, options: { goodDirection: 'up' }, interactions: ['selection'],
  },
  line: {
    schemaVersion: v, id: 'line-latency', type: 'line', title: 'API 응답 지연', description: 'p50 / p95, 최근 36시간',
    data: { fields: [{ name: 'timestamp', type: 'time', role: 'time' }, { name: 'p50', type: 'number', label: 'p50', unit: 'ms' }, { name: 'p95', type: 'number', label: 'p95', unit: 'ms' }], rows: latencyRows() },
    encoding: { x: 'timestamp', y: ['p50', 'p95'] },
    options: { thresholds: [{ value: 300, label: 'SLO 300ms', status: 'warning' }] },
    interactions: ['tooltip', 'legend-toggle', 'zoom'],
  },
  area: {
    schemaVersion: v, id: 'area-traffic', type: 'area', title: '서비스별 트래픽', description: '요청/초, 누적',
    data: { fields: [{ name: 'timestamp', type: 'time' }, { name: 'service', type: 'string', role: 'category' }, { name: 'rps', type: 'number', label: '요청/초', format: 'compact' }], rows: trafficSeries() },
    encoding: { x: 'timestamp', y: 'rps', color: 'service' }, options: { stack: 'stacked', smooth: true },
  },
  bar: {
    schemaVersion: v, id: 'bar-region', type: 'bar', title: '지역별 매출',
    data: { fields: [{ name: 'region', type: 'string', role: 'category' }, { name: 'revenue', type: 'number', label: '매출', format: 'compact', unit: '원' }], rows: regionRevenue },
    encoding: { x: 'region', y: 'revenue' }, interactions: ['tooltip', 'selection'],
    events: { 'point.click': { action: 'filter-dashboard', field: 'region' } },
  },
  'stacked-bar': {
    schemaVersion: v, id: 'stacked-channel', type: 'stacked-bar', title: '채널별 주문 구성',
    data: { fields: [{ name: 'quarter', type: 'string' }, { name: 'channel', type: 'string' }, { name: 'orders', type: 'number', label: '주문', format: 'integer', unit: '건' }], rows: quarterlyByChannel },
    encoding: { x: 'quarter', y: 'orders', color: 'channel' }, options: { stack: 'stacked' },
  },
  column: {
    schemaVersion: v, id: 'column-signups', type: 'column', title: '월별 신규 가입',
    data: { fields: [{ name: 'month', type: 'string' }, { name: 'signups', type: 'number', label: '가입', format: 'integer', unit: '명' }], rows: monthlySignups },
    encoding: { x: 'month', y: 'signups' }, options: { thresholds: [{ value: 2400, label: '목표', status: 'ok' }] },
  },
  pie: {
    schemaVersion: v, id: 'pie-browser', type: 'pie', title: '브라우저 점유율',
    data: { fields: [{ name: 'browser', type: 'string' }, { name: 'sessions', type: 'number', label: '세션', format: 'compact' }], rows: browserShare },
    encoding: { category: 'browser', value: 'sessions' },
  },
  donut: {
    schemaVersion: v, id: 'donut-severity', type: 'donut', title: '심각도별 경보', description: '최근 24시간',
    data: { fields: [{ name: 'severity', type: 'string' }, { name: 'count', type: 'number', label: '경보', format: 'integer', unit: '건' }], rows: severityShare },
    encoding: { category: 'severity', value: 'count' }, options: { centerLabel: '전체 경보' },
  },
  gauge: {
    schemaVersion: v, id: 'gauge-cpu', type: 'gauge', title: '클러스터 CPU',
    data: { fields: [{ name: 'cpu', type: 'number', label: 'CPU 사용률', unit: '%', precision: 0 }], rows: [{ cpu: 72 }] },
    encoding: { value: 'cpu' },
    options: { min: 0, max: 100, centerLabel: 'CPU 사용률', thresholds: [{ value: 70, label: '주의', status: 'warning' }, { value: 90, label: '위험', status: 'critical' }] },
  },
  scatter: {
    schemaVersion: v, id: 'scatter-accounts', type: 'scatter', title: '계정 규모 vs ARR', description: '원 크기 = 문의 수',
    data: { fields: [{ name: 'account', type: 'string' }, { name: 'tier', type: 'string' }, { name: 'seats', type: 'number', label: '좌석 수', format: 'integer' }, { name: 'arr', type: 'number', label: 'ARR', format: 'compact', unit: '원' }, { name: 'tickets', type: 'number', label: '문의', format: 'integer' }], rows: scatterRows() },
    encoding: { x: 'seats', y: 'arr', color: 'tier', size: 'tickets', label: 'account' }, interactions: ['tooltip', 'legend-toggle', 'zoom'],
  },
  heatmap: {
    schemaVersion: v, id: 'heatmap-events', type: 'heatmap', title: '요일 × 시간대 이벤트',
    data: { fields: [{ name: 'hour', type: 'string' }, { name: 'day', type: 'string' }, { name: 'events', type: 'number', label: '이벤트', format: 'integer' }], rows: heatmapRows() },
    encoding: { x: 'hour', y: 'day', value: 'events' }, options: { labels: false },
  },
  treemap: {
    schemaVersion: v, id: 'treemap-storage', type: 'treemap', title: '스토리지 사용량', description: '환경 › 계층 › 리소스 (클릭하여 드릴다운)',
    data: { fields: [{ name: 'env', type: 'string' }, { name: 'tier', type: 'string' }, { name: 'name', type: 'string' }, { name: 'gb', type: 'number', label: '용량', unit: 'GB', format: 'integer' }], rows: storageTree },
    encoding: { path: ['env', 'tier', 'name'], value: 'gb' },
  },
  radar: {
    schemaVersion: v, id: 'radar-performance', type: 'radar', title: '성능 지표',
    data: { fields: [{ name: 'metric', type: 'string' }, { name: 'score', type: 'number', label: '점수', unit: '점' }], rows: [{ metric: 'CPU', score: 75 }, { metric: 'Memory', score: 85 }, { metric: 'Disk', score: 65 }, { metric: 'Network', score: 90 }] },
    encoding: { category: 'metric', value: 'score' },
  },
  candlestick: {
    schemaVersion: v, id: 'candlestick-ohlc', type: 'candlestick', title: '주식 시세',
    data: { fields: [{ name: 'date', type: 'string' }, { name: 'open', type: 'number' }, { name: 'high', type: 'number' }, { name: 'low', type: 'number' }, { name: 'close', type: 'number' }], rows: [
      { date: '2024-01-01', open: 100, high: 105, low: 99, close: 102 },
      { date: '2024-01-02', open: 102, high: 108, low: 101, close: 106 },
      { date: '2024-01-03', open: 106, high: 107, low: 100, close: 101 },
      { date: '2024-01-04', open: 101, high: 109, low: 100, close: 107 },
      { date: '2024-01-05', open: 107, high: 112, low: 105, close: 110 },
    ] },
    encoding: { x: 'date', y: ['open', 'close', 'low', 'high'] },
  },
  boxplot: {
    schemaVersion: v, id: 'boxplot-latency', type: 'boxplot', title: '응답 시간 분포',
    data: { fields: [{ name: 'category', type: 'string' }, { name: 'value', type: 'number', label: 'ms' }], rows: [
      ...[50, 60, 75, 85, 100].map(value => ({ category: 'API-A', value })),
      ...[65, 75, 90, 110, 125].map(value => ({ category: 'API-B', value })),
    ] },
    encoding: { category: 'category', value: 'value' },
  },
  funnel: {
    schemaVersion: v, id: 'funnel-conversion', type: 'funnel', title: '전환 깔때기',
    data: { fields: [{ name: 'stage', type: 'string' }, { name: 'count', type: 'number', label: '사용자' }], rows: [{ stage: '방문', count: 10000 }, { stage: '회원가입', count: 5000 }, { stage: '구매', count: 1000 }] },
    encoding: { category: 'stage', value: 'count' },
  },
  sankey: {
    schemaVersion: v, id: 'sankey-energy', type: 'sankey', title: '에너지 흐름',
    data: { fields: [{ name: 'source', type: 'string' }, { name: 'target', type: 'string' }, { name: 'value', type: 'number', label: 'kWh' }], rows: [{ source: '태양광', target: '배터리', value: 100 }, { source: '풍력', target: '배터리', value: 80 }] },
    encoding: { path: ['source', 'target'], value: 'value' },
  },
  sunburst: {
    schemaVersion: v, id: 'sunburst-hierarchy', type: 'sunburst', title: '계층 구조',
    data: { fields: [{ name: 'group', type: 'string' }, { name: 'name', type: 'string' }, { name: 'value', type: 'number' }], rows: [{ group: '서비스', name: 'A', value: 40 }, { group: '서비스', name: 'B', value: 60 }, { group: '인프라', name: 'C', value: 30 }] },
    encoding: { path: ['group', 'name'], value: 'value' },
  },
  table: {
    schemaVersion: v, id: 'table-orders', type: 'table', title: '최근 주문',
    data: {
      fields: [
        { name: 'orderId', type: 'string', label: '주문번호' }, { name: 'customer', type: 'string', label: '고객' },
        { name: 'amount', type: 'number', label: '금액', unit: '원', format: 'integer' }, { name: 'items', type: 'number', label: '수량', format: 'integer' },
        { name: 'status', type: 'string', label: '상태' }, { name: 'orderedAt', type: 'time', label: '주문 시각' },
      ],
      rows: orderTable,
    },
    options: { pageSize: 8 },
  },
  'status-list': {
    schemaVersion: v, id: 'status-alerts', type: 'status-list', title: '활성 경보',
    data: { fields: [{ name: 'title', type: 'string' }, { name: 'severity', type: 'string' }, { name: 'at', type: 'time' }, { name: 'source', type: 'string' }], rows: alertRows(Date.now()) },
    encoding: { title: 'title', severity: 'severity', time: 'at', description: 'source' },
  },
  text: {
    schemaVersion: v, id: 'text-notes', type: 'text', title: '운영 노트',
    data: { fields: [] },
    options: {
      content: [
        '### 이번 주 배포',
        '- **결제 v3.2** 롤아웃 50% → 100%',
        '- `gw-prod-02` 커넥션 풀 조정 (`maxIdle=64`)',
        '',
        '> 금요일 18시 이후 배포 동결',
        '',
        '자세한 내용은 [런북](https://example.com/runbook)을 확인하세요. <script>alert(1)</script>',
      ].join('\n'),
    },
  },
  progress: {
    schemaVersion: v, id: 'progress-quota', type: 'progress', title: '월간 API 쿼터',
    data: { fields: [{ name: 'used', type: 'number', label: '사용량', format: 'compact', unit: '건' }], rows: [{ used: 8_420_000 }] },
    encoding: { value: 'used' },
    options: { min: 0, max: 10_000_000, thresholds: [{ value: 8_000_000, label: '80% 경고', status: 'warning' }, { value: 9_500_000, label: '95% 위험', status: 'critical' }] },
  },
} satisfies Partial<Record<ChartType, ChartDefinition>>;

export type DemoChartType = keyof typeof definitions;
export const MVP_TYPES = Object.keys(definitions) as DemoChartType[];
