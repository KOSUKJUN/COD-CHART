# CODVIL Chart 컴포넌트 사용 매뉴얼

## 1. 개요와 준비

`@codvil/chart`는 Vue 3와 Apache ECharts를 사용하는 차트 라이브러리입니다. 차트 정의로 데이터, 차트 종류와 옵션을 지정합니다. COD-PRO Chart Contents 데이터 형식도 지원합니다.

- 요구 사항: Node.js와 npm, Vue 3.5 이상, ECharts 6.x
- 이 프로젝트는 `private: true`, `UNLICENSED`이며 npm에 공개된 패키지가 아닙니다.
- 라이브러리와 데모 대시보드의 기본 렌더러는 Canvas입니다. 데모의 SVG 렌더러 스위치로 SVG를 선택할 수 있습니다.
- 접근 권한이 있는 사용자만 비공개 GitHub 저장소에 접근할 수 있습니다.

### 소스 실행

```bash
git clone https://github.com/KOSUKJUN/COD-CHART.git
cd cod-chart
npm ci
npm run dev
```

터미널에 표시된 로컬 주소를 브라우저에서 열면 데모를 볼 수 있습니다. 다른 프로그램이 5173 포트를 사용하면 Vite가 다른 포트를 선택할 수 있습니다.

```bash
npm run typecheck
npm test
npm run build
```

### 다른 프로젝트에서 사용

빌드 결과물 `dist`는 Git에 포함되지 않습니다. 저장소에서 `npm ci`와 `npm run build`를 실행한 다음 `npm pack`으로 생성한 `.tgz`를 사용하는 프로젝트에 설치하세요.

```bash
# cod-chart 저장소
npm ci
npm run build
npm pack

# 사용하는 Vue 프로젝트: 실제 생성된 파일 경로로 바꿉니다.
npm install /path/to/codvil-chart-0.1.0.tgz
npm install vue echarts
```

Windows에서는 `/path/to/...` 대신 실제 파일의 Windows 경로를 입력합니다. tarball을 자동 배포하거나 GitHub Packages/npm에 게시하는 과정은 포함되어 있지 않습니다.

## 2. Vue에서 차트 표시

```ts
// main.ts
import { createApp } from 'vue';
import { createCodvilChart } from '@codvil/chart';
import '@codvil/chart/style.css';
import App from './App.vue';

createApp(App)
  .use(createCodvilChart({ locale: 'ko-KR' }))
  .mount('#app');
```

```vue
<script setup lang="ts">
import { CvChart, type ChartDefinition, type ChartEventPayload } from '@codvil/chart';

const chart: ChartDefinition = {
  schemaVersion: '1.0.0',
  id: 'monthly-orders',
  type: 'column',
  title: '월별 주문',
  renderer: 'svg',
  data: {
    fields: [
      { name: 'month', type: 'string', label: '월' },
      { name: 'orders', type: 'number', label: '주문', unit: '건' },
    ],
    rows: [
      { month: '1월', orders: 120 },
      { month: '2월', orders: 180 },
    ],
  },
  encoding: { x: 'month', y: 'orders' },
  interactions: ['tooltip', 'selection'],
};

function onPointClick(event: ChartEventPayload) {
  console.log(event.name, event.value, event.row);
}
</script>

<template>
  <CvChart :definition="chart" :height="320" @point-click="onPointClick" />
</template>
```

`renderer`는 `canvas` 또는 `svg`입니다. 생략하면 Canvas를 사용합니다. 버튼으로 표 보기와 이미지 저장을 사용할 수 있습니다.

## 3. 데이터와 차트 정의

### 행 기반 데이터

- `schemaVersion`: 현재 `1.0.0`.
- `id`: 영문, 숫자, `_`, `-`만 사용하며 최대 64자.
- `type`: 아래 표의 차트 종류.
- `data.fields`: 각 데이터 필드의 `name`, `type` (`string`, `number`, `time`, `boolean`) 및 선택적 `label`, `unit`, `format`, `precision`.
- `data.rows`: 필드 이름을 키로 사용하는 객체 배열.
- `encoding`: 차트의 축·범주·측정값에 사용할 필드 이름.
- `options`, `interactions`, `theme`, `animation`: 선택 설정.

`number`는 숫자 문자열도 허용합니다. 변환이 불가능한 값은 빈 값으로 처리되고 경고가 발생합니다. 필수 인코딩이 없거나 참조 필드의 타입이 잘못되면 오류 상태가 표시됩니다. `data` prop으로 행 배열을 전달하면 정의의 `data.rows`보다 우선합니다. 배열 내용을 직접 변경하지 말고 새 배열로 교체하세요.

### 차트 종류 및 필수 인코딩

