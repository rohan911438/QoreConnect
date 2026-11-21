# 03 — Side awards

Special awards are open to every eligible project in addition to its category bounty (except Regional and Top-Quality, which go only to projects that win nothing else).

---

## Best case

| Award | Amount |
|---|---|
| Post-Quantum AI Agents, 1st | $1,500 |
| Best AI-Native Build | $500 |
| People's Choice, 1st | $500 |
| **Total** | **$2,500** |

Plus an Association Grant application (up to $10,000 in QOR) from January 2027.

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

Only if **every** team member is a currently enrolled student, verified by email. Confirm the team's status before submission. If eligible, tick it on the form; it costs nothing.

---

## Regional Awards (5 × $200) — fallback

Only for projects that win **no other prize**. Pick the team's region on the project form (Europe, the Americas, Middle East and Africa, Asia-Pacific, Türkiye).

## Top-Quality Awards (7 × $250) — fallback

The seven highest-scored projects that win **no other prize**, with at least 70/100 from the jury. A polished, well-documented submission makes this a realistic floor even if we miss first place.

---

## Q-Day Survivor — closed

The Q-Day Drill ran on 18 Nov; registration closed 17 Nov. Not available to us.

---

## Grants after the fest

- **Association Grant (Advanced): up to $10,000 in QOR**, paid by milestone from January 2027.
- **Pitch:** QoreConnect is the shared infrastructure QoreChain's 2027 migration depends on. Milestones could be: (1) mainnet support when abstract accounts are switched on; (2) audit of the relayer and connector; (3) X integrated dApps; (4) Migration Meter fed into QoreChain's official migration dashboard.
