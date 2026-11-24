/** Top up the relayer account from the sponsor account when it is below a threshold. Usage: tsx scripts/fund-relayer.ts [targetQOR] */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { DIANA, QoreClient, formatQor, parseQor } from '@rohankumar4179/core'
import { ChainFundsSender, ensurePqcRegistered, operatorAccount } from '@rohankumar4179/relayer'

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true } as any)
const sponsor = await operatorAccount(process.env.SPONSOR_MNEMONIC!, Number(process.env.SPONSOR_INDEX ?? 0))
const relayer = await operatorAccount(process.env.RELAYER_MNEMONIC!, Number(process.env.RELAYER_INDEX ?? 1))
const client = new QoreClient(DIANA)
const target = parseQor(process.argv[2] ?? '20')
const bal = await client.getBalance(relayer.cosmos)
console.log('relayer', relayer.cosmos, 'balance', formatQor(bal), 'QOR')
if (bal < target) {
  const tx = await new ChainFundsSender(DIANA, sponsor).send(relayer.cosmos, target - bal)
  console.log('funded', formatQor(target - bal), 'QOR, tx', tx, 'new balance', formatQor(await client.getBalance(relayer.cosmos)))
}

const reg = await ensurePqcRegistered(DIANA, relayer)
console.log('relayer ML-DSA key', reg.txHash ? `registered now, tx ${reg.txHash}` : 'already registered')
