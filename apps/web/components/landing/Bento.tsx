import type { ReactNode } from 'react'

function Card({
  title,
  body,
  children,
  className = '',
}: {
  title: string
  body: string
  children: ReactNode
  className?: string
}) {
  return (
    <li className={`qw-surface qw-ring qw-lift qw-reveal flex flex-col overflow-hidden ${className}`}>
      <div
        aria-hidden="true"
        className="relative flex min-h-[170px] flex-1 items-center justify-center overflow-hidden border-b border-line bg-[radial-gradient(120%_90%_at_50%_0%,var(--aurora-1),transparent_70%)] p-6"
      >
        {children}
      </div>
      <div className="p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <span className="qw-chip bg-ok-bg text-ok">Shipped</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
      </div>
    </li>
  )
}

const Row = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <div className="flex items-center gap-2.5 text-[12.5px]">
    <span
      className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold ${ok ? 'bg-ok-bg text-ok' : 'bg-bad-bg text-bad'}`}
    >
      {ok ? '✓' : '✕'}
    </span>
    <span className={ok ? '' : 'text-muted line-through decoration-bad/60'}>{children}</span>
  </div>
)

export function Bento() {
  return (
    <ul className="grid gap-4 md:grid-cols-6">
      <Card
        className="md:col-span-4"
        title="Never sign blind"
        body="Before MetaMask opens, you see the decoded call, a simulation, your limits and whether the chain would refuse it."
      >
        <div className="w-full max-w-sm space-y-2 rounded-xl border border-line bg-panel p-4 font-mono shadow-lg">
          <p className="text-[11px] text-muted">decoded call</p>
          <p className="text-[13px]">
            <span className="text-accent-2">QoreTipJar</span>.<span className="text-accent">tip</span>(
            <span className="text-warn">0.1 QOR</span>)
          </p>
          <div className="relative h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="qw-scan absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent" />
          </div>
          <p className="text-[11px] text-ok">simulation: succeeds · chain would allow</p>
        </div>
      </Card>

      <Card
        className="md:col-span-2"
        title="Q-Day kill switch"
        body="One passkey tap revokes every classical key in one transaction. Only your quantum-safe root can act after that."
      >
        <div className="flex flex-col items-center gap-3">
          <div className="relative grid h-20 w-20 place-items-center rounded-full border border-bad/40 bg-bad-bg">
            <div className="qw-pulse absolute inset-0 rounded-full border border-bad/50" />
            <svg
              viewBox="0 0 24 24"
              width="30"
              height="30"
              fill="none"
              stroke="var(--bad)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M12 2v9M6.3 6.3a8 8 0 1 0 11.4 0" />
            </svg>
          </div>
          <span className="font-mono text-[11px] text-muted">revoke all classical keys · 1 tx</span>
        </div>
      </Card>

      <Card
        className="md:col-span-2"
        title="Gasless onboarding"
        body="Setup is sponsored, and each dApp pays its users' gas from its own gas tank."
      >
        <div className="w-full max-w-[200px] space-y-2">
          <div className="flex justify-between font-mono text-[11px] text-muted">
            <span>gas tank</span>
            <span className="text-fg">72%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full border border-line bg-panel-2">
            <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-accent to-accent-2" />
          </div>
          <p className="text-center font-mono text-[11px] text-muted">you pay: 0 QOR</p>
        </div>
      </Card>

      <Card
        className="md:col-span-2"
        title="Agent mode"
        body="AI agents get their own capped sub-accounts and act only on instructions your quantum-safe root signed."
      >
        <div className="w-full max-w-[240px] space-y-2 text-[12px]">
          <div className="ml-auto w-fit rounded-2xl rounded-br-sm bg-accent px-3 py-1.5 text-accent-fg">
            tip 0.15 QOR to the Tip Jar
          </div>
          <div className="w-fit rounded-2xl rounded-bl-sm border border-line bg-panel px-3 py-1.5">
            <span className="text-ok">✓ root-signed</span> · executed
          </div>
          <div className="w-fit rounded-2xl rounded-bl-sm border border-bad/40 bg-bad-bg px-3 py-1.5 text-bad">
            ✕ injected instruction refused
          </div>
        </div>
      </Card>

      <Card
        className="md:col-span-2"
        title="Doctor"
        body="Paste any address: it finds the first thing that would make a transaction fail, and the one-click fix."
      >
        <div className="w-full max-w-[220px] space-y-2 rounded-xl border border-line bg-panel p-3.5 shadow-lg">
          <Row ok>ML-DSA-87 key registered</Row>
          <Row ok>MetaMask linked, not expired</Row>
          <Row ok={false}>Drainer on the allow-list</Row>
        </div>
      </Card>

      <Card
        className="md:col-span-6"
        title="Migration Meter"
        body="A public, on-chain count of accounts with a post-quantum root, with the evidence behind every number."
      >
        <span className="absolute right-4 top-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          illustration · live numbers on /meter
        </span>
        <div className="flex w-full max-w-2xl items-end justify-between gap-1.5 self-end">
          {[18, 22, 20, 28, 34, 31, 40, 46, 44, 55, 62, 60, 71, 78, 84, 92].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-md bg-gradient-to-t from-accent/20 to-accent"
              style={{ height: `${h}px`, opacity: 0.35 + i / 25 }}
            />
          ))}
        </div>
      </Card>
    </ul>
  )
}
