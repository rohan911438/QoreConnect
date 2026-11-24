import { decodeAuthenticatorExecutions, qorToEvm } from '@qorechain/sdk'
import type { QoreNetwork } from '../config'
import { fetchTxResult } from '../chain/tx'
import type { FetchLike } from '../chain/http'

export const CHAIN_ID_HEX = '0x2648' // 9800

export type RpcFn = (method: string, params?: unknown[]) => Promise<any>

/** JSON-RPC over fetch to the QoreChain EVM endpoint. */
export function evmRpc(net: QoreNetwork, fetchImpl?: FetchLike): RpcFn {
  let id = 1
  const f = fetchImpl ?? ((i: string, init?: RequestInit) => globalThis.fetch(i, init))
  return async (method, params = []) => {
    const r = await f(net.evmRpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) })
    const j: any = await r.json()
    if (j.error) throw Object.assign(new Error(j.error.message ?? 'RPC error'), { code: j.error.code ?? -32603, data: j.error.data })
    return j.result
  }
}

const b64ToHex = (s: string) => '0x' + Array.from(atob(s ?? ''), (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')

/**
 * A relayed call runs inside a Cosmos envelope (MsgExecuteEVM), so the EVM RPC has no transaction or receipt for it
 * (P06). QoreConnect's tx hash is `0x` + the envelope hash; this resolves it from Cosmos REST.
 */
export async function lookupRelayedCall(net: QoreNetwork, hash: string, rpc: RpcFn, fetchImpl?: FetchLike) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return undefined
  const t = await fetchTxResult(net, hash, fetchImpl)
  if (!t) return undefined
  const m = (t.tx?.body?.messages ?? []).find((x: any) => x['@type'] === '/qorechain.abstractaccount.v1.MsgExecuteEVM')
  if (!m) return undefined
  const [exec] = decodeAuthenticatorExecutions(t as any)
  const block = await rpc('eth_getBlockByNumber', ['0x' + t.height.toString(16), false]).catch(() => null)
  return {
    success: t.code === 0 && !!exec?.success,
    reason: exec?.reason,
    cosmosHash: t.transactionHash,
    blockNumber: '0x' + t.height.toString(16),
    blockHash: (block?.hash as string) ?? '0x' + '0'.repeat(64),
    from: qorToEvm(m.account).toLowerCase(),
    to: String(m.to).toLowerCase(),
    input: m.data ? b64ToHex(m.data) : '0x',
    value: '0x' + BigInt(m.value || 0).toString(16),
    gasLimit: '0x' + BigInt(m.gas_limit ?? m.gasLimit ?? 0).toString(16),
    gasUsed: '0x' + t.gasUsed.toString(16),
  }
}

/** eth_getTransactionReceipt that also understands relayed calls. `logs` is empty for relayed calls (Diana limitation). */
export async function getReceipt(net: QoreNetwork, hash: string, rpc: RpcFn, fetchImpl?: FetchLike) {
  const native = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null)
  if (native) return native
  const t = await lookupRelayedCall(net, hash, rpc, fetchImpl)
  if (!t) return null
  return {
    transactionHash: hash.toLowerCase(),
    transactionIndex: '0x0',
    blockHash: t.blockHash,
    blockNumber: t.blockNumber,
    from: t.from,
    to: t.to,
    cumulativeGasUsed: t.gasUsed,
    gasUsed: t.gasUsed,
    effectiveGasPrice: '0x0',
    contractAddress: null,
    logs: [],
    logsBloom: '0x' + '0'.repeat(512),
    status: t.success ? '0x1' : '0x0',
    type: '0x0',
  }
}

/** eth_getTransactionByHash that also understands relayed calls. */
export async function getTransaction(net: QoreNetwork, hash: string, rpc: RpcFn, fetchImpl?: FetchLike) {
  const native = await rpc('eth_getTransactionByHash', [hash]).catch(() => null)
  if (native) return native
  const t = await lookupRelayedCall(net, hash, rpc, fetchImpl)
  if (!t) return null
  return {
    hash: hash.toLowerCase(),
    blockHash: t.blockHash,
    blockNumber: t.blockNumber,
    transactionIndex: '0x0',
    from: t.from,
    to: t.to,
    input: t.input,
    value: t.value,
    gas: t.gasLimit,
    gasPrice: '0x0',
    nonce: '0x0',
    type: '0x0',
    chainId: CHAIN_ID_HEX,
    v: '0x0',
    r: '0x0',
    s: '0x0',
  }
}

/**
 * A request function for viem/wagmi transports: QoreChain EVM JSON-RPC plus relayed-call receipts.
 * Use it via `qoreTransport()` from `@rohankumar4179/wagmi`.
 */
export function qoreRequest(net: QoreNetwork, fetchImpl?: FetchLike) {
  const rpc = evmRpc(net, fetchImpl)
  return async ({ method, params }: { method: string; params?: unknown }) => {
    const p = (params ?? []) as unknown[]
    if (method === 'eth_getTransactionReceipt') return getReceipt(net, p[0] as string, rpc, fetchImpl)
    if (method === 'eth_getTransactionByHash') return getTransaction(net, p[0] as string, rpc, fetchImpl)
    if (method === 'eth_chainId') return CHAIN_ID_HEX
    return rpc(method, p)
  }
}
