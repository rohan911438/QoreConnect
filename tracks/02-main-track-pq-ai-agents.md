# 02 — Main track: Post-Quantum AI Agents

**Prizes:** 1st $1,500, 2nd $750. **Team size:** 1–4.

---

## Why this category, in one paragraph

In QoreChain's own terminology, an **agent is an abstract account with linked, limited keys** ("Agents (abstract accounts) are testnet-only for now"). The category's requirements are exactly the primitives QoreConnect is built on: scoped EVM windows, spending and access limits, smart-account rules and authenticated messaging. A MetaMask session key and an AI agent key are the **same mechanism** in QoreConnect: a key the post-quantum root has linked with caps, a contract allow-list and an expiry. We serve humans and AI agents with one permission layer.

---

## Requirement-by-requirement mapping

| # | Category requirement (from /prizes) | How QoreConnect meets it | Where in the architecture | Proven by |
|---|---|---|---|---|
| R1 | **Scoped EVM window** | The root key opens EVM windows with tight bounds (block count, transaction count, total uqor) wherever the protocol requires one; for agent keys we open a window scoped to the agent's target contracts *(exact behaviour verified in P01)* | `architecture/03-flows.md` (window flow) | Testnet transaction hash in README |
| R2 | **Transaction limits** | `perTxLimit` in the spending rule bound to each session key and agent key | `architecture/02-account-model.md` | Over-limit transaction rejected (code 5), shown in demo |
| R3 | **Value limits** | `dailyLimit` and `allowedDenoms`; v3.2.8 refuses value-moving keys without a rule bounding every denom | `02-account-model.md` | Daily-cap rejection in demo |
| R4 | **Duration limits** | `expiryUnix` on every linked key (default 7 days; agent keys 24 hours) | `02-account-model.md` | Expired-key rejection (code 6) in tests |
| R5 | **Target limits** | `allowed_evm_calls` (`0xTARGET` or `0xTARGET/0xSELECTOR`) = the approved dApp's contracts | `02-account-model.md`, `03-flows.md` (dApp approval) | Call to non-allowed contract rejected (code 10) in demo |
| R6 | **Smart-account spending rules** | `MsgUpdateSpendingRules` / `linkAuthenticatorMsgs` with rules in one root-signed transaction | `02-account-model.md` | Rule visible via REST, linked in README |
| R7 | **Authenticated messaging** | (a) Every session-key action is an EIP-191-signed authorisation with a per-key nonce, so the chain only executes what the key signed; (b) owner instructions to an AI agent are signed by the root key (QoreSign message signing) and verified by the agent before acting, so a prompt-injected page cannot command the agent | `architecture/03-flows.md` (agent flow), `06-security-threat-model.md` | Agent ignores an unsigned instruction in demo |
| R8 | **AI agent** | Agent mode: an AI agent (Claude, via the Anthropic SDK) holds a capped key and executes owner-signed tasks through the same relayer | `03-flows.md` (agent flow) | Agent executes one capped action, refused when over cap |

---

## Why we fit better than the typical entry in this category

About 22 projects in this category are spend-limited agents. They share a pattern: **one agent, one owner, one demo script.**

QoreConnect differs on four axes:

| Axis | Typical entry | QoreConnect |
|---|---|---|
| Who it serves | One agent | Every MetaMask user, every dApp, and agents |
| Reusability | A demo | Published SDK, shared relayer, other teams integrating |
| Onboarding | Assumes the owner has QoreX and test QOR | Sponsored onboarding from MetaMask only |
| Ecosystem impact | None beyond the demo | Directly advances QoreChain's 2027 "Required" condition |

---

## Risks in this category, and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Judges see it as "not an AI project" | Medium | Agent mode is a first-class feature with its own dashboard section and demo segment. The README explains that QoreChain calls abstract accounts "agents". **Ask the organisers on day 1** (Discord) whether QoreConnect fits this category. |
| Organisers say it fits Post-Quantum dApp better | Low–medium | Switch to the fallback (below). Decide by 24 Nov. |
| Authenticator EVM calls behave differently than documented | Medium | P01 tests them before any product code. |
| Another team ships a similar shared relayer | Low | Speed: SDK published by 26 Nov; integrations announced publicly. |

---

## Fallback: Post-Quantum dApp category

If the organisers recommend Post-Quantum dApp, add these (about 1 extra day, absorbed by cutting "could have" items):

| Requirement | Addition |
|---|---|
| `pqcVerify` | A `QoreConnectGuard` contract: high-value or sensitive actions (for example raising limits on-chain or releasing a large transfer) require an ML-DSA-87 signature from the root key, checked with the `pqcVerify` precompile (`0x...0a01`) and `pqcKeyStatus` (`0x...0a02`, checking `possessionProven`) |
| Scoped EVM window | Already covered |
| Two-stage QCAI audit | Run the QCAI auditor ("Ethereum (EVM/Solidity)" setting) on the contracts, fix findings, re-run; commit both PDF reports to `audits/` |
| Foundry tests | Already planned in P10 |

The prize table is better here too (3 places: $1,500 / $750 / $500), but competition is heavier (about 30 entries).

---

## Organiser question to post on day 1

> Hi! We're building QoreConnect: sponsored onboarding that lets MetaMask users use QoreChain EVM dApps. A post-quantum root key links their MetaMask address as an authenticator with spending rules, an `allowed_evm_calls` allow-list and an expiry, and a relayer submits `MsgExecuteEVM`. It also issues the same kind of capped key to AI agents, with root-signed instructions. Does this fit **Post-Quantum AI Agents**, or would you recommend **Post-Quantum dApp**?
