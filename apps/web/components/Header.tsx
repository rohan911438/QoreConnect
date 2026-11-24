'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Logo } from './Logo'

type Theme = 'system' | 'light' | 'dark'

const NAV: { href: string; label: string; wide?: boolean }[] = [
  { href: '/exposure', label: 'Q-Day' },
  { href: '/meter', label: 'Meter' },
  { href: '/doctor', label: 'Doctor' },
  { href: '/developers', label: 'Developers', wide: true }, // in the footer on small screens
  { href: '/account', label: 'Account' },
]

function ThemeIcon({ theme }: { theme: Theme }) {
  const d =
    theme === 'dark'
      ? 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'
      : theme === 'light'
        ? 'M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'
        : 'M4 5h16v11H4zM8 20h8M12 16v4'
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

export function Header() {
  const path = usePathname()
  const [theme, setTheme] = useState<Theme>('system')
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const t = document.documentElement.dataset.theme
    setTheme(t === 'light' || t === 'dark' ? t : 'system')
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
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
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
      <div
        className={`mx-auto flex w-full max-w-7xl items-center justify-between gap-2 rounded-2xl border px-3 py-2 transition-all duration-300 sm:px-4 ${
          scrolled ? 'border-line bg-[var(--glass)] shadow-[var(--shadow)] backdrop-blur-xl' : 'border-transparent'
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5 font-display text-[15px] font-semibold tracking-tight">
          <Logo />
          <span className="hidden min-[440px]:inline">QoreConnect</span>
          <span className="qw-chip hidden border border-warn/30 bg-warn-bg text-warn min-[400px]:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />
            <span className="hidden sm:inline">Diana </span>testnet
          </span>
        </Link>
        <nav className="flex items-center gap-0.5 text-[13px] sm:gap-1 sm:text-sm">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path === n.href || path.startsWith(n.href + '/') ? 'page' : undefined}
              className={`rounded-xl px-2 py-1.5 transition sm:px-3 ${n.wide ? 'hidden md:inline' : ''} ${path === n.href || path.startsWith(n.href + '/') ? 'bg-panel-2 font-medium text-fg' : 'text-muted hover:text-fg'}`}
            >
              {n.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={cycle}
            className="ml-1 grid h-8 w-8 place-items-center rounded-xl border border-line text-muted transition hover:text-fg"
            aria-label={`Theme: ${theme}. Change theme`}
            title={`Theme: ${theme === 'system' ? 'auto' : theme}`}
          >
            <ThemeIcon theme={theme} />
          </button>
          {path !== '/account' && (
            <Link
              href="/account"
              className="qw-btn qw-btn-primary ml-1.5 hidden !rounded-xl !px-3.5 !py-1.5 text-[13px] sm:inline-flex"
            >
              Open app
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