| 종류 | type | 필수 인코딩 |
|---|---|---|
| 선형 / 영역 / 수평·수직·누적 막대 | `line`, `area`, `bar`, `column`, `stacked-bar` | `x`, `y` |
| 파이 / 도넛 / 깔때기 | `pie`, `donut`, `funnel` | `category`, `value` |
| 단일 게이지 | `gauge` | `value` |
| 다중 게이지 | `gauge-group` | `label`, `value` |
| 산점도 | `scatter` | `x`, `y`; 선택: `color`, `size`, `label` |
| 히트맵 | `heatmap` | `x`, `y`, `value` |
| 트리맵 / 선버스트 / 샌키 | `treemap`, `sunburst`, `sankey` | `path`, `value` |
| 레이더 / 박스플롯 | `radar`, `boxplot` | `category`, `value`; 선택: `color` |
| 캔들스틱 | `candlestick` | `x`, `y: ['시가 필드', '종가 필드', '저가 필드', '고가 필드']` |
| 버블 | `bubble` | `category`, `label`, `value`; 선택: 숫자 `x`와 `y`를 함께 지정 |
| 워드 클라우드 | `word-cloud` | `category`, `value` |
| 계층형 Polar Pie | `polar-pie` | `label`(ID), `category`(표시명), `path: [부모 ID 필드]`, `value` |

`x`, `y` 등은 고정된 필드명이 아니라 `data.fields`에 선언한 필드의 이름입니다. `y`는 일반 좌표 차트에서 여러 숫자 필드의 배열도 허용합니다. 캔들스틱은 표시된 순서로 정확히 네 필드가 필요합니다. 박스플롯은 범주별 숫자의 최소값, 1사분위, 중앙값, 3사분위, 최대값을 표시합니다.

KPI, 테이블, 상태 목록, 텍스트, 진행률 위젯의 기존 인코딩은 [컴포넌트 카탈로그](component-catalog.md)를 참고하세요. 레지스트리에 선언된 추가 native 유형 전체가 Vue 위젯으로 구현된 것은 아닙니다.

## 4. COD-PRO Contents Data

`contentsData`를 지정하면 문서 형식을 내부 행 기반 형식으로 변환합니다. `contentsData`와 `data`, `encoding`, `dataSource`는 함께 지정할 수 없습니다. 기존 행 기반 정의는 계속 사용할 수 있습니다.

```vue
<script setup lang="ts">
import { CvChart, type ContentsChartDefinition } from '@codvil/chart';

const chart: ContentsChartDefinition = {
  schemaVersion: '1.0.0',
  id: 'traffic',
  type: 'line',
  title: '트래픽',
  contentsData: {
    timesArr: ['17:00', '17:05', '17:10'],
    data: [
      { key: 'INBOUND', color: '#4D8DFF', values: [
        { x: 0, y: 142 }, { x: 1, y: 186 }, { x: 2, y: 182 },
      ] },
    ],
  },
};
</script>

<template><CvChart :definition="chart" /></template>
```

| 차트 | type | `contentsData` |
|---|---|---|
| 선형·영역·막대·Point | `line`, `area`, `bar`, `column`, `stacked-bar` | `{ timesArr: string[], data: [{ key, color?, values: [{ x, y }] }] }` |
| 파이·도넛 | `pie`, `donut` | `[{ col0: 이름, col1: 값 }]` |
| 계층형 Polar Pie | `polar-pie` | `[{ id, parent, name, value }]` |
| Spider | `radar` | `{ categories: string[], data: [{ name, data: number[] }] }` |
| 다중 게이지 | `gauge` 또는 `gauge-group` | `[{ col0: 이름, col1: 값 }]` |
| 버블 | `bubble` | `[{ categories: string[], data: [{ name: string[], value: number[] }] }]` |
| 워드 클라우드 | `word-cloud` | `[{ name, weight }]` |

- 좌표 차트의 `x`는 `timesArr`의 0부터 시작하는 유효한 인덱스입니다. `color`는 안전한 색상 리터럴만 사용합니다.
- Point 차트는 `type: 'line'`과 `options: { showPoints: true }`를 사용합니다.
- Radar의 각 `data` 길이는 `categories` 길이와 같아야 합니다.
- Bubble은 객체 한 개를 담은 배열이며, 범주와 data 그룹 수 및 각 그룹의 name/value 수가 같아야 합니다.
- Bubble Contents Data는 범주를 X축으로, 값을 Y축과 원 크기로 사용합니다. 독립적인 X·Y·크기 표현이 필요하면 행 기반 정의에서 숫자 필드 `encoding.x`, `encoding.y`, `encoding.value`를 지정하세요.
- Bubble의 원 크기는 값의 상대적인 크기를 나타냅니다. 데이터가 겹치는 경우 툴팁이나 표로 값을 확인할 수 있습니다.
- Word Cloud는 양수 가중치에 따라 글자 크기를 정하고, 단어가 겹치지 않도록 가로·세로로 배치합니다. 100개를 초과하면 가중치가 높은 100개만 표시하고 경고합니다. 데이터 표는 최대 200행을 표시합니다. 표시 공간이 부족하면 차트 크기를 늘리거나 단어 수를 줄이세요.
- Polar Pie는 루트의 `parent`를 빈 문자열로 설정합니다. ID 중복, 존재하지 않는 부모, 순환 관계는 오류입니다.
- Gauge의 모든 행이 동심원 게이지로 표시됩니다. 범례에서 항목을, 툴팁에서 실제 값을 확인할 수 있습니다. 기본 범위는 0–100이며 `options.min`, `options.max`로 변경할 수 있습니다. 범위 밖의 값은 원형 막대에서 범위 끝에 맞춰 표시하되 실제 값은 유지합니다.
- 수치에는 유효한 숫자 또는 숫자 문자열을 사용할 수 있습니다. 비어 있지 않은 문자열이 필요한 이름과 유효성 검사 오류를 확인하세요.
- 데이터 변경 시 `contentsData`가 변경된 새로운 정의를 전달하세요. 예제는 [contents-fixtures.ts](../playground/contents-fixtures.ts)에 있습니다.

