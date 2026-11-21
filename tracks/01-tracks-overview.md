# 01 — Tracks overview

Everything about the fest's categories, awards and rules that affects our choices. Source: build.qorechain.io (home, rules, prizes, FAQ, about), read 21 Nov 2026. The site says rules, prizes and dates are *"not final and may still change"*. Re-check before submission.

---

## How entry works

- **Each project picks exactly one category** and competes for that category's bounty.
- **Every eligible project can also compete for the special awards.**
- *"You may build more than one project. Each project has one category."* We are building one.
- One GitHub account per person. Every team member registers individually (GitHub, X and a QoreX testnet address must all be connected). Minimum age 18.
- *"Multiple accounts for one person and copied work lead to removal of the project or the account."*

## The six categories

| Category | Team | Prizes | Core requirements |
|---|---|---|---|
| Quantum Pass | 1–2 | 10 × $150 (jury) + 20 × $50 raffle | `create-qorechain-dapp`, connect QoreX, deploy on testnet, one hybrid-signed transaction |
| Post-Quantum dApp | 1–3 | $1,500 / $750 / $500 | EVM dApp, scoped EVM window, `pqcVerify`, two-stage QCAI audit, Foundry or Hardhat tests |
| **Post-Quantum AI Agents (our choice)** | 1–4 | **$1,500 / $750** | Scoped EVM window; tx, value, duration and target limits; smart-account spending rules; authenticated messaging |
| Encrypted Apps | 1–4 | $1,500 / $750 | ML-KEM-1024, registered recipient keys, ML-DSA key binding, client-side encrypt/decrypt |
| Cross-VM | 1–4 | To be announced | EVM contract atomically calling an approved Native contract on testnet |
| Protocol Builders | 2–4 | $3,000 / $1,500 | Rollup or sidechain: ML-DSA-signed batches, withdrawal, settlement receipt, watchtower, ML-KEM data protection, threat model |

## Special awards

| Award | Prize | Eligibility | Our status |
|---|---|---|---|
| Q-Day Survivor | 5 × $200 | Q-Day Drill on 18 Nov | **Closed** (registration ended 17 Nov) |
| **People's Choice** | $500 / $300 / $200 | QoreX mainnet community vote, 6–15 Dec; 3 votes per wallet with at least 10 QOR, max 1 per project; no self-votes | **Target** |
| **Best AI-Native Build** | $500 | `AI_USAGE.md` in the repo + AI-native tick on the form | **Target** |
| Quantum Campus | $500 | Every team member is a verified enrolled student | Only if the team qualifies |
| Regional Awards | 5 × $200 | Region chosen on the form; **only projects that win no other prize** | Fallback |
| Top-Quality Awards | 7 × $250 | Highest-scored projects with **no other prize**, at least 70/100 from the jury | Fallback |

## Grants (after the fest)

| Grant | Amount (in QOR) | Eligible levels |
|---|---|---|
| Community Grant | up to $5,000 | Quantum Pass, Intermediate, special-award projects |
| **Association Grant** | **up to $10,000 (Advanced), $15,000 (Expert)** | Advanced and Expert |

Paid against milestones from January 2027. QoreConnect fits an Advanced-level Association Grant.

## Judging

- Automatic and manual checks first (3–5 Dec), then the jury scores each project against its category rubric (6–15 Dec).
- **The rubric is not published.** We design for the category requirements, real-world usefulness, technical depth, polish and clarity of the demo.
- Finalists may receive a change request with **48 hours** to answer. Keep someone available 6–15 Dec.
- QCAI audit scores are not fed into judging automatically; jurors score by hand.

## Timeline (UTC)

| Date | Event |
|---|---|
| 27 Nov, 16:30 | Workshop 4: protocol building and submission clinic |
| **2 Dec, 23:59** | **Submission deadline; project becomes read-only** |
| 3–5 Dec | Submission checks |
| 6–15 Dec | Jury judging and People's Choice vote |
| 16 Dec | Winners announced at the live demo show |
| 17–22 Dec | Prize payouts |
| Jan 2027 | Grants by milestone |

## Category alternatives we evaluated

| Category | Fit for QoreConnect | Verdict |
|---|---|---|
| **Post-Quantum AI Agents** | Strong technical fit: authenticators, spending rules, scoped windows and signed messages are the category's requirements. Agent mode covers the "AI" part. | **Main choice**, pending organiser confirmation |
| Post-Quantum dApp | Possible if we add a contract that uses `pqcVerify`, Foundry tests and a two-stage QCAI audit. About one extra day. | **Fallback** |
| Cross-VM | No natural fit | No |
| Encrypted Apps | No natural fit | No |
| Protocol Builders | Requires a rollup; needs 2+ people | No |
| Quantum Pass | Too small for this project; low prizes | No |

See [`02-main-track-pq-ai-agents.md`](02-main-track-pq-ai-agents.md) for the full requirement mapping.
