import Link from 'next/link'
import { connection } from 'next/server'
import { ConnectButton } from '../components/ConnectButton'
import { KeyDiagram } from '../components/KeyDiagram'

const REPO = 'https://github.com/rohan911438/QoreConnect'
const EXPLORER = 'https://explore.qore.network'
const ATTACK_TX = '125E638C8670B49394EDF8F10BCE9DAC7C993A508D57833F9EAFC8B179B5EFF6'

/** Measured on Diana testnet; each links to where it was recorded. */
const PROOF: { value: string; label: string; source: string }[] = [
  { value: '1', label: 'MetaMask signature to onboard', source: `${REPO}/blob/main/prompts/STATUS.md` },
  { value: '35 s', label: 'fresh browser to linked account (E2E on Diana)', source: `${REPO}/blob/main/prompts/STATUS.md` },
  { value: '0 QOR', label: 'needed to start: setup is sponsored', source: `${REPO}/blob/main/docs/testnet-evidence.md` },
  { value: '9 lines', label: 'to add QoreConnect to a wagmi dApp', source: `${REPO}/blob/main/apps/demo-dapp/src/wagmi.ts` },
]

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Create a quantum-safe root', body: 'One passkey tap makes an ML-DSA-87 key in your browser. It is encrypted on your device and registered on QoreChain.' },
  { n: '02', title: 'Link MetaMask, with limits', body: 'One MetaMask signature links it as a session key: approved dApps only, a per-transaction cap and a daily cap.' },
  { n: '03', title: 'Use any EVM dApp', body: 'MetaMask keeps signing. A relayer pays gas, and the chain enforces your limits on every call.' },
]

type Status = 'Shipped' | 'In progress' | 'Planned'
const FEATURES: { title: string; body: string; status: Status; wide?: boolean; full?: boolean; icon: keyof typeof ICONS }[] = [
  { title: 'Never sign blind', body: 'Before MetaMask opens, you see the decoded call, a simulation and whether the chain would refuse it.', status: 'Shipped', wide: true, icon: 'eye' },
  { title: 'Q-Day kill switch', body: 'One passkey tap revokes every classical key at once. Only your quantum-safe root can act after that.', status: 'Shipped', icon: 'power' },
  { title: 'Gasless onboarding', body: 'Setup fees are sponsored; dApps pay gas from their own gas tanks.', status: 'Shipped', icon: 'fuel' },
  { title: 'Agent mode', body: 'AI agents get their own capped sub-accounts and act only on instructions your quantum-safe root signed.', status: 'Shipped', icon: 'bot' },
  { title: 'Doctor', body: 'Paste any address: it finds the first thing that would make a transaction fail, and how to fix it.', status: 'Shipped', icon: 'pulse' },
  { title: 'Migration Meter', body: 'A public, on-chain count of accounts with a post-quantum root. A number that can be checked is a fact.', status: 'Shipped', full: true, icon: 'chart' },
]

const TONE: Record<Status, string> = { Shipped: 'bg-ok-bg text-ok', 'In progress': 'bg-warn-bg text-warn', Planned: 'bg-line text-muted' }

const ICONS = {
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  power: 'M12 2v9M6.3 6.3a8 8 0 1 0 11.4 0',
  fuel: 'M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M15 9h2a2 2 0 0 1 2 2v6a2 2 0 0 0 4 0V8l-3-3M7 8h5',
  bot: 'M12 3v3M5 10a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM9.5 13h.01M14.5 13h.01M2 13h3M19 13h3',
  chart: 'M3 21h18M6 17V11M11 17V6M16 17v-4M21 17V8',
  pulse: 'M3 12h4l2.5-6 5 12 2.5-6H21',
}

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const SNIPPET = `import { qoreConnect, qoreTransport, qorechainDiana } from '@qoreconnect/wagmi'
import { createQoreConnectUI } from '@qoreconnect/react'

const ui = createQoreConnectUI()
export const config = createConfig({
  chains: [qorechainDiana],
  connectors: [qoreConnect({ appName: 'My dApp', contracts: [MY_CONTRACT],
    gasTankId: 'my-dapp', relayerUrl: RELAYER, ui: ui.hooks })],
  transports: { [qorechainDiana.id]: qoreTransport() },
})`

