/** Server-side reads of the relayer's Migration Meter (docs/migration-meter.md). */
export const RELAYER = (process.env.RELAYER_INTERNAL_URL ?? process.env.NEXT_PUBLIC_RELAYER_URL ?? 'http://localhost:8787').replace(/\/$/, '')
export const PUBLIC_RELAYER = (process.env.NEXT_PUBLIC_RELAYER_URL ?? 'http://localhost:8787').replace(/\/$/, '')
export const DOC_URL = 'https://github.com/rohan911438/QoreConnect/blob/main/docs/migration-meter.md'

export interface Num {
  value: number
  label: string
  source: string
  note?: string
}
export interface MeterHeadline {
  ts: number
  network: { chainId: string; evmChainId: number; testnet: true }
  metrics: {
    onboarded: Num
    classicalKeys: Num & { session: number; agent: number }
    relayed: Num & { valueUqor: string; chainRefusals: number; byCode: Record<string, number>; preRejected: number }
    pqcSenders: (Num & { sampleSize: number; withKey: number; fromBlock: number; toBlock: number }) | null
    dapps: Num
    countdown: Num & { target: string }
  }
}
export interface Point {
  ts: number
  onboarded: number
  classicalKeys: number
  relayed: number
  chainRefusals: number
  pqcSendersPct: number | null
  dapps: number
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${RELAYER}${path}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(2500) })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

export const getMeter = () => get<MeterHeadline>('/v1/meter')
export const getSeries = async () => (await get<{ points: Point[] }>('/v1/meter/series'))?.points ?? []
/** Days to Q3 2027 computed locally, so the countdown shows even when the relayer is down. */
export const daysToQ3_2027 = (now = Date.now()) => Math.max(0, Math.ceil((Date.UTC(2027, 6, 1) - now) / 86_400_000))
