'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/** Address form: opens the shareable report page for that address. */
export function ExposureForm({ initial = '' }: { initial?: string }) {
  const router = useRouter()
  const [address, setAddress] = useState(initial)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  return (
    <form
      action="/exposure"
      method="get"
      className="qw-surface qw-ring grid gap-4 p-5 sm:p-6 md:grid-cols-[1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault()
        const a = address.trim()
        if (!/^0x[0-9a-fA-F]{40}$/.test(a) && !/^qor1[0-9a-z]{38,58}$/.test(a))
          return setError('Enter a qor1… address or a 0x… address.')
        setError(undefined)
        setBusy(true)
        router.push(`/exposure/${a}`)
      }}
    >
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Any QoreChain address (qor1… or 0x…, including a MetaMask address)</span>
        <input
          name="address"
          className="qw-input font-mono text-sm"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!error}
          data-testid="exposure-input"
        />
        {error && (
          <span role="alert" className="text-sm text-bad" data-testid="exposure-form-error">
            {error}
          </span>
        )}
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={busy}
          className="qw-btn qw-btn-primary w-full !py-[0.72rem] md:w-auto md:px-6"
          data-testid="exposure-submit"
        >
          {busy ? 'Reading the chain…' : 'Check exposure'}
        </button>
      </div>
    </form>
  )
}
