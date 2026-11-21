import Link from 'next/link'
import { ConnectButton } from '../components/ConnectButton'

const ROWS: [string, string, string][] = [
  ['Steps to a MetaMask user’s first transaction', 'About 12', '1 passkey tap + 1 MetaMask signature'],
  ['Time to first transaction', '15+ minutes', 'Under 60 seconds'],
  ['Loss if the MetaMask key is broken', 'Everything', 'Capped at the daily limit, then revoked'],
  ['dApp integration', 'Your own relayer and key setup', 'One wagmi connector'],
]

const FEATURES: { title: string; body: string; status: 'Shipped' | 'In progress' | 'Planned' }[] = [
  { title: 'Quantum-safe root', body: 'An ML-DSA-87 key, created with a passkey, controls your QoreChain account. It never leaves your device.', status: 'Shipped' },
  { title: 'MetaMask as a capped key', body: 'MetaMask keeps signing, limited to approved contracts and a daily cap. Classical, capped, revocable.', status: 'Shipped' },
  { title: 'Gasless onboarding', body: 'Setup fees are sponsored and dApps pay gas from a gas tank.', status: 'Shipped' },
  { title: 'Never sign blind', body: 'A readable preview before MetaMask opens: decoded call, simulation, and the chain’s limits checked first.', status: 'Shipped' },
  { title: 'Q-Day kill switch', body: 'One passkey tap revokes every classical key. Only your quantum-safe root can act after that.', status: 'Shipped' },
  { title: 'Agent mode', body: 'AI agents get their own capped sub-accounts and act only on instructions signed by your quantum-safe root.', status: 'Shipped' },
  { title: 'Migration Meter', body: 'A public count of accounts with a post-quantum root. A number that can be checked is a fact.', status: 'Shipped' },
]

const TONE = { Shipped: 'bg-ok-bg text-ok', 'In progress': 'bg-warn-bg text-warn', Planned: 'bg-line text-muted' }

export default function Home() {
  return (
    <div className="space-y-16 pt-8 sm:pt-16">
      <section className="max-w-3xl space-y-6">
        <p className="text-sm font-medium uppercase tracking-widest text-muted">Build Before Q-Day · QoreChain Diana testnet</p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">The migration layer for the migration year.</h1>
        <p className="text-xl text-muted">Quantum-safe root. MetaMask convenience.</p>
        <p className="max-w-2xl">
          QoreChain requires a post-quantum key for EVM transactions, and MetaMask cannot hold one. QoreConnect gives your account a post-quantum root
          key and turns MetaMask into a capped, scoped, revocable session key. No new wallet, no gas to buy.
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <ConnectButton />
          <Link href="/account" className="rounded-xl border border-line px-5 py-3 font-semibold hover:bg-panel">
            Open your account
          </Link>
        </div>
        <p className="text-sm text-muted">
          MetaMask’s own key stays classical (secp256k1). QoreConnect limits what it can do, and your quantum-safe root can revoke it at any time.
        </p>
      </section>

      <section aria-labelledby="compare" className="space-y-4">
        <h2 id="compare" className="text-2xl font-semibold tracking-tight">
          Today, and with QoreConnect
        </h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="p-3 font-medium sm:p-4">
                  <span className="sr-only">Measure</span>
                </th>
                <th scope="col" className="p-3 font-medium sm:p-4">
                  Today
                </th>
                <th scope="col" className="p-3 font-medium sm:p-4">
                  With QoreConnect
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([m, a, b]) => (
                <tr key={m} className="border-b border-line last:border-0">
                  <th scope="row" className="p-3 align-top font-medium sm:p-4">
                    {m}
                  </th>
                  <td className="p-3 align-top text-muted sm:p-4">{a}</td>
                  <td className="p-3 align-top sm:p-4">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">Measured on Diana testnet. The 60-second figure is checked with a fresh browser and real MetaMask.</p>
      </section>

      <section aria-labelledby="features" className="space-y-4">
        <h2 id="features" className="text-2xl font-semibold tracking-tight">
          What you get
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-2xl border border-line bg-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{f.title}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[f.status]}`}>{f.status}</span>
              </div>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="more" className="grid gap-4 sm:grid-cols-2">
        <h2 id="more" className="sr-only">
          More
        </h2>
        <a href="/meter" className="rounded-2xl border border-line bg-panel p-5 hover:border-accent">
          <h3 className="font-semibold">Migration Meter</h3>
          <p className="mt-2 text-sm text-muted">How many QoreChain accounts have a post-quantum root, counted on chain.</p>
        </a>
        <a href="https://github.com/rohan911438/QoreConnect/tree/main/packages/wagmi#readme" className="rounded-2xl border border-line bg-panel p-5 hover:border-accent">
          <h3 className="font-semibold">Developer guide</h3>
          <p className="mt-2 text-sm text-muted">Add QoreConnect to a wagmi dApp: one connector, one transport.</p>
        </a>
      </section>
    </div>
  )
}
