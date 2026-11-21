import type { QoreNetwork } from './config'
import type { FetchLike } from './chain/http'
import { onboardRoot, type Eip1193Provider, type LinkProof, type OnboardEvent } from './onboard'
import { getSessionState, linkSessionKey, signLinkProof } from './account/session'
import type { Limits } from './account/rules'
import type { RootSigner } from './vault/signer'
import type { Protection, RootVault } from './vault/vault'

export type FlowEvent =
  | { step: 'creating' }
  | { step: 'created'; qorAddress: string; evmAddress: string }
  | { step: 'signing' }
  | { step: 'signed' }
  | OnboardEvent
  | { step: 'linking' }
  | { step: 'linked'; txHash?: string; alreadyLinked: boolean }
  | { step: 'done'; ms: number }

export interface OnboardAndLinkOptions {
  net: QoreNetwork
  vault: RootVault
  /** An unlocked root (retry / existing vault), or `protection` to create one. */
  root?: RootSigner
  protection?: Protection
  metamask: Eip1193Provider
  metamaskAddress?: string
  relayerUrl: string
  contracts: string[]
  limits?: Limits
  fetch?: FetchLike
  /** Reuse a proof from an earlier attempt (retry without asking MetaMask again). */
  linkProof?: LinkProof
  onEvent?: (e: FlowEvent) => void
  timeoutMs?: number
}

export interface OnboardAndLinkResult {
  root: RootSigner
  linkProof: LinkProof
  sponsorTx?: string
  registerTx?: string
  linkTx?: string
  ms: number
}

/**
 * Flow A in one call: create the root (passkey) → ONE MetaMask signature (link possession proof) → sponsor (authorised
 * by that proof) → register ML-DSA-87 → link MetaMask as a capped session key for `contracts`.
 * Idempotent: every step is skipped when already done, so a failed attempt can simply be retried.
 */
export async function onboardAndLink(o: OnboardAndLinkOptions): Promise<OnboardAndLinkResult> {
  const t0 = Date.now()
  const emit = o.onEvent ?? (() => {})
  let root = o.root
  if (!root) {
    if (!o.protection) throw new Error('root or protection is required')
    emit({ step: 'creating' })
    root = await o.vault.create(o.protection)
  }
  emit({ step: 'created', qorAddress: root.qorAddress, evmAddress: root.evmAddress })

  let proof = o.linkProof
  if (!proof) {
    emit({ step: 'signing' })
    proof = await signLinkProof(o.net, root.qorAddress, o.metamask, o.metamaskAddress)
    emit({ step: 'signed' })
  }

  const ob = await onboardRoot({
    net: o.net,
    root,
    relayerUrl: o.relayerUrl,
    linkProof: proof,
    fetch: o.fetch,
    onEvent: emit,
    timeoutMs: o.timeoutMs,
  })

  emit({ step: 'linking' })
  const state = await getSessionState({ net: o.net, fetch: o.fetch }, root.qorAddress)
  const mm = proof.metamaskAddress.slice(2).toLowerCase()
  const already = state.keys.some((k) => k.active && k.pubkeyHex.toLowerCase() === mm)
  let linkTx: string | undefined
  if (!already) {
    const r = await linkSessionKey({
      net: o.net,
      root,
      fetch: o.fetch,
      contracts: o.contracts,
      limits: o.limits,
      proof,
    })
    linkTx = r.tx?.transactionHash
  }
  emit({ step: 'linked', txHash: linkTx, alreadyLinked: already })
  const ms = Date.now() - t0
  emit({ step: 'done', ms })
  return { root, linkProof: proof, sponsorTx: ob.sponsorTx, registerTx: ob.registerTx, linkTx, ms }
}
