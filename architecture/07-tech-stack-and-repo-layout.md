# 07 — Tech stack and repository layout

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) everywhere except Solidity | One language across SDK, relayer and apps |
| Package manager | pnpm workspaces | Fast, works well with monorepos; QoreChain templates support it |
| Build | tsup (packages), Next.js (web), Vite (demo dApp) | Standard, fast |
| Tests | Vitest (TS), Foundry `forge test` (Solidity), Playwright (end-to-end, optional) | Fast feedback |
| Lint / format | ESLint + Prettier | Consistency |
| Web app | Next.js (App Router) + Tailwind | Hosted onboarding, dashboard, Meter; deploys to Vercel |
| Demo dApp | Vite + React + wagmi + viem | Mirrors what real dApps use |
| Relayer | Node 22 + Hono + Drizzle + SQLite | Small, typed, Docker-friendly. Node 22+ matches workshop 2 requirements. |
| Contracts | Foundry | Fest requirement for tests (if fallback category); fast |
| QoreChain kits | `@qorechain/sdk@0.14.0`, `@qorechain/pqc@0.2.3`, `@qorechain/qoresign@0.2.0`, `@qorechain/evm@0.14.0`, `@qorechain/wallet-adapter@0.6.0` | Official kits; versions with possession-proof support |
| AI (agent mode) | Anthropic SDK, model `claude-opus-5-5` (or `claude-sonnet-5-5` for cost) | Tool use for the agent's planning |
| CI | GitHub Actions | Lint, typecheck, test, forge test, secret scan |
| Hosting | Vercel (web, demo dApp), container host (relayer) | Free or cheap tiers |

## Repository layout

```
QORE/
├── README.md                     # Project README (planning now; product README in P15)
├── LICENSE                       # Apache-2.0 (P02)
├── AI_USAGE.md                   # P15
├── idea/                         # Why and what
├── tracks/                       # Where we compete
├── architecture/                 # How it works
├── prompts/                      # Sequential build prompts with validation gates
├── spike/                        # P01 feasibility scripts and results (kept for evidence)
│   ├── src/
│   └── RESULTS.md
├── packages/
│   ├── core/                     # vault, chain client, provider, preview, doctor client
│   ├── wagmi/                    # wagmi connector + EIP-6963
│   ├── react/                    # UI kit
│   └── relayer/                  # relayer library (pipeline, tanks, sponsor, meter)
├── apps/
│   ├── web/                      # Next.js: onboarding, dashboard, doctor, meter
│   ├── relayer/                  # Hono server + Dockerfile, uses packages/relayer
│   └── demo-dapp/                # Vite + wagmi app integrating @qoreconnect/wagmi
├── contracts/                    # Foundry: DemoTarget, Drainer (attack demo), tests
├── examples/
│   └── agent/                    # AI agent with capped key and root-signed instructions
├── docs/
│   ├── integration-guide.md      # For other teams (P16)
│   └── testnet-evidence.md       # Transaction hashes and explorer links
├── .github/workflows/ci.yml
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `QORE_REST` | all | `https://api-testnet.qore.host` |
| `QORE_RPC` | all | `https://rpc-testnet.qore.host` |
| `QORE_EVM_RPC` | all | `https://evm-testnet.qore.host` |
| `QORE_CHAIN_ID` | all | `qorechain-diana` |
| `QORE_EVM_CHAIN_ID` | all | `9800` |
| `RELAYER_MNEMONIC` | relayer | Secret |
| `SPONSOR_MNEMONIC` | relayer | Secret |
| `ADMIN_TOKEN` | relayer | Secret |
| `NEXT_PUBLIC_RELAYER_URL` | web, demo | Public |
| `ANTHROPIC_API_KEY` | examples/agent | Secret; usage capped |

A `.env.example` lists all of them without values. `.env*` (except the example) is git-ignored.

## Known platform constraints

- **Windows development machine.** Use Git Bash or PowerShell; Foundry on Windows works via the official installer or WSL. Python packages `qorechain-qoreseal` have no Windows wheel (not needed by us).
- **Public REST has no CORS.** The web app and demo dApp use a server-side proxy route (`/api/qore/*`) in development and production.
- **`qor_` JSON-RPC namespace not served.** Use REST.
- **Testnet history is pruned.** The Meter keeps its own time series.
- **Wait about 10 seconds after opening an EVM window** before the first transaction (documented gotcha).
- **Precompile addresses must be lowercase** in Solidity.
