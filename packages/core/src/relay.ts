import type { SignableCall } from './preview/preview'
import { buildMetaMaskExecuteEvm, executeEvmMsg, resolveEvmAuthDigestVersion } from '@qorechain/sdk'
import type { EncodeObject } from '@cosmjs/proto-signing'
import { DEFAULT_CALL_GAS_LIMIT, type QoreNetwork } from './config'
import { QoreConnectError, type QoreConnectErrorCode } from './errors'
import { QoreClient } from './chain/client'
import type { FetchLike } from './chain/http'
import type { Eip1193Provider } from './onboard'

/**
 * Wire format for POST /v1/relay. Every field the MetaMask key signed travels as-is; the relayer fills in its own
 * `relayer` address (the digest does not include it, so a relayer cannot change what was authorised).
 */
export interface RelayRequest {
  account: string
  /** 0x-hex 20-byte MetaMask address (the linked key). */
  pubkey: string
  /** 0x-hex 65-byte personal_sign signature over the EVM auth digest (v2: binds gasLimit). */
  signature: string
  to: string
  /** Wei, decimal string. */
  value: string
  /** 0x-hex calldata. */
  data: string
  gasLimit: string
  nonce: string
  tankId: string
}

export interface RelayResponse {
  ok: boolean
  /** Envelope (Cosmos) tx hash. The EVM call runs inside it; QoreChain emits no separate EVM tx hash for it (P06). */
  txHash?: string
  success?: boolean
  code?: QoreConnectErrorCode
  chainCode?: number
  error?: string
  /** True when the relayer refused before broadcasting (no fee was spent). */
  preRejected?: boolean
  feeUqor?: string
  explorer?: string
}

const toHex = (u: Uint8Array) => '0x' + Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')
export const hexToBytes = (h: string) => Uint8Array.from((h.startsWith('0x') ? h.slice(2) : h).match(/.{1,2}/g) ?? [], (b) => parseInt(b, 16))

/** Serialise a MsgExecuteEVM EncodeObject (from buildMetaMaskExecuteEvm) into the wire format. */
export function toRelayRequest(msg: EncodeObject, tankId: string): RelayRequest {
  const v = msg.value as any
  return {
    account: v.account,
    pubkey: toHex(v.pubkey),
    signature: toHex(v.signature),
    to: v.to,
    value: String(v.value ?? '0'),
    data: toHex(v.data ?? new Uint8Array()),
    gasLimit: String(v.gasLimit),
    nonce: String(v.nonce),
    tankId,
  }
}

/** Rebuild the MsgExecuteEVM a relayer broadcasts, with its own address as `relayer`. */
export function fromRelayRequest(r: RelayRequest, relayer: string): EncodeObject {
  return executeEvmMsg({
    relayer,
    account: r.account,
    scheme: 'secp256k1',
    pubkey: hexToBytes(r.pubkey),
    signature: hexToBytes(r.signature),
    to: r.to,
    value: r.value,
    data: hexToBytes(r.data),
    gasLimit: r.gasLimit,
    nonce: r.nonce,
  } as any)
}

/** Ask MetaMask to authorise one contract call for `account` and return the relay request. */
export async function signRelayRequest(o: {
  net: QoreNetwork
  ethereum: Eip1193Provider
  metamaskAddress: string
  account: string
  to: string
  valueWei?: bigint
  data?: string
  gasLimit?: number
  tankId: string
  /** Any relayer address; the digest does not bind it. */
  relayerAddress?: string
  fetch?: FetchLike
  /**
   * The previewed call (P08). When given, it is signed exactly as shown: account, to, value, data, gasLimit and
   * nonce all come from this object, so the digest matches what the user read.
   */
  call?: SignableCall
}): Promise<RelayRequest> {
  if (o.call) {
    const c = o.call
    o = { ...o, account: c.account, to: c.to, valueWei: c.valueWei, data: c.data, gasLimit: c.gasLimit, metamaskAddress: c.pubkey }
  }
  const client = new QoreClient(o.net, o.fetch)
  const [nonce, digestVersion] = await Promise.all([
    o.call ? o.call.nonce : client.getAuthNonce(o.account, o.metamaskAddress),
    resolveEvmAuthDigestVersion({ rest: o.net.rest, fetch: o.fetch as any }),
  ])
  let msg: EncodeObject
  try {
    msg = await buildMetaMaskExecuteEvm({
      provider: o.ethereum as any,
      address: o.metamaskAddress,
      relayer: o.relayerAddress ?? o.account,
      chainId: o.net.chainId,
      account: o.account,
      to: o.to.toLowerCase(),
      value: (o.valueWei ?? 0n).toString(),
      data: hexToBytes(o.data ?? '0x'),
      gasLimit: o.gasLimit ?? DEFAULT_CALL_GAS_LIMIT,
      nonce,
      digestVersion,
    })
  } catch (e: any) {
    if (e?.code === 4001) throw new QoreConnectError('USER_REJECTED')
    throw e
  }
  return toRelayRequest(msg, o.tankId)
}

export interface RelayActivity {
  txHash: string | null
  signer: string
  target: string | null
  success: boolean
  code: number | null
  error: string | null
  feeUqor: string | null
  valueUqor: string | null
  tankId: string
  createdAt: number
}

/** Thin HTTP client for a QoreConnect relayer. */
export class RelayerClient {
  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl?: FetchLike,
  ) {}

  private get f(): FetchLike {
    return this.fetchImpl ?? ((i, init) => globalThis.fetch(i, init))
  }

  async health(): Promise<{ ok: boolean; accounts?: { relayer?: string; sponsor?: string }; [k: string]: unknown }> {
    const r = await this.f(`${this.baseUrl.replace(/\/$/, '')}/health`).catch((e) => {
      throw new QoreConnectError('RELAYER_UNAVAILABLE', { detail: String(e) })
    })
    return r.json()
  }

  /** QoreConnect's own record of value moved today (uqor); undefined if the relayer cannot say. */
  async spentToday(account: string): Promise<bigint | undefined> {
    try {
      const r = await this.f(`${this.baseUrl.replace(/\/$/, '')}/v1/accounts/${account}/spent-today`)
      if (!r.ok) return undefined
      const j: any = await r.json()
      return BigInt(j.valueUqor)
    } catch {
      return undefined
    }
  }

  /** Recent relayed calls for an account (dashboard). */
  async activity(account: string): Promise<RelayActivity[]> {
    try {
      const r = await this.f(`${this.baseUrl.replace(/\/$/, '')}/v1/accounts/${account}/activity`)
      if (!r.ok) return []
      return ((await r.json()) as any).items ?? []
    } catch {
      return []
    }
  }

  async relay(req: RelayRequest): Promise<RelayResponse> {
    const r = await this.f(`${this.baseUrl.replace(/\/$/, '')}/v1/relay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    }).catch((e) => {
      throw new QoreConnectError('RELAYER_UNAVAILABLE', { detail: String(e) })
    })
    const body = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as RelayResponse
    if (r.status === 429) return { ...body, ok: false, code: body.code ?? 'RATE_LIMITED' }
    return body
  }

  /** Relay and throw a typed QoreConnectError unless the call succeeded on chain. */
  async relayOrThrow(req: RelayRequest): Promise<RelayResponse & { txHash: string }> {
    const res = await this.relay(req)
    if (!res.ok || !res.success || !res.txHash) {
      throw new QoreConnectError(res.code ?? 'TX_FAILED', { message: res.error, chainCode: res.chainCode, txHash: res.txHash })
    }
    return res as RelayResponse & { txHash: string }
  }
}
