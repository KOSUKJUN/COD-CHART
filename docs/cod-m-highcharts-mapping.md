# COD-M 하이차트 → COD-CHART 대체 매핑

COD-M(`D:\Business\Solution\vscode\Client`)의 콘텐츠 차트를 COD-CHART로 바꿀 때 기준이 되는 문서입니다. 2026-11-11에 아래 COD-M 소스를 분석했습니다.

- `src/ts/contents/chart.js`: 옵션 생성
- `src/ts/contents/highchart.ts`: 전역 설정과 모듈 로드
- `src/shared/components/integrated/dashboard/contents/contentComponents/chart/highChart.vue`: 데이터 파싱과 래퍼

## 교체 지점

하이차트는 위 세 파일에서만 씁니다. `highChart.vue`를 `<CvChart :framed="false" :header="false">`로 감싸는 컴포넌트로 바꾸면 됩니다. 이때 COD-M이 맡을 것은 세 가지입니다.

- **패널 제목:** COD-M이 그립니다.
- **패널 배경:** `monitor_bg_color`와 `monitor_opacity`로 COD-M이 칠합니다. COD-CHART 캔버스는 항상 투명합니다.
- **크기:** `monitor_width`와 `monitor_height`를 `height` 값으로 넘깁니다.

## 유형 매핑

| contents_type | 하이차트 구현 | COD-CHART `type` | 데이터 (COD-PRO 형식 그대로) | 비고 |
|---|---|---|---|---|
| 4 line_chart | line, lineWidth 5 | `line` | `{timesArr, data:[{key,color,values}]}` | 값이 숫자 배열이면 x는 timesArr 인덱스 |
| 21 line_chart_point | line, lineWidth 0 + 마커 | `line` + `options.showPoints` | 위와 같음 | 하이차트는 y축을 1–4로 고정함(아래 '알려진 문제' 4번) |
| 5 area_chart | area, 세로 그라데이션 | `area` | 위와 같음 | |
| 6 column_chart | column + 3D(alpha 15, depth 100), 데이터 라벨 | `column` | 위와 같음 | 3D는 `theme.effects.depth`로 대체 |
| 8 bar_chart | bar + 3D(beta 25), 데이터 라벨 | `bar` | 위와 같음 | 위와 같음 |
| 7 pie_chart | 3D 도넛(innerSize 40%), 조각이 차례로 커지는 애니메이션 | `pie` / `donut` | `[{col0, col1}]` | 순차 진입은 기본 제공 |
| 14 pie_chart_polar | sunburst | `polar-pie` | `[{id,parent,name,value}]` | **COD-M에서는 지금 그려지지 않음** (파싱 분기 없음) |
| 16 spider_chart | 폴라 누적 컬럼, 0–100 고정 | `radar` | `{categories, data:[{name,data}]}` | Highcharts polar-spider 형식으로 통일 (아래 '결정 사항') |
| 22 gauge_chart | solidgauge 동심 링, 링마다 "이름 : 값" 라벨 | `gauge-group` | `[{col0, col1}]` | |
| 31 bubble_chart | packedbubble | `bubble` | `[{categories, data:[{name[],value[]}]}]` | |
| 32 word_cloud | wordcloud | `word-cloud` | `[{name, weight}]` | COD-M은 `{data:[…]}`로 한 번 감싸서 넘김 |

## 동작 매핑

| COD-M 동작 | 하이차트 방식 | COD-CHART |
|---|---|---|
| 색상 `data_color` | `colors` 배열 | `theme.palette`. 서버 색상 정의는 개발이 끝난 뒤 DB에 넣기로 함 |
| 글꼴 크기 `monitor_char_font_size` | 축, 범례, 라벨에 개별 적용 | 테마 글꼴 크기로 연결할 예정 |
| `rotation_flag` | 15초마다 `:key`를 바꿔 차트를 다시 마운트 | 차트를 다시 만들지 않고 시리즈 표시만 바꾸는 방식으로 구현할 예정 |
| `pastdata_flag` | 점을 클릭하면 `timeplay("HH:MM")` 호출 | `@point-click` 이벤트를 받아 호스트가 처리 |
| 진입 애니메이션 | 3000ms, 기본 이징 | 2000ms(cubicOut) + 항목 순차 진입(최대 1.5초). 게이지는 3000ms |
| PNG 내보내기 | exporting 모듈 | 헤더 액션의 `exportImage()` |

## 결정 사항

