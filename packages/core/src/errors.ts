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
  | 'METAMASK_MISSING'
  | 'METAMASK_LOCKED'
  | 'WRONG_NETWORK'
  | 'UNKNOWN'

const USER_MESSAGES: Record<QoreConnectErrorCode, string> = {
  LIMIT_EXCEEDED: 'Blocked by chain: this is over your spending limit. Raise it from your dashboard if you meant it.',
  EXPIRED: 'This key has expired. Renew it from your dashboard.',
  NOT_APPROVED: 'Blocked by chain: this dApp is not approved for your account. Approve it when asked, or from your dashboard.',
  NONCE: 'The signature was out of date. Try again; nothing was sent.',
  MODULE_DISABLED: 'Abstract accounts are switched off on this network. QoreConnect runs on Diana testnet only for now.',
  NO_RULE: 'Your account has no spending rule, so QoreConnect will not use it. Set limits from your dashboard.',
  REVOKED: 'This key was revoked. Link it again from your dashboard.',
  RELAYER_UNAVAILABLE: 'The relayer is unavailable. Your funds are safe; try again shortly.',
  TANK_EMPTY: "This dApp's gas budget is used up for now. Try again later or tell the dApp's team.",
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  USER_REJECTED: 'You cancelled the request. Nothing was sent.',
  VAULT_LOCKED: 'Unlock your quantum-safe key to continue.',
  VAULT_NOT_FOUND: 'No quantum-safe key on this device yet. Create one, or restore it with your recovery code.',
  BAD_PASSWORD: 'That password did not unlock your key. Try again, or restore with your recovery code.',
  PRF_UNSUPPORTED: 'This browser cannot protect your key with a passkey. Use a password instead.',
  SPONSOR_REFUSED: 'Sponsored onboarding is not available for this account. Fund it with a little QOR from the faucet instead.',
  TX_FAILED: 'The transaction failed on chain. Open it in the explorer for the reason.',
  INVALID_INPUT: 'Invalid input.',
  METAMASK_MISSING:
    'MetaMask was not found. Install MetaMask (or enable it), then reload this page. If another wallet such as QoreX opened instead, open MetaMask once so it can answer, then try again.',
  METAMASK_LOCKED: 'MetaMask is waiting for you. Open MetaMask, unlock it and answer the pending request.',
  WRONG_NETWORK: 'QoreConnect works on QoreChain Diana testnet (chain 9800) only. Switch the dApp to Diana.',
  UNKNOWN: 'Something went wrong. Reload the page and try again.',
}

/** Every code has a user-facing message that says what happened and what to do next (P13). */
export const userMessage = (code: QoreConnectErrorCode): string => USER_MESSAGES[code]

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
  // Text first: execution-failure reasons carry no code.
  if (t.includes('spending limit exceeded') || /limit \d+\w* exceeded/.test(t)) return 'LIMIT_EXCEEDED'
  if (t.includes('unbound or revoked') || t.includes('revoked')) return 'REVOKED'
  if (t.includes('expired')) return 'EXPIRED'
  if (t.includes('allowed_evm_calls') || t.includes('not permitted')) return 'NOT_APPROVED'
  if (t.includes('authenticator sequence') || t.includes('wrong nonce') || t.includes('replay')) return 'NONCE'
  if (t.includes('abstractaccount') && t.includes('disabled')) return 'MODULE_DISABLED'
  // Codes only within the abstractaccount codespace (callers pass them only for authenticator refusals).
  if (chainCode === 5) return 'LIMIT_EXCEEDED'
  if (chainCode === 6) return 'EXPIRED'
  if (chainCode === 10) return 'NOT_APPROVED'
  if (chainCode === 11) return 'NONCE'
  return 'TX_FAILED'
}
