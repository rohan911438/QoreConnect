import { deriveUnifiedAccount, fetchAuthNonce, buildMetaMaskExecuteEvm, decodeAuthenticatorExecutions } from '@qorechain/sdk'
import { readFileSync } from 'node:fs'
import { encodeFunctionData } from 'viem'
import { operator, sendTx, brief, log, CHAIN_ID, REST, hexToBytes } from './common.js'
import { standInMetaMask } from './metamask.js'
import { load, save } from './state.js'
const st = load()
const root = await deriveUnifiedAccount(JSON.parse(readFileSync('results/.root-secret.json', 'utf8')).mnemonic)
const relayer = await operator(0); const mm = standInMetaMask()
const n = await fetchAuthNonce({ rest: REST, address: root.cosmos, pubkey: hexToBytes(mm.address) })
log('auth nonce after revoke', { nonce: n.nonce.toString(), linked: n.linked })
const exec = await buildMetaMaskExecuteEvm({ provider: mm.provider as any, address: mm.address, relayer: relayer.cosmos, chainId: CHAIN_ID, account: root.cosmos, to: st.counterAllowed, value: '0', data: hexToBytes(encodeFunctionData({ abi: st.abi, functionName: 'increment' })), gasLimit: 200_000, nonce: n.nonce, digestVersion: 'v2' })
let out: any
try { const r: any = await sendTx(relayer, [exec], 650_000); const d = r.code === 0 ? decodeAuthenticatorExecutions(r, [exec]) : []; out = { ...brief(r), executions: d.map(x => ({ success: x.success, reason: x.reason })) } }
catch (e: any) { out = { refused: e.message.slice(0, 500) } }
log('Q8 execute after revoke', out)
save({ afterRevoke: out })
