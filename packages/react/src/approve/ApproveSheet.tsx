import { useRef, useState } from 'react'
import { explorerAddress, formatQor, type Limits, type QoreNetwork } from '@qoreconnect/core'
import { Modal } from '../Modal'

export interface ApproveSheetProps {
  appName: string
  origin?: string
  /** "0xTarget" or "0xTarget/0xSelector" */
  contracts: string[]
  net: QoreNetwork
  /** Current limits (unchanged by this approval). */
  limits?: Limits
  /** Resolves once approved on chain; a rejection is shown with Retry. */
  onApprove: () => Promise<void> | void
  onCancel: () => void
}

/** Flow C: "Approve <dApp> to use your account?" Contracts shown in full; limits unchanged; one passkey tap. */
export function ApproveSheet(p: ApproveSheetProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const primary = useRef<HTMLButtonElement>(null)
  const approve = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await p.onApprove()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Modal
      testId="qc-approve"
      eyebrow="New dApp"
      title={`Approve ${p.appName} to use your account?`}
      description="MetaMask will be able to call these contracts for your account, within your existing limits."
      onClose={busy ? undefined : p.onCancel}
      initialFocus={primary}
      actions={
        <>
          <button type="button" className="qc-btn qc-secondary" onClick={p.onCancel} disabled={busy}>
            Cancel
          </button>
          <button ref={primary} type="button" className="qc-btn qc-primary" onClick={approve} disabled={busy}>
            {busy ? 'Approving…' : 'Approve with passkey'}
          </button>
        </>
      }
    >
      <dl className="qc-rows">
        {p.origin && (
          <div>
            <dt>Website</dt>
            <dd className="qc-mono qc-break">{p.origin}</dd>
          </div>
        )}
        <div>
          <dt>Contracts</dt>
          <dd>
            <ul className="qc-args">
              {p.contracts.map((c) => {
                const [addr, sel] = c.split('/')
                return (
                  <li key={c}>
                    <a className="qc-mono qc-break" href={explorerAddress(p.net, addr!)} target="_blank" rel="noreferrer noopener">
                      {addr}
                    </a>
                    {sel && <span className="qc-muted"> only function {sel}</span>}
                  </li>
                )
              })}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Limits</dt>
          <dd>{p.limits ? `Unchanged: ${formatQor(p.limits.perTxUqor)} QOR per transaction, ${formatQor(p.limits.dailyUqor)} QOR per day` : 'Unchanged'}</dd>
        </div>
      </dl>
      <p className="qc-help">Check the addresses. Caps still apply even if a contract misbehaves, and you can remove this dApp at any time.</p>
      {error && (
        <p role="alert" className="qc-error">
          {error}
        </p>
      )}
    </Modal>
  )
}
