# COD-CHART AI 개발 핸드오프

다른 AI 대화에서 이 저장소 작업을 이어갈 때 사용할 현재 프로젝트 및 작업 이력 요약이다. 기준 시점: 2026-11-11.

## 다음 AI에게

먼저 이 파일과 `README.md`, 관련 `docs/` 문서 및 현재 Git 상태를 확인한 뒤 작업하라. 기존 동작과 API를 보존하고, 요청 범위 밖의 변경은 피한다. 코드 변경 시 관련 테스트와 빌드를 실행하고 결과를 명시한다. 원격 푸시나 커밋은 사용자가 요청한 경우에만 수행한다.

## 프로젝트 개요

- 저장소: `KOSUKJUN/COD-CHART` — https://github.com/KOSUKJUN/COD-CHART
- 브랜치: `main`
- 패키지: `@codvil/chart` 0.1.2
- Vue 3 + TypeScript + Apache ECharts 기반 차트 컴포넌트 라이브러리.
- `@codvil/chart/core`는 Vue/ECharts와 독립적인 core API를 제공한다.
- 스키마 검증된 차트 정의, COD-PRO Contents Data, 차트 상태/접근성, 실시간 데이터, 테마 및 차트 효과 기능을 제공한다.
- 사용 방법과 공개 API는 `README.md`, 상세 차트 스펙은 `docs/component-catalog.md` 및 `docs/component-manual.md`를 우선 참조한다.
- 갱신·모션·효과 설계의 근거는 `docs/decisions/0004-update-and-animation-policy.md`에 기록되어 있다.

## 주요 구조

- `src/core/`: 차트 정의, 스키마, 테마, 런타임 및 애니메이션 정책
- `src/adapters/echarts/`: ECharts 어댑터, 옵션 빌드 및 효과
- `src/vue/`: Vue 컴포넌트와 스타일
- `playground/`: Vite 데모
- `tests/`: Vitest 테스트
- 자세한 구조와 제약은 `docs/architecture.md`, `docs/decisions/`를 확인한다.

## 최근 작업 및 대화 이력

1. 사용자가 현재 소스를 GitHub에 올려 달라고 요청했다.
2. `npm test`를 실행해 13개 테스트 파일, 251개 테스트가 통과했음을 확인했다. jsdom의 Canvas `getContext()` 미지원 관련 경고는 출력됐지만 테스트는 모두 통과했다.
3. `npm run build`가 성공했다.
4. Git 작성자 정보가 설정되지 않아 로그인된 GitHub 계정(`KOSUKJUN`)의 noreply 주소를 **저장소 로컬 설정**으로 지정했다.
5. 아래 커밋을 `origin/main`에 푸시했고, 푸시 직후 작업 트리는 깨끗했다.
   - `6f7cfe6 Add chart effects and animation support`
   - 변경: ECharts 차트 효과/애니메이션 지원, Vue 데모와 스타일, 문서 및 관련 테스트 추가·수정
6. 직전 작업에서 확인된 Git 상태는 `main...origin/main`이었으며 미커밋 변경은 없었다.

이 요약은 현재 대화와 저장소에서 확인할 수 있었던 정보만 포함한다. 이전의 다른 대화창 기록은 확인되지 않았으므로, 그곳의 작업 내역이나 미완료 요청을 추정하지 않는다.

## 최신 작업에 포함된 기능 단서

`src/adapters/echarts/effects.ts`와 `src/adapters/echarts/build.ts`가 CODVIL 시각 효과를 적용한다. 최근 변경에는 순차 진입, 데이터 갱신 tween, 실시간 지점 강조, Gauge 효과, 툴팁 및 그라데이션/Glow, 선택적 2D 의사 3D 효과, 애니메이션 재생 동작이 포함된다. 세부 규칙과 성능 제한은 ADR-0004를 기준으로 한다.

## 개발 및 검증 명령

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

최근 검증에서 `npm test`와 `npm run build`는 성공했다. `npm run typecheck`는 해당 작업에서 별도로 실행하지 않았다.

## 다음 대화에서 시작할 때 붙여넣을 문구

> 이 저장소의 `AI-HANDOFF.md`와 README, 관련 설계 문서를 먼저 읽고 현재 Git 상태를 확인해줘. 확인된 사실과 추측을 구분하고, 내가 요청한 범위 안에서만 작업해줘. 코드 수정 후 관련 테스트와 빌드를 검증해줘.
