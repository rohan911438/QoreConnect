/** Create the demo-dapp gas tank (idempotent). Usage: pnpm --filter @qoreconnect/relayer-app seed [allowedContract...] */
import { config } from 'dotenv'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { RelayerStore } from '@qoreconnect/relayer'

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true } as any)
const dbPath = resolve(process.env.RELAYER_DB ?? './data/relayer.db')
mkdirSync(dirname(dbPath), { recursive: true })
const store = new RelayerStore(dbPath)
const id = process.env.TANK_ID ?? 'demo-dapp'
const existing = store.getTank(id)
if (existing) console.log('tank exists', { ...existing, balanceUqor: String(existing.balanceUqor), perUserDailyCapUqor: String(existing.perUserDailyCapUqor) })
else {
  const allowed = process.argv.slice(2).filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a))
  const t = store.createTank({ id, name: 'Quantum Tip Jar (demo)', owner: 'qoreconnect', balanceUqor: 50_000_000n, perUserDailyCapUqor: 2_000_000n, allowedContracts: allowed.length ? allowed : undefined })
  console.log('created tank', { id: t.id, balance: String(t.balanceUqor), perUserDailyCap: String(t.perUserDailyCapUqor), allowedContracts: t.allowedContracts ?? 'any' })
}
store.close()
