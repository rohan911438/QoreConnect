# P07 — EIP-1193 provider and wagmi connector

**Goal:** Any wagmi/viem dApp can add `qoreConnect()` and its existing `writeContract` / `sendTransaction` calls work through MetaMask + relayer on Diana. Packages are published so other teams can use them (enables P16).

**Depends on:** P06.

**Read first:** `architecture/05-sdk.md`, `architecture/03-flows.md` (Flow B), `spike/RESULTS.md` (Q3: which address is `msg.sender`).

**Time box:** 1 day.

---

## Prompt

> 1. **Provider** in `packages/core/src/provider/`: an EIP-1193 provider implementing the routing table in `architecture/05-sdk.md`. `eth_accounts` returns the address P01 identified as `msg.sender` (expected: the root's 0x address). `eth_sendTransaction`: estimate gas (+20% margin), fetch auth nonce, call the preview hook (a no-op default until P08), build the session-key `MsgExecuteEVM` with calldata and digest v2, request `personal_sign` from MetaMask, POST to the relayer, poll until included, verify on-chain by hash, return the EVM tx hash. Reads pass through to `https://evm-testnet.qore.host`. Emit `accountsChanged`, `chainChanged`, `connect`, `disconnect` properly.
> 2. **Onboarding hook:** if the connected MetaMask address is not linked to a root, the provider calls an `onNeedsOnboarding` callback (UI comes in P09); a headless default runs `onboardRoot()` + `linkSessionKey()` with the dApp's configured contracts.
> 3. **Approval hook:** if the target contract is not in the allow-list, call `onNeedsApproval` (UI in P09) → `approveDapp()`.
> 4. **wagmi connector** in `packages/wagmi`: `qoreConnect({ appName, contracts, relayerUrl, gasTankId, ui? })` using wagmi's `createConnector`; EIP-6963 announcement with name "QoreConnect" and an icon.
> 5. **Typed errors** surfaced to wagmi as standard EIP-1193 errors (4001 user rejected, etc.) with `QoreConnectError` details attached.
> 6. **Tests:** unit tests for method routing with a mocked MetaMask and relayer; an end-to-end test in `apps/demo-dapp` with a headless stand-in MetaMask (viem local account exposed as an EIP-1193 provider) that connects, onboards, and calls `increment()` on the P01 Counter through `useWriteContract`.
> 7. **Publish** `@qoreconnect/core`, `@qoreconnect/wagmi` (and `@qoreconnect/react` as a stub) to npm as `0.1.0` (ask the user to log in with `! npm login`; if the scope is unavailable, use `qoreconnect-core` / `qoreconnect-wagmi`). Add a short `packages/wagmi/README.md` with the 5-line integration.

---

## Deliverables

- EIP-1193 provider, wagmi connector with EIP-6963
- E2E test
- Published npm packages `0.1.0`

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | Unit tests | Pass |
| G2 | E2E headless | Demo dApp increments the Counter via `useWriteContract` with no QoreChain-specific code in the component |
| G3 | Manual with real MetaMask | In Chrome with MetaMask: connect → onboard → increment → explorer link works |
| G4 | Integration size | Demo dApp's integration diff is ≤ 10 lines (count it) |
| G5 | Wallet picker | QoreConnect appears in RainbowKit's list via EIP-6963 (manual) |
| G6 | Published | `npm view @qoreconnect/wagmi version` returns `0.1.0` |

## Failure branch

- MetaMask refuses `personal_sign` on chain 9800 or with the digest format: test signing the digest bytes as hex vs. raw; compare with P01 stand-in; check `buildMetaMaskExecuteEvm` source for the exact request.
- wagmi version conflict: pin wagmi v2 in peer dependencies; document.
- npm scope unavailable: publish unscoped names; update all docs.
