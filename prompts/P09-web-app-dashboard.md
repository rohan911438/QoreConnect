# P09 — Web app: onboarding and dashboard

**Goal:** A polished, user-ready web app: under-60-second onboarding, a dashboard to control keys and dApps, the Q-Day kill switch, and recovery.

**Depends on:** P08.

**Read first:** `idea/02-solution.md` (user experience), `idea/04-positioning-and-language.md`, `architecture/03-flows.md` (A, C, D, F).

**Time box:** 1 day.

---

## Prompt

> Build `apps/web` (Next.js App Router, Tailwind) and the shared UI in `packages/react`.
>
> 1. **Landing page `/`:** headline "The migration layer for the migration year", subline "Quantum-safe root. MetaMask convenience.", the before/after table, CTA "Connect with MetaMask", link to the Migration Meter and the developer guide. Status labels on features. No emojis.
> 2. **Onboarding modal** (`packages/react`, used by the web app and any dApp): one explanation screen → passkey creation → progress steps (sponsoring, registering quantum-safe key, linking MetaMask) → MetaMask possession signature → done. Show a visible timer in dev mode. Handle every error with a clear message and retry.
> 3. **Approve-dApp sheet:** dApp name and origin, contracts with explorer links, unchanged limits, passkey tap.
> 4. **Dashboard `/account`:**
>    - Account card: `qor1` and `0x` addresses, balance, "Quantum-safe root: active" badge with `possessionProven`.
>    - Keys: MetaMask session key and agent keys, each with label, expiry, limits, allow-list, "Revoke", "Renew".
>    - Approved dApps: list with contracts and "Remove".
>    - Limits editor (per-tx, daily) with passkey confirmation.
>    - **Q-Day kill switch:** red panel, "Revoke every classical key", lists what will be revoked, passkey tap, success state "Only your quantum-safe root key can act now".
>    - **Q-Day damage cap:** "If your MetaMask key were broken today, the most an attacker could take is X QOR per day, only through these contracts."
>    - Activity: recent relayed transactions with honesty labels and explorer links.
>    - Recovery: "Save recovery code" (progressive prompt when balance > threshold), "Restore on new device".
> 5. **Design:** clean, technical, consistent light and dark themes; responsive down to 360 px; accessible components.
> 6. **E2E test (Playwright, headless stand-in MetaMask + virtual WebAuthn authenticator):** landing → onboard → dashboard shows the key → revoke all → dashboard shows none.

---

## Deliverables

- Landing, onboarding modal, approve sheet, dashboard, recovery
- Playwright E2E

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | E2E | Passes headless |
| G2 | **The 60-second test (manual, real MetaMask, fresh Chrome profile)** | Landing → first confirmed transaction in under 60 seconds. Record the time and a screen recording. |
| G3 | Kill switch (manual) | Revokes all classical keys; next MetaMask transaction is blocked by the chain |
| G4 | Recovery (manual) | Export code → clear site data → restore → same address |
| G5 | Responsive | Usable at 360 px width; no horizontal scroll |
| G6 | Copy review | All copy follows the honesty rules (no "quantum-safe MetaMask", "testnet" stated) |

## Failure branch

- Over 60 seconds: profile each step; start sponsorship at passkey creation; pre-compute the possession text; reduce confirmations waited on (wait for inclusion, not finality, where safe). If still over, report the real time honestly in the video.
- Virtual WebAuthn PRF not supported in Playwright: test the password path in E2E, test passkey manually.
