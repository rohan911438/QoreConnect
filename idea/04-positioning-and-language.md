# 04 — Positioning and language

How we talk about QoreConnect in the README, UI, video, Discord posts and submission form. The goal is to sound like a natural part of QoreChain, not an outside product.

---

## Positioning statement

> **For** Ethereum users and EVM dApp teams who want to use QoreChain,
> **QoreConnect is** the migration layer
> **that** gives every MetaMask user a post-quantum root key and every dApp a 5-line integration,
> **unlike** switching wallets or building your own relayer,
> **because** the post-quantum key holds authority while the classical key only holds capped, scoped, revocable convenience.

## Headline options (pick one per surface)

- **Primary:** *QoreConnect: the migration layer for the migration year.*
- *Quantum-safe root. MetaMask convenience.*
- *A migration layer, not a wallet.*
- *Every MetaMask user on QoreChain in 60 seconds.*
- *Build Before Q-Day. Migrate before Q-Day.*

## Elevator pitches

**10 seconds:**
QoreConnect lets any MetaMask user use QoreChain's EVM in under 60 seconds, with a post-quantum key in control.

**30 seconds:**
QoreChain requires a post-quantum key for every EVM transaction, and MetaMask can't hold one. So Ethereum users can't get in, and QoreChain can't reach the "supermajority hybrid" condition it needs to make the EVM quantum-safe by default in 2027. QoreConnect gives each user a hidden post-quantum root key and turns their MetaMask key into a capped, scoped, revocable session key. dApps add it in 5 lines with wagmi.

---

## QoreChain vocabulary we mirror

Use these terms exactly as QoreChain does:

| Term | Meaning / where to use |
|---|---|
| quantum-safe | Our root key; QoreChain's mission |
| post-quantum by default | The 2027 goal we help reach |
| Build Before Q-Day / #BuildBeforeQDay | Fest hashtag; use in every X post |
| Harvest Now, Decrypt Later | Why classical keys are a long-term risk |
| the migration year (2027) | Our positioning anchor |
| the deadline year (2030) | Context for urgency |
| no flag-days | Gradual migration, starting now |
| Never sign blind | Our readable signing preview |
| Honesty built in | Our "classical, capped" labels |
| Crypto without the homework | Our onboarding promise |
| a number that can be checked is a fact | The Migration Meter principle |
| hybrid signature (secp256k1 + ML-DSA-87) | Root-key transactions |
| EVM authorisation window | Use QoreChain's British spelling "authorisation" when quoting docs |
| Diana testnet / qorechain-diana | Where we are live |

## Words we avoid

| Avoid | Use instead | Why |
|---|---|---|
| "quantum-proof MetaMask" | "MetaMask as a capped session key" | MetaMask's key is classical. Claiming otherwise contradicts QoreChain's honesty principle. |
| "live on mainnet" | "live on Diana testnet; ready for mainnet when abstract accounts are switched on" | Abstract accounts are disabled on mainnet. |
| "fully quantum-safe account" | "account with a post-quantum root" | Session keys are classical by design. |
| "unhackable" | "losses capped at the daily limit, then revoked" | Concrete and checkable. |
| "partner of QoreChain" | "built on QoreChain kits" | We are a fest entry, not a partner. |
| Homepage statistics (developer counts, commit counts) | Docs figures with links | Several homepage counters have formatting errors. |
| "CosmWasm" and "Native" interchangeably | "QoreChain Native (CosmWasm)" once, then "Native" | Homepage and docs use different names. |

## Honesty labels (UI copy)

| Action signed by | Label | Colour token |
|---|---|---|
| Root key (hybrid, ML-DSA-87) | **Quantum-safe** | success / green |
| MetaMask session key within limits | **Classical, capped** | neutral / amber |
| AI agent key | **Agent, capped** | neutral / amber |
| Anything exceeding limits | **Blocked by chain** | danger / red |

## Tone

QoreChain's tone: confident, technical, number-heavy, short declarative headlines, "X, not Y" constructions, status labels, no emojis on the main site.

Our rules:
- Short headlines. Numbers wherever possible.
- Status labels on every feature in the README: **Shipped / In progress / Planned**.
- No emojis in the product UI or README headings.
- British spelling when quoting QoreChain ("authorisation", "licence"); otherwise consistent US spelling.
- Never overclaim. If a feature depends on something unverified, say so.

## Brand use

- Write the chain as **QoreChain** in running text (wordmark is "QORECHAIN" with QORE bold).
- Do not use the QoreChain logo as our logo. Our cover image may show "Built on QoreChain" in small text.
- Respect clear space (at least the height of the letter Q) if the wordmark appears.
