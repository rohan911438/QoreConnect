import { deriveUnifiedAccount, generateMnemonic, validateMnemonic, type UnifiedAccount } from '@qorechain/sdk'
import { QoreConnectError } from '../errors'
import { SCRYPT, aesGcmDecrypt, aesGcmEncrypt, fromB64, hkdfAesKey, randomBytes, scryptAesKey, toB64 } from './crypto'
import type { PasskeyProvider } from './passkey'
import { defaultStorage, type VaultRecord, type VaultStorage } from './storage'
import { RootSigner } from './signer'

export const DEFAULT_VAULT_ID = 'root'

export type Protection = { kind: 'passkey'; passkey: PasskeyProvider; userName?: string } | { kind: 'password'; password: string; scrypt?: { N: number; r: number; p: number } }

export interface RootInfo {
  qorAddress: string
  evmAddress: string
  pqcPublicKey: Uint8Array
}

/** Additional authenticated data: binds the ciphertext to its public addresses and version. */
const aadFor = (r: Pick<VaultRecord, 'version' | 'qorAddress' | 'evmAddress' | 'kdf'>) =>
  new TextEncoder().encode(`qoreconnect-vault|v${r.version}|${r.kdf}|${r.qorAddress}|${r.evmAddress}`)

/**
 * Derive the root account exactly as QoreX and the SDK do (P01 Q9):
 * HD path m/44'/60'/0'/0/{index}, canonical address-bound ML-DSA-87 derivation.
 */
export async function deriveRoot(mnemonic: string, index = 0): Promise<UnifiedAccount> {
  if (!validateMnemonic(mnemonic)) throw new QoreConnectError('INVALID_INPUT', { message: 'That recovery phrase is not valid.' })
  return deriveUnifiedAccount(mnemonic, index)
}

/** Generate a fresh 24-word root. Secrets stay in memory; nothing is stored. */
export async function generateRoot(): Promise<{ mnemonic: string; account: UnifiedAccount }> {
  const mnemonic = generateMnemonic(256)
  return { mnemonic, account: await deriveRoot(mnemonic) }
}

async function keyFor(record: VaultRecord, protection: Protection, prfOutput?: Uint8Array): Promise<CryptoKey> {
  const salt = fromB64(record.salt)
  if (record.kdf === 'passkey-prf') {
    if (!prfOutput) throw new QoreConnectError('VAULT_LOCKED')
    return hkdfAesKey(prfOutput, salt)
  }
  if (protection.kind !== 'password') throw new QoreConnectError('VAULT_LOCKED', { message: 'This key is protected by a password.' })
  return scryptAesKey(protection.password, salt, record.scrypt ?? SCRYPT)
}

/**
 * The root key vault. Creates, encrypts, unlocks, exports and restores the post-quantum root key.
 * The mnemonic is only ever held in memory while unlocked.
 */
export class RootVault {
  constructor(
    readonly storage: VaultStorage = defaultStorage(),
    readonly id: string = DEFAULT_VAULT_ID,
  ) {}

  async exists(): Promise<boolean> {
    return !!(await this.storage.get(this.id))
  }

  /** Public info without unlocking. */
  async info(): Promise<{ qorAddress: string; evmAddress: string; kdf: VaultRecord['kdf'] } | undefined> {
    const r = await this.storage.get(this.id)
    return r && { qorAddress: r.qorAddress, evmAddress: r.evmAddress, kdf: r.kdf }
  }

  /** Create a new root (or store a given mnemonic) under the chosen protection. Returns an unlocked signer. */
  async create(protection: Protection, mnemonic?: string): Promise<RootSigner> {
    const m = mnemonic ?? generateMnemonic(256)
    const account = await deriveRoot(m)
    const salt = randomBytes(32)
    let record: Omit<VaultRecord, 'iv' | 'ciphertext'>
    let key: CryptoKey
    if (protection.kind === 'passkey') {
      const prfSalt = randomBytes(32)
      const { credentialId, prfOutput } = await protection.passkey.create({ userName: protection.userName ?? `QoreConnect ${account.cosmos.slice(0, 12)}…`, prfSalt })
      record = { version: 1, kdf: 'passkey-prf', salt: toB64(salt), prfSalt: toB64(prfSalt), credentialId: toB64(credentialId), qorAddress: account.cosmos, evmAddress: account.evm, createdAt: Date.now() }
      key = await hkdfAesKey(prfOutput, salt)
      prfOutput.fill(0)
    } else {
      if (protection.password.length < 8) throw new QoreConnectError('INVALID_INPUT', { message: 'Use a password of at least 8 characters.' })
      const params = protection.scrypt ?? SCRYPT
      record = { version: 1, kdf: 'scrypt', salt: toB64(salt), scrypt: { N: params.N, r: params.r, p: params.p }, qorAddress: account.cosmos, evmAddress: account.evm, createdAt: Date.now() }
      key = await scryptAesKey(protection.password, salt, params)
    }
    const pt = new TextEncoder().encode(m)
    const { iv, ciphertext } = await aesGcmEncrypt(key, pt, aadFor(record))
    pt.fill(0)
    await this.storage.put(this.id, { ...record, iv: toB64(iv), ciphertext: toB64(ciphertext) })
    return new RootSigner(account, m)
  }

  /** Unlock with a passkey assertion or password. */
  async unlock(protection: Protection): Promise<RootSigner> {
    const m = await this.decrypt(protection)
    const account = await deriveRoot(m)
    return new RootSigner(account, m)
  }

  /** Decrypt and return the recovery phrase (requires a fresh unlock). Show it once. */
  async exportRecoveryCode(protection: Protection): Promise<string> {
    return this.decrypt(protection)
  }

  /** Restore from a recovery phrase on a new device, protected by a new passkey or password. */
  async restore(words: string, protection: Protection): Promise<RootSigner> {
    const normalized = words.trim().toLowerCase().split(/\s+/).join(' ')
    if (!validateMnemonic(normalized)) throw new QoreConnectError('INVALID_INPUT', { message: 'That recovery phrase is not valid.' })
    return this.create(protection, normalized)
  }

  async remove(): Promise<void> {
    await this.storage.delete(this.id)
  }

  private async decrypt(protection: Protection): Promise<string> {
    const record = await this.storage.get(this.id)
    if (!record) throw new QoreConnectError('VAULT_NOT_FOUND')
    let prfOutput: Uint8Array | undefined
    if (record.kdf === 'passkey-prf') {
      if (protection.kind !== 'passkey') throw new QoreConnectError('VAULT_LOCKED', { message: 'This key is protected by a passkey.' })
      prfOutput = await protection.passkey.evaluate({ credentialId: fromB64(record.credentialId!), prfSalt: fromB64(record.prfSalt!) })
    }
    const key = await keyFor(record, protection, prfOutput)
    prfOutput?.fill(0)
    try {
      const pt = await aesGcmDecrypt(key, fromB64(record.iv), fromB64(record.ciphertext), aadFor(record))
      const m = new TextDecoder().decode(pt)
      pt.fill(0)
      return m
    } catch {
      throw new QoreConnectError(record.kdf === 'scrypt' ? 'BAD_PASSWORD' : 'VAULT_LOCKED', { message: record.kdf === 'scrypt' ? undefined : 'Your passkey did not unlock this key.' })
    }
  }
}
