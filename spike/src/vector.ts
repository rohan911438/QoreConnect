import { deriveUnifiedAccount } from '@qorechain/sdk'
const M = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art'
const a = await deriveUnifiedAccount(M, 0)
console.log(JSON.stringify({ mnemonic: 'BIP-39 test vector (abandon x23 art)', qorAddress: a.cosmos, evmAddress: a.evm, pqcPublicKeyPrefix: Buffer.from(a.pqc.publicKey).toString('hex').slice(0, 64), pqcPublicKeyLength: a.pqc.publicKey.length }, null, 2))
