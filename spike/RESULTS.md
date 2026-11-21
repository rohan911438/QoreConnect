# P01 feasibility spike — results

**Decision: GO.** Every blocking assumption holds on Diana testnet (chain v3.2.8, SDK 0.14.0). Run on 21 Nov 2026.

The core claim of QoreConnect is proven on-chain: **a brand-new account, funded by a sponsor, registers its ML-DSA-87 key, links a MetaMask-style key with a spending rule, and that key's EIP-191 signature makes a relayed contract call that executes as the root account. The chain enforces the allow-list, the per-transaction cap and revocation.**

---

## Results by question

| # | Question | Result | Evidence |
|---|---|---|---|
| Q1 | MetaMask-linked key executes a **contract call with calldata** | **PASS** | `increment()` relayed, counter 0 → 1. Relay tx [`ACA41F09…80F1`](https://explore.qore.network/tx/ACA41F09AE923018D5B882254B4788C4F93DD77E3C999E6D11DF295CE51B80F1). `buildMetaMaskExecuteEvm` takes `data: Uint8Array`. |
| Q2 | Does authenticator `MsgExecuteEVM` need an **open EVM window** on the root? | **PASS: no window needed** | Root had no window (`found: false`) when Q1 executed. |
| Q3 | Is `msg.sender` the root's 0x address? | **PASS: yes** | `lastSender` = `0x789F00F2…E4E4` = root EVM address (not the MetaMask address). |
| Q4 | Sponsor-funded new account registers its ML-DSA key and links a key | **PASS** | Sponsor send [`17C19D71…DEB7`](https://explore.qore.network/tx/17C19D719DB074183CBCC2F4E33EAC08B9F667107AD16239C5A28E64C4CFDEB7); classical bootstrap registration [`A4A820DD…F839`](https://explore.qore.network/tx/A4A820DDBCAA23E64B67A40E8755C2EBC69CC637CAA4EA61563DB736A5C3F839), `possessionProven: true`; link [`08EAAB70…3C07`](https://explore.qore.network/tx/08EAAB70FF9AD7B5AE9875A8F58522A1A98EFF97CDF66794FED1474932ED3C07). |
| Q5 | Fees and gas | **Measured** | See table below. |
| Q6 | How rules bind; exact JSON | **PASS, with a design change** | `results/q06-rules.json`. Rules are **account-wide**: the first enabled rule bounds every linked key without its own. `linkAuthenticatorMsgs` writes account rules only (`authenticatorRules: []`, `hasSpendRule: false`). There is no message to set a per-key rule in SDK 0.14.0. |
| Q7 | Not-allowed contract refused; over-limit refused; refusal detected | **PASS** | Non-allow-listed call: `success=false`, *"may call … with data only if the rule lists the call in allowed_evm_calls … authenticator not permitted"* [`187A08A3…3E90`](https://explore.qore.network/tx/187A08A35DDC76B72661C8B848D613E9811547E83EDF23E501E60A4E7D8B3E90). 1.5 QOR tip vs 1 QOR cap: *"per-tx limit 1000000uqor exceeded (attempted 1500000): spending limit exceeded"* [`2C84F549…0D92`](https://explore.qore.network/tx/2C84F5492A79EC62D8B5690B2A42273DDAD1DB80DA2F62281E57567C66F00D92). Both are code 0 with `success=false`, and `assertAuthenticatorExecutionsSucceeded` throws. A 0.5 QOR tip within limit succeeded [`3DA1C4F4…264B`](https://explore.qore.network/tx/3DA1C4F4A5D376A7FAE3A260886F29E3394DFD969252FEDA3F077984A559264B). |
| Q8 | Revoke takes effect immediately; several revokes in one tx | **PASS** | Two keys revoked in one root tx [`A5D32D10…98A2`](https://explore.qore.network/tx/A5D32D1017CDD11F3700EFBD44F86161FBE61E64D96B410E7838D598F82398A2). Next execution refused, code 10: *"linked key is unbound or revoked"* [`1D0F074C…12BA`](https://explore.qore.network/tx/1D0F074C8CE36C87BE113B9C304A2503D811548A7BBFF0DAE7802FA4BD2112BA). |
| Q9 | QoreX compatibility of SDK-derived seeds | **PASS (strong indirect evidence)** | The user's QoreX testnet wallet phrase, derived with `deriveUnifiedAccount` (path `m/44'/60'/0'/0/0`, canonical PQC derivation), gives `qor1wpae9a…r4w8`. That is the funded QoreX account, and its hybrid signatures were accepted, so its on-chain ML-DSA key equals the SDK derivation. A seed QoreConnect creates can therefore be imported into QoreX. Manual confirmation (import a fresh seed into QoreX) is still recommended. |
| Q10 | Passkey PRF in the target browser | **Pending manual** | Open `spike/prf-test.html` via a local server (`npx serve spike`) in Chrome and click "Run test". The password fallback is built regardless. |
| Q11 | Root ML-DSA signature on an instruction, verified against the on-chain key | **PASS** | 4,627-byte ML-DSA-87 signature verifies against the key from `fetchPqcStatus`; tampered message rejected. |
| Q12 | Do session keys need `deploy` for ordinary calls? | **PASS: `["evm"]` is enough** | Q1 ran with permissions `["evm"]` only. |
| Q13 | Organiser category confirmation | **Pending** | Question text in `tracks/02-main-track-pq-ai-agents.md`. |

## Measured costs (gas price 0.15 uqor/gas)

| Transaction | Signer | Gas used | Fee paid |
|---|---|---|---|
| Sponsor bank send (hybrid) | sponsor | 200,799 | 0.040 QOR |
| ML-DSA key registration (classical bootstrap) | new root | 299,281 | 0.059 QOR |
| Link authenticator + rule (hybrid) | root | 226,107 | 0.045 QOR |
| Relay `MsgExecuteEVM` `increment()` | relayer | 332,968 | 0.066 QOR |
| Relay `MsgExecuteEVM` with value | relayer | 409,213 | 0.081 QOR |
| Revoke two keys in one tx | root | 241,770 | 0.048 QOR |
| Open EVM window (operator) | operator | 186,812 | 0.045 QOR |

- **Sponsor amount per new user:** registration + link ≈ 0.105 QOR. Use **0.2 QOR** for margin (covers one rule update or renewal).
- **Relay cost:** about 0.07–0.10 QOR per execution. With about 95 QOR, the operator funds roughly 1,000 relays.
- **Onboarding wall time:** sponsor + registration took 23 s, of which 11.6 s was waiting for the registration to be included; the link added about 3 s. That is about 26 s of chain time, inside the 60-second target.
- **Block time on Diana:** about 1.2 s. 17,280 blocks is about 5–6 hours.

## Findings that change the design

1. **Spending rules are account-wide.** The first enabled account rule bounds every linked key. MetaMask and an agent key on the same account share caps and allow-list.
   → **Agent keys get their own account**: an agent sub-account derived from the same root seed (HD index ≥ 1) with its own budget and rules. That is stronger isolation (an agent can never touch the main balance), and it is how the dashboard will present agents.
2. **The relayer pays for refused executions.** A refused execution is still a code-0 transaction with a fee (0.0975 QOR in the test).
   → The relayer must **pre-check** the allow-list, caps, expiry and nonce locally (from `fetchSpendingRules`, `fetchAuthenticators`, `fetchAuthNonce`, plus `eth_call` simulation) and refuse before broadcasting. Gas tanks are charged for on-chain refusals, which caps griefing.
3. **Outer gas must cover the signed gas limit.** If the envelope provisions less gas for the call than the key signed, the chain refuses with code 10 ("provisions X gas for the call, less than the signed gas_limit"). Simulation underestimates when the call will be refused.
   → Relayer gas = `max(simulated × 1.3, signedGasLimit + 450,000)`.
4. **No EVM window is needed for authenticator executions.** Windows remain relevant only for the root acting directly on the EVM lane (for example, deploying). The "scoped EVM window" category requirement is met by the root's optional direct-EVM actions and the agent sub-account (see `tracks/02`).
5. **Account type.** The root must be an **eth-native unified account** (`deriveUnifiedAccount`, `EthNativeSigner`), not a cosmjs `directSignerFromPrivateKey` account, whose address differs. Native transactions are signed with `EthNativeSigner` and broadcast with cosmjs `StargateClient.broadcastTx`; gas comes from REST `/cosmos/tx/v1beta1/simulate`.
6. **EVM value units.** `value` in `MsgExecuteEVM` is wei (18 decimals); spending limits are in uqor (6 decimals). 1 QOR = 10^18 wei = 10^6 uqor.

## Accounts used

| Role | qor1 | 0x |
|---|---|---|
| Operator / sponsor / relayer (user's QoreX testnet wallet) | `qor1wpae9a38v7vlj2xvun2cw0669w4ls568zar4w8` | `0x707B92f6276799f928CCe4D5873f5A2babF85347` |
| Spike user root (fresh, sponsored) | `qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s` | `0x789F00F2F6705ed10DF035477fc72d3C4470E4E4` |
| Stand-in MetaMask key | — | `0x974944048DeC3f8Ff1bA6bB076724D86c085d69B` |

## Contracts deployed

| Contract | Address | Deploy tx |
|---|---|---|
| SpikeCounter (allow-listed) | `0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74` | `0xe3e232b7…a892d` |
| SpikeCounter (not allow-listed) | `0x5017fbbc1de44e698d1778630bce63741c1d0005` | `0xe73dba85…c85e` |

## Reproduce

```bash
cd spike
cp .env.example .env   # fill OPERATOR_MNEMONIC (testnet only)
npx tsx src/q00-operator.ts
npx tsx src/s1-deploy.ts
npx tsx src/s2-onboard.ts
npx tsx src/s3-link-and-execute.ts
npx tsx src/s4-negative.ts
npx tsx src/s5-after-revoke.ts
```

Secrets created by the spike (`results/.root-secret.json`, `results/.metamask-secret.json`) and `.env` are git-ignored.
