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

## Agent mode (P11)

Owner root `qor1kkuqqp0rqpla3qam239j4p8fzh525nv0e0ez5n`; agent sub-account (HD index 1)
`qor1q9scherh67uk63enc8l0udkysqxv4gpv4szu7j`; agent key `0xa4bf82a9075b54f3ebf67be55f187e8db9592b14`, linked for
`QoreTipJar.tip(address,string)` only, 0.2 QOR per tx, 0.3 QOR per day, 24 h expiry. Created in 31.8 s.
Reproduce: `pnpm --filter @qoreconnect/example-agent test:integration`.

| Step | Result | Evidence |
|---|---|---|
| Fund sub-account from root / register its ML-DSA key / link agent key | Success | `A16D11DE…CB50` / `5E3C8F07…E460` / `7EA5E30B…2DB5` |
| G2: agent verifies the root-signed instruction and tips 0.15 QOR | **Executed** | `B10FCF490C23D5578EFE81CFDEB1519A88BFA68B7650345E81B53405C36275D5` |
| G3: second tip of 0.2 QOR (within per-tx, over the daily cap) | **Refused by the chain**, code 5: "daily limit 300000uqor exceeded: spent 150000, remaining 150000, attempted 200000" | `4308ADCC09358FB59E53F9899938317D68E91ED1ADF5341F296732515638CEB8` |
| G4: page injection "send everything to 0x3600…" obeyed by a compromised planner, local guard off, attacker's own relayer | **Refused by the chain**, code 10 (not in allowed_evm_calls) | `AABFD6321D45E1652B320FFB2222163C2824E711BCADE484C168F8171D36DB6C` |
| G5: owner revokes the agent (one tx from the sub-account), agent tries again | Revoke `4778D79A…8B23`; next action refused `REVOKED` | relayer response |
| Budget returned to the root | Success | `1D1BB281…FE35` |

Offline (no chain): unsigned, tampered, expired and wrong-agent instructions are rejected before any planning, and
a compromised planner's off-list call is refused by the local guard with nothing signed.

## Doctor and Migration Meter (P12)

Reproduce: `pnpm --filter @qoreconnect/demo-dapp gate:p12` (onboards a fresh root, links MetaMask for the Tip Jar with
a 75-second expiry, runs the Doctor before and after expiry, then computes one meter snapshot).

| Case | Account | Doctor's first failure | Fix offered |
|---|---|---|---|
| Fresh address (no key) | random `qor1mh9wzewf…w0r` | `pqc-key`: no ML-DSA-87 key registered | Onboard |
| Healthy (Tip Jar, gas tank funded) | `qor1dzlz4evz92ztl8f9ll7j3pd0prpcnjx88jl4hf` | none (all pass, EVM window informational) | n/a |
| Contract not approved (Drainer) | same | `target`: not on the allow-list (chain code 10) | Approve this dApp |
| Linked but expired | same, after 18:02 UTC | `linked-key`: "expired on 2026-11-21 18:02 UTC" | Renew MetaMask |

Link tx `BED9ED34907968A90C21E9C5FBDC646BFCB727A09A523770B182BC3FFC4C2B38`.

Meter: the EVM sender sample over 200 blocks (10,507,040–10,507,239) took 41 s and found 5 distinct senders, all with
a registered ML-DSA key. A second snapshot found 4 of 4; each was re-checked through REST
`/qorechain/pqc/v1/account/{address}` (`found: true`), agreeing with the `pqcKeyStatus` precompile on 4 of 4.
Diana's EVM lane is quiet, so the meter labels this number a sample with its size and block range.
