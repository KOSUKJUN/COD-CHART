# CODVIL Chart Library

Vue 3 + Apache ECharts 기반의 차트 컴포넌트 라이브러리. Premium Dark Blue 테마와 엔진 독립 core 런타임을 제공합니다.

- **하나의 정의(JSON)로 끝나는 차트** — 테마, 반응형, 로딩/빈/오류 상태, reduced-motion, 스크린리더 요약과 대체 데이터 표, PNG 내보내기가 설정 없이 기본 제공됩니다.
- **안전한 기본값** — 정의는 스키마 검증 후에만 렌더링되며, URL 데이터 소스·HTML·임의 코드 실행을 허용하지 않습니다.
- **엔진 독립 core** — `@codvil/chart/core`는 Vue와 ECharts를 import하지 않습니다(테스트로 강제).

## 빠른 시작

```bash
npm install
npm run dev        # 데모 대시보드 http://localhost:5173
npm test           # core / adapter / Vue / 경계 테스트
npm run typecheck
npm run build      # dist/ — ESM + d.ts + CSS (vue, echarts는 peer)
```

## 사용법

```ts
// main.ts
import { createApp } from 'vue';
import { createCodvilChart } from '@codvil/chart';
import '@codvil/chart/style.css';

createApp(App)
  .use(createCodvilChart({
    locale: 'ko-KR',
    // endpointId → 기존 CODVIL 인증 API 클라이언트로 매핑 (라이브러리는 URL/토큰을 모름)
    fetch: ({ endpointId, params, signal }) => api.get(`/dashboard/v1/${endpointId}`, { params, signal }),
  }))
  .mount('#app');
```

```vue
<script setup lang="ts">
import { CvChart, type ChartDefinition } from '@codvil/chart';

const definition: ChartDefinition = {
  schemaVersion: '1.0.0',
  id: 'alerts-by-severity',
  type: 'column',
  title: '심각도별 경보',
  data: { fields: [
    { name: 'severity', type: 'string', role: 'category' },
    { name: 'count', type: 'number', label: '경보', unit: '건', format: 'integer' },
  ] },
  encoding: { x: 'severity', y: 'count' },
  dataSource: { kind: 'rest', endpointId: 'security-alert-summary', refresh: { mode: 'poll', intervalMs: 30000 } },
  events: { 'point.click': { action: 'filter-dashboard', field: 'severity' } },
};
</script>

<template>
  <CvChart :definition="definition" @point-click="(e) => applyFilter(e.action, e.row)" />
</template>
```

### `<CvChart>` API

| Prop | 설명 |
|---|---|
| `definition` | 차트 정의 (schema v1). 잘못된 정의는 예외 대신 오류 상태로 표시 |
| `data` | 런타임 행 배열. **참조 비교** — 배열을 교체하거나 `appendData()` 사용 |
| `loading` / `error` | 호스트 제어 로딩·오류 |
| `height` | `definition.layout.height` 재정의 |
| `header` / `actions` / `framed` | 카드 헤더, 표 보기·PNG 버튼, 카드 외곽 표시 여부 |

| Event | 페이로드 |
|---|---|
| `ready`, `state-change` | 상태 (`loading` / `ready` / `empty` / `error`) |
| `point-click` | `row`(원본 행), `rows`(집계 행), `seriesName`, `action`(선언된 액션) |
| `legend-toggle` | `name`, `selected` |
| `zoom-change` | `range: { start, end }` (%) |
| `drill-change` | `path` (트리맵) |
| `row-click`, `item-select` | 테이블 / 상태 목록 선택 |
| `error` | `error: { code, message }` — 안전한 메시지만 |

Slots: `actions`, `loading`, `empty`, `error`(`retry` 포함), `footer`.
Expose(ref): `refresh`, `resize`, `setData`, `appendData`, `exportImage`, `getState`, `getIssues` — 엔진 인스턴스는 노출하지 않습니다.

캔들스틱의 `encoding.y`는 `['open', 'close', 'low', 'high']` 순서로 시가·종가·저가·고가 필드 네 개를 지정합니다. 박스플롯은 `category`별 `value` 데이터의 최소값, 사분위수, 중앙값, 최대값을 표시합니다. 샌키와 선버스트의 `path`는 각 행에 지정된 순서대로 연결되는 필드입니다.

### COD-PRO Contents Data

Chart Contents의 데이터를 변환 없이 `contentsData`로 전달할 수 있습니다. 기존 `data.fields/rows` 형식도 그대로 지원합니다. `contentsData`는 정적 데이터용이며 `data`, `encoding`, `dataSource`와 동시에 지정할 수 없습니다. 데이터 갱신은 `contentsData`가 바뀐 새 정의를 전달하세요.

