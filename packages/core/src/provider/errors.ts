import { QoreConnectError, type QoreConnectErrorCode } from '../errors'

/** EIP-1193 provider error with the QoreConnect details attached (`data`). */
export class ProviderRpcError extends Error {
  readonly code: number
  readonly data?: { qoreconnect?: { code: QoreConnectErrorCode; chainCode?: number; txHash?: string; detail?: string } }
  constructor(code: number, message: string, data?: ProviderRpcError['data']) {
    super(message)
    this.name = 'ProviderRpcError'
    this.code = code
    this.data = data
  }
}

/** QoreConnect codes → EIP-1193 / JSON-RPC codes (wagmi and viem map these to their error classes). */
const CODES: Partial<Record<QoreConnectErrorCode, number>> = {
  USER_REJECTED: 4001,
  VAULT_LOCKED: 4100,
  NOT_APPROVED: 4100,
  RELAYER_UNAVAILABLE: 4900,
  MODULE_DISABLED: 4901,
  INVALID_INPUT: -32602,
  RATE_LIMITED: -32005,
}

export function toRpcError(e: unknown): Error {
  if (e instanceof ProviderRpcError) return e
  if (e instanceof QoreConnectError) {
    return new ProviderRpcError(CODES[e.code] ?? -32603, e.message, { qoreconnect: { code: e.code, chainCode: e.chainCode, txHash: e.txHash, detail: e.detail } })
  }
  const err = e as any
  if (typeof err?.code === 'number') return new ProviderRpcError(err.code, err.message ?? String(e), err.data)
  return new ProviderRpcError(-32603, String(err?.message ?? e))
}
