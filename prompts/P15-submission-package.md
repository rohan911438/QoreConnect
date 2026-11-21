# P15 — Submission package

**Goal:** A complete, compelling submission on build.qorechain.io before 2 Dec 2026, 18:00 UTC (hard deadline 23:59 UTC).

**Depends on:** P14.

**Read first:** `tracks/04-submission-checklist.md`, `tracks/03-side-awards.md` (`AI_USAGE.md` outline), `idea/02-solution.md` (video plan), `idea/04-positioning-and-language.md`.

**Time box:** 1 day (1–2 Dec).

---

## Prompt

> 1. **Product README** (replace the planning README at the root; move the planning README content to `docs/planning.md` and keep the `idea/`, `tracks/`, `architecture/`, `prompts/` folders): title and tagline; demo video link; the problem in 3 sentences; before/after table with real measured numbers; how it works (diagram from `architecture/01-system-overview.md`); quick start for users and for developers (5-line integration); live links; testnet evidence table; security model and honest limitations; status labels (Shipped / In progress / Planned); category and requirement mapping (link `tracks/02`); credits for every QoreChain kit and template used; licence.
> 2. **`AI_USAGE.md`** following the outline in `tracks/03-side-awards.md`, with a per-component table and concrete examples of AI mistakes caught by validation gates (from `STATUS.md`).
> 3. **Video (≤ 3:00)** following the plan in `idea/02-solution.md`. Write `docs/video-script.md` with timings and narration; record screen with a visible timer for onboarding; include the attack refusal and the kill switch; end with the Migration Meter. Export 1080p. Upload (YouTube unlisted or as required by the form).
> 4. **Cover image** 1600 × 900 (16:9, ≥ 1200 × 675, ≤ 5 MB): product name, tagline, a clean visual of root key → capped session key; "Built on QoreChain" small.
> 5. **Project form:** title, description, category (Post-Quantum AI Agents or the decided fallback), video, cover, testnet addresses (sponsor, relayer, demo root, contracts), kits ticked (only those really in the code), AI-native tick, region, Quantum Campus only if eligible.
> 6. **Install the "QoreChain Build GitHub App"** on the repo from My space; make the repo public; confirm the licence is detected.
> 7. Walk through every box in `tracks/04-submission-checklist.md` and tick it in the file.

---

## Deliverables

- Product README, `docs/planning.md`
- `AI_USAGE.md`
- Video and `docs/video-script.md`
- Cover image
- Completed project form
- Ticked checklist

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | Checklist | Every item in `tracks/04-submission-checklist.md` ticked |
| G2 | Video | ≤ 3:00, plays publicly, shows onboarding under 60 s, attack refusal, kill switch |
| G3 | README accuracy | Every number has a source link; no forbidden claims (see `idea/04`) |
| G4 | Project page | Renders correctly on build.qorechain.io in a logged-out browser |
| G5 | Time | Done by 2 Dec, 18:00 UTC |

## Failure branch

- Video running long: cut the developer segment to 10 seconds; keep onboarding, attack, kill switch.
- Form issue close to the deadline: ask in the fest Discord immediately; the project locks at 23:59 UTC.
