import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { QoreClient, type QoreNetwork } from '@qoreconnect/core'
import type { RelayerStore } from './store'
import type { SponsorService } from './sponsor'

export interface RelayerDeps {
  net: QoreNetwork
  store: RelayerStore
  sponsor: SponsorService
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
  app.use('*', cors({ origin: d.corsOrigins ?? '*', allowMethods: ['GET', 'POST'], allowHeaders: ['content-type', 'authorization'] }))

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
    const out = await d.sponsor.sponsor(body, ipOf((n) => c.req.header(n)))
    if (out.ok) return c.json({ funded: true, amount: out.amount, txHash: out.txHash })
    return c.json({ funded: false, error: out.error }, out.status)
  })

  return app
}
