import type {
  ChartDefinition, ChartOptions, ChartType, Encoding, EngineId, InteractionName, RendererChoice,
} from './types';

export type EncodingChannel = keyof Encoding;

export interface ComponentDescriptor {
  type: ChartType;
  displayName: string;
  description: string;
  family: 'cartesian' | 'part-to-whole' | 'indicator' | 'matrix' | 'hierarchy' | 'widget';
  /** Engine that renders this type. Deterministic — `engine: auto` always resolves here. */
  engine: EngineId;
  renderers: RendererChoice[];
  required: EncodingChannel[];
  optional: EncodingChannel[];
  interactions: InteractionName[];
  defaults: {
    options?: ChartOptions;
    interactions?: InteractionName[];
    height?: number;
  };
  /** Encoding channels that must reference numeric fields. */
  numeric?: EncodingChannel[];
}

const ECHARTS_RENDERERS: RendererChoice[] = ['canvas', 'svg'];
const CARTESIAN_INTERACTIONS: InteractionName[] = ['tooltip', 'selection', 'legend-toggle', 'zoom'];

const descriptors: ComponentDescriptor[] = [
  {
    type: 'kpi', displayName: 'KPI 카드', description: '핵심 수치, 단위, 증감과 상태',
    family: 'indicator', engine: 'native', renderers: [], required: ['value'], optional: ['compare', 'trend', 'label'],
    interactions: ['selection'], numeric: ['value', 'compare'], defaults: { options: { goodDirection: 'up' }, height: 140 },
  },
  {
    type: 'line', displayName: '라인', description: '시계열·추세', family: 'cartesian', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['x', 'y'], optional: ['color'], interactions: CARTESIAN_INTERACTIONS,
    numeric: ['y'], defaults: { options: { smooth: false, showPoints: false, legend: 'top' }, interactions: ['tooltip', 'legend-toggle'] },
  },
  {
    type: 'area', displayName: '영역', description: '누적량·추세 (단일/누적/100%)', family: 'cartesian', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['x', 'y'], optional: ['color'], interactions: CARTESIAN_INTERACTIONS,
    numeric: ['y'], defaults: { options: { stack: 'none', legend: 'top' }, interactions: ['tooltip', 'legend-toggle'] },
  },
  {
    type: 'bar', displayName: '가로 막대', description: '범주 비교 (가로 기본, 긴 라벨에 적합)', family: 'cartesian',
    engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['x', 'y'], optional: ['color'],
    interactions: ['tooltip', 'selection', 'legend-toggle'], numeric: ['y'],
    defaults: { options: { orientation: 'horizontal', legend: 'top' }, interactions: ['tooltip', 'selection'] },
  },
  {
    type: 'stacked-bar', displayName: '누적 막대', description: '구성 비교 (누적 / 100% 누적)', family: 'cartesian',
    engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['x', 'y'], optional: ['color'],
    interactions: ['tooltip', 'selection', 'legend-toggle'], numeric: ['y'],
    defaults: { options: { orientation: 'vertical', stack: 'stacked', legend: 'top' }, interactions: ['tooltip', 'legend-toggle'] },
  },
  {
    type: 'column', displayName: '세로 막대', description: '범주·기간 비교', family: 'cartesian', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['x', 'y'], optional: ['color'],
    interactions: ['tooltip', 'selection', 'legend-toggle'], numeric: ['y'],
    defaults: { options: { orientation: 'vertical', legend: 'top' }, interactions: ['tooltip', 'selection'] },
  },
  {
    type: 'pie', displayName: '파이', description: '합계 대비 비율', family: 'part-to-whole', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['category', 'value'], optional: [], numeric: ['value'],
    interactions: ['tooltip', 'selection', 'legend-toggle'], defaults: { options: { legend: 'right' }, interactions: ['tooltip', 'selection', 'legend-toggle'] },
  },
  {
    type: 'donut', displayName: '도넛', description: '비율 + 중심 합계', family: 'part-to-whole', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['category', 'value'], optional: [], numeric: ['value'],
    interactions: ['tooltip', 'selection', 'legend-toggle'],
    defaults: { options: { legend: 'right', showTotal: true }, interactions: ['tooltip', 'selection', 'legend-toggle'] },
  },
  {
    type: 'gauge', displayName: '게이지', description: '범위 내 단일 값과 임계 구간', family: 'indicator', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['value'], optional: ['label'], numeric: ['value'], interactions: ['tooltip'],
    defaults: { options: { min: 0, max: 100 }, height: 240 },
  },
  {
    type: 'scatter', displayName: '산점도', description: 'x/y 상관, 크기·색상 선택', family: 'cartesian', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['x', 'y'], optional: ['color', 'size', 'label'], numeric: ['x', 'y', 'size'],
    interactions: CARTESIAN_INTERACTIONS, defaults: { options: { legend: 'top' }, interactions: ['tooltip', 'legend-toggle'] },
  },
  {
    type: 'heatmap', displayName: '히트맵', description: '행 × 열 강도', family: 'matrix', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['x', 'y', 'value'], optional: [], numeric: ['value'],
    interactions: ['tooltip', 'selection'], defaults: { interactions: ['tooltip'] },
  },
  {
    type: 'treemap', displayName: '트리맵', description: '계층 비중, 드릴다운', family: 'hierarchy', engine: 'echarts',
    renderers: ECHARTS_RENDERERS, required: ['path', 'value'], optional: [], numeric: ['value'],
    interactions: ['tooltip', 'selection', 'drilldown'], defaults: { options: { drilldown: true }, interactions: ['tooltip', 'drilldown'] },
  },
  {
    type: 'radar', displayName: '레이더', description: '다중 항목 비교 (다각형)',
    family: 'cartesian', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['category', 'value'], optional: ['color'],
    interactions: ['tooltip', 'selection', 'legend-toggle'], numeric: ['value'],
    defaults: { options: { legend: 'top' }, interactions: ['tooltip', 'legend-toggle'], height: 320 },
  },
  {
    type: 'bubble', displayName: '버블', description: '범주별 항목의 크기 비교',
    family: 'cartesian', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['category', 'label', 'value'], optional: [],
    numeric: ['value'], interactions: ['tooltip', 'selection'], defaults: { interactions: ['tooltip', 'selection'], height: 320 },
  },
  {
    type: 'word-cloud', displayName: '워드 클라우드', description: '가중치에 따른 단어 크기',
    family: 'part-to-whole', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['category', 'value'], optional: [],
    numeric: ['value'], interactions: ['tooltip', 'selection'], defaults: { interactions: ['tooltip', 'selection'], height: 320 },
  },
  {
    type: 'polar-pie', displayName: '계층형 파이', description: '부모 ID 기반 동심원 계층',
    family: 'hierarchy', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['label', 'category', 'path', 'value'], optional: [],
    numeric: ['value'], interactions: ['tooltip', 'selection', 'drilldown'], defaults: { interactions: ['tooltip', 'drilldown'], height: 320 },
  },
  {
    type: 'gauge-group', displayName: '다중 게이지', description: '여러 항목의 게이지 비교',
    family: 'indicator', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['label', 'value'], optional: [],
    numeric: ['value'], interactions: ['tooltip', 'selection'], defaults: { options: { min: 0, max: 100 }, interactions: ['tooltip', 'selection'], height: 320 },
  },
  {
    type: 'candlestick', displayName: '캔들스틱', description: '금융 시계열 (시가/고가/저가/종가)',
    family: 'cartesian', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['x', 'y'], optional: [],
    interactions: ['tooltip', 'legend-toggle', 'zoom'], numeric: ['y'],
    defaults: { options: { legend: 'top' }, interactions: ['tooltip', 'zoom'], height: 300 },
  },
  {
    type: 'boxplot', displayName: '박스플롯', description: '분포 요약 (사분위·중앙값·이상치)',
    family: 'cartesian', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['category', 'value'], optional: ['color'],
    interactions: ['tooltip', 'selection', 'legend-toggle'], numeric: ['value'],
    defaults: { options: { legend: 'top' }, interactions: ['tooltip', 'legend-toggle'] },
  },
  {
    type: 'funnel', displayName: '깔때기', description: '단계별 변환 (위→아래)',
    family: 'part-to-whole', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['category', 'value'], optional: [],
    interactions: ['tooltip', 'selection', 'legend-toggle'], numeric: ['value'],
    defaults: { options: { legend: 'right' }, interactions: ['tooltip', 'legend-toggle'] },
  },
  {
    type: 'sankey', displayName: '샌키 다이어그램', description: '흐름·에너지·비율 추적',
    family: 'hierarchy', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['path', 'value'], optional: [],
    interactions: ['tooltip', 'selection'], numeric: ['value'],
    defaults: { options: { legend: 'top' }, interactions: ['tooltip'], height: 400 },
  },
  {
    type: 'sunburst', displayName: '선버스트', description: '계층 비중 (동심원)',
    family: 'hierarchy', engine: 'echarts', renderers: ECHARTS_RENDERERS, required: ['path', 'value'], optional: [],
    interactions: ['tooltip', 'selection', 'drilldown'], numeric: ['value'],
    defaults: { options: { legend: 'top', drilldown: true }, interactions: ['tooltip', 'drilldown'], height: 400 },
  },
  {
    type: 'table', displayName: '데이터 테이블', description: '정렬·페이지·빈/오류 상태', family: 'widget', engine: 'native',
    renderers: [], required: [], optional: [], interactions: ['selection'],
    defaults: { options: { pageSize: 10, sortable: true }, interactions: ['selection'] },
  },
  {
    type: 'country-table', displayName: '국가 테이블', description: '국가 코드, 국가명, 건수 표시', family: 'widget', engine: 'native',
    renderers: [], required: [], optional: [], interactions: ['selection'],
    defaults: { options: { pageSize: 10 }, interactions: ['selection'] },
  },
  {
    type: 'process-table', displayName: '프로세스 테이블', description: '프로세스 명, 설명 표시', family: 'widget', engine: 'native',
    renderers: [], required: [], optional: [], interactions: ['selection'],
    defaults: { options: { pageSize: 10 }, interactions: ['selection'] },
  },
  {
    type: 'label-table', displayName: '라벨 테이블', description: '라벨 목록 표시', family: 'widget', engine: 'native',
    renderers: [], required: [], optional: [], interactions: ['selection'],
    defaults: { options: { pageSize: 10 }, interactions: ['selection'] },
  },
  {
    type: 'news-table', displayName: '뉴스 테이블', description: '날짜, 뉴스 타이틀, 종류, 출처 표시 (HTML 포맷팅 지원)', family: 'widget', engine: 'native',
    renderers: [], required: [], optional: [], interactions: ['selection'],
    defaults: { options: { pageSize: 10 }, interactions: ['selection'] },
  },
  {
    type: 'dash-table', displayName: '대시 테이블', description: '대시보드용 테이블 (다양한 필드 타입 지원)', family: 'widget', engine: 'native',
    renderers: [], required: [], optional: [], interactions: ['selection'],
    defaults: { options: { pageSize: 10 }, interactions: ['selection'] },
  },
  {
    type: 'circle-progress', displayName: '원형 진행률', description: '퍼센트 표시 (0~100)', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 140 },
  },
  {
    type: 'label-v1', displayName: 'Label ver1', description: '타이틀과 건수 표시', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 120 },
  },
  {
    type: 'label-v2', displayName: 'Label ver2', description: '타이틀과 건수 표시 (ver2)', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 120 },
  },
  {
    type: 'label-v3', displayName: 'Label ver3', description: '타이틀, 건수, 등락건수 표시', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 120 },
  },
  {
    type: 'label-v4', displayName: 'Label ver4', description: '타이틀과 단일 건수', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 100 },
  },
  {
    type: 'label-v5', displayName: 'Label ver5', description: '타이틀, 건수, 등락건수 (다중)', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 120 },
  },
  {
    type: 'label-v6', displayName: 'Label ver6', description: '헤더 타이틀, 다중 건수, 타이틀 조합', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 140 },
  },
  {
    type: 'label-v7', displayName: 'Label ver7', description: '다중 타이틀과 건수', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 130 },
  },
  {
    type: 'label-v8', displayName: 'Label ver8', description: '병렬 타이틀과 건수 조합', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 130 },
  },
  {
    type: 'label-v9', displayName: 'Label ver9', description: '단일 타이틀과 건수', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 100 },
  },
  {
    type: 'label-v10', displayName: 'Label ver10', description: '타이틀, 건수, 이미지명', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 120 },
  },
  {
    type: 'multi-label', displayName: 'Multi Label', description: '다중 타이틀과 건수', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 130 },
  },
  {
    type: 'label-v11', displayName: 'Label ver11', description: '순차적 라벨 표시', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 120 },
  },
  {
    type: 'label-v12', displayName: 'Label ver12', description: '소속기관 등 계층형 라벨', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 140 },
  },
  {
    type: 'label-v13', displayName: 'Label ver13', description: '필터링 라벨', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 110 },
  },
  {
    type: 'label-v14', displayName: 'Label ver14', description: '카테고리 라벨', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 110 },
  },
  {
    type: 'label-v15', displayName: 'Label ver15', description: '이중 타이틀 괄호 표시', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 130 },
  },
  {
    type: 'label-v16', displayName: 'Label ver16', description: '상단/하단 데이터 표시', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 120 },
  },
  {
    type: 'label-v17', displayName: 'Label ver17', description: '타이틀과 정상여부 표시', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 100 },
  },
  {
    type: 'label-v18', displayName: 'Label ver18', description: '공격표면 등 다중 서브데이터', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 140 },
  },
  {
    type: 'alert-level', displayName: '위기경보', description: '경보단계 표시 (1:정상~5:심각)', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 100 },
  },
  {
    type: 'alert-level-v2', displayName: '위기경보 ver2', description: '경보단계 표시 (1:정상~5:심각)', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 100 },
  },
  {
    type: 'alert-level-v3', displayName: '위기경보 ver3', description: '경보단계 표시 (1:관심~4:심각)', family: 'indicator', engine: 'native',
    renderers: [], required: [], optional: [], interactions: [],
    defaults: { height: 100 },
  },
  {
    type: 'status-list', displayName: '상태/경보 목록', description: '심각도·시간·선택 이벤트', family: 'widget', engine: 'native',
    renderers: [], required: ['title', 'severity'], optional: ['time', 'description'], interactions: ['selection'],
    defaults: { interactions: ['selection'] },
  },
  {
    type: 'text', displayName: '텍스트 카드', description: '제한된 마크다운 (HTML/script 제거)', family: 'widget',
    engine: 'native', renderers: [], required: [], optional: [], interactions: [], defaults: {},
  },
  {
    type: 'progress', displayName: '진행률/임계치', description: '값 / 최대값 / 임계 상태', family: 'indicator',
    engine: 'native', renderers: [], required: ['value'], optional: ['label'], numeric: ['value'], interactions: [],
    defaults: { options: { min: 0, max: 100 }, height: 120 },
  },
];

