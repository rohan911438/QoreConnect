# QoreConnect — the migration layer for the migration year

> **Quantum-safe root. MetaMask convenience.**
> Any Ethereum user and any EVM dApp on QoreChain in under 60 seconds — with a post-quantum key in control and the classical key capped, scoped and revocable.

**Hackathon:** Build Before Q-Day: The QoreChain Developer Fest (build.qorechain.io)
**Network:** QoreChain testnet `qorechain-diana` (EVM chain id 9800)
**Submission deadline:** 2 Dec 2026, 23:59 UTC (the repo locks automatically)
**Status:** This is the original planning README (21 Nov 2026), kept for reference. The product README is [`../README.md`](../README.md).

---

## What this folder contains

This repository currently holds the **planning workspace**. No code has been written yet. Each folder answers one question:

| Folder | Question it answers | Start here |
|---|---|---|
| [`idea/`](../idea/) | **What** are we building, **why** this idea, and why it is the best idea for QoreChain | [`idea/01-problem.md`](../idea/01-problem.md) |
| [`tracks/`](../tracks/) | **Where** do we compete: the main category, side awards, why they fit, and the submission checklist | [`tracks/01-tracks-overview.md`](../tracks/01-tracks-overview.md) |
| [`architecture/`](../architecture/) | **How** it works: components, account model, flows, relayer, SDK, security, repo layout | [`architecture/01-system-overview.md`](../architecture/01-system-overview.md) |
| [`prompts/`](../prompts/) | **In what order** we build it: sequential build prompts, each with a validation gate | [`prompts/README.md`](../prompts/README.md) |

Read them in that order: idea, then tracks, then architecture, then prompts.

---

## The idea in 30 seconds

**The problem.** QoreChain requires every EVM transaction to come from an account with a registered post-quantum (ML-DSA-87) key and an open "EVM window". MetaMask cannot hold that key, and QoreX (QoreChain's wallet) does not yet support EVM signing. So the millions of Ethereum users QoreChain wants to attract **cannot send a single EVM transaction**, and every dApp team rebuilds the same relayer and onboarding code.

**Why it matters to QoreChain.** QoreChain's roadmap calls 2027 *"the migration year"*. In Q3 2027 the EVM lane becomes **Required**, but only once **a supermajority of EVM traffic already signs hybrid**. Today almost nobody can, because nobody can onboard.

**The solution.** QoreConnect gives every user a hidden **post-quantum root key** (created in the browser and protected by a passkey). The root key links the user's **MetaMask key as a capped session key**: it is scoped to dApps the user approved, limited per transaction and per day, and revocable in one tap. A **sponsored relayer** submits transactions and pays gas from dApp-funded gas tanks. A **wagmi connector** lets any existing dApp integrate it in about 5 lines. A public **Migration Meter** shows how much of QoreChain's EVM activity is protected by a post-quantum root.

**The headline numbers we will demonstrate:**

| | Today | With QoreConnect |
|---|---|---|
| Steps for a MetaMask user's first transaction | ~12 | 1 passkey tap + 1 MetaMask signature |
| Time to first transaction | 15+ minutes | under 60 seconds |
| Loss if the MetaMask key is broken | everything | capped at the daily limit, then revoked |
| dApp integration effort | write your own relayer and key setup | one wagmi connector |

---

## Where we compete

- **Main category:** Post-Quantum AI Agents ($1,500 / $750). See [`tracks/02-main-track-pq-ai-agents.md`](../tracks/02-main-track-pq-ai-agents.md).
- **Side awards (targets):** People's Choice, Best AI-Native Build, **Quantum Campus** (the team is eligible: all members are enrolled students).
- **Fallback awards (entered):** **Regional Awards** (5 × $200) and **Top-Quality Awards** (7 × $250, jury score ≥ 70/100). Both are paid only to projects that win no other prize.
- **Best case:** $1,500 + $500 + $500 + $500 = **$3,000**. See [`tracks/03-side-awards.md`](../tracks/03-side-awards.md).
- **After the fest:** Association Grant (up to $10,000 in QOR).
- **Fallback category:** Post-Quantum dApp, if the organisers say we do not fit AI Agents.

---

## How the build will run

The build is split into **16 sequential prompts** (`prompts/P01` to `prompts/P16`). Each prompt has:

1. **Goal and context**: what to build and what it depends on.
2. **Tasks**: concrete steps.
3. **Deliverables**: files and artefacts that must exist when it is done.
4. **Validation gate**: commands and checks that must pass before the next prompt starts.
5. **Failure branch**: what to do if the gate fails.

**P01 is a go/no-go spike.** It tests the 5 assumptions the whole design depends on, on the live testnet, before any product code is written.

See [`prompts/README.md`](../prompts/README.md) for the execution rules and the schedule.

---

## Planned tech stack (summary)

- **Monorepo:** pnpm workspaces, TypeScript everywhere
- **Packages:** `@qoreconnect/core`, `@qoreconnect/wagmi`, `@qoreconnect/react`, `@qoreconnect/relayer`
- **Apps:** `apps/web` (Next.js: onboarding, dashboard, Migration Meter), `apps/relayer` (Node + Hono, Docker), `apps/demo-dapp` (Vite + wagmi)
- **Contracts:** Foundry (demo target contract and tests)
- **QoreChain kits:** `@qorechain/sdk` 0.14.0, `@qorechain/pqc`, `@qorechain/qoresign`, `@qorechain/evm`, `@qorechain/wallet-adapter` 0.6.0
- **Hosting:** Vercel (web) and a container host (relayer)

Full detail: [`architecture/07-tech-stack-and-repo-layout.md`](../architecture/07-tech-stack-and-repo-layout.md).

---

## Key dates (UTC)

| Date | Milestone |
|---|---|
| 22 Nov 2026 | P01 feasibility spike: go/no-go |
| 26 Nov 2026 | SDK published, start inviting other teams to integrate |
| 27 Nov 2026, 16:30 | Workshop 4: protocol building and submission clinic |
| 30 Nov 2026 | Feature freeze |
| 2 Dec 2026, 23:59 | Submission deadline |
| 6 to 15 Dec 2026 | Judging and People's Choice vote |
| 16 Dec 2026 | Winners announced |

---

## Honesty rules for this project

QoreChain's own style is *"a number that can be checked is a fact"*. We follow it:

- We say **"live on Diana testnet"**, never "live on mainnet". Abstract accounts are switched off on mainnet.
- The MetaMask key is described as **"classical, capped and revocable"**, never as "quantum-safe". The root key is the quantum-safe part.
- Every number in the README, video and Migration Meter links to a source that can be checked.
- Facts that we have not yet verified on testnet are marked **(unverified)** in these documents until P01 confirms them.

---

## Licence

The code will be released under **Apache-2.0** (a fest requirement is MIT or Apache-2.0 with the licence file in the repo).
"# QoreConnect" 
