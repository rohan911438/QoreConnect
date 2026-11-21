/**
 * Migration Meter (P12). Definitions live in docs/migration-meter.md; this file implements them exactly.
 * Every headline number carries a `source` (how to check it) and the rows behind it go into `evidence`.
 */
import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem'
import { evmToQor } from '@qorechain/sdk'
import { explorerTx, type AuthenticatorInfo, type PqcKeyInfo, type QoreNetwork } from '@qoreconnect/core'
import type { RelayerStore } from './store'

/** Start of Q3 2027: QoreChain's roadmap target for hybrid signatures "Required" on the EVM lane. */
export const Q3_2027 = Date.UTC(2027, 6, 1)
export const PQC_KEY_STATUS = '0x0000000000000000000000000000000000000a02'
const KEY_STATUS_ABI = parseAbi(['function pqcKeyStatus(address account) view returns (bool registered, uint8 algorithmId, bytes pubkey)'])
const CHAIN_CODE_NAMES: Record<number, string> = { 5: 'LIMIT_EXCEEDED', 6: 'EXPIRED', 10: 'NOT_APPROVED', 11: 'NONCE' }

export interface MeterChain {
  getPqcKey(address: string): Promise<Pick<PqcKeyInfo, 'registered'>>
  getAuthenticators(address: string): Promise<AuthenticatorInfo[]>
}

export interface SenderSample {
  fromBlock: number
  toBlock: number
  senders: { address: string; account: string; pqc: boolean }[]
}

export interface EvmSampler {
  sample(blocks: number, maxSenders: number): Promise<SenderSample>
}

export interface MeterNumber {
  value: number
  label: string
  source: string
  note?: string
}

export interface MeterSnapshot {
  ts: number
  network: { chainId: string; evmChainId: number; testnet: true }
  metrics: {
    onboarded: MeterNumber
    classicalKeys: MeterNumber & { session: number; agent: number }
    relayed: MeterNumber & { valueUqor: string; chainRefusals: number; byCode: Record<string, number>; preRejected: number }
    pqcSenders: (MeterNumber & { sampleSize: number; withKey: number; fromBlock: number; toBlock: number }) | null
    dapps: MeterNumber
    countdown: MeterNumber & { target: string }
  }
  evidence: {
    onboarded: { account: string; sponsorTx: string | null; registered: boolean; rest: string }[]
    keys: { account: string; key: string; kind: 'session' | 'agent'; label: string; expiryUnix: number; rest: string }[]
    relays: { txHash: string | null; account: string; target: string | null; success: boolean | null; code: number | null; valueUqor: string | null; at: number; explorer: string | null }[]
    senders: SenderSample | null
    dapps: { tankId: string; name: string; executions: number }[]
  }
  errors: string[]
}

export interface MeterOptions {
  /** Public base URL of this relayer, used to build evidence links. */
  publicUrl?: string
  maxAccounts?: number
  sampleBlocks?: number
  maxSenders?: number
  now?: number
}

const pLimit = async <T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k]!)
      }
    }),
  )
  return out
}

