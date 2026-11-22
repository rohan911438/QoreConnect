# Benchmark: QoreConnect and the alternatives

Two questions a judge or a dApp team will ask: *what else could a MetaMask user do on QoreChain?* and *what does
QoreConnect cost?* Every competitor claim below cites the vendor's own docs or store listing (checked 22 Nov 2026).
Every QoreConnect number was measured on Diana testnet and links to where it was recorded.

## 1. Approaches compared

| | Plain MetaMask on QoreChain | QoreX (QoreChain's official wallet) | Passkey smart wallets (e.g. Coinbase Smart Wallet) | MetaMask smart accounts + ERC-7715 permissions | **QoreConnect** |
|---|---|---|---|---|---|
| Root key | secp256k1 | ML-DSA-87 hybrid [1] | P-256 passkey or Ethereum address [2] | secp256k1 (EOA upgraded to a smart account) [3] | **ML-DSA-87 + secp256k1 hybrid** |
| Root is post-quantum | No | **Yes** [1] | No (P-256 is elliptic-curve) | No | **Yes** |
| Works on QoreChain's EVM lane | **No**: refused without a registered ML-DSA key (spike Q2/Q4) | Yes, EIP-1193/6963 [1] | Not deployed on QoreChain | Not deployed on QoreChain | **Yes** (Diana) |
| User keeps MetaMask | Yes | No: new wallet, new keys | No | Yes | **Yes** |
| Scoped, capped session keys | No | Not documented in the listing [1] | Via modules | Yes, caveat enforcers [3] | **Yes, enforced by the chain** (code 5 / code 10 refusals) |
| Who enforces limits | n/a | n/a | Smart-contract code | Caveat-enforcer contracts [3] | **QoreChain's abstract-account module** (no custom contract) |
| Revoke every classical key in one tx | n/a | n/a | Remove owner per tx | Revoke per delegation | **Yes, one root-signed tx** ([tx](https://explore.qore.network/tx/A5D32D1017CDD11F3700EFBD44F86161FBE61E64D96B410E7838D598F82398A2)) |
| Agents with their own capped keys | No | No | Via modules | Yes (ERC-7715 targets agents) [3] | **Yes, plus root-signed instructions** |
| Gas for the first transaction | Must buy QOR | Must buy QOR | Paymaster (app-sponsored) | Paymaster | **Sponsored setup, dApp gas tanks** |

**Where each one wins.** QoreX is the right answer for someone happy to switch wallets: it is post-quantum end to end
and made by the chain team. ERC-7715 and passkey smart wallets are mature on Ethereum L2s but their roots are elliptic-curve
keys, so they are not a Q-Day answer. QoreConnect is for the user who will not switch wallets and the dApp that does not
want to lose them: MetaMask keeps working, and the key that can undo everything is post-quantum.

## 2. QoreConnect measured costs (Diana, gas price 0.15 uqor/gas)

Source: [`spike/RESULTS.md`](../spike/RESULTS.md), *Measured costs*.

| Action | Who pays | Gas | Fee |
|---|---|---|---|
| Register the ML-DSA-87 key (once) | sponsor | 299,281 | 0.059 QOR |
| Link MetaMask with limits (once) | sponsor | 226,107 | 0.045 QOR |
| A dApp call through the relayer | dApp gas tank | 332,968 | 0.066 QOR |
| A call that moves value | dApp gas tank | 409,213 | 0.081 QOR |
| Revoke keys (kill switch, any number in one tx) | user's root | 241,770 | 0.048 QOR |

Onboarding a new user therefore costs the sponsor about **0.10 QOR**, and the user pays nothing.

## 3. QoreConnect measured user experience

| Metric | Value | Source |
|---|---|---|
| MetaMask signatures to onboard | 1 | web E2E asserts it ([spec](../apps/web/e2e/onboard-dashboard.spec.ts)) |
| Fresh browser to linked account | ~35 s, including Diana block times | [`prompts/STATUS.md`](../prompts/STATUS.md) P09 |
| QOR needed by the user to start | 0 | sponsored setup, [evidence](testnet-evidence.md) |
| Lines a wagmi dApp adds | 9 | marked in [`apps/demo-dapp/src/wagmi.ts`](../apps/demo-dapp/src/wagmi.ts) |
| Attack with a stolen MetaMask key on a non-approved contract | refused by the chain, code 10 | [tx](https://explore.qore.network/tx/125E638C8670B49394EDF8F10BCE9DAC7C993A508D57833F9EAFC8B179B5EFF6) |

## 4. What this benchmark does not claim

- No timing comparison with QoreX: we did not run a timed QoreX onboarding, so we do not quote one.
- No security ranking: QoreX and QoreConnect both put an ML-DSA-87 key in charge; they differ in which wallet the user keeps.
- ML-DSA-87 sizes for reference: public key 2,592 bytes, signature 4,627 bytes, NIST category 5 [4].

## Sources

1. QoreX listing by the QoreChain Team, Firefox Add-ons: <https://addons.mozilla.org/en-US/firefox/addon/qorex/>
2. Coinbase Smart Wallet repository (owners: Ethereum addresses or secp256r1 passkeys): <https://github.com/coinbase/smart-wallet>
3. MetaMask Smart Accounts Kit, Advanced Permissions (ERC-7715): <https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/>
4. IETF draft, ML-DSA security considerations: <https://www.ietf.org/archive/id/draft-connolly-cfrg-ml-dsa-security-considerations-02.html>; Open Quantum Safe: <https://openquantumsafe.org/liboqs/algorithms/sig/ml-dsa>
