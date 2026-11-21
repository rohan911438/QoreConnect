// Step 3 (Q1, Q2, Q3, Q6, Q12): link a MetaMask-style key with rules, then relay a contract call.
import {
  deriveUnifiedAccount, linkAuthenticatorMsgs, signAuthenticatorLinkMetaMask, fetchSpendingRules, fetchAuthenticators,
  fetchAuthNonce, buildMetaMaskExecuteEvm, resolveEvmAuthDigestVersion, decodeAuthenticatorExecutions, fetchEvmWindow,
} from '@qorechain/sdk'
import { readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, http, encodeFunctionData } from 'viem'
import { operator, sendTx, brief, log, CHAIN_ID, REST, EVM_RPC, hexToBytes, stargate } from './common.js'
import { standInMetaMask } from './metamask.js'
import { load, save } from './state.js'

const st = load()
const root = await deriveUnifiedAccount(JSON.parse(readFileSync('results/.root-secret.json', 'utf8')).mnemonic)
const relayer = await operator(0)
const mm = standInMetaMask()
log('stand-in metamask', mm.address)
log('root window (expect none)', await fetchEvmWindow({ rest: REST, address: root.cosmos }))

// 1) possession proof via personal_sign, exactly like MetaMask
const proof = await signAuthenticatorLinkMetaMask({ chainId: CHAIN_ID, account: root.cosmos, provider: mm.provider as any, address: mm.address })
const expiry = Math.floor(Date.now() / 1000) + 24 * 3600
const rule = { id: 'qoreconnect', enabled: true, perTxLimit: '1000000', dailyLimit: '5000000', allowedDenoms: ['uqor'], allowedEvmCalls: [st.counterAllowed.toLowerCase()] }
const msgs = linkAuthenticatorMsgs({
  owner: root.cosmos, chainId: CHAIN_ID, scheme: 'secp256k1', pubkey: proof.pubkey, permissions: ['evm'],
  expiryUnix: expiry, label: 'metamask', possessionProof: proof.possessionProof, spendingRules: [rule],
})
const link = await sendTx(root, msgs)
log('link tx (root, hybrid)', brief(link))
const rules = await fetchSpendingRules({ rest: REST, address: root.cosmos })
const auths = await fetchAuthenticators({ rest: REST, address: root.cosmos })
writeFileSync('results/q06-rules.json', JSON.stringify(rules, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2))
writeFileSync('results/q06-authenticators.json', JSON.stringify(auths, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2))
log('rules', rules); log('authenticators', auths)

// 2) MetaMask signs an increment() call; the operator relays it
const pub = createPublicClient({ transport: http(EVM_RPC) })
const before = await pub.readContract({ address: st.counterAllowed, abi: st.abi, functionName: 'count' })
const digestVersion = await resolveEvmAuthDigestVersion({ rest: REST })
const { nonce } = await fetchAuthNonce({ rest: REST, address: root.cosmos, pubkey: proof.pubkey })
const data = hexToBytes(encodeFunctionData({ abi: st.abi, functionName: 'increment' }))
const exec = await buildMetaMaskExecuteEvm({ provider: mm.provider as any, address: mm.address, relayer: relayer.cosmos, chainId: CHAIN_ID, account: root.cosmos, to: st.counterAllowed, value: '0', data, gasLimit: 200_000, nonce, digestVersion })
const rel = await sendTx(relayer, [exec])
log('relay tx (operator as relayer)', brief(rel))
const results = rel.code === 0 ? decodeAuthenticatorExecutions(rel as any, [exec]) : []
log('execution results', results)
const after = await pub.readContract({ address: st.counterAllowed, abi: st.abi, functionName: 'count' })
const lastSender = await pub.readContract({ address: st.counterAllowed, abi: st.abi, functionName: 'lastSender' })
log('counter', { before: String(before), after: String(after), lastSender, rootEvm: root.evm, metamask: mm.address })
save({ metamask: mm.address, link: { tx: link.transactionHash, gasUsed: link.gasUsed?.toString(), fee: link.feeUqor }, execute: { tx: rel.transactionHash, gasUsed: rel.gasUsed?.toString(), fee: rel.feeUqor, success: results[0]?.success, before: String(before), after: String(after), lastSender, digestVersion } })
