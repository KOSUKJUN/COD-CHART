# ADR-0001: ECharts 단일 엔진 + 어댑터 경계 유지

- 상태: 승인 (2026-11-10, 사용자 결정 "echarts 기반으로 할께")
- 관련: 명세서 §3 "G2 + ECharts 하이브리드"를 대체

## 맥락

명세서는 AntV G2와 Apache ECharts 하이브리드를 제안했다. MVP 16종 중 엔진이 필요한 11종(Line, Area, Bar, Stacked Bar, Column, Pie, Donut, Gauge, Scatter, Heatmap, Treemap)은 모두 ECharts 6.1.0이 기본 제공한다.

## 결정

- ECharts 6.1.0(Apache-2.0)을 유일한 차트 엔진으로 사용한다.
- `RendererAdapter` 인터페이스와 `registerAdapter()`는 유지한다. G2가 꼭 필요한 유형이 생기면 `adapter-g2`를 추가하고 registry descriptor의 `engine`만 바꾼다.
- `engine` 값은 `auto | echarts | native`. 저장된 `engine: 'g2'`는 0.9.0→1.0.0 마이그레이션에서 `auto`로 변환하고 경고를 남긴다. 그 밖의 엔진 지정은 capability error(대체 렌더링 없음).
- `engineOptions.echarts`를 공식 escape hatch로 제공한다(ADR-0002의 sanitiser 적용).

## 거부한 대안

| 대안 | 거부 이유 |
|---|---|
| G2 + ECharts 하이브리드 | 번들 약 2배, 툴팁·범례·애니메이션 동작 불일치, 테마 매핑·테스트 2배, "양 엔진 전 기능 커버"가 끝이 없는 목표 |
| G2 단일 | Gauge/Treemap/Heatmap 등 대시보드 유형 폭과 접근성(aria, decal) 기본 지원이 ECharts 쪽이 넓음 |

## 영향

- 번들: 라이브러리 자체 gzip 약 37KB(core 18KB + vue/adapter 19KB) + 사용한 ECharts 모듈만 (tree-shaking, `runtime.ts`).
- 기능 매트릭스는 ECharts 6.1.0 기준으로만 관리한다([engine-feature-matrix.csv](../engine-feature-matrix.csv)).
