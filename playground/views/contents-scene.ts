import type { ContentsChartDefinition } from '../../src';
import { contentsDefinitions } from '../contents-fixtures';

/** COD-M content names (contents_type) for the fixtures, as they appear on the dashboard. */
const TITLES: Record<string, string> = {
  'contents-line': '인바운드 트래픽 (line_chart)',
  'contents-area': '인바운드 트래픽 (area_chart)',
  'contents-bar': '구간별 트래픽 (bar_chart)',
  'contents-column': '구간별 트래픽 (column_chart)',
  'contents-point': '응답 추이 (line_chart_point)',
  'contents-pie': '장비 제조사 비율 (pie_chart)',
  'contents-polar': '대륙별 공격 (pie_chart_polar)',
  'contents-radar': 'DNS 응답 시간 (spider_chart)',
  'contents-gauge': '센서 사용률 (gauge_chart)',
  'contents-bubble': '기간별 탐지 (bubble_chart)',
  'contents-word-cloud': '위협 키워드 (word_cloud)',
};

export interface SceneContent {
  /** Host-owned panel title (COD-M renders it, not the chart). */
  title: string;
  def: ContentsChartDefinition;
}

const empty: ContentsChartDefinition = {
  schemaVersion: '1.0.0', id: 'contents-empty', type: 'line', title: '데이터 없음',
  contentsData: { timesArr: [], data: [] },
  options: { emptyMessage: '데이터가 없습니다.' },
};

const all = new Map<string, SceneContent>(
  [...contentsDefinitions, empty].map((def) => [def.id, { title: TITLES[def.id] ?? def.title ?? def.id, def }]),
);

export function content(id: string): SceneContent {
  const found = all.get(id);
  if (!found) throw new Error(`unknown scene content: ${id}`);
  return found;
}
