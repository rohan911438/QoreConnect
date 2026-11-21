'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { GAS_TANK, RELAYER_URL, TIPJAR_ADDRESS } from '../../lib/qore'

type Check = { id: string; title: string; status: 'pass' | 'fail' | 'info' | 'skip'; detail: string; fix?: { kind: string; label: string } }
type Report = { account: string; evmAddress: string; target?: string; healthy: boolean; firstFailure?: Check; checks: Check[]; checkedAt: number }

const ICON: Record<Check['status'], [string, string, string]> = {
  pass: ['✓', 'text-ok', 'Pass'],
  fail: ['✕', 'text-bad', 'Fail'],
  info: ['i', 'text-muted', 'Info'],
  skip: ['–', 'text-muted', 'Skipped'],
}

/** Where each fix opens the right flow. */
function fixHref(kind: string, target?: string): string {
  switch (kind) {
    case 'onboard':
    case 'link':
      return '/'
    case 'renew':
      return '/account#keys'
    case 'set-rule':
      return '/account#limits'
    case 'approve':
      return target ? `/account?approve=${target}#dapps` : '/account#dapps'
    default:
      return '/meter'
  }
}

export default function DoctorPage() {
  const [address, setAddress] = useState('')
  const [target, setTarget] = useState(TIPJAR_ADDRESS)
  const [report, setReport] = useState<Report>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const check = async (addr = address, tgt = target) => {
    if (!addr.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      const q = new URLSearchParams({ tank: GAS_TANK, ...(tgt.trim() ? { target: tgt.trim() } : {}) })
      const r = await fetch(`${RELAYER_URL}/v1/doctor/${encodeURIComponent(addr.trim())}?${q}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setReport(j)
      history.replaceState(null, '', `?address=${encodeURIComponent(addr.trim())}${tgt.trim() ? `&target=${tgt.trim()}` : ''}`)
    } catch (e) {
      setReport(undefined)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const p = new URLSearchParams(location.search)
    const a = p.get('address')
    const t = p.get('target')
    if (t !== null) setTarget(t)
    if (a) {
      setAddress(a)
      void check(a, t ?? TIPJAR_ADDRESS)
    }
  }, [])

  return (
    <div className="max-w-3xl space-y-8 pt-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Doctor</h1>
        <p className="text-muted">Why would this account&apos;s next transaction fail? Enter any QoreChain address. The Doctor reads the chain, finds the first problem and links to the fix. It never signs anything.</p>
      </header>

      <form
        className="grid gap-3 rounded-2xl border border-line bg-panel p-5 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          void check()
        }}
      >
        <label className="space-y-1 text-sm">
          <span className="font-medium">Account (qor1… or 0x…)</span>
          <input className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm" value={address} onChange={(e) => setAddress(e.target.value)} required spellCheck={false} autoComplete="off" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">dApp contract (optional)</span>
          <input className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm" value={target} onChange={(e) => setTarget(e.target.value)} spellCheck={false} autoComplete="off" />
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-4 py-2 font-semibold text-accent-fg disabled:opacity-60">
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="rounded-xl bg-bad-bg px-4 py-3 text-sm text-bad">
          {error}
        </p>
      )}

      {report && (
        <section className="space-y-4" aria-live="polite" data-testid="doctor-report">
          <div className={`rounded-2xl px-5 py-4 ${report.healthy ? 'bg-ok-bg text-ok' : 'bg-bad-bg text-bad'}`}>
            <p className="font-semibold">{report.healthy ? 'Healthy: the next transaction should go through.' : `First problem: ${report.firstFailure!.title}`}</p>
            {!report.healthy && <p className="mt-1 text-sm">{report.firstFailure!.detail}</p>}
            {report.firstFailure?.fix && (
              <Link href={fixHref(report.firstFailure.fix.kind, report.target)} className="mt-3 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg" data-testid="doctor-fix">
                {report.firstFailure.fix.label}
              </Link>
            )}
          </div>
          <ol className="divide-y divide-line rounded-2xl border border-line bg-panel">
            {report.checks.map((c, i) => {
              const [icon, tone, word] = ICON[c.status]
              return (
                <li key={c.id} className="flex gap-3 px-5 py-3" data-status={c.status}>
                  <span className={`mt-0.5 w-5 shrink-0 text-center font-semibold ${tone}`} aria-hidden="true">
                    {icon}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {i + 1}. {c.title} <span className="sr-only">({word})</span>
                    </p>
                    <p className="break-words text-sm text-muted">{c.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-muted">
            Account <span className="font-mono">{report.account}</span> · checked {new Date(report.checkedAt).toISOString().slice(0, 19).replace('T', ' ')} UTC · Diana testnet
          </p>
        </section>
      )}
    </div>
  )
}
