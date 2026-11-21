import { EthNativeSigner, type UnifiedAccount } from '@qorechain/sdk'
import type { EncodeObject } from '@cosmjs/proto-signing'
import type { QoreNetwork } from '../config'
import { QoreConnectError, classifyChainRefusal } from '../errors'
import { getJson, HttpError, postJson, type FetchLike } from './http'

/** Result of an included transaction, in the shape the SDK's execution decoders accept. */
export interface TxResult {
  code: number
  transactionHash: string
  height: number
  gasUsed: bigint
  gasWanted: bigint
  rawLog: string
  events: { type: string; attributes: { key: string; value: string }[] }[]
  msgResponses: { typeUrl: string; value: Uint8Array }[]
  feeUqor: string
}

/** Anything that can submit signed tx bytes and wait for inclusion. */
export interface Broadcaster {
  broadcast(txBytes: Uint8Array): Promise<TxResult>
}

export interface SendTxOptions {
  /** Gas units, or "auto" to simulate (simulated × 1.3 + 5,000). */
  gas?: number | 'auto'
  /** Minimum gas when "auto" (the relayer uses this to cover the signed EVM gas limit). */
  minGas?: number
  /** "hybrid" (default) or "classical" (only for the bootstrap ML-DSA key registration). */
  mode?: 'hybrid' | 'classical'
  memo?: string
}

const b64 = (u: Uint8Array) => {
  let s = ''
  for (const byte of u) s += String.fromCharCode(byte)
  return btoa(s)
}
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

/** Account number and sequence over REST. Throws VAULT_NOT_FOUND-like error when the account does not exist yet. */
export async function accountSequence(net: QoreNetwork, address: string, fetchImpl?: FetchLike) {
  const j = await getJson<any>(`${net.rest}/cosmos/auth/v1beta1/accounts/${address}`, fetchImpl).catch((e) => {
    if (e instanceof HttpError && e.status === 404) throw new QoreConnectError('TX_FAILED', { message: `Account ${address} does not exist on chain yet.`, detail: e.body })
    throw new QoreConnectError('RELAYER_UNAVAILABLE', { message: 'QoreChain REST is unreachable right now.', detail: String(e) })
  })
  const a = j.account?.base_account ?? j.account
  return { accountNumber: BigInt(a.account_number ?? 0), sequence: BigInt(a.sequence ?? 0) }
}

/** Simulate signed tx bytes over REST and return gas used. */
export async function simulateTx(net: QoreNetwork, txBytes: Uint8Array, fetchImpl?: FetchLike): Promise<number> {
  const j = await postJson<any>(`${net.rest}/cosmos/tx/v1beta1/simulate`, { tx_bytes: b64(txBytes) }, fetchImpl)
  if (!j.gas_info) throw new QoreConnectError('TX_FAILED', { message: 'Simulation failed', detail: JSON.stringify(j).slice(0, 500) })
  return Number(j.gas_info.gas_used)
}

/**
 * REST broadcaster: POST /cosmos/tx/v1beta1/txs (sync), then poll GET /cosmos/tx/v1beta1/txs/{hash}.
 * Works in browsers through a same-origin REST proxy, and in Node directly.
 */
export class RestBroadcaster implements Broadcaster {
  constructor(
    private readonly net: QoreNetwork,
    private readonly opts: { fetch?: FetchLike; timeoutMs?: number; pollMs?: number } = {},
  ) {}

  async broadcast(txBytes: Uint8Array): Promise<TxResult> {
    const sub = await postJson<any>(`${this.net.rest}/cosmos/tx/v1beta1/txs`, { tx_bytes: b64(txBytes), mode: 'BROADCAST_MODE_SYNC' }, this.opts.fetch)
    const tr = sub.tx_response
    if (!tr) throw new QoreConnectError('TX_FAILED', { detail: JSON.stringify(sub).slice(0, 500) })
    if (tr.code && tr.code !== 0) {
      throw new QoreConnectError(classifyChainRefusal(tr.raw_log, tr.code), { chainCode: tr.code, txHash: tr.txhash, detail: tr.raw_log })
    }
    const hash: string = tr.txhash
    const deadline = Date.now() + (this.opts.timeoutMs ?? 60_000)
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, this.opts.pollMs ?? 1_000))
      const got = await getJson<any>(`${this.net.rest}/cosmos/tx/v1beta1/txs/${hash}`, this.opts.fetch).catch(() => undefined)
      const t = got?.tx_response
      if (!t) continue
      return {
        code: Number(t.code ?? 0),
        transactionHash: hash,
        height: Number(t.height ?? 0),
        gasUsed: BigInt(t.gas_used ?? 0),
        gasWanted: BigInt(t.gas_wanted ?? 0),
        rawLog: t.raw_log ?? '',
        events: (t.events ?? []).map((e: any) => ({ type: e.type, attributes: (e.attributes ?? []).map((a: any) => ({ key: a.key, value: a.value })) })),
        msgResponses: decodeMsgResponses(t),
        feeUqor: '0',
      }
    }
    throw new QoreConnectError('TX_FAILED', { message: 'Transaction was not included in time', txHash: hash })
  }
}

