import 'dotenv/config'
import {
  createClient, deriveUnifiedAccount, directSignerFromPrivateKey, fetchPqcStatus,
  type UnifiedAccount, type TxClient,
} from '@qorechain/sdk'

export const REST = process.env.QORE_REST!
export const RPC = process.env.QORE_RPC!
export const EVM_RPC = process.env.QORE_EVM_RPC!
export const CHAIN_ID = process.env.QORE_CHAIN_ID!
export const EXPLORER = 'https://explore.qore.network'

export const client = createClient({ network: 'testnet' })

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  return Uint8Array.from(Buffer.from(h, 'hex'))
}

export async function operator(index = 0): Promise<UnifiedAccount> {
  const m = process.env.OPERATOR_MNEMONIC
  if (!m) throw new Error('OPERATOR_MNEMONIC missing in spike/.env')
  return deriveUnifiedAccount(m, index)
}

export async function txFor(acc: UnifiedAccount, hybrid = true): Promise<TxClient> {
  const signer = await directSignerFromPrivateKey(hexToBytes(acc.privateKey), 'qor')
  return client.connectTx(signer, hybrid ? { pqcKeypair: acc.pqc } : {})
}

export async function balance(addr: string): Promise<string> {
  const r = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${addr}`)
  const j: any = await r.json()
  return JSON.stringify(j.balances ?? j)
}

export async function pqc(addr: string) {
  return fetchPqcStatus({ rest: REST, address: addr })
}

export function log(label: string, v: unknown) {
  console.log(`[${label}]`, typeof v === 'string' ? v : JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? `bytes(${x.length})` : x), 2))
}

// ---- eth-native hybrid transactions (the account type QoreX / unified accounts use) ----
import { EthNativeSigner } from '@qorechain/sdk'
import { StargateClient } from '@cosmjs/stargate'
import type { EncodeObject } from '@cosmjs/proto-signing'

let sg: StargateClient | undefined
export async function stargate() { return (sg ??= await StargateClient.connect(RPC)) }

export async function accountSeq(addr: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const r = await fetch(`${REST}/cosmos/auth/v1beta1/accounts/${addr}`)
  if (!r.ok) throw new Error(`account ${addr} not found (${r.status})`)
  const j: any = await r.json()
  const a = j.account?.base_account ?? j.account
  return { accountNumber: BigInt(a.account_number ?? 0), sequence: BigInt(a.sequence ?? 0) }
}

export const GAS_PRICE = 0.15 // uqor per gas (floor is 0.1)

export async function simulate(txBytes: Uint8Array): Promise<number> {
  const r = await fetch(`${REST}/cosmos/tx/v1beta1/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_bytes: Buffer.from(txBytes).toString('base64') }) })
  const j: any = await r.json()
  if (!r.ok || !j.gas_info) throw new Error('simulate failed: ' + JSON.stringify(j).slice(0, 400))
  return Number(j.gas_info.gas_used)
}

export async function sendTx(acc: UnifiedAccount, messages: EncodeObject[], gas: number | 'auto' = 'auto', mode: 'hybrid' | 'classical' = 'hybrid') {
  const signer = new EthNativeSigner(acc, { signMode: mode, rest: REST })
  const { accountNumber, sequence } = await accountSeq(acc.cosmos)
  const version = mode === 'hybrid' ? await signer.resolveSignBytesVersion(CHAIN_ID) : undefined
  const build = (g: number) => signer.sign({ chainId: CHAIN_ID, messages, fee: { amount: [{ denom: 'uqor', amount: String(Math.ceil(g * GAS_PRICE)) }], gas: String(g) }, accountNumber, sequence, signBytesVersion: version })
  let g = typeof gas === 'number' ? gas : 0
  let simulated: number | undefined
  if (gas === 'auto') { simulated = await simulate(build(3_000_000).txRawBytes); g = Math.ceil(simulated * 1.3) + 5_000 }
  const signed = build(g)
  const c = await stargate()
  const t0 = Date.now()
  const res = await c.broadcastTx(signed.txRawBytes, 60_000, 1_000)
  return { ...res, ms: Date.now() - t0, feeUqor: String(Math.ceil(g * GAS_PRICE)), simulated }
}

export function brief(r: any) {
  return { code: r.code, hash: r.transactionHash, height: r.height, gasUsed: r.gasUsed?.toString(), gasWanted: r.gasWanted?.toString(), feeUqor: r.feeUqor, ms: r.ms, rawLog: r.code ? r.rawLog : undefined, url: `${EXPLORER}/tx/${r.transactionHash}` }
}
