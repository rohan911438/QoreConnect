# P16 — Ecosystem outreach kit (runs in parallel from 26 Nov)

**Goal:** Other fest teams integrate QoreConnect before the deadline, and the community knows about it before People's Choice voting.

**Depends on:** P07 (published SDK). Runs alongside P08–P15.

**Read first:** `tracks/03-side-awards.md` (People's Choice plan), `idea/04-positioning-and-language.md`, `architecture/05-sdk.md`.

**Time box:** about 1 hour per day.

---

## Prompt

> 1. **Integration guide** `docs/integration-guide.md`: who it is for; 5-line wagmi integration; React UI option; how to request a gas tank (form or Discord DM); limits and honest limitations; troubleshooting (Doctor); FAQ ("Do my users need QoreX?" "Does it work on mainnet?" "What if your relayer goes down?").
> 2. **Target list** `docs/outreach.md`: from build.qorechain.io/projects, list EVM-based projects whose users would need onboarding (Post-Quantum dApp category first), with their repo, the integration effort estimate, and status (contacted / interested / integrated).
> 3. **Messages (drafts for the user to post; never post on their behalf without approval):**
>    - Discord announcement: "Add MetaMask onboarding to your QoreChain dApp in 5 lines" with the guide link and an offer of a free gas tank.
>    - X thread with #BuildBeforeQDay: the problem, the 60-second clip, the attack clip, the Meter link.
>    - Direct-message template for target teams.
> 4. **Integration support:** for each interested team, open a pull request to their repo (only with their consent) or pair on Discord; create their gas tank.
> 5. **Showcase:** a "Powered by QoreConnect" section on the landing page and README listing integrated projects, with links.
> 6. **People's Choice reminders** (drafts) for 6, 10 and 14 Dec.

---

## Deliverables

- `docs/integration-guide.md`, `docs/outreach.md`
- Drafted posts and messages
- Integrations listed on the landing page

## Validation gate (checked at P15)

| # | Check | Pass condition |
|---|---|---|
| G1 | Guide | A developer outside the team integrates using only the guide (ask one team to confirm) |
| G2 | Integrations | Target ≥ 3 integrated projects; minimum 1 (report the real number honestly) |
| G3 | Posts | Announcement and X thread published by the user |

## Failure branch

- No team integrates in time: present the integration guide plus our own demo dApp, and report outreach honestly in the README ("contacted N teams"). Do not claim integrations that did not happen.
