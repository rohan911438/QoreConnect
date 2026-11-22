import Link from 'next/link'
import {
  EXPOSURE_DOC,
  GRADE_TONE,
  STATUS_LABEL,
  fmtQor,
  type ExposureFinding,
  type ExposureReport,
} from '../../lib/exposure'
import { ShareBar } from './ShareBar'

const SEV: Record<ExposureFinding['severity'], [string, string, string]> = {
  good: ['✓', 'text-ok', 'Good'],
  warn: ['!', 'text-warn', 'Warning'],
  bad: ['✕', 'text-bad', 'Risk'],
  info: ['i', 'text-muted', 'Info'],
}

const NEXT_HREF: Record<string, string> = {
  onboard: '/',
  'set-rule': '/account#limits',
  'set-expiry': '/account#keys',
  revoke: '/account#keys',
}

/** Score ring: an SVG arc, so it renders on the server and in both themes. */
export function ScoreRing({ score, grade }: { score?: number; grade?: string }) {
  const r = 52
  const c = 2 * Math.PI * r
  const tone = grade ? GRADE_TONE[grade] : undefined
  return (
    <div className="relative grid h-36 w-36 shrink-0 place-items-center" data-testid="exposure-grade">
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
        {score !== undefined && (
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={tone?.ring ?? 'var(--muted)'}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(c * score) / 100} ${c}`}
          />
        )}
      </svg>
      <div className="text-center">
        <p className={`font-display text-5xl font-semibold leading-none ${tone?.text ?? 'text-muted'}`}>
          {grade ?? '–'}
        </p>
        <p className="mt-1 text-xs text-muted">{score !== undefined ? `${score} / 100` : 'no score'}</p>
      </div>
    </div>
  )
}

export function ExposureView({ report, shareUrl }: { report: ExposureReport; shareUrl: string }) {
  const r = report
  const stats: [string, string, string?][] = [
    ['Balance', fmtQor(r.balanceUqor)],
    [
      'Worst case on Q-Day',
      fmtQor(r.atRiskUqor),
      r.atRiskPerDayUqor ? `at most ${fmtQor(r.atRiskPerDayUqor)} per day` : undefined,
    ],
    ['Quantum-safe root', r.pqcRegistered ? 'ML-DSA-87' : 'None'],
    [
      'Classical key revealed',
      r.publicKeyExposed ? 'Yes' : 'Not yet',
      r.exposedBy.length
        ? `by ${r.exposedBy.map((e) => (e === 'evm-tx' ? 'an EVM tx' : 'a QoreChain tx')).join(' and ')}`
        : undefined,
    ],
  ]
  return (
    <section className="space-y-5" aria-live="polite" data-testid="exposure-report" data-status={r.status}>
      <div className="qw-surface qw-ring qw-rise flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <ScoreRing score={r.score} grade={r.grade} />
        <div className="min-w-0 space-y-3">
          <p className="qw-eyebrow">{STATUS_LABEL[r.status]}</p>
          <p
            className="font-display text-[clamp(1.5rem,3vw,2.2rem)] font-semibold leading-tight tracking-[-0.03em]"
            data-testid="exposure-headline"
          >
            {r.headline}
          </p>
          <p className="break-all font-mono text-xs text-muted">{r.account}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {r.nextStep && r.nextStep.kind !== 'none' && (
              <Link
                href={NEXT_HREF[r.nextStep.kind] ?? '/'}
                className="qw-btn qw-btn-primary"
                data-testid="exposure-next"
              >
                {r.nextStep.label}
              </Link>
            )}
            <ShareBar url={shareUrl} grade={r.grade} />
          </div>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([k, v, sub]) => (
          <div key={k} className="qw-surface p-5">
            <dt className="text-xs uppercase tracking-[0.14em] text-muted">{k}</dt>
            <dd className="mt-2 font-display text-2xl font-semibold tracking-tight">{v}</dd>
            {sub && <dd className="mt-1 text-xs text-muted">{sub}</dd>}
          </div>
        ))}
      </dl>

      <ol className="qw-surface divide-y divide-line/70 overflow-hidden">
        {r.findings.map((f) => {
          const [icon, tone, word] = SEV[f.severity]
          return (
            <li key={f.id} className="flex gap-4 px-6 py-4" data-severity={f.severity}>
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-panel-2 text-xs font-bold ${tone}`}
                aria-hidden="true"
              >
                {icon}
              </span>
              <div className="min-w-0">
                <p className="font-medium">
                  {f.title} <span className="sr-only">({word})</span>
                </p>
                <p className="break-words text-sm text-muted">
                  {f.detail}
                  {f.source && (
                    <>
                      {' '}
                      <a
                        href={f.source}
                        className="underline decoration-line underline-offset-2 hover:text-fg"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source
                      </a>
                    </>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="text-xs leading-relaxed text-muted">
        Read live from QoreChain Diana testnet at {new Date(r.checkedAt).toISOString().slice(0, 16).replace('T', ' ')}{' '}
        UTC. Chain parameters: hybrid signatures <span className="font-mono">{r.chainParams.hybridSignatureMode}</span>,
        classical fallback {r.chainParams.allowClassicalFallback ? 'allowed' : 'not allowed'}. The grade is a heuristic
        summary, not an audit.{' '}
        <a href={EXPOSURE_DOC} className="underline underline-offset-2 hover:text-fg">
          How it is calculated
        </a>
        .
      </p>
    </section>
  )
}