/** The landing page onboards (creates the root vault), so it is rendered per request for the CSP nonce (T17). */
export default async function Home() {
  await connection()
  return (
    <div className="space-y-28 pt-10 sm:pt-16">
      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-7">
          <p className="qc-rise inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            Build Before Q-Day · live on QoreChain Diana testnet
          </p>
          <h1 className="qc-rise-2 font-display text-[clamp(2.5rem,6.2vw,4.4rem)] font-semibold leading-[1.02] tracking-tight">
            The migration layer for the <span className="qc-gradient-text">migration year.</span>
          </h1>
          <p className="qc-rise-3 max-w-xl text-lg text-muted sm:text-xl">
            <span className="text-fg">Quantum-safe root. MetaMask convenience.</span> QoreChain needs a post-quantum key for EVM transactions, and
            MetaMask cannot hold one. QoreConnect gives your account that key and turns MetaMask into a capped, scoped, revocable session key.
          </p>
          <div className="flex flex-wrap items-start gap-3">
            <ConnectButton />
            <Link href="/account" className="rounded-xl border border-line bg-panel px-5 py-3 font-semibold transition hover:border-accent">
              Open your account
            </Link>
          </div>
          <p className="max-w-xl text-sm text-muted">
            Honesty built in: MetaMask&apos;s own key stays classical (secp256k1). QoreConnect limits what it can do, and your quantum-safe root
            can revoke it at any time.
          </p>
        </div>
        <KeyDiagram />
      </section>

      {/* Proof strip */}
      <section aria-labelledby="proof" className="space-y-5">
        <h2 id="proof" className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
          Measured on Diana, not promised
        </h2>
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {PROOF.map((p) => (
            <li key={p.label} className="bg-panel p-5 sm:p-6">
              <a href={p.source} className="group block" rel="noreferrer noopener">
                <span className="block font-display text-3xl font-semibold tracking-tight sm:text-4xl">{p.value}</span>
                <span className="mt-1 block text-sm text-muted">{p.label}</span>
                <span className="mt-3 inline-block text-xs text-muted underline-offset-4 group-hover:text-accent group-hover:underline">Source ↗</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="space-y-8">
        <div className="max-w-2xl space-y-3">
          <h2 id="how" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Crypto without the homework.
          </h2>
          <p className="text-muted">No new wallet, no seed phrase to write down first, no gas to buy. Three steps, about half a minute.</p>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="qc-card p-6">
              <span className="font-mono text-sm text-accent">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features (bento) */}
      <section aria-labelledby="features" className="space-y-8">
        <h2 id="features" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          What you get
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className={`qc-card flex flex-col p-6 ${f.wide ? 'md:col-span-2' : f.full ? 'md:col-span-3' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel-2 text-accent">
                  <Icon d={ICONS[f.icon]} />
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TONE[f.status]}`}>{f.status}</span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Attack */}
      <section aria-labelledby="attack" className="relative overflow-hidden rounded-3xl border border-line bg-panel p-6 sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-bad-bg blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-bad">The attack demo</p>
            <h2 id="attack" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              We stole the MetaMask key. The chain still said no.
            </h2>
            <p className="text-muted">
              A drainer dApp signed a call with a linked MetaMask key and sent it through its own relayer, skipping every QoreConnect check. QoreChain
              refused it on chain, because the drainer was never on the account&apos;s allow-list.
            </p>
            <a href={`${EXPLORER}/tx/${ATTACK_TX}`} className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline" rel="noreferrer noopener">
              See the refused transaction ↗
            </a>
          </div>
          <div className="rounded-2xl border border-line bg-bg p-5 font-mono text-[13px] leading-relaxed">
            <p className="text-muted">$ pnpm demo:attack</p>
            <p>
              <span className="text-ok">✓</span> control tip 0.1 QOR <span className="text-muted">success</span>
            </p>
            <p>
              <span className="text-bad">✕</span> drainer via QoreConnect relayer <span className="text-muted">NOT_APPROVED, no fee</span>
            </p>
            <p>
              <span className="text-bad">✕</span> drainer via attacker&apos;s own relayer <span className="text-muted">chain code 10</span>
            </p>
            <p className="mt-3 break-all text-muted">tx {ATTACK_TX.slice(0, 16)}…{ATTACK_TX.slice(-6)}</p>
          </div>
        </div>
      </section>

      {/* Developers */}
      <section aria-labelledby="dev" className="grid gap-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">For dApp teams</p>
          <h2 id="dev" className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            One connector. Your code stays the same.
          </h2>
          <p className="text-muted">
            Add the connector and the transport. <code className="font-mono text-sm text-fg">useWriteContract</code> and{' '}
            <code className="font-mono text-sm text-fg">useWaitForTransactionReceipt</code> keep working; QoreConnect handles keys, previews, gas and
            receipts.
          </p>
          <a href={`${REPO}#integrate-a-dapp-wagmi`} className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline" rel="noreferrer noopener">
            Read the quick start ↗
          </a>
        </div>
        <pre className="overflow-x-auto rounded-2xl border border-line bg-panel p-5 font-mono text-[12.5px] leading-relaxed">
          <code>{SNIPPET}</code>
        </pre>
      </section>

      {/* Closing */}
      <section aria-labelledby="more" className="grid gap-4 md:grid-cols-2">
        <h2 id="more" className="sr-only">
          Explore
        </h2>
        <Link href="/meter" className="qc-card group p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Public</p>
          <h3 className="mt-3 font-display text-2xl font-semibold">Migration Meter →</h3>
          <p className="mt-2 text-sm text-muted">How much of QoreChain&apos;s EVM activity has a post-quantum root, counted on chain with the evidence.</p>
        </Link>
        <Link href="/doctor" className="qc-card group p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Support</p>
          <h3 className="mt-3 font-display text-2xl font-semibold">Doctor →</h3>
          <p className="mt-2 text-sm text-muted">Paste an address. Get the first problem and the fix, in one click.</p>
        </Link>
      </section>
    </div>
  )
}
