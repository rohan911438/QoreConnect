export type QoreConnectErrorCode =
  | 'LIMIT_EXCEEDED'
  | 'EXPIRED'
  | 'NOT_APPROVED'
  | 'NONCE'
  | 'MODULE_DISABLED'
  | 'NO_RULE'
  | 'REVOKED'
  | 'RELAYER_UNAVAILABLE'
  | 'TANK_EMPTY'
  | 'RATE_LIMITED'
  | 'USER_REJECTED'
  | 'VAULT_LOCKED'
  | 'VAULT_NOT_FOUND'
  | 'BAD_PASSWORD'
  | 'PRF_UNSUPPORTED'
  | 'SPONSOR_REFUSED'
  | 'TX_FAILED'
  | 'INVALID_INPUT'
  | 'UNKNOWN'

const USER_MESSAGES: Record<QoreConnectErrorCode, string> = {
  LIMIT_EXCEEDED: 'Blocked by chain: this is over your spending limit.',
  EXPIRED: 'This key has expired. Renew it from your dashboard.',
  NOT_APPROVED: 'Blocked by chain: this dApp is not approved for your account.',
  NONCE: 'The signature was out of date. Please try again.',
  MODULE_DISABLED: 'QoreConnect runs on Diana testnet only for now.',
  NO_RULE: 'Your account has no spending rule, so QoreConnect will not use it.',
  REVOKED: 'This key was revoked. Link it again from your dashboard.',
  RELAYER_UNAVAILABLE: 'The relayer is unavailable. Your funds are safe; try again shortly.',
  TANK_EMPTY: "This dApp's gas budget is used up for now.",
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  USER_REJECTED: 'You cancelled the request.',
  VAULT_LOCKED: 'Unlock your quantum-safe key to continue.',
  VAULT_NOT_FOUND: 'No quantum-safe key on this device yet.',
  BAD_PASSWORD: 'That password did not unlock your key.',
  PRF_UNSUPPORTED: 'This browser cannot protect your key with a passkey. Use a password instead.',
  SPONSOR_REFUSED: 'Sponsored onboarding is not available for this account.',
  TX_FAILED: 'The transaction failed on chain.',
  INVALID_INPUT: 'Invalid input.',
  UNKNOWN: 'Something went wrong.',
}

/** A typed error with a message a user can read and the raw chain details for developers. */
export class QoreConnectError extends Error {
  readonly code: QoreConnectErrorCode
  readonly chainCode?: number
  readonly txHash?: string
  readonly detail?: string

  constructor(code: QoreConnectErrorCode, opts: { message?: string; chainCode?: number; txHash?: string; detail?: string } = {}) {
    super(opts.message ?? USER_MESSAGES[code])
    this.name = 'QoreConnectError'
    this.code = code
    this.chainCode = opts.chainCode
    this.txHash = opts.txHash
    this.detail = opts.detail
  }
}

/**
 * Classify a chain refusal (from a raw log or an execution-failure reason) into a QoreConnect error code.
 * Strings verified on Diana in P01.
 */
export function classifyChainRefusal(text: string | undefined, chainCode?: number): QoreConnectErrorCode {
  const t = (text ?? '').toLowerCase()
  if (t.includes('spending limit exceeded') || t.includes('limit') && t.includes('exceeded') || chainCode === 5) return 'LIMIT_EXCEEDED'
  if (t.includes('unbound or revoked') || t.includes('revoked')) return 'REVOKED'
  if (t.includes('expired') || chainCode === 6) return 'EXPIRED'
  if (t.includes('allowed_evm_calls') || t.includes('not permitted') || chainCode === 10) return 'NOT_APPROVED'
  if (t.includes('nonce') || t.includes('replay') || chainCode === 11) return 'NONCE'
  if (t.includes('disabled') || chainCode === 9) return 'MODULE_DISABLED'
  if (chainCode === 8) return 'NO_RULE'
  return 'TX_FAILED'
}
