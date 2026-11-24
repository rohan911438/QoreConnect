import Link from 'next/link'
import { connection } from 'next/server'
import type { ReactNode } from 'react'
import { ConnectButton } from '../components/ConnectButton'
import { KeyDiagram } from '../components/KeyDiagram'
import { HeroMock } from '../components/landing/HeroMock'
import { Bento } from '../components/landing/Bento'

const REPO = 'https://github.com/rohan911438/QoreConnect'
const EXPLORER = 'https://explore.qore.network'
const ATTACK_TX = '125E638C8670B49394EDF8F10BCE9DAC7C993A508D57833F9EAFC8B179B5EFF6'

/** Measured on Diana testnet; each links to where it was recorded. */
const PROOF: { value: string; unit?: string; label: string; source: string }[] = [
  {
    value: '1',
    label: 'MetaMask signature to onboard',
    source: `${REPO}/blob/main/apps/web/e2e/onboard-dashboard.spec.ts`,
  },
  {
    value: '35',
    unit: 's',
    label: 'fresh browser to a linked account, E2E on Diana',
    source: `${REPO}/blob/main/prompts/STATUS.md`,
  },
  {
    value: '0',
    unit: 'QOR',
    label: 'needed by the user to start: setup is sponsored',
    source: `${REPO}/blob/main/docs/benchmark.md`,
  },
  {
    value: '9',
    unit: 'lines',
    label: 'to add QoreConnect to a wagmi dApp',
    source: `${REPO}/blob/main/apps/demo-dapp/src/wagmi.ts`,
  },
]

const STACK = [
  'ML-DSA-87 · FIPS 204',
  'QoreChain Diana',
  'MetaMask',
  'wagmi',
  'viem',
  'WebAuthn passkeys',
  'Abstract accounts',
  'Foundry',
  'Hono relayer',
  'Next.js',
]

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Create a quantum-safe root',
    body: 'One passkey tap makes an ML-DSA-87 key in your browser. It is encrypted on your device and registered on QoreChain.',
  },
  {
    n: '02',
    title: 'Link MetaMask, with limits',
    body: 'One MetaMask signature links it as a session key: approved dApps only, a per-transaction cap and a daily cap.',
  },
  {
    n: '03',
    title: 'Use any EVM dApp',
    body: 'MetaMask keeps signing. A relayer pays gas, and the chain itself enforces your limits on every call.',
  },
]

type Cell = 'yes' | 'no' | string
const COMPARE: { row: string; mm: Cell; qorex: Cell; aa: Cell; qc: Cell }[] = [
  { row: 'Root key is post-quantum', mm: 'no', qorex: 'yes', aa: 'no', qc: 'yes' },
  { row: 'Works on QoreChain’s EVM lane', mm: 'no', qorex: 'yes', aa: 'Not deployed', qc: 'yes' },
  { row: 'Keep using MetaMask', mm: 'yes', qorex: 'no', aa: 'no', qc: 'yes' },
  { row: 'Limits enforced by the chain', mm: 'no', qorex: 'Not documented', aa: 'By contracts', qc: 'yes' },
  { row: 'Revoke every classical key in 1 tx', mm: 'no', qorex: 'n/a', aa: 'Per owner', qc: 'yes' },
  { row: 'User needs gas to start', mm: 'Buy QOR', qorex: 'Buy QOR', aa: 'Paymaster', qc: 'Sponsored' },
]

function CellView({ v, strong }: { v: Cell; strong?: boolean }) {
  if (v === 'yes')
    return (
      <span className={`inline-flex items-center gap-1.5 ${strong ? 'font-semibold text-ok' : 'text-ok'}`}>
        <span aria-hidden="true">●</span> Yes
      </span>
    )
  if (v === 'no')
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <span aria-hidden="true" className="text-bad">
          ○
        </span>{' '}
        No
      </span>
    )
  return <span className={strong ? 'font-semibold' : 'text-muted'}>{v}</span>
}

function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className = '',
}: {
  id: string
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={`space-y-10 ${className}`}>
      <div className="qw-reveal max-w-3xl space-y-4">
        <p className="qw-eyebrow">{eyebrow}</p>
        <h2 id={id} className="qw-h2">
          {title}
        </h2>
        {intro && <p className="max-w-2xl text-lg text-muted">{intro}</p>}
      </div>
      {children}
    </section>
  )
}