/**
 * Decode msg_responses from a REST tx_response. Cosmos SDK 0.50+ REST includes them in `tx_response.tx`? No:
 * they are in `data` (hex-encoded TxMsgData). We decode the protobuf by hand to avoid extra dependencies:
 * TxMsgData { repeated Any msg_responses = 2; } and Any { string type_url = 1; bytes value = 2; }.
 */
function decodeMsgResponses(t: any): { typeUrl: string; value: Uint8Array }[] {
  if (Array.isArray(t.msg_responses)) {
    return t.msg_responses.map((m: any) => ({ typeUrl: m['@type'] ?? m.type_url, value: m.value ? fromB64(m.value) : new Uint8Array() }))
  }
  const hex: string | undefined = t.data
  if (!hex) return []
  const bytes = Uint8Array.from(hex.match(/.{1,2}/g) ?? [], (h) => parseInt(h, 16))
  return parseAnyList(bytes, 2)
}

function readVarint(b: Uint8Array, i: number): [number, number] {
  let x = 0
  let shift = 0
  for (;;) {
    const byte = b[i++]!
    x += (byte & 0x7f) * 2 ** shift
    if (byte < 0x80) return [x, i]
    shift += 7
  }
}

function parseFields(b: Uint8Array): { field: number; value: Uint8Array }[] {
  const out: { field: number; value: Uint8Array }[] = []
  let i = 0
  while (i < b.length) {
    const [key, j] = readVarint(b, i)
    const field = Math.floor(key / 8)
    const wire = key & 7
    i = j
    if (wire === 2) {
      const [len, k] = readVarint(b, i)
      out.push({ field, value: b.subarray(k, k + len) })
      i = k + len
    } else if (wire === 0) {
      i = readVarint(b, i)[1]
    } else if (wire === 1) i += 8
    else if (wire === 5) i += 4
    else break
  }
  return out
}

function parseAnyList(b: Uint8Array, field: number) {
  return parseFields(b)
    .filter((f) => f.field === field)
    .map((f) => {
      const any = parseFields(f.value)
      const typeUrl = new TextDecoder().decode(any.find((x) => x.field === 1)?.value ?? new Uint8Array())
      return { typeUrl, value: any.find((x) => x.field === 2)?.value ?? new Uint8Array() }
    })
}

/**
 * Sign (eth-native, hybrid by default) and broadcast native messages from a unified account.
 * Gas: simulate, then max(simulated × 1.3 + 5,000, minGas).
 */
export async function sendTx(
  net: QoreNetwork,
  account: UnifiedAccount,
  messages: EncodeObject[],
  broadcaster: Broadcaster,
  opts: SendTxOptions = {},
  fetchImpl?: FetchLike,
): Promise<TxResult> {
  const mode = opts.mode ?? 'hybrid'
  const signer = new EthNativeSigner(account, { signMode: mode, rest: net.rest, fetch: fetchImpl as any })
  const { accountNumber, sequence } = await accountSequence(net, account.cosmos, fetchImpl)
  const signBytesVersion = mode === 'hybrid' ? await signer.resolveSignBytesVersion(net.chainId) : undefined
  const build = (gas: number, feeUqor = Math.ceil(gas * net.gasPrice)) =>
    signer.sign({
      chainId: net.chainId,
      messages,
      fee: { amount: [{ denom: 'uqor', amount: String(feeUqor) }], gas: String(gas) },
      memo: opts.memo,
      accountNumber,
      sequence,
      signBytesVersion,
    })
  let gas: number
  if (typeof opts.gas === 'number') gas = opts.gas
  else {
    const simulated = await simulateTx(net, build(3_000_000, 0).txRawBytes, fetchImpl) // zero fee: simulate skips the min-fee check, and a new account cannot afford a 3M-gas fee
    gas = Math.max(Math.ceil(simulated * 1.3) + 5_000, opts.minGas ?? 0)
  }
  const signed = build(gas)
  const res = await broadcaster.broadcast(signed.txRawBytes)
  res.feeUqor = String(Math.ceil(gas * net.gasPrice))
  if (res.code !== 0) {
    throw new QoreConnectError(classifyChainRefusal(res.rawLog, res.code), { chainCode: res.code, txHash: res.transactionHash, detail: res.rawLog })
  }
  return res
}
