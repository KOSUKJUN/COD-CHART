# ADR-0004: 갱신·애니메이션 정책

- 상태: 승인 (2026-11-10)

## 결정

**모션 우선순위** (`resolveMotion`): `prefers-reduced-motion` → 제품 설정(`motion.enabled`) → 정의(`animation.enabled=false`, `preset: 'none'`) → 갱신 빈도 → preset 시간.
- 진입 500ms(cubicOut, 항목당 12ms·최대 240ms stagger), 갱신 400ms, 강조 150ms.
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
