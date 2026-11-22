# How AI was used to build QoreConnect

QoreConnect was built AI-native: planned and implemented with **Claude Code** through a chain of 16 written prompts, each
ending in a validation gate that had to pass on the live Diana testnet before the next prompt started. AI also runs
*inside* the product, in agent mode, behind hard safety rails.

## Tools and models

| Use | Tool / model |
|---|---|
| Research, planning, implementation, tests, reviews | Claude Code (Claude Opus models) |
| In-product agent planner | Claude (`claude-opus-5-5`) via the Anthropic SDK, strict tool schemas, with a deterministic rule-based fallback |
| Verification | Vitest, Foundry, Playwright, live Diana testnet runs, gitleaks, a client-bundle secret scan |

## Workflow

1. **Research:** Claude read the fest rules and QoreChain's public docs, roadmap and SDK, and proposed three ideas. The
   team picked one direction and rejected others (for example, a chat-based wallet, judged too common).
2. **Planning documents:** [`idea/`](idea/), [`tracks/`](tracks/) and [`architecture/`](architecture/) were drafted by
   Claude and reviewed by the team. Every unverified chain fact was marked *(unverified)* until tested.
3. **Prompt chain:** [`prompts/P01`–`P16`](prompts/) were written up front. Each prompt has deliverables, a validation
   gate and a failure branch. P01 was a go/no-go spike that tested the design's riskiest assumptions on Diana first.
4. **Gates:** after each prompt, the gate results, transaction hashes and every deviation from the plan were logged in
   [`prompts/STATUS.md`](prompts/STATUS.md). Checks that need a human (a real passkey, a real MetaMask click-through)
   are marked *manual pending* instead of being claimed.

## Per component

| Component | How it was made | How it was verified |
|---|---|---|
| Root vault (`packages/core/src/vault`) | AI-generated | Unit tests (password, passkey with a fake PRF, wrong password, AAD tamper, no plaintext stored), derivation test vector against the official SDK; manual Windows Hello check pending |
| Chain client, onboarding, session keys (`packages/core/src/account`, `onboard.ts`) | AI-generated | Diana integration tests with transaction hashes; rule-merge unit tests; invariant checker after every write |
| Relayer and sponsor (`packages/relayer`) | AI-generated | 43 unit tests; live relays on Diana (success, limit refusals, replay, 5 in parallel); Docker image in CI |
| EIP-1193 provider, wagmi connector, signing preview | AI-generated | Provider and preview unit tests; headless wagmi end-to-end on Diana |
| React UI and web app | AI-generated, design direction from the team's reference sites | React tests (focus trap, Escape, Retry), Playwright on Diana, no horizontal scroll at 360 px |
| Contracts | AI-generated | 35 Foundry tests including fuzzing; deployed and checked with `eth_getCode` |
| Agent mode | AI-generated | Instruction tests (tampered, wrong key, expired…), prompt-injection tests, Diana runs including a chain refusal |
| Security review | AI-assisted | Threat table [`docs/security.md`](docs/security.md), invariant tests, code review |
| Product direction, idea choice, testnet wallet, manual checks | Human | — |

## Mistakes the AI made, and how the gates caught them

| Where | Mistake | Caught by | Fix |
|---|---|---|---|
| P01 | Planned per-key spending rules; on Diana, rules are **account-wide** | Spike test on Diana | One managed rule kept first; AI agents get their own sub-accounts |
| P01 | Assumed a refused transaction is free; refusals cost fees | Spike measurements | Mandatory relayer pre-check before every broadcast |
| P04 | Simulation with a placeholder fee that a new account could not afford | Integration test failed on Diana | Simulate with a zero fee |
| P06 | Expected a separate EVM transaction hash; relayed calls run inside the Cosmos envelope | Diana run (no `ethereum_tx` event) | Provider synthesises receipts from the envelope |
| P09 | **Retry** after a failure created a *second* root account | React test of the Retry path | Flow events carry the root and link proof, so Retry resumes |
| P10 | Guard contract relied on a `possessionProven` precompile field that does not exist | Precompile ABI check | Guard verifies a root ML-DSA signature against the registered key |
| P12 | Dashboard used colour tokens that did not exist | Visual check during the P12 gate | Tokens fixed |
| P13 | The SDK trusted the relayer's transaction hash without checking it was **this** call (T9) | Threat-model walkthrough | Provider checks account, target, data, value, nonce and gas limit on chain |
| P13 | The leak detector flagged the ML-DSA secret key's first 32 bytes in transactions: a false alarm, because those bytes are the public seed shared with the public key | Live invariant test on Diana | Detector watches the secret parts of the key |
| P13 | The bundle scan flagged elliptic-curve constants as "key-shaped" | Running the scan | Array-literal constants excluded |

## AI inside the product: agent mode

An AI agent can tip or pay through approved contracts on the owner's behalf. Its boundaries do not depend on the model
behaving well:

- The agent acts only on **instructions signed by the owner's ML-DSA-87 root key**, verified against the key registered on
  chain. Text from web pages or tool results can never become an instruction.
- A local guard allows only the signed instruction's contract targets and function selectors.
- The agent's key lives on its **own sub-account** with its own caps and allow-list, which the chain enforces even if every
  local check failed.
- Cost caps limit model calls and tokens; the agent falls back to a deterministic planner when no API key is set.
- One root-signed transaction revokes the agent.

Tests: [`packages/core/test/agent.test.ts`](packages/core/test/agent.test.ts), [`examples/agent/test`](examples/agent/test),
and the Diana runs in [`prompts/STATUS.md`](prompts/STATUS.md) (P11).