/** Compute one snapshot from the relayer database and the chain. Never throws: per-metric failures go to `errors`. */
export async function computeMeter(d: { net: QoreNetwork; store: RelayerStore; chain: MeterChain; sampler?: EvmSampler }, o: MeterOptions = {}): Promise<MeterSnapshot> {
  const now = o.now ?? Date.now()
  const base = (o.publicUrl ?? '').replace(/\/$/, '')
  const ev = (m: string) => `${base}/v1/meter/evidence/${m}`
  const rest = (path: string) => `${d.net.rest.replace(/\/$/, '')}${path}`
  const maxAccounts = o.maxAccounts ?? 200
  const errors: string[] = []
  const inputs = d.store.meterInputs()

  // 1. Onboarded: sponsored roots whose ML-DSA key is registered.
  const sponsored = inputs.sponsored.slice(0, maxAccounts)
  const onboardedRows = await pLimit(sponsored, 8, async (s) => {
    const registered = await d.chain
      .getPqcKey(s.root)
      .then((k) => k.registered)
      .catch((e) => (errors.push(`pqc ${s.root}: ${(e as Error).message}`), false))
    return { account: s.root, sponsorTx: s.txHash, registered, rest: rest(`/qorechain/pqc/v1/account/${s.root}`) }
  })
  const onboarded = onboardedRows.filter((r) => r.registered)

  // 2. Classical keys under a post-quantum root: active linked keys on known accounts.
  const known = [...new Set([...onboarded.map((r) => r.account), ...inputs.relayAccounts])].slice(0, maxAccounts)
  const nowS = Math.floor(now / 1000)
  const keyRows = (
    await pLimit(known, 8, async (account) => {
      const auths = await d.chain.getAuthenticators(account).catch((e) => (errors.push(`auth ${account}: ${(e as Error).message}`), [] as AuthenticatorInfo[]))
      return auths
        .filter((a) => !a.revoked && (a.expiryUnix === 0 || a.expiryUnix > nowS))
        .map((a) => ({
          account,
          key: '0x' + a.pubkeyHex,
          kind: (a.label.startsWith('agent:') ? 'agent' : 'session') as 'agent' | 'session',
          label: a.label,
          expiryUnix: a.expiryUnix,
          rest: rest(`/qorechain/abstractaccount/v1/authenticators/${account}`),
        }))
    })
  ).flat()

  // 3. Relayed executions and refusals.
  const r = inputs.relays
  const byCode: Record<string, number> = {}
  for (const [code, n] of Object.entries(r.refusalsByCode)) byCode[`${code} ${CHAIN_CODE_NAMES[Number(code)] ?? 'OTHER'}`] = n

  // 4. EVM-lane senders (sample).
  let senders: SenderSample | null = null
  if (d.sampler) {
    try {
      senders = await d.sampler.sample(o.sampleBlocks ?? 200, o.maxSenders ?? 50)
    } catch (e) {
      errors.push(`sample: ${(e as Error).message}`)
    }
  }
  const withKey = senders?.senders.filter((s) => s.pqc).length ?? 0

  // 6. Countdown.
  const days = Math.max(0, Math.ceil((Q3_2027 - now) / 86_400_000))

  return {
    ts: now,
    network: { chainId: d.net.chainId, evmChainId: d.net.evmChainId, testnet: true },
    metrics: {
      onboarded: { value: onboarded.length, label: 'Accounts onboarded through QoreConnect', source: ev('onboarded'), note: sponsored.length < inputs.sponsored.length ? `first ${maxAccounts} checked` : undefined },
      classicalKeys: {
        value: keyRows.length,
        session: keyRows.filter((k) => k.kind === 'session').length,
        agent: keyRows.filter((k) => k.kind === 'agent').length,
        label: 'Classical keys under a post-quantum root',
        source: ev('keys'),
      },
      relayed: {
        value: r.executed,
        valueUqor: r.valueUqor.toString(),
        chainRefusals: r.chainRefusals,
        byCode,
        preRejected: r.preRejected,
        label: 'Relayed executions',
        source: ev('relays'),
      },
      pqcSenders: senders
        ? {
            value: senders.senders.length ? Math.round((withKey / senders.senders.length) * 1000) / 10 : 0,
            withKey,
            sampleSize: senders.senders.length,
            fromBlock: senders.fromBlock,
            toBlock: senders.toBlock,
            label: 'EVM senders with a post-quantum key (%, sample)',
            source: ev('senders'),
            note: `sample of ${senders.senders.length} senders in blocks ${senders.fromBlock}–${senders.toBlock}`,
          }
        : null,
      dapps: { value: inputs.dapps.length, label: 'dApps integrated', source: ev('dapps') },
      countdown: { value: days, target: new Date(Q3_2027).toISOString().slice(0, 10), label: 'Days to Q3 2027', source: 'docs/migration-meter.md#6-countdown-to-q3-2027', note: "QoreChain's roadmap target for hybrid-required EVM lane" },
    },
    evidence: {
      onboarded: onboardedRows,
      keys: keyRows,
      relays: r.recent.map((x) => ({ ...x, explorer: x.txHash ? explorerTx(d.net, x.txHash) : null })),
      senders,
      dapps: inputs.dapps,
    },
    errors: errors.slice(0, 20),
  }
}

