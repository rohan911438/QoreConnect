'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { qore } from '../lib/qore'

/** "Connect with MetaMask": runs onboarding when needed, then opens the dashboard. */
export function ConnectButton({ className = '' }: { className?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const connect = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await qore().provider.request({ method: 'eth_requestAccounts' })
      router.push('/account')
    } catch (e: any) {
      if (e?.code !== 4001) setError(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        className={`rounded-xl bg-accent px-5 py-3 font-semibold text-accent-fg shadow-sm transition hover:opacity-90 disabled:opacity-60 ${className}`}
      >
        {busy ? 'Connecting…' : 'Connect with MetaMask'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  )
}
