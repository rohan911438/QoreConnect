import { useRef, useState } from 'react'
import { Modal } from '../Modal'

export interface UnlockPromptProps {
  reason?: string
  error?: string
  onSubmit: (password: string) => void
  onCancel: () => void
}

/** Password unlock for vaults created without passkey PRF. (Passkey vaults unlock with the browser's own prompt.) */
export function UnlockPrompt({ reason, error, onSubmit, onCancel }: UnlockPromptProps) {
  const [password, setPassword] = useState('')
  const input = useRef<HTMLInputElement>(null)
  return (
    <Modal
      testId="qc-unlock"
      title="Unlock your quantum-safe key"
      description={reason ?? 'Your root key signs this change.'}
      onClose={onCancel}
      initialFocus={input}
      actions={
        <>
          <button type="button" className="qc-btn qc-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form="qc-unlock-form" className="qc-btn qc-primary" disabled={password.length < 8}>
            Unlock
          </button>
        </>
      }
    >
      <form
        id="qc-unlock-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (password.length >= 8) onSubmit(password)
        }}
      >
        <label className="qc-field">
          <span>Password</span>
          <input ref={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      </form>
      {error && (
        <p role="alert" className="qc-error">
          {error}
        </p>
      )}
    </Modal>
  )
}
