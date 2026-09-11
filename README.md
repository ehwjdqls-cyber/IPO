# IPO Proof

근거 기반 IPO 상장심사 Q&A 및 증빙 매핑 코파일럿. 제품 요구사항과 구현 계약의 단일 기준은
[`IPO_PROOF_WEBAPP_MASTER_SPEC.md`](./IPO_PROOF_WEBAPP_MASTER_SPEC.md)이다.

## 저장소 구조 (pnpm workspace monorepo)

```text
apps/web/                    # Next.js App Router UI + /api/v1 Route Handlers
packages/db/                 # SQL 마이그레이션, DB 클라이언트, RLS/RBAC 테스트
packages/contracts/          # Zod 스키마 (env, RBAC, API DTO)
packages/ai/                 # AI provider adapter, RAG (Milestone 3부터 구현)
packages/ui/                 # 공통 디자인 토큰/컴포넌트
workers/document-worker/     # Python 추출 worker (Milestone 2부터 구현)
fixtures/synthetic/          # 합성·비식별 테스트 문서만 저장 (실제 고객 문서 금지)
tests/e2e/                   # Playwright E2E
```

## 시작하기

```bash
pnpm install
cp .env.example .env.local   # 값을 채운 뒤 사용
pnpm dev
```

## 검증 명령

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

## 보안 원칙

- 다른 조직(organization)의 데이터는 어떤 API에서도 노출되지 않는다.
- 모든 테넌트 데이터 접근에는 `organization_id`(프로젝트 데이터는 `project_id`까지) 범위가 적용된다.
- service role key 등 secret은 서버 전용이며 브라우저 번들에 포함되지 않는다.
- 실제 고객 문서·개인정보는 테스트 fixture나 Git에 저장하지 않는다.
