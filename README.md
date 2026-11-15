# SOMSSI Global Marketing Copilot v2 (`somssi_sns`)

인천 송도 120분 가야금·한복 원데이클래스(**솜씨 / SOMSSI**)를 위한 글로벌 마케팅 콘텐츠 생성·검수·수정·배포 파이프라인입니다.

## 주요 기능 및 브랜치 이력

| 브랜치 | 설명 |
|---|---|
| `main` | 통합 배포 브랜치 |
| `feat/ground-truth-config` | `config/ground_truth.json`, `config/rag_knowledge_base.json` 분리 및 `somssi_system_prompt.md` 동적 렌더링(`src/promptRenderer.js`) |
| `feat/copilot-engine` | 4개 채널(`reels`, `instagram_feed`, `threads`, `naver_blog`) 생성(`generate`) 및 단일 채널 수정(`revise`) 엔진(`src/copilot.js`), Strict Schema & Section 9 Self-Check 검증기(`src/validator.js`) |
| `feat/web-dashboard` | 트렌드 수집·초안 생성·채널별 Revise·Ground Truth 편집·Make.com UTM 치환 배포 웹 대시보드(`server.js`, `public/`) |

## 실행 방법

```bash
# 1. 시스템 프롬프트 동기화 (config/ground_truth.json -> somssi_system_prompt.md)
npm run sync-prompt

# 2. 단위 및 통합 테스트 실행
npm test

# 3. 웹 대시보드 서버 실행 (기본 포트: 3400)
npm start
```

브라우저에서 `http://localhost:3400`에 접속하면 대시보드를 사용할 수 있습니다.
