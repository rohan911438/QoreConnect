# Testnet evidence (QoreChain Diana, chain 9800)

Every claim QoreConnect makes is backed by a transaction or a reproducible script on **Diana testnet**. Abstract accounts
are testnet-only; nothing here runs on mainnet. Explorer: <https://explore.qore.network>.

## Contracts (P10)

Deployed 2026-11-21 from the operator account `0x707B92f6276799f928CCe4D5873f5A2babF85347` inside a scoped EVM window
(open-window tx `85AA2FCA…5ACE`). Code at each address checked with `eth_getCode`.

| Contract | Address | Deploy tx | Code |
|---|---|---|---|
| QoreTipJar | `0x42653b89eff2a993cf2767fedef783366f53aea4` | `0x24f70a3e3bafce83258cdc8591881f1d10864fcd05b547cddeb125d7d272d556` | 1,456 bytes |
| Drainer (attack demo only, never approved) | `0x36003c3cea4a8e38cff894cce2c1d1be94e23baa` | `0xc91afac0a3bc362dfb60e01c66923a5aa7cdee22fb8fa9bf36fc4ca084581bf0` | 512 bytes |
| QoreConnectGuard (owner = spike root, 1 QOR threshold) | `0x1a5b03240e7b3ce11fb8e59ef5da1cb60fbe9eab` | `0x8ae533d1811a4f093ac06208b3bfdc65b2d8f98940e87e694eccf2c43669eca5` | 3,091 bytes |

Reproduce: `cd contracts && forge build && cd ../spike && npx tsx src/d10-deploy-p10.ts` (writes `apps/demo-dapp/src/deployments.json`).

Foundry: 35 tests (unit + fuzz, mock `pqcVerify`/`pqcKeyStatus` precompiles at `0x…0a01`/`0x…0a02`). Coverage:
QoreTipJar 100% lines/branches, Drainer 100%, QoreConnectGuard 97.6% lines.

## Attack demo (P10 G4): `pnpm demo:attack`

Victim: root `qor1gg54y9regwhrd7yn29aw6qy7lqvk83h4v9e9ju`, MetaMask key `0x51a28Ce0CE2E9E1591Ec1E325c4dc650717707E3` linked
for the Tip Jar only (1 QOR per tx, 5 QOR per day).

| Step | Result | Evidence |
|---|---|---|
| Control: tip 0.1 QOR through the relayer | Success | `F0D97E75412C83976175F54C175E0677886EC716D800F6CC9AEDC3A8EF3BE913` |
| Attack through the QoreConnect relayer (`Drainer.claimAirdrop`, 2 QOR) | Refused before broadcast: `NOT_APPROVED` (code 10), no fee | relayer response |
| Attack with the stolen key **and the attacker's own relayer** (no pre-check) | **Refused by the chain**, code 10: "authenticator not permitted for this action" | `125E638C8670B49394EDF8F10BCE9DAC7C993A508D57833F9EAFC8B179B5EFF6` |

## Earlier gates

See `prompts/STATUS.md` for P01–P09 hashes (onboarding, session keys, relayer refusals, provider E2E, signing preview,
kill switch).
