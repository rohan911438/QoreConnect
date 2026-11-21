'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'

export function Header() {
  const [theme, setTheme] = useState<Theme>('system')
  useEffect(() => {
    const t = document.documentElement.dataset.theme
    setTheme(t === 'light' || t === 'dark' ? t : 'system')
  }, [])
  const cycle = () => {
    const next: Theme = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'
    setTheme(next)
    try {
      if (next === 'system') {
        delete document.documentElement.dataset.theme
        localStorage.removeItem('qc-theme')
      } else {
        document.documentElement.dataset.theme = next
        localStorage.setItem('qc-theme', next)
      }
    } catch {
      /* storage unavailable */
    }
  }
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 96 96">
          <path d="M48 14 76 25v21c0 18-12 30-28 36-16-6-28-18-28-36V25z" fill="none" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" />
          <circle cx="48" cy="46" r="11" fill="none" stroke="currentColor" strokeWidth="7" />
        </svg>
        <span className="hidden min-[440px]:inline">QoreConnect</span>
        <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn">
          <span className="hidden sm:inline">Diana </span>testnet
        </span>
      </Link>
      <nav className="flex items-center gap-0.5 text-sm sm:gap-3">
        <Link href="/meter" className="rounded-lg px-2 py-1.5 hover:bg-panel">
          Meter
        </Link>
        <Link href="/doctor" className="rounded-lg px-2 py-1.5 hover:bg-panel">
          Doctor
        </Link>
        <Link href="/account" className="rounded-lg px-2 py-1.5 hover:bg-panel">
          Account
        </Link>
        <a href="https://github.com/rohan911438/QoreConnect#readme" className="hidden rounded-lg px-2 py-1.5 hover:bg-panel sm:inline">
          Developers
        </a>
        <button type="button" onClick={cycle} className="rounded-lg border border-line px-2 py-1.5" aria-label={`Theme: ${theme}. Change theme`}>
          {theme === 'system' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light'}
        </button>
      </nav>
    </header>
  )
}
