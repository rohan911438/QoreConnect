/**
 * Network constants for QoreConnect. Values verified on Diana testnet in P01 (spike/RESULTS.md).
 */
export interface QoreNetwork {
  /** Cosmos chain id. */
  chainId: string
  /** EVM chain id. */
  evmChainId: number
  /** REST (LCD) base URL. Browser apps should point this at a same-origin proxy (public REST has no CORS). */
  rest: string
  /** CometBFT RPC. */
  rpc: string
  /** EVM JSON-RPC. */
  evmRpc: string
  /** Block explorer base URL. */
  explorer: string
  /** Gas price in uqor per gas unit. The chain floor is 0.1; we use 0.15 (verified). */
  gasPrice: number
  /** Whether x/abstractaccount is enabled (testnet: yes; mainnet: no, code 9). */
  abstractAccounts: boolean
}

export const DIANA: QoreNetwork = {
  chainId: 'qorechain-diana',
  evmChainId: 9800,
  rest: 'https://api-testnet.qore.host',
  rpc: 'https://rpc-testnet.qore.host',
  evmRpc: 'https://evm-testnet.qore.host',
  explorer: 'https://explore.qore.network',
  gasPrice: 0.15,
  abstractAccounts: true,
}

/** 1 QOR = 10^6 uqor (native) = 10^18 wei (EVM). */
export const UQOR_PER_QOR = 1_000_000n
export const WEI_PER_UQOR = 1_000_000_000_000n
export const WEI_PER_QOR = UQOR_PER_QOR * WEI_PER_UQOR

/** Convert wei (EVM value) to uqor, rounding up (the chain rounds outflow up). */
export function weiToUqor(wei: bigint): bigint {
  return (wei + WEI_PER_UQOR - 1n) / WEI_PER_UQOR
}

export function uqorToWei(uqor: bigint): bigint {
  return uqor * WEI_PER_UQOR
}

/** Format uqor as a QOR display string with up to 6 decimals, no trailing zeros. */
export function formatQor(uqor: bigint | string | number): string {
  const v = BigInt(uqor)
  const neg = v < 0n
  const a = neg ? -v : v
  const whole = a / UQOR_PER_QOR
  const frac = (a % UQOR_PER_QOR).toString().padStart(6, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`
}

/** Parse a QOR display string ("1.5") into uqor. */
export function parseQor(display: string): bigint {
  const m = display.trim().match(/^(\d+)(?:\.(\d{0,6}))?$/)
  if (!m) throw new Error(`invalid QOR amount: ${display}`)
  return BigInt(m[1]!) * UQOR_PER_QOR + BigInt((m[2] ?? '').padEnd(6, '0') || '0')
}

export function explorerTx(net: QoreNetwork, hash: string): string {
  return `${net.explorer}/tx/${hash.startsWith('0x') ? hash : hash.toUpperCase()}`
}

export function explorerAddress(net: QoreNetwork, address: string): string {
  return `${net.explorer}/address/${address}`
}

/** Gas the relayer adds on top of the signed EVM gas limit for the envelope (P01 finding 3). */
export const ENVELOPE_GAS_OVERHEAD = 450_000

/** Default EVM gas limit a session key signs for a call when estimation is unavailable. */
export const DEFAULT_CALL_GAS_LIMIT = 300_000
