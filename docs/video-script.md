# Demo video script (≤ 3:00)

Two tracks, recorded separately:

- **Screen track:** what you click, in order. Recorded silently; speed up waits in the edit.
- **Voiceover:** about the *product* (the problem, why it matters, what it guarantees). It does not describe the clicks;
  the screen shows those.

Record at 1920 × 1080, 30 fps, browser zoom 110 %, dark theme, a fresh browser profile with only MetaMask installed.
Every number said aloud is visible on screen at that moment. Never say "mainnet", "quantum-proof MetaMask" or "audited".

---

## Before recording

| | |
|---|---|
| Wake the relayer | Open <https://qoreconnect-relayer.onrender.com/health> 2 minutes before. The free plan can take about a minute to wake. |
| MetaMask | A **new** account with **0 QOR** (this shows onboarding is sponsored), network QoreChain Diana (9800). |
| Agent | Running locally: `pnpm --filter @qoreconnect/example-agent start`. Terminal window ready, large font. |
| Tabs, in order | 1 demo dApp `qoreconnect-demo.vercel.app` · 2 web app `qoreconnect-web.vercel.app/?timer=1` · 3 explorer tab of the attack tx · 4 `/developers` · 5 `/meter` |
| Terminal 2 | In the repo, ready to type `pnpm demo:attack`. |

**Order matters:** do the kill switch **last** among the live actions. After it, MetaMask can no longer tip.

---

## Screen track (what moves on screen)

| # | Time | Screen | Clicks and moments to capture |
|---|---|---|---|
| 1 | 0:00–0:15 | Demo dApp, plain MetaMask | Try a tip with MetaMask connected directly. Hold on the chain's refusal (no ML-DSA key). |
| 2 | 0:15–0:30 | Web app landing | Slow scroll over the hero and the animated key diagram. |
| 3 | 0:30–1:00 | Web app, `?timer=1` | **Connect** → onboarding modal → **passkey tap** → **one MetaMask signature** → stepper runs (sponsor, register, link) → "You're on QoreChain". The timer stops at about 20 s. Cut the waiting if needed but keep the timer visible. |
| 4 | 1:00–1:25 | Demo dApp → Tip Jar | Amount **0.1**, click **Tip 0.1 QOR to …**. Hold 2 s on the **signing preview** (decoded call, simulation, limits, "Classical, capped"). Confirm in MetaMask → success → click the explorer link. |
| 5 | 1:25–1:50 | Demo dApp → `#/attack` | Click **Claim airdrop (send 2 QOR)**: the preview says **Blocked by chain** and MetaMask never opens. Cut to terminal: `pnpm demo:attack` → refused, code 10. Cut to the explorer tab of the refused tx. |
| 6 | 1:50–2:15 | Web app → Account → Agents | Create an agent (name, task, small limits) → **Create agent with passkey**. Cut to the agent terminal: instruction verified, tip executed, injected instruction **rejected**. |
| 7 | 2:15–2:30 | Web app → Account → **Q-Day kill switch** | **Revoke every classical key** → passkey → "Revoked 1 classical key". Hold on "There are no active classical keys." |
| 8 | 2:30–2:48 | `/developers` | Scroll slowly: install command → the four package cards → the quick-start code. Click **Copy** on the install line. |
| 9 | 2:48–3:00 | `/meter` | Hold on the counts and the countdown to Q3 2027. Fade out on the logo. |

---

## Voiceover (product, not clicks)

About 410 words, which is about 2:45 at a calm 150 words per minute. Each block matches the screen row with the same
number. Pause between blocks; the screen carries the gaps.

**1. The problem (0:00–0:15)**
> QoreChain is preparing for Q-Day, the day quantum computers can break today's wallet keys. So it only accepts EVM
> transactions from accounts that hold a post-quantum key. MetaMask can't hold one. That locks out the users QoreChain
> wants most.

**2. What QoreConnect is (0:15–0:30)**
> QoreConnect is the migration layer. Your account is owned by a quantum-safe root key, ML-DSA-87, created and
> encrypted on your own device. MetaMask stays, as a key the root can limit and revoke.

**3. No new habits (0:30–1:00)**
> You don't switch wallets, and you don't buy gas. A passkey and one MetaMask signature are all it takes, and setup is
> sponsored, so a brand-new user starts with zero QOR. About twenty seconds.
> The important part is what the root decides: which apps MetaMask may use, how much per transaction, and how much
> per day. And it's the chain that enforces those rules, not our app.

**4. Never sign blind (1:00–1:25)**
> Wallets usually show you a hash and hope you trust it. QoreConnect decodes the call, simulates it and checks it
> against your limits before MetaMask even opens. It's honest about safety too: this signature is labelled
> classical and capped, because that is exactly what it is. The app pays the gas.

**5. A stolen key is a small problem (1:25–1:50)**
> Here's the real test. A drainer page, and an attacker holding the MetaMask key and bypassing our software entirely.
> The chain still says no. A stolen classical key can spend at most your daily limit, only in apps you approved,
> and only until you revoke it.

**6. Agents with a budget, not your keys (1:50–2:15)**
> The same rails work for AI agents. An agent gets its own capped sub-account and acts only on instructions your
> quantum-safe root has signed. Inject a prompt, forge an instruction, and it's simply rejected. Prompt injection
> can't spend your money.

**7. Ready for Q-Day (2:15–2:30)**
> And when Q-Day arrives, one tap revokes every classical key in a single transaction. What's left is the part that
> was quantum-safe from the start.

**8. For builders (2:30–2:48)**
> For developers it's four open-source packages on npm today: a wagmi connector, the React screens, the core engine
> and a relayer you can host yourself. Nine lines, and your existing code keeps working.

**9. Close (2:48–3:00)**
> The Migration Meter tracks how much of QoreChain already has a post-quantum root. QoreConnect: quantum-safe root,
> MetaMask convenience. The migration layer for the migration year.

---

## Recording tips

- Record the voiceover first, then cut the screen to fit it; it is easier than talking over fixed footage.
- If onboarding runs long, speed up only the stepper, never the timer.
- Captions on. Export 1080p, under 3:00.
