import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { QoreClient, type QoreNetwork } from '@qoreconnect/core'
import type { RelayerStore } from './store'
import type { SponsorService } from './sponsor'
import type { RelayService } from './relay'
import { timingSafeEqual } from 'node:crypto'
import { meterHeadline, meterPoint, type MeterIndexer } from './meter'
import { DoctorInputError, runDoctor } from './doctor'
import { runExposure, type ExposureChain } from './exposure'

export interface RelayerDeps {
  net: QoreNetwork
  store: RelayerStore
  sponsor: SponsorService
  relay?: RelayService
  /** Bearer token for admin routes (POST /v1/tanks). Admin routes are disabled without it. */
  adminToken?: string
  version?: string
  accounts?: { relayer?: string; sponsor?: string }
  /** Resolve the caller IP (overrides trustProxyHops). Behind a proxy, trust only the platform's header. */
  ip?: (header: (name: string) => string | undefined) => string
  /**
   * Number of trusted reverse proxies in front of the relayer. 0 (default): X-Forwarded-For is ignored and the socket
   * address is used, so a client cannot pick its own rate-limit bucket. N > 0: the N-th entry from the RIGHT of
   * X-Forwarded-For is used (the address the outermost trusted proxy saw); entries a client added on the left are ignored.
   */
  trustProxyHops?: number
  corsOrigins?: string[]
  /** Migration Meter indexer (enables POST /v1/meter/refresh). */
  meter?: MeterIndexer
  /** /health reports an alert when the relayer or sponsor balance is below this (default 2 QOR). */
  lowBalanceUqor?: bigint
}

export const MAX_BODY_BYTES = 160 * 1024

