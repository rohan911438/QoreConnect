'use client'
import { DIANA, QoreConnectProvider, RootVault, type QoreNetwork } from '@qoreconnect/core'
import { createQoreConnectUI, type QoreConnectUI } from '@qoreconnect/react'

export const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL ?? 'http://localhost:8787'
export const GAS_TANK = process.env.NEXT_PUBLIC_GAS_TANK ?? 'demo-dapp'
/** Contracts the QoreConnect app itself approves at onboarding (the demo dApp's contracts). */
export const DEFAULT_CONTRACTS = (process.env.NEXT_PUBLIC_DEFAULT_CONTRACTS ?? '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
/** Known contract names for readable lists. */
export const CONTRACT_NAMES: Record<string, string> = { '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74': 'Demo Counter (Quantum Tip Jar)' }
/** Prompt to save the recovery code once the balance passes this (uqor). */
export const RECOVERY_PROMPT_UQOR = 1_000_000n

let singleton: { net: QoreNetwork; vault: RootVault; ui: QoreConnectUI; provider: QoreConnectProvider } | undefined

/** Browser-only: REST goes through the same-origin proxy (QoreChain REST has no CORS); EVM RPC is called directly. */
export function qore() {
  if (singleton) return singleton
  const params = new URLSearchParams(globalThis.location?.search ?? '')
  const net: QoreNetwork = { ...DIANA, rest: `${globalThis.location?.origin ?? ''}/api/qore` }
  const vault = new RootVault()
  const ui = createQoreConnectUI({
    vault,
    showTimer: process.env.NODE_ENV !== 'production' || params.has('timer'),
    forcePassword: params.get('protect') === 'password',
  })
  const provider = new QoreConnectProvider({ appName: 'QoreConnect', contracts: DEFAULT_CONTRACTS, relayerUrl: RELAYER_URL, gasTankId: GAS_TANK, net, vault, hooks: ui.hooks })
  singleton = { net, vault, ui, provider }
  return singleton
}
