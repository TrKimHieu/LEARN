# LEARN monorepo

One npm workspace: `apps/api`, `apps/worker`, `apps/compute` (backend), `apps/web` (Next.js), `apps/mobile` (Expo), and `packages/*`. Install once at the root with `npm ci`; there is one `package-lock.json`.

Read `docs/progress/STATE.md`, `docs/progress/CHECKLIST.md`, and `docs/STRUCTURE.md` before backend changes. Each app has its own `AGENTS.md`.

- Preserve `/api/v1`, cookie/native refresh, ownership, quotas and grading.
- Validate external input with Zod; TypeScript strict; no explicit `any`.
- Never expose answers before submission or commit secrets/private backups.
- Never reset existing databases or rewrite applied migrations. Use the isolated test stack.
- Web and mobile import `@learn/contracts` from `packages/contracts` directly. A contract change runs `npm run contracts:hash` and must pass typecheck in every workspace (`npm run typecheck` at the root). Installed mobile builds still compare `CONTRACTS_HASH` with `GET /api/v1/meta`, so keep changes backward compatible.
- Apps never import another app's source; only `packages/*` are shared.
- Checks: backend at the root (`npm run lint`, `typecheck`, `test`, `test:tooling`, `build`); web and mobile with `npm run <script> -w apps/web|apps/mobile`. CI runs per app, filtered by path (`.github/workflows/{backend,web,mobile}-*.yml`).
- Update STATE, CHECKLIST and session-log with real evidence; mocks are not live integration.
