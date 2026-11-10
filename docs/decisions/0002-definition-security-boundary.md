# ADR-0002: 차트 정의는 신뢰하지 않는 입력이다

- 상태: 승인 (2026-11-10)

## 맥락

정의는 저장되어 다른 사용자에게 로드된다(대시보드 공유). 정의를 통한 XSS, SSRF, CSS 주입, 프로토타입 오염, 임의 코드 실행을 막아야 한다.

## 결정

| 위협 | 대응 | 위치 |
|---|---|---|
| SSRF / 임의 URL | `dataSource.endpointId`는 `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$` (`/`, `:` 불가), `url` 속성은 오류. 실제 호출은 호스트의 `fetch/subscribe`가 담당 | `schema.ts` |
| XSS (텍스트 카드) | 제한 마크다운 → 토큰 트리 → `h()`. script/style/iframe은 내용째 제거, 링크는 `https:`/`mailto:`만, `rel="noopener noreferrer nofollow"` | `sanitize.ts`, `Markdown.ts` |
| XSS (ECharts HTML 툴팁) | 모든 툴팁은 라이브러리 formatter가 `escapeHtml`로 생성. escape hatch의 `<` 포함 formatter 문자열, tooltip `renderMode/appendTo` 재정의 제거 | `build.ts`, `sanitize.ts` |
| 외부 리소스 로드 / 링크 | `image://`, `javascript:`, `data:text/html`, `url(` 값과 `link/target` 키 제거 | `sanitizeEngineOptions` |
| CSS 주입 | 테마 색상은 `#hex` / `rgb()` / `rgba()` 리터럴만 허용 | `isSafeColor` |
| 프로토타입 오염 | `__proto__`, `constructor`, `prototype` 키 제거, 비평범 객체 제거, 깊이 12 / 노드 20,000 제한 | `sanitize.ts` |
| 임의 코드 | 이벤트는 `filter-dashboard | navigate(routeId) | emit` 선언형 액션만. 정의에 함수가 들어갈 수 없음 | `schema.ts` |
| 정보 노출 | 원시 예외 메시지 비노출, `ChartDataError`의 안전 메시지 + correlationId만 표시 | `source.ts` |

라이브러리 전체에서 `v-html`, `innerHTML`, `eval`, `new Function` 사용을 금지하고 테스트로 강제한다.

## 남은 일

서버 측에서도 같은 스키마로 검증해야 한다(명세 §5). `validateChartDefinition`은 순수 함수라 Node에서 재사용하거나, Java 서버용 JSON Schema로 내보내는 작업이 필요하다.