```ts
import type { ContentsChartDefinition } from '@codvil/chart';

const chart: ContentsChartDefinition = {
  schemaVersion: '1.0.0', id: 'traffic', type: 'line', title: '트래픽',
  contentsData: {
    timesArr: ['17:00', '17:05'],
    data: [{ key: 'INBOUND', color: '#4D8DFF', values: [{ x: 0, y: 142 }, { x: 1, y: 186 }] }],
  },
};
```

| PDF 종류 (Contents Code) | `type` | `contentsData` 형식 |
|---|---|---|
| 선형/영역, 수평/수직 막대, 선형 Point (4, 5, 6, 8, 21) | `line`, `area`, `bar`, `column` | `{ timesArr: string[], data: [{ key, color?, values: [{ x, y }] }] }`; `x`는 `timesArr` 인덱스. Point는 `options.showPoints: true` |
| Pie (7) | `pie` | `[{ col0: 이름, col1: 값 }]` |
| Pie(Polar) (14) | `polar-pie` | `[{ id, parent, name, value }]`; 최상위의 `parent`는 빈 문자열 |
| Spider (16) | `radar` | `{ categories: string[], data: [{ name, data: number[] }] }` |
| Gauge (22) | `gauge` | `[{ col0: 이름, col1: 값 }]`; 모든 항목을 다중 게이지로 표시 |
| Bubble (31) | `bubble` | `[{ categories: string[], data: [{ name: string[], value: number[] }] }]` |
| Word Cloud (32) | `word-cloud` | `[{ name, weight }]` |

문서에 포함된 예시의 생략 기호와 특수 따옴표는 JSON 문법이 아니므로 실제 전달 시 표준 JSON으로 작성해야 합니다. 유효하지 않은 인덱스, 필드나 부모 관계는 오류 상태로 표시합니다. 예제 전체는 [playground/contents-fixtures.ts](playground/contents-fixtures.ts)에 있습니다.

### Vue 없이 (core API)

```ts
import { createChart, installEChartsAdapter } from '@codvil/chart';
const handle = createChart(el, definition, { fetch });
handle.on('point.click', (e) => …);
handle.destroy(); // 엔진 인스턴스·타이머·옵저버·구독 모두 해제
```

## 16종 MVP

| Native(DOM) | ECharts |
|---|---|
| KPI 카드, 데이터 테이블, 상태/경보 목록, 텍스트(제한 마크다운), 진행률/임계치 | 라인, 영역, 가로 막대, 누적 막대, 세로 막대, 파이, 도넛, 게이지, 산점도, 히트맵, 트리맵 |

인코딩·옵션·상호작용 상세: [docs/component-catalog.md](docs/component-catalog.md)

## 실시간 데이터

`dataSource: { kind: 'stream', endpointId, transport: 'sse' | 'websocket', windowSize, flushIntervalMs }`
호스트는 `subscribe(request, sink)`를 제공합니다. 라이브러리는 버전형 envelope(`type`, `sequence`, `payload`)를 받아
중복/역순 제거 → burst 병합(coalesce) → 슬라이딩 윈도 → 1프레임 1렌더를 수행하고,
오류 시 REST snapshot 복구 + 지수 backoff 재연결, 탭 비가시 15초 후 구독 해제를 처리합니다.

## 문서

- [컴포넌트 사용 매뉴얼](docs/component-manual.md) — 설치, Contents Data, 차트 종류 및 API
- [아키텍처](docs/architecture.md) · [컴포넌트 카탈로그](docs/component-catalog.md) · [엔진 기능 매트릭스](docs/engine-feature-matrix.csv)
- ADR: [0001 ECharts 단일 엔진](docs/decisions/0001-echarts-single-engine.md) · [0002 정의 보안 경계](docs/decisions/0002-definition-security-boundary.md) · [0003 테마/팔레트 검증](docs/decisions/0003-theme-palette-validation.md) · [0004 갱신·애니메이션 정책](docs/decisions/0004-update-and-animation-policy.md)
- [서드파티 고지](THIRD-PARTY-NOTICES.md)

## 지원 환경 / 알려진 제한

- Vue ≥ 3.5 (`useId` 사용), ECharts ≥ 6.0. 최신 Chromium/Firefox/Safari 기준 (`color-mix()`, `:has()`는 데모에서만 사용). 공식 브라우저 매트릭스는 **미확정**.
- SSR: DOM 접근은 `onMounted` 이후에만 발생하지만 SSR 렌더 테스트는 아직 없음.
- Java/Tomcat API, ClickHouse/MariaDB 연동은 기존 CODVIL 서버 코드가 없어 미구현 — 데이터 계약(`DataServices`)만 정의.
- 성능 수치는 미측정(스펙 §8 가설 상태). 시각 회귀 테스트·라이트 테마·G2 어댑터는 다음 단계.