독립적인 좌표가 있는 버블 차트 예제:

```ts
const bubble: ChartDefinition = {
  schemaVersion: '1.0.0', id: 'bubble-xy', type: 'bubble',
  data: {
    fields: [
      { name: 'group', type: 'string' }, { name: 'name', type: 'string' },
      { name: 'x', type: 'number' }, { name: 'y', type: 'number' },
      { name: 'size', type: 'number' },
    ],
    rows: [
      { group: '서버', name: 'A', x: 18, y: 28, size: 30 },
      { group: '서버', name: 'B', x: 35, y: 70, size: 75 },
    ],
  },
  encoding: { category: 'group', label: 'name', x: 'x', y: 'y', value: 'size' },
};
```

## 5. 속성, 이벤트, 메서드

| 속성 | 설명 |
|---|---|
| `definition` | 필수. `ChartDefinition` 또는 `ContentsChartDefinition` |
| `data` | 행 기반 차트의 런타임 행 배열; 정의의 행보다 우선 |
| `height` | 높이 숫자(px) 또는 CSS 길이 |
| `loading`, `error` | 외부에서 로딩 또는 오류 표시 제어 |
| `services` | 데이터 서비스와 테마 등 차트별 설정 |
| `header`, `actions`, `framed` | 헤더, 액션 버튼, 카드 외곽 표시 여부 |

주요 이벤트는 `ready`, `point-click`, `legend-toggle`, `zoom-change`, `drill-change`, `row-click`, `item-select`, `state-change`, `error`입니다. 이벤트 페이로드는 `type`, `chartId`와 해당 이벤트의 `name`, `value`, `row`, `rows`, `selected`, `range`, `path`, `error` 등을 포함합니다. 모든 차트에서 모든 필드가 제공되지는 않습니다.

`ref`로 노출되는 메서드는 `refresh()`, `resize(width?, height?)`, `setData(rows)`, `appendData(rows, windowSize?)`, `exportImage(options?)`, `getState()`, `getIssues()`입니다. `exportImage({ type: 'svg' })`는 SVG 렌더러에서만 지원합니다. 제공 슬롯은 `actions`, `loading`, `empty`, `error`, `footer`입니다.

## 6. 데이터 소스

행 기반 차트는 정적 `data.rows` 외에 호스트가 제공한 `fetch` 또는 `subscribe` 서비스로 데이터를 받을 수 있습니다. 라이브러리는 직접 URL이나 인증 토큰을 보관하지 않습니다.

```ts
const dataSource = {
  kind: 'rest' as const,
  endpointId: 'orders.monthly',
  refresh: { mode: 'poll' as const, intervalMs: 15000 },
};

const plugin = createCodvilChart({
  async fetch({ endpointId, params, signal }) {
    // 호스트의 인증 API 클라이언트에서 허용된 endpointId를 매핑합니다.
    return api.fetchChartRows({ endpointId, params, signal }); // { rows: [...] }
  },
});
```

`dataSource`를 정의에 넣고 적절한 `data.fields`와 `encoding`을 지정하세요. 스트림은 `kind: 'stream'`, `endpointId`, 선택적 `transport`, `windowSize`, `flushIntervalMs`와 호스트 `subscribe(request, sink)`가 필요합니다. `sink.next`는 `{ type: 'snapshot' | 'append' | 'heartbeat', sequence, payload? }` 형식을 받습니다.

## 7. 문제 해결

- **차트 설정 오류**: 필수 인코딩, 필드 타입, `contentsData` 인덱스와 배열 길이를 확인합니다. 컴포넌트의 `getIssues()`로 검증 내용을 확인할 수 있습니다.
- **데이터 없음**: `data.rows`, `data` prop 또는 호스트 데이터 서비스의 반환값을 확인합니다.
- **범위가 보이지 않음**: 게이지의 `min/max`, 레이더 데이터 값과 표시 영역 크기를 확인합니다.
- **SVG 다운로드 불가**: 정의의 `renderer: 'svg'`를 지정합니다.
- **설치 후 모듈을 찾지 못함**: `npm pack` 전에 `npm run build`를 실행했는지 확인합니다.

라이브러리 구성과 현재 제한 사항은 [README](../README.md)를 참고하세요.
