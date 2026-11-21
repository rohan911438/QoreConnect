// Step 4 (Q7, Q8, Q11): refusals, revoke, and ML-DSA message signatures verified against the on-chain key.
import {
  deriveUnifiedAccount, fetchAuthNonce, buildMetaMaskExecuteEvm, decodeAuthenticatorExecutions, assertAuthenticatorExecutionsSucceeded,
  linkAuthenticatorMsgs, signAuthenticatorLinkEip191, revokeAuthenticatorMsg, fetchAuthenticators, pqcSign, pqcVerify, fetchPqcStatus,
  pqcStatusPublicKey, fetchSpendingRules,
} from '@qorechain/sdk'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { readFileSync } from 'node:fs'
import { encodeFunctionData, createPublicClient, http } from 'viem'
import { operator, sendTx, brief, log, CHAIN_ID, REST, EVM_RPC, hexToBytes, balance } from './common.js'
import { standInMetaMask } from './metamask.js'
import { load, save } from './state.js'

const st = load()
const root = await deriveUnifiedAccount(JSON.parse(readFileSync('results/.root-secret.json', 'utf8')).mnemonic)
const relayer = await operator(0)
const mm = standInMetaMask()
const pub = createPublicClient({ transport: http(EVM_RPC) })
const pk20 = hexToBytes(mm.address)
const results: Record<string, unknown> = {}

async function attempt(label: string, to: string, fn: string, valueWei: string) {
  const { nonce } = await fetchAuthNonce({ rest: REST, address: root.cosmos, pubkey: pk20 })
  const data = hexToBytes(encodeFunctionData({ abi: st.abi, functionName: fn }))
  const exec = await buildMetaMaskExecuteEvm({ provider: mm.provider as any, address: mm.address, relayer: relayer.cosmos, chainId: CHAIN_ID, account: root.cosmos, to, value: valueWei, data, gasLimit: 200_000, nonce, digestVersion: 'v2' })
  let r: any
  try { r = await sendTx(relayer, [exec], 650_000) } catch (e: any) { log(`${label} (simulation/broadcast refused)`, e.message.slice(0, 600)); results[label] = { refusedAt: 'simulate/broadcast', error: e.message.slice(0, 300) }; return }
  const dec = r.code === 0 ? decodeAuthenticatorExecutions(r, [exec]) : []
  let asserted = 'n/a'
  if (r.code === 0) { try { assertAuthenticatorExecutionsSucceeded(r, [exec]); asserted = 'succeeded' } catch (e: any) { asserted = 'AuthenticatorExecutionError: ' + e.message.slice(0, 200) } }
  log(label, { ...brief(r), executions: dec.map(d => ({ success: d.success, reason: d.reason, vmError: d.vmError })), asserted })
  results[label] = { code: r.code, tx: r.transactionHash, success: dec[0]?.success, reason: dec[0]?.reason, rawLog: r.code ? r.rawLog?.slice(0, 300) : undefined, asserted }
}

log('root balance', await balance(root.cosmos))
const QOR = 10n ** 18n // EVM wei per QOR
await attempt('Q7a call to non-allowlisted contract', st.counterOther, 'increment', '0')

await attempt('Q7c tip over perTxLimit (1.5 QOR)', st.counterAllowed, 'tip', (QOR * 3n / 2n).toString())
log('tips on counter', String(await pub.readContract({ address: st.counterAllowed, abi: st.abi, functionName: 'tips' })))

// Q8: link a second key (agent-style), then revoke BOTH in one root transaction
const agentPk = generatePrivateKey(); const agent = privateKeyToAccount(agentPk)
const aproof = signAuthenticatorLinkEip191({ chainId: CHAIN_ID, account: root.cosmos, privateKey: agentPk })
const currentRules = (await fetchSpendingRules({ rest: REST, address: root.cosmos })).rules.map(r => ({ ...r, dailyLimit: r.dailyLimit.toString(), perTxLimit: r.perTxLimit.toString() }))
const link2 = await sendTx(root, linkAuthenticatorMsgs({ owner: root.cosmos, chainId: CHAIN_ID, scheme: 'secp256k1', pubkey: aproof.pubkey, permissions: ['evm'], expiryUnix: Math.floor(Date.now() / 1000) + 3600, label: 'agent:test', possessionProof: aproof.possessionProof, spendingRules: currentRules }))
log('Q8 link second key', brief(link2))
const revoke = await sendTx(root, [
  revokeAuthenticatorMsg({ owner: root.cosmos, scheme: 'secp256k1', pubkey: pk20 }),
  revokeAuthenticatorMsg({ owner: root.cosmos, scheme: 'secp256k1', pubkey: aproof.pubkey }),
])
log('Q8 revoke both in one tx', brief(revoke))
log('Q8 authenticators after', (await fetchAuthenticators({ rest: REST, address: root.cosmos })).map(a => ({ label: a.label, revoked: a.revoked })))
await attempt('Q8 execute after revoke', st.counterAllowed, 'increment', '0')

// Q11: root signs an instruction with ML-DSA-87; agent verifies against the key registered on chain
const instruction = new TextEncoder().encode(JSON.stringify({ v: 1, agent: agent.address, task: 'increment', maxPerTx: '1000000', exp: Date.now() + 3600e3 }))
const sig = pqcSign(root.pqc.secretKey, instruction)
const onchain = pqcStatusPublicKey(await fetchPqcStatus({ rest: REST, address: root.cosmos }))!
const ok = pqcVerify(onchain, instruction, sig)
const tampered = new Uint8Array(instruction); tampered[5] ^= 1
log('Q11 ML-DSA instruction', { sigBytes: sig.length, verifiesAgainstOnchainKey: ok, tamperedRejected: !pqcVerify(onchain, tampered, sig) })
results.Q11 = { verifies: ok, tamperedRejected: !pqcVerify(onchain, tampered, sig) }
save({ negative: results, link2: link2.transactionHash, revoke: { tx: revoke.transactionHash, gasUsed: revoke.gasUsed?.toString() } })
