'use client'
import { DIANA, QoreConnectProvider, RootVault, type QoreNetwork } from '@rohankumar4179/core'
import { createQoreConnectUI, type QoreConnectUI } from '@rohankumar4179/react'

export const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL ?? 'http://localhost:8787'
export const GAS_TANK = process.env.NEXT_PUBLIC_GAS_TANK ?? 'demo-dapp'
/** Contracts the QoreConnect app itself approves at onboarding (the demo dApp's contracts). */
export const DEFAULT_CONTRACTS = (process.env.NEXT_PUBLIC_DEFAULT_CONTRACTS ?? '0x42653b89eff2a993cf2767fedef783366f53aea4')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
/** Known contract names for readable lists. */
/** QoreTipJar on Diana (P10). */
export const TIPJAR_ADDRESS = '0x42653b89eff2a993cf2767fedef783366f53aea4'
export const CONTRACT_NAMES: Record<string, string> = {
  [TIPJAR_ADDRESS]: 'Quantum Tip Jar',
  '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74': 'Demo Counter (P01 spike)',
}
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
