import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import type { HonestyLabel, Preview } from '@rohankumar4179/core'
import { STYLES } from '../styles'

export interface SigningPreviewProps {
  preview: Preview
  appName: string
  /** MetaMask (session key) address that will sign. */
  signerAddress: string
  onConfirm: () => void
  onCancel: () => void
}

const LABEL_TONE: Record<HonestyLabel, 'ok' | 'warn' | 'bad'> = {
  'Quantum-safe': 'ok',
  'Classical, capped': 'warn',
  'Agent, capped': 'warn',
  'Blocked by chain': 'bad',
}

const LABEL_HELP: Record<HonestyLabel, string> = {
  'Quantum-safe': 'Signed by your post-quantum root key (ML-DSA-87).',
  'Classical, capped':
    'MetaMask signs with a classical key. The chain caps what it can spend and you can revoke it in one transaction.',
  'Agent, capped': 'An agent key signs. The chain caps what it can spend and you can revoke it in one transaction.',
  'Blocked by chain': 'Your account rules on QoreChain would refuse this, so nothing will be signed.',
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** Focusable elements inside `root`, in tab order. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  )
}

/**
 * "Never sign blind": a readable preview of exactly what MetaMask will sign, with the policy checks the chain
 * enforces and an honesty label. Accessible modal: labelled, focus-trapped, Escape cancels.
 */
export function SigningPreview({ preview, appName, signerAddress, onConfirm, onCancel }: SigningPreviewProps) {
  const titleId = useId()
  const descId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const canSign = !preview.blocked && !preview.willFail
  const d = preview.decoded

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ;(canSign ? primary.current : cancel.current)?.focus()
    return () => previous?.focus?.()
  }, [canSign])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key !== 'Tab' || !dialog.current) return
    const els = focusables(dialog.current)
    if (!els.length) return
    const first = els[0]!
    const last = els[els.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="qc-root qc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <style>{STYLES}</style>
      <div
        ref={dialog}
        className="qc-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
      >
        <header className="qc-head">
          <p className="qc-eyebrow">{appName} asks you to sign</p>
          <h2 id={titleId} className="qc-title">
            {d.kind === 'decoded' ? d.name : d.kind === 'transfer' ? 'Transfer' : 'Unknown function'}
          </h2>
          <span className={`qc-badge qc-${LABEL_TONE[preview.label]}`} data-testid="qc-label">
            {preview.label}
          </span>
          <p id={descId} className="qc-summary">
            {preview.summary}
          </p>
        </header>

        <dl className="qc-rows">
          <div>
            <dt>Contract</dt>
            <dd>
              <a href={preview.contract.explorerUrl} target="_blank" rel="noreferrer noopener" className="qc-mono">
                {preview.contract.name
                  ? `${preview.contract.name} (${short(preview.contract.address)})`
                  : short(preview.contract.address)}
              </a>
            </dd>
          </div>
          <div>
            <dt>Function</dt>
            <dd className="qc-mono">
              {d.kind === 'decoded'
                ? d.signature
                : d.kind === 'transfer'
                  ? 'none (plain transfer)'
                  : `${d.selector} (not recognised: check the contract before signing)`}
            </dd>
          </div>
          {d.kind === 'decoded' && d.args.length > 0 && (
            <div>
              <dt>Arguments</dt>
              <dd>
                <ul className="qc-args">
                  {d.args.map((a, i) => (
                    <li key={i}>
                      <span className="qc-muted">
                        {a.name} ({a.type})
                      </span>{' '}
                      <span className="qc-mono qc-break">{a.value}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          <div>
            <dt>Value</dt>
            <dd className="qc-mono">{preview.value.qor} QOR</dd>
          </div>
          <div>
            <dt>Gas</dt>
            <dd>
              Paid by {appName} (gas tank). Limit {preview.call.gasLimit.toLocaleString()}.
            </dd>
          </div>
          <div>
            <dt>Signer</dt>
            <dd>
              MetaMask <span className="qc-mono">{short(signerAddress)}</span> for account{' '}
              <span className="qc-mono">{short(preview.call.account)}</span>
            </dd>
          </div>
        </dl>

        <section aria-label="Checks" className="qc-checks">
          <ul>
            {preview.checks.map((c) => (
              <li key={c.id} className={c.ok ? 'qc-pass' : c.warning ? 'qc-warnrow' : 'qc-fail'}>
                <span aria-hidden="true" className="qc-mark">
                  {c.ok ? '✓' : c.warning ? '!' : '✗'}
                </span>
                <span className="qc-visually-hidden">{c.ok ? 'Passed: ' : c.warning ? 'Warning: ' : 'Failed: '}</span>
                <span>
                  <strong>{c.label}</strong>
                  <span className="qc-muted"> · {c.detail}</span>
                  {c.estimate && <span className="qc-muted"> (tracked by QoreConnect)</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="qc-help">{LABEL_HELP[preview.label]}</p>
        </section>

        <footer className="qc-actions">
          <button ref={cancel} type="button" className="qc-btn qc-secondary" onClick={onCancel}>
            {canSign ? 'Cancel' : 'Close'}
          </button>
          {canSign && (
            <button ref={primary} type="button" className="qc-btn qc-primary" onClick={onConfirm}>
              Confirm in MetaMask
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
