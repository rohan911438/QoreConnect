import Link from 'next/link'
import { Logo } from './Logo'

const REPO = 'https://github.com/rohan911438/QoreConnect'

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Your account', href: '/account' },
      { label: 'Migration Meter', href: '/meter' },
      { label: 'Doctor', href: '/doctor' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Quick start', href: `${REPO}#quick-start`, external: true },
      { label: 'wagmi connector', href: `${REPO}/tree/main/packages/wagmi`, external: true },
      { label: 'Run a relayer', href: `${REPO}/tree/main/apps/relayer`, external: true },
    ],
  },
  {
    title: 'Trust',
    links: [
      { label: 'Security model', href: `${REPO}/blob/main/docs/security.md`, external: true },
      { label: 'Testnet evidence', href: `${REPO}/blob/main/docs/testnet-evidence.md`, external: true },
      { label: 'Benchmark', href: `${REPO}/blob/main/docs/benchmark.md`, external: true },
      { label: 'Diana explorer', href: 'https://explore.qore.network', external: true },
    ],
  },
]

export function Footer() {
  return (
    <footer className="relative mt-8 border-t border-line bg-[linear-gradient(to_bottom,transparent,color-mix(in_srgb,var(--panel)_70%,transparent))]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold">
            <Logo />
            QoreConnect
          </Link>
          <p className="max-w-xs text-sm text-muted">
            Quantum-safe root. MetaMask convenience. The migration layer for QoreChain&apos;s migration year.
          </p>
          <p className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
            Diana testnet only. Testnet funds have no value. Not audited.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="space-y-3 text-sm">
            <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-muted">{c.title}</h2>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} className="hover:text-accent" rel="noreferrer noopener">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="hover:text-accent">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto max-w-7xl overflow-hidden px-4 sm:px-6 lg:px-8">
        <p
          aria-hidden="true"
          className="select-none bg-gradient-to-b from-line to-transparent bg-clip-text font-display text-[clamp(3.5rem,16.5vw,14rem)] font-bold leading-[0.8] tracking-[-0.06em] text-transparent"
        >
          QoreConnect
        </p>
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:px-6 lg:px-8">
        <span>Built on QoreChain&apos;s official SDK and PQC kits · chain qorechain-diana, EVM 9800</span>
        <span>Apache-2.0 · Built by students for Build Before Q-Day</span>
      </div>
    </footer>
  )
}
