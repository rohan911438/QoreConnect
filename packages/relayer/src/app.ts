import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { QoreClient, type QoreNetwork } from '@qoreconnect/core'
import type { RelayerStore } from './store'
import type { SponsorService } from './sponsor'
import type { RelayService } from './relay'
import { timingSafeEqual } from 'node:crypto'

export interface RelayerDeps {
  net: QoreNetwork
  store: RelayerStore
  sponsor: SponsorService
  relay?: RelayService
  /** Bearer token for admin routes (POST /v1/tanks). Admin routes are disabled without it. */
  adminToken?: string
  version?: string
  accounts?: { relayer?: string; sponsor?: string }
  /** Resolve the caller IP. Behind a proxy, trust only the platform's header. */
  ip?: (header: (name: string) => string | undefined) => string
  corsOrigins?: string[]
}

export function createRelayerApp(d: RelayerDeps) {
  const app = new Hono()
  const client = new QoreClient(d.net)
  const ipOf = d.ip ?? ((h) => h('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown')
  app.use(
    '*',
    cors({
      origin: d.corsOrigins ?? '*',
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['content-type', 'authorization'],
    }),
  )

  app.get('/health', async (c) => {
    const [height, relayerBal, sponsorBal] = await Promise.all([
      client.getLatestHeight().catch(() => null),
      d.accounts?.relayer ? client.getBalance(d.accounts.relayer).catch(() => null) : null,
      d.accounts?.sponsor ? client.getBalance(d.accounts.sponsor).catch(() => null) : null,
    ])
    return c.json({
      ok: true,
      service: 'qoreconnect-relayer',
      version: d.version ?? '0.0.0',
      chainId: d.net.chainId,
      height,
      accounts: d.accounts ?? {},
      balances: { relayerUqor: relayerBal?.toString() ?? null, sponsorUqor: sponsorBal?.toString() ?? null },
    })
  })

  app.post('/v1/sponsor', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const out = await d.sponsor.sponsor(
      body,
      ipOf((n) => c.req.header(n)),
    )
    if (out.ok) return c.json({ funded: true, amount: out.amount, txHash: out.txHash })
    return c.json({ funded: false, error: out.error }, out.status)
  })

  app.post('/v1/relay', async (c) => {
    if (!d.relay) return c.json({ ok: false, error: 'relay disabled' }, 503)
    const body = await c.req.json().catch(() => ({}))
    const out = await d.relay.relay(
      body,
      ipOf((n) => c.req.header(n)),
    )
    return c.json(out.body, out.status as any)
  })

  app.get('/v1/relay/:txHash', (c) => {
    const r = d.store.getRelay(c.req.param('txHash'))
    if (!r) return c.json({ found: false }, 404)
    return c.json({
      found: true,
      txHash: r.tx_hash,
      success: r.success === 1,
      code: r.code,
      error: r.error,
      feeUqor: r.fee_uqor,
      tankId: r.tank_id,
      account: r.account,
      target: r.target,
      createdAt: r.created_at,
    })
  })

  /** Public: value this account moved through QoreConnect in the last 24 h (estimate for the signing preview). */
  app.get('/v1/accounts/:account/spent-today', (c) => {
    const account = c.req.param('account')
    if (!/^qor1[0-9a-z]{38,58}$/.test(account)) return c.json({ error: 'bad account' }, 400)
    return c.json({
      account,
      valueUqor: d.store.accountValueToday(account).toString(),
      windowHours: 24,
      source: 'qoreconnect-relayer',
    })
  })

  /** Public: recent relayed calls for this account (dashboard activity). */
  app.get('/v1/accounts/:account/activity', (c) => {
    const account = c.req.param('account')
    if (!/^qor1[0-9a-z]{38,58}$/.test(account)) return c.json({ error: 'bad account' }, 400)
    return c.json({ account, items: d.store.accountActivity(account, 25) })
  })

  app.get('/v1/tanks/:id', (c) => {
    const t = d.store.getTank(c.req.param('id'))
    if (!t) return c.json({ found: false }, 404)
    return c.json({
      id: t.id,
      name: t.name,
      owner: t.owner,
      balance: t.balanceUqor.toString(),
      dailySpent: d.store.tankSpentToday(t.id).toString(),
      perUserDailyCap: t.perUserDailyCapUqor.toString(),
      allowedContracts: t.allowedContracts ?? null,
      paused: t.paused,
    })
  })

  const isAdmin = (h: string | undefined) => {
    if (!d.adminToken || !h?.startsWith('Bearer ')) return false
    const a = Buffer.from(h.slice(7))
    const b = Buffer.from(d.adminToken)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  app.post('/v1/tanks', async (c) => {
    if (!isAdmin(c.req.header('authorization'))) return c.json({ error: 'unauthorized' }, 401)
    const b: any = await c.req.json().catch(() => ({}))
    if (
      typeof b.id !== 'string' ||
      !/^[a-z0-9-]{1,64}$/.test(b.id) ||
      typeof b.name !== 'string' ||
      typeof b.owner !== 'string'
    ) {
      return c.json({ error: 'id (a-z0-9-), name and owner are required' }, 400)
    }
    if (d.store.getTank(b.id)) return c.json({ error: 'tank exists' }, 409)
    const t = d.store.createTank({
      id: b.id,
      name: b.name,
      owner: b.owner,
      balanceUqor: BigInt(b.balanceUqor ?? 50_000_000),
      perUserDailyCapUqor: BigInt(b.perUserDailyCap ?? 2_000_000),
      allowedContracts: Array.isArray(b.allowedContracts) ? b.allowedContracts : undefined,
    })
    return c.json(
      { created: true, id: t.id, balance: t.balanceUqor.toString(), perUserDailyCap: t.perUserDailyCapUqor.toString() },
      201,
    )
  })

  return app
}
