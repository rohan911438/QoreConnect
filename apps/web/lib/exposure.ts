/** Server-side read of the relayer's Q-Day exposure report (packages/relayer/src/exposure.ts, docs/exposure.md). */
import { cache } from 'react'
import { RELAYER } from './meter'

export interface ExposureFinding {
  id: string
  severity: 'good' | 'warn' | 'bad' | 'info'
  title: string
  detail: string
  source?: string
}
export interface ExposureReport {
  account: string
  evmAddress: string
  status: 'protected' | 'capped' | 'claimable' | 'hidden' | 'empty'
  score?: number
  grade?: 'A' | 'B' | 'C' | 'D' | 'F'
  headline: string
  balanceUqor: string
  atRiskUqor: string
  atRiskPerDayUqor?: string
  pqcRegistered: boolean
  publicKeyExposed: boolean
  exposedBy: ('cosmos-tx' | 'evm-tx')[]
  classicalKeys: { active: number; withoutExpiry: number; latestExpiryUnix?: number }
  chainParams: { hybridSignatureMode: string; allowClassicalFallback: boolean; pqcPrimary: boolean }
  findings: ExposureFinding[]
  nextStep?: { kind: 'onboard' | 'set-rule' | 'set-expiry' | 'revoke' | 'none'; label: string }
  checkedAt: number
}

export const EXPOSURE_DOC = 'https://github.com/rohan911438/QoreConnect/blob/main/docs/exposure.md'
export const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a) || /^qor1[0-9a-z]{38,58}$/.test(a)

/**
 * Fetch a report; cached for 5 minutes per address. Returns an error message instead of throwing. Wrapped in React's
 * cache() so metadata, page and card share one request per render (a fetch with an abort signal is not memoized).
 */
export const getExposure = cache(async (address: string): Promise<{ report?: ExposureReport; error?: string }> => {
  if (!isAddress(address)) return { error: 'Enter a qor1… address or a 0x… address.' }
  try {
    const r = await fetch(`${RELAYER}/v1/exposure/${encodeURIComponent(address)}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(90_000), // a sleeping free-plan relayer can take about a minute to wake
    })
    const j = await r.json()
    if (!r.ok) return { error: j.error ?? `HTTP ${r.status}` }
    return { report: j as ExposureReport }
  } catch (e) {
    return { error: `The relayer did not answer: ${(e as Error).message}` }
  }
})

export function fmtQor(uqor: string | bigint): string {
  const u = BigInt(uqor)
  const whole = u / 1_000_000n
  const frac = (u % 1_000_000n).toString().padStart(6, '0').slice(0, 2).replace(/0+$/, '')
  return `${whole.toLocaleString('en-US')}${frac ? '.' + frac : ''} QOR`
}

export const GRADE_TONE: Record<string, { text: string; ring: string; hex: string }> = {
  A: { text: 'text-ok', ring: 'var(--ok)', hex: '#3fd0a0' },
  B: { text: 'text-ok', ring: 'var(--ok)', hex: '#7fd88f' },
  C: { text: 'text-warn', ring: 'var(--warn)', hex: '#f0b84a' },
  D: { text: 'text-bad', ring: 'var(--bad)', hex: '#f08a4a' },
  F: { text: 'text-bad', ring: 'var(--bad)', hex: '#f06a6a' },
}

export const STATUS_LABEL: Record<ExposureReport['status'], string> = {
  protected: 'Quantum-safe',
  capped: 'Quantum-safe root, capped classical keys',
  claimable: 'Claimable on Q-Day',
  hidden: 'Hidden until first transaction',
  empty: 'Unused address',
}

export const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-6)}`
