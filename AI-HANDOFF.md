# COD-CHART AI 개발 핸드오프

다른 AI 대화에서 이 저장소 작업을 이어갈 때 사용할 현재 프로젝트 및 작업 이력 요약이다. 기준 시점: 2026-11-13.

## 다음 AI에게

먼저 이 파일과 `README.md`, 관련 `docs/` 문서 및 현재 Git 상태를 확인한 뒤 작업하라. 기존 동작과 API를 보존하고, 요청 범위 밖의 변경은 피한다. 코드 변경 시 관련 테스트와 빌드를 실행하고 결과를 명시한다. 원격 푸시나 커밋은 사용자가 요청한 경우에만 수행한다.

## 프로젝트 개요

- 저장소: `KOSUKJUN/COD-CHART` — https://github.com/KOSUKJUN/COD-CHART
- 브랜치: `main`
- 로컬 경로: `D:\Business\Solution\claude\COD-CHART` (2026-11-13부터. 예전 `C:\Users\user\COD-CHART`는 더 이상 쓰지 않는다)
- 푸시 계정: 이 PC의 Git은 `leonis1401-rgb`로 인증하며, 이 계정이 저장소 Collaborator(쓰기 권한)다. 커밋 작성자는 저장소 로컬 설정 `shinjungeun`.
- 컴포넌트: 55종 (ECharts 차트 21종 + DOM 위젯 34종). 전체 목록과 옵션은 `docs/component-catalog.md`.
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

### 2026-11-13 작업

7. 로컬 저장소를 `D:\Business\Solution\claude\COD-CHART`로 옮겼다(GitHub에서 새로 clone).
8. 다른 대화 세션들이 커밋하지 않고 남긴 작업(약 30개 파일)을 `5bba125 Add dashboard features, scene views and playground toggles`로 커밋·푸시했다.
   - 라인·영역 옵션: `realtime`(실시간 추가·슬라이드), `drawOrder: 'one-by-one'`(한 줄씩 그리기), `zoom`(하단 구간 탐색)
   - 관제 옵션: `autoTour`, `thresholds` + `alarm`(패널 경보), `staleAfterMs`(데이터 지연 표시), `ranking`(Top-N bar race), heatmap `pattern: 'week-hour'`, `status-grid` 위젯
   - 플레이그라운드: 컴포넌트 / 3D 상황판 / 메인화면 보기(`playground/views/`)
9. 플레이그라운드 정리
   - "선형·영역 차트 옵션 · 2종" 섹션을 없앴다. 대신 상단 "실시간 추가"·"한 줄씩 그리기" 토글이 맨 위 "기존 COD-M 차트 대체" 섹션의 선형·영역 차트를 직접 바꾼다.
   - "실시간 추가", "하단 차트 검색" 토글은 기본 꺼짐이다(`d5e7a8c`, `7b549b4`).
   - "관제 화면 기능" 섹션은 우리 차트로 만든 관제용 예시·테스트다. 정식 요구사항은 아니지만 참고용으로 그대로 둔다.
10. `realtime`과 `drawOrder: 'one-by-one'`을 함께 쓰면, 한 줄씩 그리기는 진입 때 한 번만 하고 이후에는 데이터에 따라 슬라이드한다(반복 그리기 루프 없음).
11. `docs/component-catalog.md`를 레지스트리 기준 55종과 새 옵션 설명으로 갱신하고, `.gitattributes`로 줄바꿈을 LF로 고정했다.

이 요약은 대화와 저장소에서 확인한 정보만 포함한다. 8번의 작업을 한 다른 세션들의 대화 기록은 확인하지 못했으므로, 그 작업의 배경이나 미완료 요청은 추정하지 않는다.

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

개발 서버는 `http://localhost:5174`에서 열린다(`vite.config.ts`, `strictPort`). VS Code 실행 구성은 `.vscode/launch.json`에 있다.

2026-11-13 검증에서 `npm test`와 `npm run typecheck`가 성공했다.

## 다음 대화에서 시작할 때 붙여넣을 문구

> 이 저장소의 `AI-HANDOFF.md`와 README, 관련 설계 문서를 먼저 읽고 현재 Git 상태를 확인해줘. 확인된 사실과 추측을 구분하고, 내가 요청한 범위 안에서만 작업해줘. 코드 수정 후 관련 테스트와 빌드를 검증해줘.
