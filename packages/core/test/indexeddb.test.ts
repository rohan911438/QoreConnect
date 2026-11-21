import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { IndexedDbVaultStorage, RootVault } from '../src/index'

const FAST = { N: 2 ** 10, r: 8, p: 1 }

describe('IndexedDbVaultStorage', () => {
  it('persists the encrypted record and never stores any mnemonic word sequence', async () => {
    const storage = new IndexedDbVaultStorage('qc-test')
    const vault = new RootVault(storage)
    const s = await vault.create({ kind: 'password', password: 'correct horse battery', scrypt: FAST })
    const words = (await vault.exportRecoveryCode({ kind: 'password', password: 'correct horse battery' })).split(' ')
    const blob = JSON.stringify(await storage.get('root'))
    for (let i = 0; i + 2 <= words.length; i++) expect(blob).not.toContain(`${words[i]} ${words[i + 1]}`)
    expect(await storage.list()).toEqual(['root'])
    // A new vault object over the same DB (simulates a page reload) unlocks to the same address.
    const again = await new RootVault(new IndexedDbVaultStorage('qc-test')).unlock({ kind: 'password', password: 'correct horse battery' })
    expect(again.qorAddress).toBe(s.qorAddress)
  }, 60_000)
})
