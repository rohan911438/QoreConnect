# P13 — Hardening and security review

**Goal:** The product survives real users and judges: invariants hold, errors are handled, secrets are safe, and the threat model is verified against the code.

**Depends on:** P10, P11, P12. **This is the feature-freeze day (30 Nov).**

**Read first:** `architecture/06-security-threat-model.md`, `prompts/STATUS.md`.

**Time box:** 1 day.

---

## Prompt

> 1. **Threat-model walkthrough:** for each threat T1–T19, find the code or test that implements the mitigation and link it in a new `docs/security.md` table (threat → mitigation → file:line → test). Any threat without a test gets one, or is moved to "known limitations" with a reason.
> 2. **Invariant tests** from the threat model (5 invariants) run in CI against mocked chain state, and once more against Diana in the integration suite.
> 3. **Error handling pass:** every user-facing error has a readable message and a next step; relayer down, tank empty, expired key, module disabled (mainnet), MetaMask locked, wrong network, PRF unsupported.
> 4. **Web security:** strict Content-Security-Policy on vault pages (no third-party scripts), `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, no secret in client bundles (scan `.next` output for env names).
> 5. **Relayer:** input size limits, timeouts, rate limits verified by tests; structured logs without secrets; `/health` alerts when balances are low.
> 6. **Dependency audit:** `pnpm audit`; pin versions; remove unused dependencies.
> 7. Run `/security-review` (Claude Code) and `/code-review` on the full diff; fix confirmed findings.
> 8. **Fresh-machine test:** clone the repo into a new folder, follow only the README quick start, and record every step that fails; fix the README or the code.

---

## Deliverables

- `docs/security.md`
- Additional tests
- Fixes from reviews
- README quick start validated

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | CI | All green: lint, typecheck, unit, contracts, secret scan |
| G2 | Integration suite on Diana | All pass |
| G3 | Threat table | Every threat has a mitigation with a file reference and a test, or is a documented limitation |
| G4 | Reviews | No unresolved high-severity findings |
| G5 | Fresh clone | Quick start works end to end |
| G6 | Bundle scan | No secret env names in client bundles |

## Failure branch

- A high-severity finding cannot be fixed by the end of the day: disable the affected feature behind a flag and document it; never ship a known fund-loss bug.
