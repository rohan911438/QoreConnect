/**
 * Hero visual: the Quantum Tip Jar demo dApp with QoreConnect's signing preview open over it, as the user sees it
 * before MetaMask. Values mirror the Diana demo (Tip Jar address, 1 QOR per tx, 5 QOR per day). Static HTML, no data.
 */
function Bar({ used, cap, label }: { used: number; cap: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className="font-mono text-fg">
          {used} / {cap} QOR
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
          style={{ width: `${Math.max(4, (used / cap) * 100)}%` }}
        />
      </div>
    </div>
  )
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" className="shrink-0 text-ok">
      <path
        d="M3.5 8.5 6.5 11.5 12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HeroMock() {
  return (
    <figure
      className="relative mx-auto w-full max-w-[560px]"
      aria-label="Illustration: QoreConnect's signing preview over the Quantum Tip Jar demo"
    >
      {/* glow */}
      <div
        aria-hidden="true"
        className="absolute -inset-y-10 inset-x-0 -z-10 rounded-[3rem] sm:-inset-x-10 bg-[radial-gradient(closest-side,var(--aurora-1),transparent)] blur-2xl"
      />

      <div className="qw-window" aria-hidden="true">
        <div className="qw-window-bar">
          <i />
          <i />
          <i />
          <span className="ml-3 flex-1 truncate rounded-lg bg-bg/60 px-3 py-1 text-center font-mono text-[11px] text-muted">
            tipjar.demo · chain 9800
          </span>
        </div>

        <div className="relative grid min-h-[420px] grid-cols-1 sm:min-h-[440px]">
          {/* dApp underneath */}
          <div className="space-y-4 p-6 opacity-60 blur-[1.5px]">
            <p className="font-display text-xl font-semibold">Quantum Tip Jar</p>
            <div className="h-20 rounded-xl bg-panel-2" />
            <div className="flex gap-2">
              <div className="h-9 flex-1 rounded-lg bg-panel-2" />
              <div className="h-9 w-20 rounded-lg bg-accent/40" />
            </div>
            <div className="h-24 rounded-xl bg-panel-2" />
          </div>

          {/* QoreConnect sheet */}
          <div className="absolute inset-x-3 bottom-3 top-16 overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl sm:inset-x-8">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-accent to-transparent" />
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                    QoreConnect · before MetaMask
                  </p>
                  <p className="mt-1 font-display text-lg font-semibold leading-tight">
                    Tip 0.1 QOR to Quantum Tip Jar
                  </p>
                </div>
                <span className="qw-chip bg-warn-bg text-warn">Classical, capped</span>
              </div>

              <dl className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
                <dt className="text-muted">Contract</dt>
                <dd className="flex items-center gap-1.5 font-mono">
                  QoreTipJar 0x4265…aea4 <Check />
                </dd>
                <dt className="text-muted">Function</dt>
                <dd className="font-mono">tip()</dd>
                <dt className="text-muted">Simulation</dt>
                <dd className="flex items-center gap-1.5">
                  Succeeds <Check />
                </dd>
                <dt className="text-muted">Gas</dt>
                <dd>Paid by the dApp&apos;s gas tank</dd>
              </dl>

              <div className="space-y-2.5 rounded-xl border border-line bg-bg/50 p-3">
                <Bar label="This transaction" used={0.1} cap={1} />
                <Bar label="Today" used={0.1} cap={5} />
              </div>

              <div className="flex gap-2 pt-1">
                <span className="qw-btn flex-1 !py-2 text-xs">Cancel</span>
                <span className="qw-btn qw-btn-primary flex-[2] !py-2 text-xs">Sign in MetaMask</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* floating chips */}
      <div
        aria-hidden="true"
        className="qw-rise-4 absolute -top-6 left-6 hidden rounded-2xl border border-line bg-panel/90 px-3.5 py-2.5 shadow-xl backdrop-blur sm:block"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Root key</p>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
          ML-DSA-87
        </p>
      </div>
      <div
        aria-hidden="true"
        className="qw-rise-4 absolute -bottom-7 right-6 hidden rounded-2xl border border-line bg-panel/90 px-3.5 py-2.5 shadow-xl backdrop-blur sm:block"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Chain verdict</p>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ok">
          <Check /> Allowed by your limits
        </p>
      </div>
    </figure>
  )
}
