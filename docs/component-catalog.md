# 컴포넌트 카탈로그 (55종)

단일 정의는 `src/core/registry.ts`이고, 아래 표도 이 파일 기준입니다. 필수 인코딩이 없거나 지원하지 않는 상호작용을 지정하면 검증 오류가 납니다. 옵션 타입은 `src/core/types.ts`의 `ChartOptions`를 따릅니다.

## ECharts 차트 (21종)

| type | 이름 | 엔진 | 필수 인코딩 | 선택 인코딩 | 상호작용 | 기본 옵션 | 용도 |
|---|---|---|---|---|---|---|---|
| `line` | 라인 | echarts | x, y | color | tooltip, selection, legend-toggle, zoom | smooth=false, showPoints=false, legend="top" | 시계열·추세 |
| `area` | 영역 | echarts | x, y | color | tooltip, selection, legend-toggle, zoom | stack="none", legend="top" | 누적량·추세 (단일/누적/100%) |
| `bar` | 가로 막대 | echarts | x, y | color | tooltip, selection, legend-toggle | orientation="horizontal", legend="top" | 범주 비교 (가로 기본, 긴 라벨에 적합) |
| `stacked-bar` | 누적 막대 | echarts | x, y | color | tooltip, selection, legend-toggle | orientation="vertical", stack="stacked", legend="top" | 구성 비교 (누적 / 100% 누적) |
| `column` | 세로 막대 | echarts | x, y | color | tooltip, selection, legend-toggle | orientation="vertical", legend="top" | 범주·기간 비교 |
| `pie` | 파이 | echarts | category, value | — | tooltip, selection, legend-toggle | legend="right" | 합계 대비 비율 |
| `donut` | 도넛 | echarts | category, value | — | tooltip, selection, legend-toggle | legend="right", showTotal=true | 비율 + 중심 합계 |
| `gauge` | 게이지 | echarts | value | label | tooltip | min=0, max=100 | 범위 내 단일 값과 임계 구간 |
| `scatter` | 산점도 | echarts | x, y | color, size, label | tooltip, selection, legend-toggle, zoom | legend="top" | x/y 상관, 크기·색상 선택 |
| `heatmap` | 히트맵 | echarts | x, y, value | — | tooltip, selection | — | 행 × 열 강도 |
| `treemap` | 트리맵 | echarts | path, value | — | tooltip, selection, drilldown | drilldown=true | 계층 비중, 드릴다운 |
| `radar` | 레이더 | echarts | category, value | color | tooltip, selection, legend-toggle | legend="right" | 다중 항목 비교 (스파이더 웹) |
| `bubble` | 버블 | echarts | category, label, value | x, y | tooltip, selection, legend-toggle | — | 범주별 항목의 크기 비교 |
| `word-cloud` | 워드 클라우드 | echarts | category, value | — | tooltip, selection | — | 가중치에 따른 단어 크기 |
| `polar-pie` | 계층형 파이 | echarts | label, category, path, value | — | tooltip, selection, drilldown | — | 부모 ID 기반 동심원 계층 |
| `gauge-group` | 다중 게이지 | echarts | label, value | — | tooltip, selection | min=0, max=100 | 여러 항목의 게이지 비교 |
| `candlestick` | 캔들스틱 | echarts | x, y | — | tooltip, legend-toggle, zoom | legend="top" | 금융 시계열 (시가/고가/저가/종가) |
| `boxplot` | 박스플롯 | echarts | category, value | color | tooltip, selection, legend-toggle | legend="top" | 분포 요약 (사분위·중앙값·이상치) |
| `funnel` | 깔때기 | echarts | category, value | — | tooltip, selection, legend-toggle | legend="right" | 단계별 변환 (위→아래) |
| `sankey` | 샌키 다이어그램 | echarts | path, value | — | tooltip, selection | legend="top" | 흐름·에너지·비율 추적 |
| `sunburst` | 선버스트 | echarts | path, value | — | tooltip, selection, drilldown | legend="top", drilldown=true | 계층 비중 (동심원) |

## DOM 위젯 (34종)

차트 엔진 없이 DOM으로 그립니다. 렌더러(`canvas`/`svg`) 설정은 적용되지 않습니다.

