import type { Metadata } from 'next'
import Link from 'next/link'
import { Sparkline } from '../../components/Sparkline'
import { DOC_URL, PUBLIC_RELAYER, daysToQ3_2027, getMeter, getSeries, type Num, type Point } from '../../lib/meter'

export const revalidate = 60
export const metadata: Metadata = {
  title: 'Migration Meter · QoreConnect',
  description: 'How much of QoreChain Diana testnet is already rooted in post-quantum keys. Every number links to its source.',
}

const qor = (uqor: string) => (Number(BigInt(uqor) / 1000n) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })
/** Evidence links point at the public relayer even when the page reads an internal URL. */
const pub = (src: string) => src.replace(/^https?:\/\/[^/]+/, PUBLIC_RELAYER).replace(/^\/v1/, `${PUBLIC_RELAYER}/v1`)

function Tile({ n, value, unit, sub, series }: { n: Num; value: string; unit?: string; sub?: React.ReactNode; series?: { ts: number; v: number }[] }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-5">
      <h2 className="text-sm text-muted">{n.label}</h2>
      <p className="text-4xl font-semibold tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-1 text-lg text-muted">{unit}</span>}
      </p>
      {sub && <p className="text-sm text-muted">{sub}</p>}
      {series && <Sparkline points={series} label={n.label} />}
      <a href={pub(n.source)} className="mt-auto text-xs text-muted underline" target="_blank" rel="noreferrer">
        Source: the rows behind this number
      </a>
    </section>
  )
}

export default async function MeterPage() {
  const [m, points] = await Promise.all([getMeter(), getSeries()])
  const s = (k: keyof Omit<Point, 'ts'>) => points.filter((p) => p[k] !== null).map((p) => ({ ts: p.ts, v: p[k] as number }))
  const days = m?.metrics.countdown.value ?? daysToQ3_2027()

  return (
    <div className="space-y-10 pt-6">
      <header className="max-w-3xl space-y-3">
        <p className="text-sm font-medium uppercase tracking-widest text-muted">Migration Meter · Diana testnet</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">How much of QoreChain is already quantum-rooted?</h1>
        <p className="text-muted">A number that can be checked is a fact. Every number here links to the raw rows behind it, and every row links to the chain.</p>
        <p className="text-sm text-muted">
          {m ? `Snapshot ${new Date(m.ts).toISOString().slice(0, 16).replace('T', ' ')} UTC · refreshed every 15 minutes` : 'The relayer is not reachable right now, so live numbers are unavailable.'}
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-2xl border border-line bg-panel p-6" aria-labelledby="countdown">
        <p id="countdown" className="text-6xl font-semibold tracking-tight tabular-nums">
          {days.toLocaleString('en-US')}
          <span className="ml-2 text-xl text-muted">days</span>
        </p>
        <p className="max-w-md pb-2 text-sm text-muted">
          to Q3 2027, <strong className="text-fg">QoreChain&apos;s roadmap target</strong> for making hybrid signatures required on the EVM lane. It is QoreChain&apos;s target, not a
          QoreConnect promise.
        </p>
      </section>

      {m && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tile n={m.metrics.onboarded} value={m.metrics.onboarded.value.toLocaleString('en-US')} sub="Root accounts with a registered ML-DSA-87 key" series={s('onboarded')} />
          <Tile
            n={m.metrics.classicalKeys}
            value={m.metrics.classicalKeys.value.toLocaleString('en-US')}
            sub={`${m.metrics.classicalKeys.session} MetaMask session keys, ${m.metrics.classicalKeys.agent} agent keys. Classical, capped, revocable by a quantum-safe root.`}
            series={s('classicalKeys')}
          />
          <Tile
            n={m.metrics.relayed}
            value={m.metrics.relayed.value.toLocaleString('en-US')}
            sub={`${qor(m.metrics.relayed.valueUqor)} QOR moved · ${m.metrics.relayed.preRejected} stopped by the relayer before broadcast`}
            series={s('relayed')}
          />
          <Tile
            n={{ ...m.metrics.relayed, label: 'Refused by the chain' }}
            value={m.metrics.relayed.chainRefusals.toLocaleString('en-US')}
            sub={Object.entries(m.metrics.relayed.byCode).map(([k, v]) => `code ${k.replace(' ', ' (')}): ${v}`).join(' · ') || 'None yet'}
            series={s('chainRefusals')}
          />
          {m.metrics.pqcSenders ? (
            <Tile
              n={m.metrics.pqcSenders}
              value={String(m.metrics.pqcSenders.value)}
              unit="%"
              sub={`${m.metrics.pqcSenders.withKey} of ${m.metrics.pqcSenders.sampleSize} sampled EVM senders (blocks ${m.metrics.pqcSenders.fromBlock.toLocaleString('en-US')}–${m.metrics.pqcSenders.toBlock.toLocaleString('en-US')}). A sample, not a census.`}
              series={s('pqcSendersPct')}
            />
          ) : (
            <section className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">EVM sender sample unavailable in this snapshot.</section>
          )}
          <Tile n={m.metrics.dapps} value={m.metrics.dapps.value.toLocaleString('en-US')} sub="Gas tanks with at least one successful relayed call" series={s('dapps')} />
        </div>
      )}

      {points.length > 0 && (
        <details className="rounded-2xl border border-line bg-panel p-5">
          <summary className="cursor-pointer font-medium">Table view ({points.length} snapshots)</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-muted">
                <tr>
                  {['Time (UTC)', 'Onboarded', 'Classical keys', 'Relayed', 'Chain refusals', 'PQ senders %', 'dApps'].map((h) => (
                    <th key={h} className="py-1 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {points
                  .slice(-50)
                  .reverse()
                  .map((p) => (
                    <tr key={p.ts} className="border-t border-line">
                      <td className="py-1 pr-4">{new Date(p.ts).toISOString().slice(0, 16).replace('T', ' ')}</td>
                      <td className="pr-4">{p.onboarded}</td>
                      <td className="pr-4">{p.classicalKeys}</td>
                      <td className="pr-4">{p.relayed}</td>
                      <td className="pr-4">{p.chainRefusals}</td>
                      <td className="pr-4">{p.pqcSendersPct ?? '–'}</td>
                      <td className="pr-4">{p.dapps}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <section className="max-w-3xl space-y-3" aria-labelledby="how">
        <h2 id="how" className="text-xl font-semibold">
          How we count
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Onboarded: accounts our sponsor funded whose ML-DSA-87 key is registered on chain.</li>
          <li>Classical keys: active linked MetaMask and agent keys on those accounts. Each one can be revoked in one transaction by a quantum-safe root.</li>
          <li>Relayed and refused: every call our relayer broadcast, with the chain&apos;s refusal code when it said no.</li>
          <li>EVM senders: a labelled sample of recent blocks, each sender checked with the pqcKeyStatus precompile.</li>
          <li>Diana history is pruned, so the series starts on the day the indexer first ran.</li>
        </ul>
        <p className="text-sm">
          <a className="underline" href={DOC_URL}>
            Full definitions, sources and limitations
          </a>{' '}
          · <Link className="underline" href="/doctor">Check why an account&apos;s transaction would fail</Link>
        </p>
      </section>
    </div>
  )
}
