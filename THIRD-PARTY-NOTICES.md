# Third-Party Notices

CODVIL Chart Library의 배포 번들(`dist/`)은 아래 패키지를 **포함하지 않습니다**. 모두 peer dependency이며 소비 앱이 설치·번들링합니다. 소비 앱의 배포물에는 아래 고지가 포함되어야 합니다.
이 문서는 법률 의견이 아닙니다. 릴리스 전에 조직의 OSS 승인 절차를 거쳐야 합니다(명세 §14).

| 패키지 | 버전(검증 시점) | 라이선스 | 비고 |
|---|---|---|---|
| echarts | 6.1.0 | Apache-2.0 | `NOTICE` 고지 필요: "Apache ECharts, Copyright 2017-2026 The Apache Software Foundation" |
| zrender | 6.1.0 | BSD-3-Clause | echarts 의존성 |
| tslib | 2.3.0 | 0BSD | echarts / zrender 의존성 |
| vue (+ @vue/*) | 3.5.45 | MIT | |

ECharts의 `LICENSE`, `NOTICE`, `licenses/` 디렉터리는 `node_modules/echarts/`에 있습니다.

## 개발 전용 의존성

vite, vitest, @vitejs/plugin-vue, vue-tsc, typescript, @vue/test-utils, jsdom, @types/node — 배포물에 포함되지 않습니다.

`npm audit`(2026-11-10): 런타임 의존성 취약점 0건. 개발 전용 `@vue/test-utils → js-beautify → glob / minimatch` 체인에 moderate 등급 경고(GHSA-g3hv-75wg-m249, ReDoS)가 있습니다. 배포 영향은 없으며, `--force` 수정은 메이저 다운그레이드를 유발해 적용하지 않았습니다.

## 폰트 / 아이콘 / 데이터

- 폰트: 다운로드하지 않습니다. `Pretendard`, `Inter`, 시스템 폰트 순서의 font stack이며, 설치되어 있지 않으면 시스템 폰트를 사용합니다.
- 아이콘: 인라인 SVG 경로와 유니코드 기호(▲ ◆ ● ✓)를 사용하며, 외부 아이콘 세트는 쓰지 않습니다.
- 데모 데이터: 시드 기반 합성 데이터(`playground/fixtures.ts`)입니다.

SBOM(SPDX/CycloneDX)은 아직 생성하지 않았습니다. lockfile(`package-lock.json`)이 고정되어 있으므로 다음 단계에서 `npm sbom --sbom-format cyclonedx`로 생성할 수 있습니다.
