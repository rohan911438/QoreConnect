import { deriveUnifiedAccount, pqcSign, pqcVerify, type UnifiedAccount } from '@qorechain/sdk'
import type { EncodeObject } from '@cosmjs/proto-signing'
import type { QoreNetwork } from '../config'
import { QoreConnectError } from '../errors'
import { sendTx, type Broadcaster, type SendTxOptions, type TxResult } from '../chain/tx'
import type { FetchLike } from '../chain/http'

/** Auto-lock after this many milliseconds of holding secrets (architecture/06, T15). */
export const AUTO_LOCK_MS = 5 * 60 * 1000

/**
 * An unlocked root key. Signs hybrid (secp256k1 + ML-DSA-87) native transactions and ML-DSA-87 messages.
 * Locks itself after AUTO_LOCK_MS; after that every call throws VAULT_LOCKED.
 */
export class RootSigner {
  private account: UnifiedAccount | undefined
  private mnemonic: string | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  readonly qorAddress: string
  readonly evmAddress: string
  readonly pqcPublicKey: Uint8Array

  constructor(account: UnifiedAccount, mnemonic: string, autoLockMs = AUTO_LOCK_MS) {
    this.account = account
    this.mnemonic = mnemonic
    this.qorAddress = account.cosmos
    this.evmAddress = account.evm
    this.pqcPublicKey = account.pqc.publicKey
    if (autoLockMs > 0) {
      this.timer = setTimeout(() => this.lock(), autoLockMs)
      ;(this.timer as any)?.unref?.()
    }
  }

  get locked(): boolean {
    return !this.account
  }

  /** The unified account (secrets included). Internal use only. */
  unsafeAccount(): UnifiedAccount {
    if (!this.account) throw new QoreConnectError('VAULT_LOCKED')
    return this.account
  }

  /** Derive a sub-account from the same seed (agent accounts use index >= 1). */
  async deriveSubAccount(index: number): Promise<UnifiedAccount> {
    if (!this.mnemonic) throw new QoreConnectError('VAULT_LOCKED')
    if (index < 1) throw new QoreConnectError('INVALID_INPUT', { message: 'Sub-account index must be >= 1' })
    return deriveUnifiedAccount(this.mnemonic, index)
  }

  /** Sign and broadcast native messages with the root (hybrid unless the bootstrap registration). */
  signAndBroadcast(net: QoreNetwork, messages: EncodeObject[], broadcaster: Broadcaster, opts?: SendTxOptions, fetchImpl?: FetchLike): Promise<TxResult> {
    return sendTx(net, this.unsafeAccount(), messages, broadcaster, opts, fetchImpl)
  }

  /** ML-DSA-87 signature (4,627 bytes) over `message`, verifiable against the root's registered key. */
  signMessage(message: Uint8Array): Uint8Array {
    return pqcSign(this.unsafeAccount().pqc.secretKey, message)
  }

  verifyMessage(message: Uint8Array, signature: Uint8Array): boolean {
    return pqcVerify(this.pqcPublicKey, message, signature)
  }

  /** Drop secrets from memory (best effort: JS strings cannot be zeroed). */
  lock(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.account) {
      this.account.pqc.secretKey.fill(0)
      this.account = undefined
    }
    this.mnemonic = undefined
  }
}