| type | 이름 | 엔진 | 필수 인코딩 | 선택 인코딩 | 상호작용 | 기본 옵션 | 용도 |
|---|---|---|---|---|---|---|---|
| `kpi` | KPI 카드 | native | value | compare, trend, label | selection | goodDirection="up" | 핵심 수치, 단위, 증감과 상태 |
| `table` | 데이터 테이블 | native | — | — | selection | pageSize=10, sortable=true | 정렬·페이지·빈/오류 상태 |
| `country-table` | 국가 테이블 | native | — | — | selection | pageSize=10 | 국가 코드, 국가명, 건수 표시 |
| `process-table` | 프로세스 테이블 | native | — | — | selection | pageSize=10 | 프로세스 명, 설명 표시 |
| `label-table` | 라벨 테이블 | native | — | — | selection | pageSize=10 | 라벨 목록 표시 |
| `news-table` | 뉴스 테이블 | native | — | — | selection | pageSize=10 | 날짜, 뉴스 타이틀, 종류, 출처 표시 (HTML 포맷팅 지원) |
| `dash-table` | 대시 테이블 | native | — | — | selection | pageSize=10 | 대시보드용 테이블 (다양한 필드 타입 지원) |
| `circle-progress` | 원형 진행률 | native | — | — | — | — | 퍼센트 표시 (0~100) |
| `label-v1` | Label ver1 | native | — | — | — | — | 타이틀과 건수 표시 |
| `label-v2` | Label ver2 | native | — | — | — | — | 타이틀과 건수 표시 (ver2) |
| `label-v3` | Label ver3 | native | — | — | — | — | 타이틀, 건수, 등락건수 표시 |
| `label-v4` | Label ver4 | native | — | — | — | — | 타이틀과 단일 건수 |
| `label-v5` | Label ver5 | native | — | — | — | — | 타이틀, 건수, 등락건수 (다중) |
| `label-v6` | Label ver6 | native | — | — | — | — | 헤더 타이틀, 다중 건수, 타이틀 조합 |
| `label-v7` | Label ver7 | native | — | — | — | — | 다중 타이틀과 건수 |
| `label-v8` | Label ver8 | native | — | — | — | — | 병렬 타이틀과 건수 조합 |
| `label-v9` | Label ver9 | native | — | — | — | — | 단일 타이틀과 건수 |
| `label-v10` | Label ver10 | native | — | — | — | — | 타이틀, 건수, 이미지명 |
| `multi-label` | Multi Label | native | — | — | — | — | 다중 타이틀과 건수 |
| `label-v11` | Label ver11 | native | — | — | — | — | 순차적 라벨 표시 |
| `label-v12` | Label ver12 | native | — | — | — | — | 소속기관 등 계층형 라벨 |
| `label-v13` | Label ver13 | native | — | — | — | — | 필터링 라벨 |
| `label-v14` | Label ver14 | native | — | — | — | — | 카테고리 라벨 |
| `label-v15` | Label ver15 | native | — | — | — | — | 이중 타이틀 괄호 표시 |
| `label-v16` | Label ver16 | native | — | — | — | — | 상단/하단 데이터 표시 |
| `label-v17` | Label ver17 | native | — | — | — | — | 타이틀과 정상여부 표시 |
| `label-v18` | Label ver18 | native | — | — | — | — | 공격표면 등 다중 서브데이터 |
| `alert-level` | 위기경보 | native | — | — | — | — | 경보단계 표시 (1:정상~5:심각) |
| `alert-level-v2` | 위기경보 ver2 | native | — | — | — | — | 경보단계 표시 (1:정상~5:심각) |
| `alert-level-v3` | 위기경보 ver3 | native | — | — | — | — | 경보단계 표시 (1:관심~4:심각) |
| `status-list` | 상태/경보 목록 | native | title, severity | time, description | selection | — | 심각도·시간·선택 이벤트 |
| `text` | 텍스트 카드 | native | — | — | — | — | 제한된 마크다운 (HTML/script 제거) |
| `status-grid` | 장비 상태 타일 | native | title, severity | description | selection | — | 수백 대 장비의 상태를 한 화면에 칸으로 |
| `progress` | 진행률/임계치 | native | value | label | — | min=0, max=100 | 값 / 최대값 / 임계 상태 |

