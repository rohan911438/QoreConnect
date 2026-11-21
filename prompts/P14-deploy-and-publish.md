# P14 — Deploy and publish

**Goal:** Everything is live, funded and monitored until the end of judging (16 Dec).

**Depends on:** P13.

**Read first:** `architecture/04-relayer.md` (deployment), `tracks/04-submission-checklist.md` (technical checks).

**Time box:** 4 hours.

---

## Prompt

> 1. **Relayer:** deploy `apps/relayer` to a container host (Fly.io, Railway or Render; ask the user which account to use). Set secrets via the host's secret manager. Persistent volume for SQLite. Custom domain if available. Verify `/health`.
> 2. **Web app and demo dApp:** deploy `apps/web` and `apps/demo-dapp` to Vercel (production). Set `NEXT_PUBLIC_RELAYER_URL`. Verify the REST proxy works in production.
> 3. **Funding:** top up sponsor and relayer accounts to cover expected usage until 16 Dec (estimate from P01 fees × expected users × 2). Plan daily faucet claims from operator accounts and consolidation.
> 4. **Monitoring:** uptime monitor on `/health` and the web app; alert on low balances; a daily check reminder 3–16 Dec.
> 5. **npm:** publish `0.2.0` of all packages with the final API; update READMEs.
> 6. **Smoke test in production** from a fresh browser profile with only MetaMask: onboard, tip, attack blocked, kill switch, meter page, doctor page.
> 7. Record all URLs, contract addresses and key tx hashes in `docs/testnet-evidence.md` and `STATUS.md`.

---

## Deliverables

- Live relayer, web app, demo dApp
- Published packages `0.2.0`
- Monitoring
- `docs/testnet-evidence.md` complete

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | Production smoke test | All steps pass from a fresh profile |
| G2 | Balances | Sponsor and relayer funded for the estimated need until 16 Dec |
| G3 | Monitoring | Alert fires on a test (for example, by pointing the monitor at a wrong path) |
| G4 | npm | `0.2.0` published; install in a blank project works |
| G5 | Evidence | Every claim in the README has a link in `docs/testnet-evidence.md` |

## Failure branch

- Container host unavailable: run the relayer as Vercel Functions with a hosted SQLite (Turso) or Postgres (Neon), with serial processing.
- Faucet limits make funding insufficient: lower sponsor amounts to the measured minimum, add a waitlist banner, and ask in Discord for a builder top-up.
