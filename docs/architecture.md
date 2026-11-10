# 아키텍처

```text
Host app (Vue)                       ── createCodvilChart({ locale, theme, motion, fetch, subscribe })
  └─ <CvChart>  src/vue/             ── props/emits/slots, 카드·상태 오버레이·표 보기, native 위젯 렌더
       └─ useChart()                 ── mount 시 createChart, unmount 시 destroy, 엔진 전환 시 재생성
            └─ createChart()  src/core/chart.ts
                 ├─ validateChartDefinition  (migrate → validate → defaults)   schema.ts
                 ├─ resolveEngine            (registry, 결정적, capability error)  registry.ts
                 ├─ DataController           (static / REST poll / stream)      source.ts
                 ├─ normalizeRows            (타입 강제, maxRows)                data.ts
                 ├─ resolveTheme / resolveMotion                                  theme.ts, animation.ts
                 ├─ buildSummary / buildAccessibleTable                          a11y.ts
                 └─ RendererAdapter  (registerAdapter로 외부 주입)               adapter.ts
                      └─ EChartsAdapter  src/adapters/echarts/
                           ├─ runtime.ts  tree-shaken echarts.use([...]), KO locale
                           └─ build.ts    정의+행 → ECharts option (순수 함수)
```

## 경계 (tests/boundaries.test.ts로 강제)

| 계층 | import 가능 | 금지 |
|---|---|---|
| `src/core` | 자기 자신 | `vue`, `echarts`, `../vue`, `../adapters` |
| `src/adapters/echarts` | core, `echarts/*` | `vue` |
| `src/vue` | core, `vue` | `echarts`, adapters |
| 전체 | — | `v-html`, `innerHTML`, `eval`, `new Function` |

## 렌더 파이프라인

1. 정의 변경 → `structureKey`(행 제외 안정 해시) 비교. 동일하면 아무것도 하지 않음.
2. 행 변경 → `normalizeRows` → `requestAnimationFrame`으로 병합 → 1프레임 1회 렌더.
3. 구조 변경이면 `setOption(notMerge)`, 데이터만이면 `setOption(replaceMerge: ['series'])` + 안정 series `id`로 값 tween.
4. 렌더 후 상태 `ready | empty` 결정. 데이터/정의 실패(`failed`)는 새 데이터나 유효 정의가 올 때까지 유지.

## 상태 모델

`idle → loading → ready | empty | error`. 모든 오류는 예외가 아닌 상태로 변환되어 대시보드의 다른 차트에 영향을 주지 않습니다.
사용자 표시 메시지는 항상 안전한 문구이며, 원시 예외 텍스트는 노출하지 않습니다(`toSafeError`). 호스트는 `ChartDataError(code, message, correlationId)`로 추적 ID를 전달할 수 있습니다.

## 소유권 / 정리

`ChartHandle.destroy()`는 rAF, ResizeObserver, matchMedia 리스너, visibilitychange 리스너, 폴링·flush·재연결 타이머, AbortController, 스트림 구독, ECharts 인스턴스(`off()` + `dispose()`), 이벤트 리스너를 모두 해제합니다. 테스트는 destroy 후 `getInstanceByDom()`이 `undefined`이고 가짜 타이머 수가 0임을 확인합니다.
