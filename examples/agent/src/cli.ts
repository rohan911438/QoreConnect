/**
 * QoreConnect example agent.
 *   pnpm agent address                    print this agent's address (key generated into .env on first run)
 *   pnpm agent proof <qor1 sub-account> <qor1 root>   print the link proof (pins the owner root)
 *   pnpm agent run <instruction.json> [page.html ...]   verify the root-signed instruction and execute it
 *   pnpm start                            HTTP server (GET /address, POST /link-proof, POST /run)
 * Env (examples/agent/.env): AGENT_PRIVATE_KEY, RELAYER_URL, GAS_TANK_ID, ANTHROPIC_API_KEY (optional), AGENT_MODEL,
 * AGENT_PORT, AGENT_RUNS_PER_HOUR, AGENT_OWNER_ROOT and AGENT_ACCOUNTS (written when the owner links it). Testnet only.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { config as dotenv } from 'dotenv'
import { generatePrivateKey } from 'viem/accounts'
import type { Hex } from 'viem'
import { DIANA, type SignedInstruction } from '@qoreconnect/core'
import { Agent } from './agent'
import { ClaudePlanner, RulePlanner, type UntrustedDoc } from './planner'

const ENV = resolve(import.meta.dirname, '../.env')
dotenv({ path: ENV, quiet: true } as any)

function privateKey(): Hex {
  let pk = process.env.AGENT_PRIVATE_KEY as Hex | undefined
  if (!pk) {
    pk = generatePrivateKey()
    appendFileSync(ENV, `${existsSync(ENV) ? '\n' : ''}AGENT_PRIVATE_KEY=${pk}\n`)
    console.error(`[agent] generated a new key in ${ENV} (git-ignored)`)
  }
  return pk
}

/** Write AGENT_OWNER_ROOT / AGENT_ACCOUNTS into examples/agent/.env (git-ignored), replacing earlier values. */
function persistOwner(o: { root: string; accounts: string[] }) {
  const lines = (existsSync(ENV) ? readFileSync(ENV, 'utf8') : '').split(/\r?\n/).filter((l) => l && !/^AGENT_(OWNER_ROOT|ACCOUNTS)=/.test(l))
  lines.push(`AGENT_OWNER_ROOT=${o.root}`, `AGENT_ACCOUNTS=${o.accounts.join(',')}`)
  writeFileSync(ENV, lines.join('\n') + '\n')
  console.error(`[agent] owner pinned: ${o.root} (${o.accounts.length} account${o.accounts.length === 1 ? '' : 's'})`)
}

function makeAgent() {
  const hasClaude = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  const planner = hasClaude ? new ClaudePlanner({ model: process.env.AGENT_MODEL ?? 'claude-opus-5-5' }) : new RulePlanner()
  if (!hasClaude) console.error('[agent] no Anthropic credentials: using the deterministic rule planner')
  return new Agent({
    net: DIANA,
    privateKey: privateKey(),
    relayerUrl: process.env.RELAYER_URL ?? 'http://localhost:8787',
    tankId: process.env.GAS_TANK_ID ?? 'demo-dapp',
    planner,
    runsPerHour: Number(process.env.AGENT_RUNS_PER_HOUR ?? 10),
    owner: process.env.AGENT_OWNER_ROOT ? { root: process.env.AGENT_OWNER_ROOT, accounts: (process.env.AGENT_ACCOUNTS ?? '').split(',').filter(Boolean) } : undefined,
    onPin: persistOwner,
  })
}

const readDoc = (p: string): UntrustedDoc => ({ source: p, text: readFileSync(p, 'utf8').slice(0, 20_000) })

const [cmd, ...args] = process.argv.slice(2)
const agent = makeAgent()

if (cmd === 'address') {
  console.log(agent.address)
} else if (cmd === 'proof') {
  if (!args[0]?.startsWith('qor1') || !args[1]?.startsWith('qor1')) throw new Error('usage: proof <qor1 sub-account> <qor1 owner root>')
  const p = await agent.linkProof(args[0], args[1])
  console.log(JSON.stringify({ agent: agent.address, metamaskAddress: p.metamaskAddress, pubkey: Buffer.from(p.pubkey).toString('hex'), possessionProof: Buffer.from(p.possessionProof).toString('hex') }))
} else if (cmd === 'run') {
  const signed = JSON.parse(readFileSync(args[0]!, 'utf8')) as SignedInstruction
  const res = await agent.run(signed, args.slice(1).map(readDoc))
  console.log(JSON.stringify(res, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
  process.exit(res.ok ? 0 : 1)
} else if (cmd === 'serve' || !cmd) {
  const port = Number(process.env.AGENT_PORT ?? 8790)
  const origin = process.env.AGENT_CORS_ORIGIN ?? 'http://localhost:3000'
  createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type' })
      res.end(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
    }
    try {
      if (req.method === 'OPTIONS') return send(204, {})
      if (req.method === 'GET' && req.url === '/address') return send(200, { address: agent.address })
      let raw = ''
      for await (const c of req) {
        raw += c
        if (raw.length > 200_000) return send(413, { error: 'body too large' })
      }
      const body = raw ? JSON.parse(raw) : {}
      if (req.method === 'POST' && req.url === '/link-proof') {
        if (typeof body.account !== 'string' || !body.account.startsWith('qor1')) return send(400, { error: 'account (qor1) required' })
        if (typeof body.root !== 'string' || !body.root.startsWith('qor1')) return send(400, { error: 'root (qor1) required' })
        let p
        try {
          p = await agent.linkProof(body.account, body.root)
        } catch (e) {
          return send(409, { error: (e as Error).message })
        }
        return send(200, { metamaskAddress: p.metamaskAddress, pubkey: Buffer.from(p.pubkey).toString('hex'), possessionProof: Buffer.from(p.possessionProof).toString('hex') })
      }
      if (req.method === 'POST' && req.url === '/run') {
        const docs: UntrustedDoc[] = Array.isArray(body.documents) ? body.documents.slice(0, 5).map((d: any) => ({ source: String(d.source ?? 'request'), text: String(d.text ?? '').slice(0, 20_000) })) : []
        const r = await agent.run(body.signed, docs)
        return send(r.ok ? 200 : 403, r)
      }
      send(404, { error: 'not found' })
    } catch (e) {
      send(500, { error: (e as Error).message })
    }
  }).listen(port, () => console.log(`[agent] ${agent.address} listening on http://localhost:${port}`))
} else {
  console.error('usage: address | proof <qor1> | run <instruction.json> [docs...] | serve')
  process.exit(2)
}
