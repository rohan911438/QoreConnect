# P02 — Monorepo scaffold and CI

**Goal:** An empty but fully wired monorepo: all packages and apps exist, build, lint, typecheck and test in CI.

**Depends on:** P01 = GO.

**Read first:** `architecture/07-tech-stack-and-repo-layout.md`, `spike/RESULTS.md`, `spike/SDK_NOTES.md`.

**Time box:** 3 hours.

---

## Prompt

> Scaffold the QoreConnect monorepo in the repository root, following `architecture/07-tech-stack-and-repo-layout.md` exactly.
>
> 1. `git init` if needed; create `.gitignore` (node_modules, dist, .next, .env*, !.env.example, foundry out/cache, *.db).
> 2. Add `LICENSE` (Apache-2.0, copyright "QoreConnect contributors", 2026).
> 3. Root `package.json` (private, `packageManager` pnpm), `pnpm-workspace.yaml` (`packages/*`, `apps/*`, `examples/*`, `spike`), `tsconfig.base.json` (strict, ES2022, moduleResolution bundler), ESLint + Prettier configs.
> 4. Create packages with `package.json`, `tsconfig.json`, `src/index.ts`, a placeholder Vitest test, and tsup build: `packages/core`, `packages/wagmi`, `packages/react`, `packages/relayer`. Pin `@qorechain/sdk@0.14.0`, `@qorechain/pqc@0.2.3`, `@qorechain/qoresign@0.2.0`, `@qorechain/evm@0.14.0`, `@qorechain/wallet-adapter@0.6.0` in `packages/core`.
> 5. Create apps: `apps/web` (Next.js App Router + Tailwind, one page "QoreConnect"), `apps/relayer` (Hono server with `GET /health` returning `{ ok: true, version }`, plus a `Dockerfile`), `apps/demo-dapp` (Vite + React + wagmi + viem, one page).
> 6. Create `contracts/` as a Foundry project with a placeholder test. If Foundry is not installed on this Windows machine, document the install steps in `contracts/README.md` and make CI install it.
> 7. Create `examples/agent` with a placeholder `index.ts`.
> 8. Create `.env.example` with every variable from the architecture doc (no values for secrets).
> 9. Root scripts: `build`, `lint`, `typecheck`, `test`, `test:contracts`, `dev:web`, `dev:relayer`, `dev:demo`.
> 10. GitHub Actions `.github/workflows/ci.yml`: install pnpm, install Foundry, run lint, typecheck, test, `forge test`, and a secret scan (gitleaks).
> 11. Move the spike's useful helpers (chain config, endpoints) into `packages/core/src/config.ts` with the values verified in P01.
> 12. Keep the planning folders (`idea/`, `tracks/`, `architecture/`, `prompts/`) untouched, except that the root `README.md` gets a short "Repository layout" section.

---

## Deliverables

- Monorepo structure matching the architecture doc
- `LICENSE` (Apache-2.0), `.gitignore`, `.env.example`
- CI workflow
- `packages/core/src/config.ts` with verified chain constants

## Validation gate

| # | Check | Command / method | Pass condition |
|---|---|---|---|
| G1 | Install | `pnpm install` | Exit 0 |
| G2 | Build | `pnpm build` | All packages and apps build |
| G3 | Lint and types | `pnpm lint && pnpm typecheck` | Exit 0 |
| G4 | Tests | `pnpm test && pnpm test:contracts` | Placeholder tests pass |
| G5 | Relayer runs | `pnpm dev:relayer` then `curl localhost:<port>/health` | `{ "ok": true }` |
| G6 | Web runs | `pnpm dev:web` | Page loads |
| G7 | Licence | GitHub detects Apache-2.0 after push (or `licensee` locally) | Detected |
| G8 | No secrets | gitleaks in CI | Clean |

## Failure branch

- Foundry install fails on Windows: use WSL or run Foundry only in CI; document in `contracts/README.md`.
- A `@qorechain/*` package fails to install on Windows: record it, try `--ignore-scripts`, otherwise isolate that package behind a server-side API.
