// Step 2 (Q4/Q5): a brand-new user root, funded by a sponsor, registers its ML-DSA-87 key.
import { generateMnemonic, deriveUnifiedAccount, bank, buildRegisterPqcKeyMsg, signProofOfPossession } from '@qorechain/sdk'
import { writeFileSync } from 'node:fs'
import { operator, sendTx, brief, pqc, balance, log, CHAIN_ID, hexToBytes } from './common.js'
import { save } from './state.js'

const sponsor = await operator(0)
const mnemonic = generateMnemonic()
const root = await deriveUnifiedAccount(mnemonic)
// spike-only secret: kept in a git-ignored file so later steps can reuse this test root
writeFileSync('results/.root-secret.json', JSON.stringify({ mnemonic }))
log('new root', { cosmos: root.cosmos, evm: root.evm })

const T = Date.now()
const SPONSOR_AMOUNT = '3000000' // 3 QOR for the spike (covers registration, link, tests)
const s = await sendTx(sponsor, [bank.send({ fromAddress: sponsor.cosmos, toAddress: root.cosmos, amount: [{ denom: 'uqor', amount: SPONSOR_AMOUNT }] })])
log('sponsor send', brief(s))
log('root balance', await balance(root.cosmos))

const proof = signProofOfPossession({ chainId: CHAIN_ID, account: root.cosmos, algorithmId: 1, keypair: root.pqc })
const regMsg = buildRegisterPqcKeyMsg(root.cosmos, { pqcKeypair: root.pqc, ecdsaPubkey: hexToBytes(root.publicKey), keyType: 'hybrid', proofOfPossession: proof })
const r = await sendTx(root, [regMsg], 'auto', 'classical')
log('register pqc (classical bootstrap tx)', brief(r))
const st = await pqc(root.cosmos)
log('root pqc', { registered: st.registered, possessionProven: (st as any).possessionProven })
log('onboarding wall time ms', Date.now() - T)
log('root balance after', await balance(root.cosmos))
save({ root: { cosmos: root.cosmos, evm: root.evm }, onboard: { sponsorTx: s.transactionHash, registerTx: r.transactionHash, registerGasUsed: r.gasUsed?.toString(), registerFee: r.feeUqor, ms: Date.now() - T } })