- **spider_chart (2026-11-11):** COD-M의 지금 구현(꽃잎 모양 폴라 누적 컬럼)은 따르지 않습니다. [Highcharts polar-spider 데모](https://www.highcharts.com/demo/highcharts/polar-spider) 형식으로 그립니다.
  - **격자:** 다각형 선만 그리고 띠 배경은 없습니다.
  - **시리즈:** 선과 작은 점으로 그리고, 면 채움은 마우스를 올렸을 때만 나타납니다.
  - **범례:** 오른쪽에 세로로 놓습니다.
  - **툴팁:** 항목별 값 목록을 보여 줍니다.
  - **최대값:** 0–100 고정 대신 `options.max`를 쓰고, 지정하지 않으면 데이터 최대값(최소 100)을 씁니다.

## COD-M 하이차트 구현에서 옮기지 않을 문제

1. pie_chart_polar가 항상 "데이터 없음"으로 나옵니다 (`highChart.vue`에 파싱 분기가 없음).
2. 백만 이상 값의 단위가 틀립니다. `value/1000 + "M"`이라서 2,000,000이 "2,000M"으로 표시됩니다.
3. 크레딧(Highcharts.com 표기)을 line/area/column/bar에서만 끕니다.
4. line_point, column, bar에서 y축 설정을 통째로 바꿔서 단위 포맷과 글꼴 크기가 사라집니다.
5. 게이지의 호 색상(`default_color2`)과 배경 색상(`colorArr`)이 서로 다른 목록에서 옵니다. 값 라벨은 처음 한 번만 만들어져 갱신되지 않습니다.
6. 버블을 클릭하면 정의되지 않은 함수(`bubble_link_move`)를 호출해 ReferenceError가 납니다.
7. 파이 애니메이션 래퍼(`H.wrap`)가 옵션을 만들 때마다 전역에 덧쌓입니다.
8. rotation `setInterval`이 해제되지 않아 메모리가 샙니다. `"Y"` 검사와 truthy 검사가 서로 맞지 않습니다.
9. 툴팁이 외부 CSS 클래스와 하이차트 기본 밝은 박스를 써서 어두운 화면과 어울리지 않습니다.

## COD-CHART에서 추가된 동작 (2026-11-11)

| 동작 | 설명 |
|---|---|
| 범례 필터 | 모든 차트에서 범례를 클릭하면 해당 항목이 걸러집니다. 게이지 링과 버블은 남은 항목으로 다시 배치되고, 도넛 합계는 다시 계산됩니다. 데이터가 갱신돼도 숨긴 항목은 그대로 숨겨져 있습니다. |
| 하단 차트 검색 | 선형·영역 차트에서 `options.zoom: true/false`로 아래 구간 탐색 슬라이더를 켜고 끕니다. 값을 지정하지 않으면 `zoom` 인터랙션을 따릅니다. |
| 효과 | 선형 차트만 선을 따라 데이터 빛이 흐릅니다. 막대와 파이에는 움직이는 효과가 없습니다. 버블과 워드클라우드는 평소에는 멈춰 있고, 항목에 마우스를 올리면 전체가 몽글몽글 떠다닙니다. 항목마다 주기(2.8–4.6초)와 위상이 다른 작은 사인 경로를 1.2–3.5px로 그리고, 마우스를 올린 항목은 1.12배로 커지며 빛납니다. 마우스가 차트를 벗어나면 0.6초 동안 제자리로 돌아옵니다. 3D 모드의 파이는 35°쯤 기울어진 타원 원판으로 그립니다. |
| 막대 효과 | 처음 나타날 때 막대가 끝까지 차오르면 끝단이 한 번 번쩍입니다(데이터 갱신 때는 나오지 않음). 마우스를 올리면 막대 끝에 값이 0부터 세어 올라가며 나타납니다(값 라벨을 이미 표시하는 차트와 누적 막대는 제외). |
| 파이 효과 | 하나의 원판을 얇은 이음선으로 나눈 모습입니다. 조각은 단색이고, 원판 전체에 왼쪽 위에서 오는 은은한 하이라이트와 테두리 빛 하나가 깔립니다(3D 포함). 3D 옆면은 원기둥처럼 정면이 밝고 옆으로 갈수록 어두운 곡면입니다. 처음 나타날 때 하나의 부채꼴로 펼쳐지며 빛나는 앞쪽 가장자리가 따라갑니다(한 번만). 마우스를 올린 조각은 5px 튀어나오고(3D는 8px 떠오름) 나머지는 0.97배로 작아지며 0.55 투명도로 흐려집니다. 말풍선은 오른쪽 범례를 가리지 않도록 범례 앞까지만 씁니다. |
| 3D 파이 호버 | 마우스를 올린 조각이 옆면과 함께 10px 떠오르면서 바깥쪽으로 기울고, 나머지는 0.96배로 작아지며 흐려집니다. 도넛은 가운데 값도 바뀝니다. |
| 값 카운트업 | 모든 차트에서 마우스를 올린 항목 옆에 값이 0부터 세어 올라가며 나타납니다(0.56초). 막대는 끝, 선형·영역은 포인터와 가장 가까운 선의 점 왼쪽 위, 파이(일반·3D)는 조각 가장자리에서 꺾인 선이 뻗어 나가고 끝에 말풍선(이름 · 값 · 비율, 테두리는 조각 색)이 튀어나옵니다. 마우스를 올린 조각의 % 라벨은 숨겨지고 툴팁 대신 이 말풍선이 표시되며, 말풍선은 차트 영역 밖으로 나가지 않게 맞춥니다. 게이지 링은 호의 끝, 폴라는 조각 바깥, 버블·워드·3D 파이와 나머지 차트는 항목 위에 표시합니다. 도넛과 단일 게이지는 가운데 값이 대신 세어 올라가고, 스파이더·캔들스틱·박스플롯처럼 한 항목에 값이 여러 개인 차트는 툴팁만 셉니다. 툴팁 안의 숫자도 모든 차트에서 세어 올라갑니다(서식 유지, 날짜와 시간 제외). |
