# 컴포넌트 카탈로그 (MVP 16종)

단일 정의는 `src/core/registry.ts`. 필수 인코딩이 없거나 지원하지 않는 상호작용을 지정하면 검증 오류가 납니다.

| type | 이름 | 엔진 | 필수 인코딩 | 선택 인코딩 | 상호작용 | 주요 옵션 |
|---|---|---|---|---|---|---|
| `kpi` | KPI 카드 | native | value | compare, trend, label | selection | goodDirection, thresholds |
| `line` | 라인 | echarts | x, y(배열 가능) | color | tooltip, selection, legend-toggle, zoom | smooth, showPoints, thresholds, maxPoints(LTTB) |
| `area` | 영역 | echarts | x, y | color | 〃 | stack: none/stacked/percent |
| `bar` | 가로 막대 | echarts | x, y | color | tooltip, selection, legend-toggle | orientation(기본 horizontal), labels |
| `stacked-bar` | 누적 막대 | echarts | x, y | color | 〃 | stack: stacked/percent, orientation |
| `column` | 세로 막대 | echarts | x, y | color | 〃 | thresholds, labels |
| `pie` | 파이 | echarts | category, value | — | tooltip, selection, legend-toggle | labels, legend |
| `donut` | 도넛 | echarts | category, value | — | 〃 | showTotal, centerLabel |
| `gauge` | 게이지 | echarts | value | label | tooltip | min, max, thresholds(구간 밴드) |
| `scatter` | 산점도 | echarts | x, y | color, size, label | tooltip, selection, legend-toggle, zoom | thresholds |
| `heatmap` | 히트맵 | echarts | x, y, value | — | tooltip, selection | labels |
| `treemap` | 트리맵 | echarts | path[], value | — | tooltip, selection, drilldown | drilldown |
| `table` | 데이터 테이블 | native | (fields 전체) | — | selection | pageSize, sortable |
| `status-list` | 상태/경보 목록 | native | title, severity | time, description | selection | — |
| `text` | 텍스트 카드 | native | — | — | — | content(제한 마크다운) |
| `progress` | 진행률/임계치 | native | value | label | — | min, max, thresholds |

## 공통 완료 조건 점검 (명세 §6)

| 항목 | 상태 | 근거 |
|---|---|---|
| 스키마·기본값·레지스트리 | ✅ | `registry.ts`, `schema.test.ts` |
| 로딩 / 빈 / 잘못된 데이터 / API 오류 / resize | ✅ | `CvChart.test.ts`, `lifecycle.test.ts` |
| 정규 이벤트 | ✅ | point.click, legend.toggle, zoom.change, drill.change, row.click, item.select |
| 테마 토큰·대비·색각 | ✅ | ADR-0003, decal 패턴 토글 |
| reduced motion | ✅ | `resolveMotion` 테스트 + CSS `prefers-reduced-motion` |
| 대체 정보 | ✅ | aria 요약, 데이터 표 토글, `role="figure"` |
| destroy 후 누수 없음 | ✅ | 11종 ECharts 수명주기 테스트 |
| 시각 회귀 기준 이미지 | ⚠️ 수동 확인만 | Playwright 스냅샷 미도입 |
| 데이터 테이블 가상화 | ⚠️ 페이지네이션으로 결정 | 수천 행 이상 필요 시 재검토 |

## 데이터 형식

- 행(row) 객체 배열. 필드 타입에 맞게 변환: `number`(숫자 문자열 허용), `time`(ISO-8601/epoch → ms), `string`, `boolean`. 변환 실패는 `null` + 경고.
- 범주형 시리즈는 최대 8개. 넘으면 "기타"로 묶고 알림을 표시한다.
- 파이·트리맵은 음수/0을 무시하고, 파이는 내림차순으로 정렬한다.