/** Headline view (no evidence rows) for `GET /v1/meter`. */
export const meterHeadline = (s: MeterSnapshot) => ({ ts: s.ts, network: s.network, metrics: s.metrics, errors: s.errors.length })

/** One series point per snapshot. */
export const meterPoint = (s: MeterSnapshot) => ({
  ts: s.ts,
  onboarded: s.metrics.onboarded.value,
  classicalKeys: s.metrics.classicalKeys.value,
  relayed: s.metrics.relayed.value,
  chainRefusals: s.metrics.relayed.chainRefusals,
  pqcSendersPct: s.metrics.pqcSenders?.value ?? null,
  dapps: s.metrics.dapps.value,
})

/** Samples recent EVM blocks over JSON-RPC and checks each sender with the pqcKeyStatus precompile. */
export class RpcEvmSampler implements EvmSampler {
  constructor(
    private readonly rpc: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly concurrency = 6,
  ) {}

  private async call(method: string, params: unknown[]): Promise<any> {
    const res = await this.fetchImpl(this.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
    const j: any = await res.json()
    if (j.error) throw new Error(`${method}: ${j.error.message}`)
    return j.result
  }

  async hasPqcKey(address: string): Promise<boolean> {
    const data = encodeFunctionData({ abi: KEY_STATUS_ABI, functionName: 'pqcKeyStatus', args: [address as `0x${string}`] })
    const out = await this.call('eth_call', [{ to: PQC_KEY_STATUS, data }, 'latest'])
    const [registered] = decodeFunctionResult({ abi: KEY_STATUS_ABI, functionName: 'pqcKeyStatus', data: out }) as readonly [boolean, number, string]
    return registered
  }

  async sample(blocks: number, maxSenders: number): Promise<SenderSample> {
    const toBlock = Number(BigInt(await this.call('eth_blockNumber', [])))
    const fromBlock = Math.max(0, toBlock - blocks + 1)
    const nums = Array.from({ length: toBlock - fromBlock + 1 }, (_, i) => toBlock - i)
    const seen = new Set<string>()
    for (let i = 0; i < nums.length && seen.size < maxSenders; i += this.concurrency) {
      const batch = await Promise.all(nums.slice(i, i + this.concurrency).map((n) => this.call('eth_getBlockByNumber', ['0x' + n.toString(16), true]).catch(() => null)))
      for (const b of batch) for (const tx of b?.transactions ?? []) if (tx?.from && seen.size < maxSenders) seen.add(String(tx.from).toLowerCase())
    }
    const senders = await pLimit([...seen], this.concurrency, async (address) => ({ address, account: evmToQor(address), pqc: await this.hasPqcKey(address).catch(() => false) }))
    return { fromBlock, toBlock, senders }
  }
}

/** Periodic job: compute and store a snapshot every `intervalMs`. */
export class MeterIndexer {
  private timer?: ReturnType<typeof setInterval>
  private running?: Promise<MeterSnapshot>
  constructor(
    private readonly d: Parameters<typeof computeMeter>[0],
    private readonly o: MeterOptions & { intervalMs?: number; log?: (m: string) => void } = {},
  ) {}

  async runOnce(): Promise<MeterSnapshot> {
    if (this.running) return this.running
    this.running = computeMeter(this.d, { ...this.o, now: undefined }).then((s) => {
      const { evidence, ...head } = s
      this.d.store.saveMeterSnapshot(s.ts, JSON.stringify(head), JSON.stringify(evidence))
      this.o.log?.(`meter snapshot: ${JSON.stringify(meterPoint(s))}${s.errors.length ? ` (${s.errors.length} errors)` : ''}`)
      return s
    })
    try {
      return await this.running
    } finally {
      this.running = undefined
    }
  }

  start() {
    void this.runOnce().catch((e) => this.o.log?.(`meter failed: ${(e as Error).message}`))
    this.timer = setInterval(() => void this.runOnce().catch((e) => this.o.log?.(`meter failed: ${(e as Error).message}`)), this.o.intervalMs ?? 15 * 60_000)
    this.timer.unref?.()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }
}