export function createRelayerApp(d: RelayerDeps) {
  const app = new Hono()
  const client = new QoreClient(d.net)
  const hops = d.trustProxyHops ?? 0
  const clientIp = (c: Context): string => {
    const h = (n: string) => c.req.header(n)
    if (d.ip) return d.ip(h)
    if (hops > 0) {
      const xff = (h('x-forwarded-for') ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      if (xff.length >= hops) return xff[xff.length - hops]!
    }
    return (c.env as any)?.incoming?.socket?.remoteAddress ?? 'unknown'
  }
  app.use(
    '*',
    cors({
      origin: d.corsOrigins ?? '*',
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['content-type', 'authorization'],
    }),
  )
  // Input size limit: the largest valid request is a relay with 64 KiB calldata (~130 KB as hex JSON).
  app.use(
    '/v1/*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: `request body over ${MAX_BODY_BYTES} bytes` }, 413),
    }),
  )

  app.get('/health', async (c) => {
    const [height, relayerBal, sponsorBal] = await Promise.all([
      client.getLatestHeight().catch(() => null),
      d.accounts?.relayer ? client.getBalance(d.accounts.relayer).catch(() => null) : null,
      d.accounts?.sponsor ? client.getBalance(d.accounts.sponsor).catch(() => null) : null,
    ])
    const low = d.lowBalanceUqor ?? 2_000_000n
    const alerts = [
      height === null && 'chain unreachable',
      relayerBal !== null && relayerBal < low && `relayer balance low (${relayerBal} uqor < ${low})`,
      sponsorBal !== null && sponsorBal < low && `sponsor balance low (${sponsorBal} uqor < ${low})`,
    ].filter(Boolean) as string[]
    // 200 while the process is alive (liveness); `status` and `alerts` are for monitoring.
    return c.json({
      ok: true,
      status: alerts.length ? 'degraded' : 'healthy',
      alerts,
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
    const out = await d.sponsor.sponsor(body, clientIp(c))
    if (out.ok) return c.json({ funded: true, amount: out.amount, txHash: out.txHash })
    return c.json({ funded: false, error: out.error }, out.status)
  })

  app.post('/v1/relay', async (c) => {
    if (!d.relay) return c.json({ ok: false, error: 'relay disabled' }, 503)
    const body = await c.req.json().catch(() => ({}))
    const out = await d.relay.relay(body, clientIp(c))
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

  // ---- Migration Meter (P12, docs/migration-meter.md) ----
  const EVIDENCE = new Set(['onboarded', 'keys', 'relays', 'senders', 'dapps'])
  app.get('/v1/meter', (c) => {
    const s = d.store.latestMeterSnapshot()
    if (!s) return c.json({ error: 'no snapshot yet', hint: 'the indexer runs every few minutes' }, 503)
    c.header('cache-control', 'public, max-age=60')
    return c.json(JSON.parse(s))
  })
  app.get('/v1/meter/series', (c) => {
    c.header('cache-control', 'public, max-age=60')
    return c.json({
      points: d.store.meterSnapshots(2000).map((s) => meterPoint({ ...JSON.parse(s), evidence: undefined })),
    })
  })
  app.get('/v1/meter/evidence/:metric', (c) => {
    const m = c.req.param('metric')
    if (!EVIDENCE.has(m)) return c.json({ error: `unknown metric; one of ${[...EVIDENCE].join(', ')}` }, 404)
    const e = d.store.latestMeterEvidence()
    if (!e) return c.json({ error: 'no snapshot yet' }, 503)
    c.header('cache-control', 'public, max-age=60')
    return c.json({ metric: m, snapshotTs: e.ts, definition: `docs/migration-meter.md`, rows: JSON.parse(e.data)[m] })
  })
  /** Admin: compute a snapshot now. */
  app.post('/v1/meter/refresh', async (c) => {
    if (!isAdmin(c.req.header('authorization'))) return c.json({ error: 'unauthorized' }, 401)
    if (!d.meter) return c.json({ error: 'meter disabled' }, 404)
    return c.json(meterHeadline(await d.meter.runOnce()))
  })

  // ---- Doctor (Flow G) ----
  app.get('/v1/doctor/:address', async (c) => {
    if (!d.store.hit(`doctor:${clientIp(c)}`, 30, 60_000)) return c.json({ error: 'slow down' }, 429)
    try {
      const report = await runDoctor(
        client,
        {
          address: c.req.param('address'),
          target: c.req.query('target'),
          selector: c.req.query('selector'),
          tankId: c.req.query('tank'),
          signer: c.req.query('signer'),
        },
        { getTank: (id) => d.store.getTank(id) },
      )
      return c.json(report)
    } catch (e) {
      if (e instanceof DoctorInputError) return c.json({ error: e.message }, 400)
      return c.json({ error: `chain query failed: ${(e as Error).message}` }, 502)
    }
  })

  // ---- Q-Day exposure report ----
  const exposureChain: ExposureChain = {
    getBalance: (a) => client.getBalance(a),
    getPqcKey: (a) => client.getPqcKey(a),
    getPqcParams: () => client.getPqcParams(),
    getAccountPubkey: (a) => client.getAccountPubkey(a),
    getAuthenticators: (a) => client.getAuthenticators(a),
    getSpendingRules: (a) => client.getSpendingRules(a),
    getEvmNonce: async (evm) => {
      const r = await fetch(d.net.evmRpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [evm, 'latest'] }),
        signal: AbortSignal.timeout(15_000),
      })
      const j: any = await r.json()
      return Number.parseInt(j.result ?? '0x0', 16) || 0
    },
  }
  app.get('/v1/exposure/:address', async (c) => {
    if (!d.store.hit(`exposure:${clientIp(c)}`, 30, 60_000)) return c.json({ error: 'slow down' }, 429)
    try {
      return c.json(await runExposure(exposureChain, { address: c.req.param('address') }))
    } catch (e) {
      if (e instanceof DoctorInputError) return c.json({ error: e.message }, 400)
      return c.json({ error: `chain query failed: ${(e as Error).message}` }, 502)
    }
  })

  return app
}
