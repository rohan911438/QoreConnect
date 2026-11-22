# 04 — Submission checklist

Everything required to submit, from build.qorechain.io rules and /start. There is **no submit button**: the project becomes read-only at **2 Dec 2026, 23:59 UTC**. Target: everything complete by **2 Dec, 18:00 UTC**.

---

## Registration (do this first, before building)

- [ ] Every team member registered on build.qorechain.io
- [ ] GitHub account connected (one per person)
- [ ] X account connected
- [ ] QoreX testnet address (`qor1...`) connected
- [ ] Team formed in "My space" (invite teammates by GitHub username)
- [ ] Project created with category **Post-Quantum AI Agents** (or the fallback, decided by 24 Nov)
- [ ] Region chosen on the project form (for Regional Awards)

## Repository

- [ ] Public GitHub repository *(repo is currently PRIVATE: owner decision)*
- [ ] `LICENSE` file, **Apache-2.0**, detected by GitHub (check the licence badge on the repo page) *(file present at repo root; GitHub API shows no detected licence while the repo is private: recheck after making it public)*
- [ ] `README.md` with: what it is, problem, demo video link, quick start, architecture summary, testnet addresses, status labels, credits *(done except the demo video link and the deployed URL)*
- [x] README **credits every kit and template used** (`@qorechain/sdk`, `@qorechain/pqc`, `@qorechain/qoresign`, `@qorechain/evm`, `@qorechain/wallet-adapter`, `create-qorechain-dapp` if used, any workshop code). *"Copied projects are disqualified."* *(sdk 0.14.0 and pqc 0.2.3, the only kits in the code)*
- [x] `AI_USAGE.md` (required for Best AI-Native Build)
- [ ] "QoreChain Build GitHub App" installed on the repo (from My space)
- [x] No secrets committed (`.env` files ignored; check with a secret scan) *(.env git-ignored; git grep for keys, mnemonics and API keys clean on 22 Nov (only BIP-39 test vectors in tests))*

## Project form

- [ ] Title and short description
- [ ] Cover image: 16:9, at least 1200 × 675, JPG/PNG/WebP, up to 5 MB *(ready: docs/assets/cover.png, 1600 × 900 PNG, 490 KB; upload on the form)*
- [ ] **Video: up to 3 minutes** (required)
- [ ] At least one QoreChain testnet address (`qor1...`) the project uses: sponsor, relayer, demo user, demo contracts
- [ ] Kits and network features ticked: **only what is really in the code** (verified from the repo)
- [ ] AI-native tick (for Best AI-Native Build)
- [ ] **Quantum Campus** tick, with every team member's student email verified (the team is eligible)
- [ ] **Regional Awards**: region selected (fallback award; only paid if we win no other prize)
- [ ] **Top-Quality Awards**: no form field; requires a jury score of at least 70/100 (fallback award)

## Technical checks (the automatic checks run 3–5 Dec)

- [x] Testnet transactions exist for: key registration, authenticator link, spending rule, `MsgExecuteEVM` via relayer, revoke, EVM window, agent action *(one explorer link per type in docs/testnet-evidence.md, Checklist coverage)*
- [x] Transaction hashes listed in README with explorer links (https://explore.qore.network) *(docs/testnet-evidence.md, linked from README)*
- [x] Only **Diana testnet** activity counts for checks
- [ ] Deployed web app reachable (Vercel URL)
- [ ] Relayer reachable and funded until at least 16 Dec (judging and demo show)
- [ ] Sponsor and relayer balances topped up (faucet: once per 24 h per account; plan ahead)
- [x] CI green on the default branch *(green on main, 22 Nov)*

## Judging period (6–15 Dec)

- [ ] One team member available to answer a **48-hour change request**
- [ ] Relayer and web app monitored daily
- [ ] People's Choice reminder posts on 6, 10 and 14 Dec

## Final hour

- [ ] Re-read README top to bottom
- [ ] Watch the video once more
- [ ] Open the deployed app in a fresh browser profile with only MetaMask and run onboarding
- [ ] Confirm the project page on build.qorechain.io shows everything correctly
