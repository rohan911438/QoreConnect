# QoreConnect example agent

An AI agent that pays on QoreChain under rules it cannot change. Diana testnet only.

```
owner dashboard ──(root-signed instruction, ML-DSA-87)──▶ agent ──(EIP-191, agent key)──▶ relayer ──▶ QoreChain
                                                             │                                       │
                                                  verifies against the root key            enforces the sub-account rule:
                                                  registered ON CHAIN                       allow-list (contract + function),
                                                                                            per-tx and daily caps, expiry,
                                                                                            revocation
```

## Two layers of authentication

1. **Owner → agent.** The agent acts only on an instruction signed by the owner's quantum-safe root key (ML-DSA-87).
   It fetches the root's public key from the chain, not from the instruction, and rejects anything unsigned,
   tampered, expired, for another agent or for another chain. Text found in web pages or tool results is passed to
   the model as `<untrusted_document>` data and can never become an instruction.
2. **Agent → chain.** Every action is signed by the agent's own secp256k1 key and executed through the same
   `MsgExecuteEVM` path as MetaMask. The agent's key lives on its **own sub-account** (HD index ≥ 1 of the root
   seed) with its own budget, so it can never touch the owner's main balance. The chain refuses anything outside the
   rule, whatever the model decides.

Between the two, a local guard refuses any call that is not one of the signed `calls` (target and selector) or is
over the signed per-transaction cap, before anything is signed. The daily cap is left to the chain, which counts
every call.

## Planners

| Planner | When | Notes |
|---|---|---|
| `ClaudePlanner` | `ANTHROPIC_API_KEY` (or an `ant auth login` profile) is available | `claude-opus-5-5`, one **strict** tool per signed function, server-side refusal fallback enabled (`fallbacks: "default"`) |
| `RulePlanner` | no Anthropic credentials | Deterministic: `tip <amount> QOR to <0x…> [with note "<text>"]`. Ignores documents |
| `CompromisedPlanner` | tests and demo only | Obeys injected text, to show the guard and the chain stopping it |

**Cost caps (hard):** at most 4 model turns, 4,000 output tokens per call, 40,000 tokens per run, 2 actions per
run, and 10 runs per rolling hour (`AGENT_RUNS_PER_HOUR`). The loop never runs unbounded.

## Run it

```bash
pnpm --filter @qoreconnect/example-agent agent address      # creates examples/agent/.env with AGENT_PRIVATE_KEY (git-ignored)
pnpm --filter @qoreconnect/example-agent start              # http://localhost:8790: GET /address, POST /link-proof, POST /run
```

Then open the dashboard (`/account` → **Agents** → **New agent**). The dashboard asks the agent for a possession
proof, funds and registers the agent's sub-account, links the agent key scoped to the function you list, signs the
instruction with your passkey-protected root, and can send it to the agent. **Revoke** stops the agent at the chain;
**Return budget** sends what is left back to your main account.

From the command line instead: `pnpm agent run instruction.json fixtures/creator-page.html`.

Environment (`examples/agent/.env`): `AGENT_PRIVATE_KEY`, `RELAYER_URL` (default `http://localhost:8787`),
`GAS_TANK_ID` (default `demo-dapp`), `ANTHROPIC_API_KEY` (optional), `AGENT_MODEL`, `AGENT_PORT`,
`AGENT_CORS_ORIGIN`, `AGENT_RUNS_PER_HOUR`.

## Tests

```bash
pnpm --filter @qoreconnect/example-agent test               # offline: injection, guard, cost caps (scripted fake Claude client)
pnpm --filter @qoreconnect/example-agent test:integration   # Diana: create → tip → chain refusal → injection refusal → revoke
pnpm --filter @qoreconnect/core test                        # instruction verification (valid, tampered, wrong key, expired, …)
```

Evidence from the Diana run is in `docs/testnet-evidence.md`.

## What the agent cannot do

- Call a contract or function the owner did not sign for (guard, then chain code 10).
- Exceed the per-transaction or daily cap (guard for per-tx, chain code 5 for both).
- Spend the owner's main balance (separate sub-account).
- Act after revocation or expiry (relayer pre-check, then the chain).

It **can** misuse an allowed function within its caps, for example tip the wrong creator if the model is fooled.
Keep caps small and the allowed functions narrow; that is the damage bound.