const registry = new Map<ChartType, ComponentDescriptor>(descriptors.map((d) => [d.type, d]));

export function getDescriptor(type: string): ComponentDescriptor | undefined {
  return registry.get(type as ChartType);
}

export function listDescriptors(): ComponentDescriptor[] {
  return [...registry.values()];
}

export const CHART_TYPES = descriptors.map((d) => d.type);

export interface EngineResolution {
  engine: EngineId;
  renderer: RendererChoice | null;
}

/**
 * Deterministic engine/renderer resolution. Identical valid definitions always map
 * to the same engine. Throws a CapabilityError on any mismatch — never silently
 * substitutes another engine.
 */
export function resolveEngine(def: Pick<ChartDefinition, 'type' | 'engine' | 'renderer'>): EngineResolution {
  const d = getDescriptor(def.type);
  if (!d) throw new CapabilityError('unknown-type', `지원하지 않는 차트 유형입니다: ${String(def.type)}`);
  const requested = def.engine ?? 'auto';
  if (requested !== 'auto' && requested !== d.engine) {
    throw new CapabilityError(
      'engine-unsupported',
      `'${d.type}' 유형은 '${requested}' 엔진을 지원하지 않습니다 (지원: ${d.engine}).`,
    );
  }
  if (d.engine === 'native') return { engine: 'native', renderer: null };
  const renderer = def.renderer ?? 'canvas';
  if (!d.renderers.includes(renderer)) {
    throw new CapabilityError('renderer-unsupported', `'${d.type}' 유형은 '${renderer}' 렌더러를 지원하지 않습니다.`);
  }
  return { engine: d.engine, renderer };
}

export class CapabilityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CapabilityError';
  }
}
