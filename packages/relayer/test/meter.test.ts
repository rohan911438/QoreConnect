import { describe, expect, it } from 'vitest'
import { DIANA, type AuthenticatorInfo } from '@rohankumar4179/core'
import { MeterIndexer, Q3_2027, RelayerStore, RpcEvmSampler, SponsorService, computeMeter, createRelayerApp, type MeterChain } from '../src/index'

const A = 'qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s'
const B = 'qor1kkuqqp0rqpla3qam239j4p8fzh525nv0e0ez5n'
const C = 'qor1q9scherh67uk63enc8l0udkysqxv4gpv4szu7j'
const NOW = Date.UTC(2026, 10, 21, 12)
const key = (p: Partial<AuthenticatorInfo>): AuthenticatorInfo => ({
  scheme: 'secp256k1',
  pubkeyHex: '02' + 'ab'.repeat(32),
  permissions: ['evm'],
  expiryUnix: 0,
  label: '',
  createdAtUnix: 0,
  revoked: false,
  hasSpendRule: true,
  ...p,
})

/** Fixture: A and B sponsored (B's key never registered), C an agent sub-account seen only through relays. */
function fixture() {
  const store = new RelayerStore(':memory:')
  for (const [mm, root, tx] of [
    ['0x01', A, 'AAA1'],
    ['0x02', B, 'BBB1'],
  ] as const) {
    const id = store.reserveSponsorship({ metamask: mm, root, ip: '1.1.1.1', amountUqor: '100000' })!
    store.completeSponsorship(id, tx)
  }
  store.reserveSponsorship({ metamask: '0x03', root: 'qor1pending', ip: '1.1.1.1', amountUqor: '100000' }) // pending: never counted
  store.createTank({ id: 'tipjar', name: 'Quantum Tip Jar', owner: 'x', balanceUqor: 10_000_000n, perUserDailyCapUqor: 1_000_000n })
  store.createTank({ id: 'unused', name: 'Unused', owner: 'x', balanceUqor: 10_000_000n, perUserDailyCapUqor: 1_000_000n })
  const relay = (p: Omit<Parameters<RelayerStore['recordRelay']>[0], 'signer'>) => store.recordRelay({ target: '0xt', ...p, signer: '0xk' }, NOW - 1000)
  relay({ tankId: 'tipjar', account: A, txHash: 'T1', success: true, code: 0, valueUqor: 100_000n })
  relay({ tankId: 'tipjar', account: A, txHash: 'T2', success: true, code: 0, valueUqor: 250_000n })
  relay({ tankId: 'tipjar', account: C, txHash: 'T3', success: true, code: 0, valueUqor: 150_000n })
  relay({ tankId: 'tipjar', account: C, txHash: 'T4', success: false, code: 5 })
  relay({ tankId: 'tipjar', account: A, txHash: 'T5', success: false, code: 10 })
  relay({ tankId: 'tipjar', account: A, txHash: 'T6', success: false, code: 10 })
  relay({ tankId: 'unused', account: A, success: false, error: 'NOT_APPROVED: pre-check' }) // pre-rejected, no tx
  relay({ tankId: 'unused', account: A, success: false, error: 'LIMIT_EXCEEDED: pre-check' })
  const chain: MeterChain = {
    getPqcKey: async (a) => ({ registered: a !== B }),
    getAuthenticators: async (a) =>
      a === A
        ? [key({ label: 'metamask' }), key({ label: 'old', revoked: true }), key({ label: 'expired', expiryUnix: NOW / 1000 - 60 })]
        : a === C
          ? [key({ label: 'agent:tipper', expiryUnix: NOW / 1000 + 10 * 365 * 86_400 })]
          : [],
  }
  return { store, chain }
}

