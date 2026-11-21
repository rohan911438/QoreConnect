# 03 — Side awards

Special awards are open to every eligible project in addition to its category bounty (except Regional and Top-Quality, which go only to projects that win nothing else).

---

## Best case

| Award | Amount |
|---|---|
| Post-Quantum AI Agents, 1st | $1,500 |
| Best AI-Native Build | $500 |
| People's Choice, 1st | $500 |
| Quantum Campus (team is eligible) | $500 |
| **Total** | **$3,000** |

Plus an Association Grant application (up to $10,000 in QOR) from January 2027.

## Floor case (if we win no other prize)

Regional Awards and Top-Quality Awards go **only** to projects that win nothing else, so they work as a safety net. Because we target both, a strong submission that misses the category podium can still take:

| Award | Amount |
|---|---|
| Top-Quality Award (jury score ≥ 70/100) | $250 |
| Regional Award (our region) | $200 |

Whether a project can hold both fallback awards at once is not stated in the rules; ask the organisers.

## All awards we are entering

| Award | Prize | Eligibility | Our status |
|---|---|---|---|
| Post-Quantum AI Agents (main category) | $1,500 / $750 | Category requirements | **Target** |
| People's Choice | $500 / $300 / $200 | Community vote | **Target** |
| Best AI-Native Build | $500 | `AI_USAGE.md` + form tick | **Target** |
| **Quantum Campus** | **$500** | Every team member is a verified enrolled student | **Target: the team is eligible** |
| **Regional Awards** | **5 × $200** | Region chosen on the form; only projects that win no other prize | **Fallback: entered** |
| **Top-Quality Awards** | **7 × $250** | Highest-scored projects with no other prize, at least 70/100 from the jury | **Fallback: entered** |

---

## People's Choice ($500 / $300 / $200)

**How it works:** QoreX community vote on **mainnet**, 6–15 Dec. Each wallet holding at least 10 QOR gets 3 votes, at most 1 per project. Team members cannot vote for their own project.

**Why we fit:** QoreConnect is useful to every voter and to every team building an EVM dApp. Each integrating team brings its own community.

**Plan:**
1. **Integrations as a vote engine.** Publish the SDK by 26 Nov and help 3–5 fest teams integrate. Each one is a team (and community) with a reason to vote for us.
2. **Migration Meter as a shareable page.** A live public number people want to share ("X accounts migrated").
3. **Build in public on X** with #BuildBeforeQDay: day-by-day progress, the timer comparison, the attack demo clip.
4. **Discord presence:** answer onboarding questions in the fest Discord with "here's how QoreConnect solves this".
5. **Voting reminder posts** on 6, 10 and 14 Dec, with a clear link to the project page.

**Note:** voting happens on mainnet even though our product runs on testnet. Voters only need QoreX and 10 QOR; the product does not need to run on mainnet.

---

## Best AI-Native Build ($500)

**Requirements:** an `AI_USAGE.md` in the repo plus the AI-native tick on the project form.

**Why we fit, honestly:**
1. **Built AI-native:** the whole project is planned and implemented with Claude Code using sequential, validated prompts (`prompts/`). `AI_USAGE.md` documents which prompts produced which parts, what was validated by hand, and what AI got wrong and how we caught it.
2. **AI inside the product:** agent mode lets an AI agent act on-chain under caps, with root-signed instructions as the defence against prompt injection.
3. **QoreChain's MCP server** (optional): the agent can read chain data through `@qorechain/mcp`.

**`AI_USAGE.md` outline (written in P15):**
- Tools and models used
- Workflow: idea research, planning documents, prompt chain with validation gates
- Per-component table: AI-generated / AI-assisted / hand-written, and how each was verified
- Mistakes AI made and how the validation gates caught them
- Where AI runs inside the product (agent mode), and its safety boundaries

---

## Quantum Campus ($500)

**Status: target. The team is eligible** (confirmed by the team on 21 Nov 2026).

**Rule:** every team member must be a currently enrolled student, verified by email.

**Actions:**
1. Each team member completes the student email verification on build.qorechain.io before 2 Dec.
2. If anyone joins the team later, confirm they are also an enrolled student first, or the whole team loses eligibility.
3. Tick Quantum Campus on the project form.
4. Mention it in the README and video credits ("built by students"): it strengthens the story without costing anything.

---

## Regional Awards (5 × $200) — fallback, entered

**Rule:** region chosen on the project form; **only projects that win no other prize**.

**Actions:**
1. Choose the team's region on the project form (Europe, the Americas, Middle East and Africa, Asia-Pacific, Türkiye).
2. Regional judging likely favours projects that are visible in that region's community: share the project in regional QoreChain and student channels during the People's Choice period.

## Top-Quality Awards (7 × $250) — fallback, entered

**Rule:** the seven highest-scored projects that win **no other prize**, with **at least 70/100** from the jury.

**Why we are well placed:** jurors score by hand, so a polished, honest, well-tested submission is what counts. The validation gates in `prompts/` (tests, testnet evidence, security review, fresh-clone check) are exactly what pushes a jury score above 70.

**Actions:** nothing extra on the form; it follows from quality. Keep the 48-hour change-request window covered during judging (6–15 Dec).

---

## Q-Day Survivor — closed

The Q-Day Drill ran on 18 Nov; registration closed 17 Nov. Not available to us.

---

## Grants after the fest

- **Association Grant (Advanced): up to $10,000 in QOR**, paid by milestone from January 2027.
- **Pitch:** QoreConnect is the shared infrastructure QoreChain's 2027 migration depends on. Milestones could be: (1) mainnet support when abstract accounts are switched on; (2) audit of the relayer and connector; (3) X integrated dApps; (4) Migration Meter fed into QoreChain's official migration dashboard.
