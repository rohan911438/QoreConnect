'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { QoreConnectProvider } from '@rohankumar4179/react'
import { qore } from '../lib/qore'

/** Mounts QoreConnect's modals (onboarding, approval, unlock, preview) once for the whole app. */
export function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  if (!ready) return <>{children}</>
  return <QoreConnectProvider ui={qore().ui}>{children}</QoreConnectProvider>
}