describe('Migration Meter: metric computation from fixtures', () => {
  it('counts each metric exactly as docs/migration-meter.md defines it', async () => {
    const { store, chain } = fixture()
    const sampler = {
      sample: async () => ({
        fromBlock: 101,
        toBlock: 300,
        senders: [
          { address: '0x1', account: A, pqc: true },
          { address: '0x2', account: B, pqc: false },
          { address: '0x3', account: C, pqc: false },
          { address: '0x4', account: 'qor1x', pqc: true },
        ],
      }),
    }
    const s = await computeMeter({ net: DIANA, store, chain, sampler }, { now: NOW, publicUrl: 'https://relayer.example/' })
    const m = s.metrics

    expect(m.onboarded.value).toBe(1) // A only: B unregistered, pending never funded
    expect(s.evidence.onboarded.map((r) => [r.account, r.registered, r.sponsorTx])).toEqual([
      [A, true, 'AAA1'],
      [B, false, 'BBB1'],
    ])
    expect(m.classicalKeys).toMatchObject({ value: 2, session: 1, agent: 1 }) // revoked and expired keys excluded
    expect(m.relayed).toMatchObject({ value: 3, valueUqor: '500000', chainRefusals: 3, preRejected: 2, byCode: { '5 LIMIT_EXCEEDED': 1, '10 NOT_APPROVED': 2 } })
    expect(m.pqcSenders).toMatchObject({ value: 50, withKey: 2, sampleSize: 4, fromBlock: 101, toBlock: 300 })
    expect(m.pqcSenders!.note).toContain('sample of 4 senders')
    expect(m.dapps.value).toBe(1) // "unused" has only pre-rejected calls
    expect(s.evidence.dapps).toEqual([{ tankId: 'tipjar', name: 'Quantum Tip Jar', executions: 3 }])
    expect(m.countdown.value).toBe(Math.ceil((Q3_2027 - NOW) / 86_400_000))
    expect(m.countdown.target).toBe('2027-07-01')
    expect(m.onboarded.source).toBe('https://relayer.example/v1/meter/evidence/onboarded')
    expect(s.evidence.relays[0]!.explorer).toBeNull() // newest row is a pre-rejection, no tx
    expect(s.evidence.relays.find((r) => r.txHash === 'T1')!.explorer).toBe('https://explore.qore.network/tx/T1')
    expect(s.network.testnet).toBe(true)
  })

  it('records chain errors per metric instead of failing the snapshot, and works without a sampler', async () => {
    const { store } = fixture()
    const s = await computeMeter({ net: DIANA, store, chain: { getPqcKey: async () => Promise.reject(new Error('rest down')), getAuthenticators: async () => [] } }, { now: NOW })
    expect(s.metrics.onboarded.value).toBe(0)
    expect(s.metrics.pqcSenders).toBeNull()
    expect(s.errors[0]).toContain('rest down')
    expect(s.metrics.relayed.value).toBe(3)
  })

  it('stores a series and serves headline, series and evidence over HTTP', async () => {
    const { store, chain } = fixture()
    const app = createRelayerApp({ net: DIANA, store, sponsor: {} as SponsorService })
    expect((await app.request('/v1/meter')).status).toBe(503)
    const idx = new MeterIndexer({ net: DIANA, store, chain }, { publicUrl: 'https://r' })
    await idx.runOnce()
    await new Promise((r) => setTimeout(r, 5))
    await idx.runOnce()
    const head: any = await (await app.request('/v1/meter')).json()
    expect(head.metrics.relayed.value).toBe(3)
    expect(head.evidence).toBeUndefined()
    const series: any = await (await app.request('/v1/meter/series')).json()
    expect(series.points).toHaveLength(2)
    expect(series.points[0]).toMatchObject({ onboarded: 1, classicalKeys: 2, relayed: 3, chainRefusals: 3, dapps: 1, pqcSendersPct: null })
    const ev: any = await (await app.request('/v1/meter/evidence/keys')).json()
    expect(ev.rows.map((r: any) => r.label).sort()).toEqual(['agent:tipper', 'metamask'])
    expect((await app.request('/v1/meter/evidence/secrets')).status).toBe(404)
  })
})

describe('RpcEvmSampler', () => {
  it('collects distinct senders from recent blocks and checks pqcKeyStatus', async () => {
    const calls: string[] = []
    const word = (b: boolean) => '0x' + (b ? '1' : '0').padStart(64, '0') + '1'.padStart(64, '0') + '60'.padStart(64, '0') + '0'.padStart(64, '0')
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const { method, params } = JSON.parse(String(init.body))
      calls.push(method)
      const result =
        method === 'eth_blockNumber'
          ? '0xa'
          : method === 'eth_getBlockByNumber'
            ? { transactions: Number(params[0]) % 2 ? [{ from: '0x707B92f6276799f928CCe4D5873f5A2babF85347' }] : [{ from: '0x36003c3cea4a8e38cff894cce2c1d1be94e23baa' }, { from: '0x707b92f6276799f928cce4d5873f5a2babf85347' }] }
            : word(params[0].data.toLowerCase().includes('707b92f6276799f928cce4d5873f5a2babf85347'))
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }))
    }) as any
    const s = await new RpcEvmSampler('http://rpc', fakeFetch, 3).sample(5, 50)
    expect(s).toMatchObject({ fromBlock: 6, toBlock: 10 })
    expect(s.senders).toHaveLength(2)
    expect(s.senders.find((x) => x.address.startsWith('0x707b'))!.pqc).toBe(true)
    expect(s.senders.find((x) => x.address.startsWith('0x3600'))!.pqc).toBe(false)
    expect(s.senders[0]!.account).toMatch(/^qor1/)
    expect(calls.filter((c) => c === 'eth_getBlockByNumber')).toHaveLength(5)
  })
})
