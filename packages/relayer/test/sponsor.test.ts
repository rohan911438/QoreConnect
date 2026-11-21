import { describe, expect, it } from 'vitest'
import { authenticatorLinkMessageBytes } from '@qorechain/sdk'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { DIANA, sponsorMessage } from '@qoreconnect/core'
import { RelayerStore, SponsorService, createRelayerApp, type FundsSender } from '../src/index'

const ROOT_A = 'qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s'
const ROOT_B = 'qor1wpae9a38v7vlj2xvun2cw0669w4ls568zar4w8'
const ROOT_C = 'qor17fuv7k0c9mw0suwkxreganyq2me9c8xmdl9s7p'

class FakeSender implements FundsSender {
  sent: { to: string; amount: bigint }[] = []
  fail = false
  async send(to: string, amount: bigint) {
    if (this.fail) throw new Error('boom')
    this.sent.push({ to, amount })
    return 'TX' + this.sent.length
  }
}

async function signed(root: string, pk = generatePrivateKey()) {
  const mm = privateKeyToAccount(pk)
  const signature = await mm.signMessage({
    message: sponsorMessage({ chainId: DIANA.chainId, rootAddress: root, metamaskAddress: mm.address }),
  })
  return { rootAddress: root, metamaskAddress: mm.address, signature, pk }
}

function setup(cfg?: Partial<{ amountUqor: bigint; perIpPerDay: number; globalDailyBudgetUqor: bigint }>) {
  const store = new RelayerStore(':memory:')
  const sender = new FakeSender()
  const svc = new SponsorService(DIANA, store, sender, {
    amountUqor: 240_000n,
    perIpPerDay: 3,
    globalDailyBudgetUqor: 50_000_000n,
    ...cfg,
  })
  return { store, sender, svc }
}

async function linkProof(root: string, signFor = root) {
  const mm = privateKeyToAccount(generatePrivateKey())
  const key = Uint8Array.from(Buffer.from(mm.address.slice(2).toLowerCase(), 'hex'))
  const signature = await mm.signMessage({
    message: { raw: authenticatorLinkMessageBytes(DIANA.chainId, signFor, 'secp256k1', key) },
  })
  return { rootAddress: root, metamaskAddress: mm.address, signature, proof: 'link' }
}

describe('SponsorService', () => {
  it('accepts the authenticator-link possession proof (single-signature onboarding)', async () => {
    const { svc, sender } = setup()
    expect(await svc.sponsor(await linkProof(ROOT_A), '1.1.1.1')).toMatchObject({ ok: true })
    expect(sender.sent).toHaveLength(1)
  })

  it('rejects a link proof made for a different account', async () => {
    const { svc, sender } = setup()
    expect(await svc.sponsor(await linkProof(ROOT_A, ROOT_B), '1.1.1.1')).toMatchObject({ ok: false, status: 403 })
    expect(sender.sent).toHaveLength(0)
  })

  it('funds a valid request once', async () => {
    const { svc, sender } = setup()
    const r = await svc.sponsor(await signed(ROOT_A), '1.1.1.1')
    expect(r).toMatchObject({ ok: true, txHash: 'TX1', amount: '240000' })
    expect(sender.sent).toEqual([{ to: ROOT_A, amount: 240_000n }])
  })

  it('G3: refuses a second sponsorship for the same MetaMask address', async () => {
    const { svc, sender } = setup()
    const first = await signed(ROOT_A)
    expect((await svc.sponsor(first, '1.1.1.1')).ok).toBe(true)
    const second = await signed(ROOT_B, first.pk)
    expect(await svc.sponsor(second, '2.2.2.2')).toMatchObject({ ok: false, status: 409 })
    expect(sender.sent).toHaveLength(1)
  })

  it('refuses a second sponsorship for the same root from another MetaMask', async () => {
    const { svc } = setup()
    expect((await svc.sponsor(await signed(ROOT_A), '1.1.1.1')).ok).toBe(true)
    expect(await svc.sponsor(await signed(ROOT_A), '1.1.1.1')).toMatchObject({ ok: false, status: 409 })
  })

  it('rejects a signature for a different root (no sponsoring random addresses)', async () => {
    const { svc } = setup()
    const s = await signed(ROOT_A)
    expect(await svc.sponsor({ ...s, rootAddress: ROOT_B }, '1.1.1.1')).toMatchObject({ ok: false, status: 403 })
  })

  it('rejects malformed input', async () => {
    const { svc } = setup()
    expect(await svc.sponsor({ rootAddress: 'cosmos1xyz' }, 'x')).toMatchObject({ status: 400 })
    expect(await svc.sponsor({ rootAddress: ROOT_A, metamaskAddress: '0x12' }, 'x')).toMatchObject({ status: 400 })
  })

  it('limits per IP per day', async () => {
    const { svc } = setup({ perIpPerDay: 2 })
    expect((await svc.sponsor(await signed(ROOT_A), '9.9.9.9')).ok).toBe(true)
    expect((await svc.sponsor(await signed(ROOT_B), '9.9.9.9')).ok).toBe(true)
    expect(await svc.sponsor(await signed(ROOT_C), '9.9.9.9')).toMatchObject({ ok: false, status: 429 })
  })

  it('enforces the global daily budget', async () => {
    const { svc } = setup({ globalDailyBudgetUqor: 300_000n })
    expect((await svc.sponsor(await signed(ROOT_A), '1.1.1.1')).ok).toBe(true)
    expect(await svc.sponsor(await signed(ROOT_B), '2.2.2.2')).toMatchObject({ ok: false, status: 503 })
  })

  it('releases the slot when the transfer fails', async () => {
    const { svc, sender } = setup()
    sender.fail = true
    const s = await signed(ROOT_A)
    expect(await svc.sponsor(s, '1.1.1.1')).toMatchObject({ ok: false, status: 502 })
    sender.fail = false
    expect((await svc.sponsor(s, '1.1.1.1')).ok).toBe(true)
  })
})

describe('relayer app', () => {
  it('POST /v1/sponsor returns funded, then 409', async () => {
    const { store, svc } = setup()
    const app = createRelayerApp({ net: DIANA, store, sponsor: svc })
    const body = JSON.stringify(await signed(ROOT_A))
    const r1 = await app.request('/v1/sponsor', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    })
    expect(r1.status).toBe(200)
    expect(await r1.json()).toMatchObject({ funded: true })
    const r2 = await app.request('/v1/sponsor', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    })
    expect(r2.status).toBe(409)
  })
})
