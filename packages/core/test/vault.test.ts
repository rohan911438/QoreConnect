import { describe, expect, it } from 'vitest'
import { deriveUnifiedAccount } from '@qorechain/sdk'
import { MemoryVaultStorage, RootVault, QoreConnectError, type PasskeyProvider } from '../src/index'

// Fast scrypt for tests only; production uses N = 2^17.
const FAST = { N: 2 ** 10, r: 8, p: 1 }
const pw = (password: string) => ({ kind: 'password' as const, password, scrypt: FAST })

/** Deterministic fake passkey: PRF = SHA-256(credentialId || salt). */
class FakePasskey implements PasskeyProvider {
  private ids = new Set<string>()
  async isSupported() {
    return true
  }
  private async prf(id: Uint8Array, salt: Uint8Array) {
    const d = new Uint8Array(id.length + salt.length)
    d.set(id)
    d.set(salt, id.length)
    return new Uint8Array(await crypto.subtle.digest('SHA-256', d))
  }
  async create({ prfSalt }: { prfSalt: Uint8Array }) {
    const credentialId = crypto.getRandomValues(new Uint8Array(16))
    this.ids.add(credentialId.join(','))
    return { credentialId, prfOutput: await this.prf(credentialId, prfSalt) }
  }
  async evaluate({ credentialId, prfSalt }: { credentialId: Uint8Array; prfSalt: Uint8Array }) {
    if (!this.ids.has(credentialId.join(','))) throw new QoreConnectError('USER_REJECTED')
    return this.prf(credentialId, prfSalt)
  }
}

describe('RootVault', () => {
  it('creates with a password, stores no plaintext, and unlocks to the same address', async () => {
    const storage = new MemoryVaultStorage()
    const vault = new RootVault(storage)
    const s1 = await vault.create(pw('correct horse battery'))
    const rec = storage.records.get('root')!
    const words = (await vault.exportRecoveryCode(pw('correct horse battery'))).split(' ')
    expect(words).toHaveLength(24)
    expect(JSON.stringify(rec)).not.toContain(words.slice(0, 3).join(' '))
    const s2 = await vault.unlock(pw('correct horse battery'))
    expect(s2.qorAddress).toBe(s1.qorAddress)
    expect(s2.evmAddress).toBe(s1.evmAddress)
    expect(s1.qorAddress.startsWith('qor1')).toBe(true)
  }, 60_000)

  it('rejects a wrong password', async () => {
    const vault = new RootVault(new MemoryVaultStorage())
    await vault.create(pw('correct horse battery'))
    await expect(vault.unlock(pw('wrong password!'))).rejects.toMatchObject({ code: 'BAD_PASSWORD' })
  }, 60_000)

  it('detects tampering of bound public data (AAD)', async () => {
    const storage = new MemoryVaultStorage()
    const vault = new RootVault(storage)
    await vault.create(pw('correct horse battery'))
    storage.records.get('root')!.evmAddress = '0x0000000000000000000000000000000000000001'
    await expect(vault.unlock(pw('correct horse battery'))).rejects.toMatchObject({ code: 'BAD_PASSWORD' })
  }, 60_000)

  it('derives the same account as the SDK (QoreX compatible)', async () => {
    const vault = new RootVault(new MemoryVaultStorage())
    const s = await vault.create(pw('correct horse battery'))
    const m = await vault.exportRecoveryCode(pw('correct horse battery'))
    const ref = await deriveUnifiedAccount(m, 0)
    expect(s.qorAddress).toBe(ref.cosmos)
    expect(Buffer.from(s.pqcPublicKey).toString('hex')).toBe(Buffer.from(ref.pqc.publicKey).toString('hex'))
  }, 60_000)

  it('passkey round trip, and restore on a new device', async () => {
    const pk = new FakePasskey()
    const vault = new RootVault(new MemoryVaultStorage())
    const s1 = await vault.create({ kind: 'passkey', passkey: pk })
    const s2 = await vault.unlock({ kind: 'passkey', passkey: pk })
    expect(s2.qorAddress).toBe(s1.qorAddress)
    const words = await vault.exportRecoveryCode({ kind: 'passkey', passkey: pk })
    const other = new RootVault(new MemoryVaultStorage())
    const s3 = await other.restore('  ' + words.toUpperCase() + ' ', pw('new device pass'))
    expect(s3.qorAddress).toBe(s1.qorAddress)
    await expect(other.unlock({ kind: 'passkey', passkey: new FakePasskey() })).rejects.toMatchObject({ code: 'VAULT_LOCKED' })
  }, 60_000)

  it('signs ML-DSA-87 messages and locks', async () => {
    const vault = new RootVault(new MemoryVaultStorage())
    const s = await vault.create(pw('correct horse battery'))
    const msg = new TextEncoder().encode('instruction')
    const sig = s.signMessage(msg)
    expect(sig.length).toBe(4627)
    expect(s.verifyMessage(msg, sig)).toBe(true)
    expect(s.verifyMessage(new TextEncoder().encode('other'), sig)).toBe(false)
    const sub = await s.deriveSubAccount(1)
    expect(sub.cosmos).not.toBe(s.qorAddress)
    s.lock()
    expect(s.locked).toBe(true)
    expect(() => s.signMessage(msg)).toThrow(QoreConnectError)
  }, 60_000)

  it('rejects invalid recovery phrases and short passwords', async () => {
    const vault = new RootVault(new MemoryVaultStorage())
    await expect(vault.restore('not a real phrase', pw('correct horse battery'))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(vault.create(pw('short'))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  }, 60_000)
})
