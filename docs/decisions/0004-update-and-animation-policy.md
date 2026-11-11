# ADR-0004: 갱신·애니메이션 정책

- 상태: 승인 (2026-11-10)

## 결정

**모션 우선순위** (`resolveMotion`): `prefers-reduced-motion` → 제품 설정(`motion.enabled`) → 정의(`animation.enabled=false`, `preset: 'none'`) → 갱신 빈도 → preset 시간.
- 진입 500ms(cubicOut, 항목당 40ms·전체 480ms 이내 순차 stagger + 시리즈당 90ms), 갱신 400ms, 강조 150ms.
- Gauge 회전: 진입 1200ms(cubicOut), 갱신 800ms(cubicInOut). 갱신 tween이 스로틀되면 같은 2배 비율로 줄어든다.
- 관측된 갱신 간격이 1초 미만이면 갱신 tween을 간격의 40%로 줄이고, 300ms 미만이면 끈다.
- OS reduced-motion 설정 변경은 런타임에 감지해 다시 렌더링한다.

**갱신**
- Vue `definition`은 deep watch하지만, core가 구조 해시를 비교하므로 외형 변화만으로 엔진을 다시 만들지 않는다.
- `data`는 참조 비교. 한 프레임 안의 여러 갱신은 rAF로 1회 렌더로 합친다(50회 append → 1렌더, 테스트로 검증).
- 데이터만 바뀐 갱신은 `replaceMerge: ['series']`와 **안정 series `id`** 조합으로 처리한다.

## 실제 화면에서 발견한 버그 (2026-11-10, Chrome 스크린샷 검증)

1. **ResizeObserver 최초 콜백**이 마운트 직후 `resize()`(200ms 애니메이션)를 호출해 진입 애니메이션을 중단시켰다. 누적 막대는 첫 범주만, 라인은 앞부분만 그려진 채 멈췄다.
   → 크기가 실제로 바뀔 때만 resize하고, resize 자체는 애니메이션 없이 즉시 처리한다.
2. **series `id` 없이 `replaceMerge`**를 쓰면 매 갱신마다 시리즈가 새로 생성되어 실시간 라인이 1초마다 진입 애니메이션을 다시 재생했다.
   → 모든 series에 안정 id(`s:<이름>`)를 부여한다.
3. **라인 axis 툴팁 + `focus: 'series'`** 조합에서는 hover 시 다른 시리즈가 흐려져 비교가 불가능했다. → 막대 계열에서만 focus를 사용한다.

jsdom 단위 테스트로는 잡히지 않는 유형이므로, 다음 단계에서 Playwright 시각 회귀 테스트로 고정할 것을 제안한다.

## CODVIL 효과 레이어 (2026-11-10)

ECharts를 그대로 쓰지 않고, 모든 차트 유형에 공통 디자인·모션 규격을 입힌다. 구현은 `src/adapters/echarts/effects.ts`(순수 함수) → `build.ts`에서 유형별 적용.

| 효과 | 규격 |
|---|---|
| 순차 진입 | `stagger()` — 막대·파이·히트맵·버블·퍼널·레이더·워드클라우드는 항목 순서대로, 라인은 시리즈별 90ms 간격으로 그려진다. 갱신은 지연 없이 동시에 시작. |
| 부드러운 수치 전환 | 갱신 tween + 막대 라벨·도넛 중앙 합계·Gauge 수치의 `valueAnimation`(숫자가 카운트됨). |
| 실시간 이벤트 강조 | 갱신 간격이 관측되면(`motion.live`) 라인/영역 최신 지점에 ripple. 임계값 초과 시 라인은 최근 6개 초과 지점에 상태색 링, 막대는 상태색 테두리+glow. 모션 OFF면 ripple 대신 정적 링. 오버레이 series는 `fx:` id, silent, 툴팁 제외, 부모와 같은 name(범례 토글 연동). |
| Gauge 회전 | 진행 호 끝을 따라 도는 tip 마커 + 상태 등급별 glow 강도(critical > warning > ok). 호·마커·중앙 수치가 같은 타이밍으로 움직인다. |
| Hover 상세 | 반투명 glass 툴팁(backdrop blur), 직전 지점 대비 증감(▲/▼ %)과 임계 상태 표시, 마크별 glow 강조. |
| 그라데이션·Glow | 막대는 값 끝이 밝고 기준선으로 갈수록 흐려지는 그라데이션, 라인·게이지·링은 자기 색 glow, Sankey 흐름은 출발→도착 색 블렌딩. 4,000점 초과 데이터는 glow 생략(성능). |

`theme.effects: { gradient?: boolean; glow?: boolean }`(기본 둘 다 true)로 인쇄·저전력 환경에서 끌 수 있다.

**3D 스타일** (`theme.effects.depth`, 기본 false): WebGL 대신 2D 렌더러에서 의사 3D로 그린다(이전 three.js 3D 파이는 파이만 지원해 제거). 막대=custom series 직육면체(앞면 그라데이션·밝은 윗면·어두운 옆면, 2D와 같은 폭·간격 규칙), 파이/도넛=어두운 복제 레이어를 아래로 쌓은 원판(silent, `fx:depth:*`), 산점도/버블=radial 구, 라인/영역/그 외=우하단 drop shadow. 4,000점 초과 데이터는 3D를 생략한다.

**다시 재생**: `replayAnimation()`(adapter `replay()` → `chart.clear()` 후 마지막 option을 notMerge로 다시 적용). DOM 위젯은 remount로 CSS 진입 애니메이션을 다시 재생한다. 데이터는 다시 불러오지 않는다. `prefers-reduced-motion` 우선순위는 그대로 유지된다.
