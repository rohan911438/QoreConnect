# Demo video script (≤ 3:00)

Record at 1920 × 1080, 30 fps, browser zoom 110 %, dark theme, a fresh browser profile with only MetaMask installed.
Keep a visible timer on screen for the onboarding segment (`/?timer=1` shows one). Every number said aloud is on screen
with its source. Never say "mainnet", "quantum-proof MetaMask" or "audited".

| Time | Screen | Narration (about 150 words per minute) |
|---|---|---|
| **0:00–0:15** | Demo dApp (Quantum Tip Jar) with plain MetaMask on chain 9800: the transaction is refused because the account has no ML-DSA key. | "QoreChain only accepts EVM transactions from accounts with a post-quantum key. MetaMask can't hold one. So today, a MetaMask user can't send a single transaction here." |
| **0:15–0:25** | Landing page hero, the animated diagram. | "QoreConnect fixes that. A quantum-safe root key in your browser, and MetaMask as a capped, revocable session key." |
| **0:25–1:05** | Timer starts. Connect with MetaMask → onboarding modal → passkey tap → one MetaMask signature → "You're on QoreChain". Timer stops (about 35 s). | "One passkey tap creates an ML-DSA-87 key on this device. One MetaMask signature links MetaMask with limits: approved dApps only, a per-transaction cap, a daily cap. Setup is sponsored, so I need no QOR. Done in about thirty-five seconds." |
| **1:05–1:30** | Tip 0.1 QOR in the Tip Jar. The signing preview opens before MetaMask: decoded call, simulation, limits, the "Classical, capped" label. Confirm → success, explorer link. | "Before MetaMask opens, I see exactly what I'm signing, and whether the chain would allow it. Honesty built in: MetaMask's key is labelled classical. The dApp's gas tank pays the fee." |
| **1:30–2:00** | Attack page, then terminal `pnpm demo:attack`. Explorer shows the refused transaction (code 10). | "Now an attacker steals the MetaMask key and calls a drainer contract through their own relayer, skipping every QoreConnect check. The chain itself refuses it: the drainer was never on my allow-list." |
| **2:00–2:20** | Dashboard → Q-Day kill switch → passkey → "Only your quantum-safe root key can act now." | "And if Q-Day comes? One tap revokes every classical key in a single transaction. Only the quantum-safe root is left." |
| **2:20–2:40** | Dashboard Agents panel: create an agent; the agent's terminal shows a root-signed instruction verified, a tip executed, and an injected instruction rejected (WRONG_OWNER / BAD_SIGNATURE). | "AI agents get the same rails: their own capped sub-account, and they act only on instructions my root key signed. Prompt injection can't spend my money." |
| **2:40–2:52** | `apps/demo-dapp/src/wagmi.ts` with the QoreConnect lines highlighted. | "For dApp teams, it's one wagmi connector. Nine lines, and existing hooks keep working." |
| **2:52–3:00** | Migration Meter: the counts and the countdown to Q3 2027. | "The Migration Meter counts every account with a post-quantum root, on chain. QoreConnect: the migration layer for the migration year." |

## Checklist before recording

- Relayer running and funded (`/health` healthy); demo gas tank seeded.
- MetaMask on a fresh account with no QOR (shows that onboarding is sponsored).
- Agent running locally (`pnpm --filter @qoreconnect/example-agent start`).
- Explorer tabs pre-opened for the attack transaction.
- Captions on; export 1080p; under 3:00.