/* Hand-highlighted snippet (no runtime highlighter, nothing third-party). */
const K = ({ c }: { c: string }) => <span className="text-accent-2">{c}</span>
const S = ({ c }: { c: string }) => <span className="text-ok">{c}</span>
const F = ({ c }: { c: string }) => <span className="text-warn">{c}</span>
const M = ({ c }: { c: string }) => <span className="text-muted">{c}</span>

/** The landing page onboards (creates the root vault), so it is rendered per request for the CSP nonce (T17). */
export default async function Home() {
  await connection()
  return (
    <div className="space-y-36 pt-10 sm:pt-16">
      {/* ---------------- Hero ---------------- */}
      <section className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div className="space-y-8">
          <a
            href={`${EXPLORER}/tx/${ATTACK_TX}`}
            rel="noreferrer noopener"
            className="qw-rise group inline-flex items-center gap-2.5 rounded-full border border-line bg-panel/60 py-1 pl-1 pr-3.5 text-xs text-muted backdrop-blur transition hover:border-accent/50"
          >
            <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-fg">Live</span>
            Build Before Q-Day · on QoreChain Diana testnet
            <span aria-hidden="true" className="transition group-hover:translate-x-0.5">
              →
            </span>
          </a>
          <h1 className="qw-rise-2 font-display text-[clamp(2.8rem,6.2vw,5.4rem)] font-semibold leading-[0.95] tracking-[-0.045em]">
            The migration layer for the <span className="qw-gradient-text">migration year.</span>
          </h1>
          <p className="qw-rise-3 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            <span className="text-fg">Quantum-safe root. MetaMask convenience.</span> QoreChain needs a post-quantum key
            for EVM transactions, and MetaMask cannot hold one. QoreConnect gives your account that key and turns
            MetaMask into a capped, scoped, revocable session key.
          </p>
          <div className="qw-rise-4 flex flex-wrap items-start gap-3">
            <ConnectButton size="lg" />
            <Link href="/doctor" className="qw-btn qw-btn-lg">
              Check an address
            </Link>
          </div>
          <p className="qw-rise-4 flex max-w-xl items-start gap-2.5 text-sm text-muted">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
            Honesty built in: MetaMask&apos;s own key stays classical (secp256k1). QoreConnect limits what it can do,
            and your quantum-safe root can revoke it at any time.
          </p>
        </div>
        <HeroMock />
      </section>

      {/* ---------------- Built with ---------------- */}
      <section aria-label="Built with" className="-mt-16 space-y-5">
        <p className="text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Built with</p>
        <div className="qw-marquee overflow-hidden">
          <div className="qw-marquee-track">
            {[...STACK, ...STACK].map((s, i) => (
              <span
                key={i}
                aria-hidden={i >= STACK.length}
                className="whitespace-nowrap font-display text-lg font-medium text-muted/80"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Proof ---------------- */}
      <section aria-labelledby="proof" className="space-y-6">
        <h2 id="proof" className="qw-eyebrow">
          Measured on Diana, not promised
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PROOF.map((p) => (
            <li key={p.label} className="qw-reveal">
              <a href={p.source} rel="noreferrer noopener" className="qw-surface qw-ring group block h-full p-6">
                <span className="block font-display text-6xl font-semibold leading-none tracking-[-0.05em]">
                  <span className="qw-gradient-text">{p.value}</span>
                  {p.unit && <span className="ml-1.5 text-2xl tracking-tight text-muted">{p.unit}</span>}
                </span>
                <span className="mt-4 block text-sm text-muted">{p.label}</span>
                <span className="mt-5 inline-flex items-center gap-1 font-mono text-[11px] text-muted transition group-hover:text-accent">
                  source ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- How it works ---------------- */}
      <Section
        id="how"
        eyebrow="How it works"
        title="Crypto without the homework."
        intro="No new wallet, no seed phrase to write down first, no gas to buy. Three steps, about half a minute."
      >
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div className="qw-surface qw-reveal p-6">
            <KeyDiagram />
          </div>
          <ol className="relative space-y-4 before:absolute before:bottom-8 before:left-[27px] before:top-8 before:w-px before:bg-gradient-to-b before:from-accent before:via-accent-2 before:to-transparent">
            {STEPS.map((s) => (
              <li key={s.n} className="qw-reveal relative flex gap-5 rounded-2xl p-3">
                <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-line bg-panel font-mono text-sm text-accent shadow-[var(--shadow)]">
                  {s.n}
                </span>
                <div className="pt-1.5">
                  <h3 className="text-xl font-semibold">{s.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      {/* ---------------- Features ---------------- */}
      <Section
        id="features"
        eyebrow="What you get"
        title={
          <>
            Everything a careful user wants. <span className="text-muted">Nothing to learn.</span>
          </>
        }
      >
        <Bento />
      </Section>

      {/* ---------------- Attack ---------------- */}
      <section
        aria-labelledby="attack"
        className="qw-reveal relative overflow-hidden rounded-[2rem] border border-bad/25 bg-panel p-6 sm:p-12"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(closest-side,var(--bad-bg),transparent)] blur-2xl"
        />
        <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-5">
            <p className="qw-eyebrow !text-bad">The attack demo</p>
            <h2 id="attack" className="qw-h2">
              We stole the MetaMask key. <span className="text-bad">The chain still said no.</span>
            </h2>
            <p className="text-lg leading-relaxed text-muted">
              A drainer dApp signed a call with a linked MetaMask key and sent it through its own relayer, skipping
              every QoreConnect check. QoreChain refused it on chain, because the drainer was never on the
              account&apos;s allow-list.
            </p>
            <a href={`${EXPLORER}/tx/${ATTACK_TX}`} className="qw-btn" rel="noreferrer noopener">
              See the refused transaction ↗
            </a>
          </div>
          <div className="qw-window">
            <div className="qw-window-bar">
              <i className="!bg-bad/70" />
              <i className="!bg-warn/70" />
              <i className="!bg-ok/70" />
              <span className="ml-3 font-mono text-[11px] text-muted">terminal</span>
            </div>
            <div className="space-y-2 p-5 font-mono text-[13px] leading-relaxed">
              <p className="text-muted">$ pnpm demo:attack</p>
              <p>
                <span className="text-ok">✓</span> control tip 0.1 QOR <span className="text-muted">success</span>
              </p>
              <p>
                <span className="text-bad">✕</span> drainer via QoreConnect relayer{' '}
                <span className="text-muted">NOT_APPROVED, no fee</span>
              </p>
              <p>
                <span className="text-bad">✕</span> drainer via attacker&apos;s own relayer{' '}
                <span className="text-muted">chain code 10</span>
              </p>
              <p className="break-all pt-2 text-muted">
                tx {ATTACK_TX.slice(0, 16)}…{ATTACK_TX.slice(-6)}
                <span className="qw-blink ml-1 inline-block h-3.5 w-2 translate-y-0.5 bg-fg/70" aria-hidden="true" />
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Compare ---------------- */}
      <Section
        id="compare"
        eyebrow="Benchmark"
        title="Why not just switch wallets?"
        intro={
          <>
            You can: QoreX, QoreChain&apos;s own wallet, is post-quantum end to end. QoreConnect is for the people who
            will not switch, and the dApps that do not want to lose them.{' '}
            <a
              className="text-fg underline decoration-line underline-offset-4 hover:decoration-accent"
              href={`${REPO}/blob/main/docs/benchmark.md`}
              rel="noreferrer noopener"
            >
              Sources and measured costs
            </a>
            .
          </>
        }
      >
        <div className="qw-surface qw-reveal overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="p-4 font-medium sm:p-5" />
                <th scope="col" className="p-4 font-medium sm:p-5">
                  MetaMask alone
                </th>
                <th scope="col" className="p-4 font-medium sm:p-5">
                  QoreX wallet
                </th>
                <th scope="col" className="p-4 font-medium sm:p-5">
                  EVM smart wallets*
                </th>
                <th scope="col" className="bg-accent/5 p-4 font-semibold text-fg sm:p-5">
                  QoreConnect
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r.row} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="p-4 font-medium sm:p-5">
                    {r.row}
                  </th>
                  <td className="p-4 sm:p-5">
                    <CellView v={r.mm} />
                  </td>
                  <td className="p-4 sm:p-5">
                    <CellView v={r.qorex} />
                  </td>
                  <td className="p-4 sm:p-5">
                    <CellView v={r.aa} />
                  </td>
                  <td className="bg-accent/5 p-4 sm:p-5">
                    <CellView v={r.qc} strong />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line p-4 text-xs text-muted sm:px-5">
            *Passkey smart wallets (P-256 owners) and MetaMask smart accounts with ERC-7715 permissions: mature on
            Ethereum L2s, but their roots are elliptic-curve keys.
          </p>
        </div>
      </Section>

      {/* ---------------- Developers ---------------- */}
      <Section id="dev" eyebrow="For dApp teams" title="One connector. Your code stays the same.">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.35fr] lg:items-center">
          <div className="space-y-5">
            <p className="text-lg leading-relaxed text-muted">
              Add the connector and the transport.{' '}
              <code className="font-mono text-[0.9em] text-fg">useWriteContract</code> and{' '}
              <code className="font-mono text-[0.9em] text-fg">useWaitForTransactionReceipt</code> keep working;
              QoreConnect handles keys, previews, gas and receipts.
            </p>
            <ul className="space-y-2.5 text-sm">
              {[
                'Readable preview before every signature',
                'Gas paid from your dApp’s gas tank',
                'Typed errors with a next step for the user',
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-ok-bg text-[11px] text-ok">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <a href={`${REPO}#integrate-a-dapp-wagmi`} className="qw-btn" rel="noreferrer noopener">
              Read the quick start ↗
            </a>
          </div>
          <div className="qw-window qw-reveal">
            <div className="qw-window-bar">
              <i />
              <i />
              <i />
              <span className="ml-3 font-mono text-[11px] text-muted">wagmi.ts</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.7]">
              <code>
                <K c="import" /> {'{ qoreConnect, qoreTransport, qorechainDiana }'} <K c="from" />{' '}
                <S c="'@rohankumar4179/wagmi'" />
                {'\n'}
                <K c="import" /> {'{ createQoreConnectUI }'} <K c="from" /> <S c="'@rohankumar4179/react'" />
                {'\n\n'}
                <K c="const" /> ui = <F c="createQoreConnectUI" />
                ()
                {'\n'}
                <K c="export const" /> config = <F c="createConfig" />({'{'}
                {'\n'}
                {'  '}chains: [qorechainDiana],
                {'\n'}
                {'  '}connectors: [<F c="qoreConnect" />({'{'} appName: <S c="'My dApp'" />, contracts: [MY_CONTRACT],
                {'\n'}
                {'    '}gasTankId: <S c="'my-dapp'" />, relayerUrl: RELAYER, ui: ui.hooks {'}'})],
                {'\n'}
                {'  '}transports: {'{'} [qorechainDiana.id]: <F c="qoreTransport" />
                () {'}'},{'\n'}
                {'}'}){'\n\n'}
                <M c="// existing hooks keep working" />
              </code>
            </pre>
          </div>
        </div>
      </Section>

      {/* ---------------- Explore ---------------- */}
      <section aria-labelledby="more" className="grid gap-4 md:grid-cols-2">
        <h2 id="more" className="sr-only">
          Explore
        </h2>
        {[
          {
            href: '/meter',
            eyebrow: 'Public',
            title: 'Migration Meter',
            body: 'How much of QoreChain’s EVM activity has a post-quantum root, counted on chain with the evidence.',
          },
          {
            href: '/doctor',
            eyebrow: 'Support',
            title: 'Doctor',
            body: 'Paste an address. Get the first problem and the fix, in one click.',
          },
        ].map((c) => (
          <Link key={c.href} href={c.href} className="qw-surface qw-ring qw-lift qw-reveal group block p-8">
            <p className="qw-eyebrow">{c.eyebrow}</p>
            <h3 className="mt-4 flex items-center gap-3 font-display text-3xl font-semibold tracking-tight">
              {c.title}
              <span
                aria-hidden="true"
                className="text-muted transition group-hover:translate-x-1 group-hover:text-accent"
              >
                →
              </span>
            </h3>
            <p className="mt-2 text-muted">{c.body}</p>
          </Link>
        ))}
      </section>

      {/* ---------------- CTA ---------------- */}
      <section
        aria-labelledby="cta"
        className="qw-reveal relative overflow-hidden rounded-[2rem] border border-line p-8 text-center sm:p-16"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(80%_120%_at_50%_0%,var(--aurora-1),transparent_60%),radial-gradient(60%_100%_at_80%_100%,var(--aurora-2),transparent_60%)]"
        />
        <p className="qw-eyebrow justify-center">Before Q-Day</p>
        <h2 id="cta" className="qw-h2 mx-auto mt-4 max-w-3xl">
          Give your MetaMask a <span className="qw-gradient-text">quantum-safe boss.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          About half a minute, one signature, nothing to pay. Testnet only.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ConnectButton size="lg" center />
          <a href={REPO} className="qw-btn qw-btn-lg" rel="noreferrer noopener">
            View the code
          </a>
        </div>
      </section>
    </div>
  )
}