## 라인·영역 옵션

| 옵션 | 값 | 동작 |
|---|---|---|
| `zoom` | `boolean` | 차트 아래 구간 탐색 슬라이더(Ctrl+휠·드래그 확대 포함). 지정하지 않으면 `interactions`의 `zoom` 여부를 따른다. |
| `realtime` | `boolean` \| `{ windowSize?: number }` | 실시간 추가. 더 새로운 x 값이 들어오면 선이 왼쪽으로 밀리고 오른쪽 끝에 새 구간이 그려지며 최신 점이 깜빡인다. `windowSize`를 주면 최신 N개 x 값만 유지한다. 새 데이터(contentsData·rows)를 넘기거나 차트 핸들의 `appendData`로 공급한다. |
| `drawOrder` | `'together'`(기본) \| `'one-by-one'` | 진입 애니메이션에서 선을 동시에 그릴지, 한 줄씩 차례로 그릴지. `realtime`과 함께 쓰면 한 줄씩 그리는 동안 들어온 구간은 다 그린 뒤 이어서 반영된다. |
| `maxPoints` | `number` | 시리즈당 최대 렌더 점 수. 넘으면 LTTB로 샘플링한다(라인·산점도). |

## 흐르는 빛 효과

| 옵션 | 적용 대상 | 값 | 동작 |
|---|---|---|---|
| `borderFlow` | 파이·도넛·계층형 파이, 레이더 | `boolean`(기본 켜짐) | 진입 애니메이션이 끝나면 은은한 빛줄기(앞쪽 점 없이 꼬리만)가 계속 흐른다. 파이 계열은 차트 바깥 HUD 고리를 따라 시계 방향으로 8초에 한 바퀴, 레이더는 거미줄의 고리와 축을 따라 정해진 경로를 돌아다닌다. 애니메이션이나 glow 효과가 꺼져 있거나 3D 파이에서는 표시하지 않는다. `false`면 끈다. |

## 관제 화면 옵션

벽면 상황판처럼 사람이 조작하지 않고 오래 띄워 두는 화면을 위한 옵션입니다. 플레이그라운드의 "관제 화면 기능" 섹션이 예시입니다.

| 옵션 | 적용 대상 | 값 | 동작 |
|---|---|---|---|
| `autoTour` | ECharts 차트 | `boolean` \| `{ intervalMs?: number }` | `intervalMs`(기본 3000)마다 다음 항목을 강조하고 툴팁·값을 보여 준다. 포인터가 차트 위에 있으면 멈춘다. |
| `thresholds` | 라인·영역·막대·세로 막대·산점도(기준선), 게이지·진행률(구간) | `{ value, label?, status? }[]` | 임계 기준선 또는 구간 밴드. |
| `alarm` | `thresholds`가 있는 차트 | `boolean` | 최신 값이 임계치를 넘으면 패널 테두리가 상태색으로 빛난다(critical은 깜빡임). `thresholds`가 있으면 기본 켜짐. |
| `staleAfterMs` | 실시간 차트(stream, 폴링 REST, `realtime`) | `number` \| `false` | 이 시간 동안 새 데이터가 없으면 "데이터 지연"을 표시하고 최신 점을 회색으로 바꾼다. 지정하지 않으면 관측된 갱신 간격의 3배(최소 5초), 폴링 REST는 간격의 2.5배. `false`면 끈다. |
| `ranking` | 가로 막대(시리즈 1개) | `boolean` \| `{ top?: number }` | Top-N 순위. 값 기준으로 정렬을 유지하고 순위가 바뀌면 막대가 자리를 바꾼다(bar race). 기본 상위 10개. |
| `pattern` | 히트맵 | `'week-hour'` | `encoding.x`의 시간값을 7일(월–일) × 24시간 격자로 묶어 `encoding.value`를 합산한다. `encoding.y`는 필요 없다. |

`status-grid`(장비 상태 타일)는 장비 위치를 고정한 채 상태만 바꿔 그리고, 위험 상태는 깜빡이며, 상단 칩으로 상태별 필터를 제공합니다.
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
