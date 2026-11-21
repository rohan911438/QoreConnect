import { describe, expect, it } from 'vitest'
import { deriveRoot } from '../src/index'
import vector from './fixtures/derivation-vector.json'

// Public BIP-39 test mnemonic (never funded). Vector generated with @qorechain/sdk@0.14.0 deriveUnifiedAccount,
// the same derivation the P01 spike used on Diana (spike/src/common.ts).
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'

describe('derivation test vector (G2)', () => {
  it('matches the spike derivation for the same mnemonic', async () => {
    const a = await deriveRoot(MNEMONIC, 0)
    expect(a.cosmos).toBe(vector.qorAddress)
    expect(a.evm.toLowerCase()).toBe(vector.evmAddress.toLowerCase())
    expect(Buffer.from(a.pqc.publicKey).toString('hex').slice(0, 64)).toBe(vector.pqcPublicKeyPrefix)
    expect(a.pqc.publicKey.length).toBe(vector.pqcPublicKeyLength)
  }, 60_000)
})
