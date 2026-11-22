'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from './Logo'

type Theme = 'system' | 'light' | 'dark'

const NAV = [
  { href: '/meter', label: 'Meter' },
  { href: '/doctor', label: 'Doctor' },
  { href: '/account', label: 'Account' },
]

export function Header() {
  const path = usePathname()
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
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display font-semibold tracking-tight">
          <Logo />
          <span className="hidden min-[440px]:inline">QoreConnect</span>
          <span className="hidden rounded-full border border-warn/30 bg-warn-bg px-2 py-0.5 text-xs font-medium text-warn min-[400px]:inline">
            <span className="hidden sm:inline">Diana </span>testnet
          </span>
        </Link>
        <nav className="flex items-center gap-0 text-[13px] sm:gap-1.5 sm:text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path === n.href ? 'page' : undefined}
              className={`rounded-lg px-2 py-1.5 transition sm:px-2.5 hover:bg-panel-2 ${path === n.href ? 'bg-panel-2 font-medium' : 'text-muted hover:text-fg'}`}
            >
              {n.label}
            </Link>
          ))}
          <a href="https://github.com/rohan911438/QoreConnect#readme" className="hidden rounded-lg px-2.5 py-1.5 text-muted transition hover:bg-panel-2 hover:text-fg sm:inline">
            Developers
          </a>
          <button
            type="button"
            onClick={cycle}
            className="ml-1 rounded-lg border border-line px-2 py-1.5 text-muted sm:px-2.5 transition hover:text-fg"
            aria-label={`Theme: ${theme}. Change theme`}
          >
            {theme === 'system' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </nav>
      </div>
    </header>
  )
}
