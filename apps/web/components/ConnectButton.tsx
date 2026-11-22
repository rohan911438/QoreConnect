'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { qore } from '../lib/qore'

/** "Connect with MetaMask": runs onboarding when needed, then opens the dashboard. */
export function ConnectButton({ className = '', size, center }: { className?: string; size?: 'lg'; center?: boolean }) {
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
    <div className={`flex flex-col gap-2 ${center ? 'items-center' : 'items-start'}`}>
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        className={`qw-btn qw-btn-primary ${size === 'lg' ? 'qw-btn-lg' : ''} ${className}`}
      >
        {busy ? 'Connecting…' : 'Connect with MetaMask'}
        {!busy && <span aria-hidden="true">→</span>}
      </button>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  )
}
