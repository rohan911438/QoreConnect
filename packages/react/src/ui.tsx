import { useSyncExternalStore, type ReactNode } from 'react'
import {
  QoreConnectError,
  RootVault,
  WebAuthnPasskeyProvider,
  type Eip1193Provider,
  type Limits,
  type PreviewRequest,
  type QoreConnectHooks,
  type QoreNetwork,
  type RootSigner,
} from '@qoreconnect/core'
import { SigningPreview } from './preview/SigningPreview'
import { OnboardingModal } from './onboarding/OnboardingModal'
import { ApproveSheet } from './approve/ApproveSheet'
import { UnlockPrompt } from './unlock/UnlockPrompt'

type Pending =
  | { kind: 'preview'; req: PreviewRequest; resolve: (ok: boolean) => void }
  | {
      kind: 'onboarding'
      appName: string
      net: QoreNetwork
      vault: RootVault
      metamask: Eip1193Provider
      metamaskAddress: string
      relayerUrl: string
      contracts: string[]
      resolve: (root: RootSigner) => void
      reject: (e: unknown) => void
    }
  | { kind: 'approve'; appName: string; origin?: string; contracts: string[]; net: QoreNetwork; resolve: (ok: boolean) => void }
  | { kind: 'unlock'; reason?: string; error?: string; resolve: (password: string) => void; reject: (e: unknown) => void }

export interface QoreConnectUIOptions {
  /** Vault to unlock (default: this browser's IndexedDB vault, shared with the connector). */
  vault?: RootVault
  /** Show the onboarding stopwatch. */
  showTimer?: boolean
  /** Use a password instead of a passkey (browsers without PRF, automated tests). */
  forcePassword?: boolean
  passkeyName?: string
  limits?: Limits
  /** Override how the root is unlocked (headless tests, custom key storage). */
  unlockRoot?: () => Promise<RootSigner>
}

/**
 * UI bridge between the connector (created outside React, in the wagmi config) and React.
 * Pass `ui.hooks` to `qoreConnect({ ui: ui.hooks })` and render `<QoreConnectProvider ui={ui}>` once.
 */
export interface QoreConnectUI {
  hooks: QoreConnectHooks
  /** Unlock the root (reuses a recently unlocked signer). Used by dashboards too. */
  unlock(reason?: string): Promise<RootSigner>
  /** The root if it is unlocked right now (never prompts). */
  peek(): RootSigner | undefined
  /** @internal */
  subscribe(fn: () => void): () => void
  /** @internal */
  current(): Pending | undefined
  /** @internal */
  set(p: Pending | undefined): void
  readonly options: QoreConnectUIOptions
}

export function createQoreConnectUI(options: QoreConnectUIOptions & { extraHooks?: Omit<QoreConnectHooks, 'onPreview' | 'onNeedsOnboarding' | 'onNeedsApproval' | 'unlockRoot'> } = {}): QoreConnectUI {
  let pending: Pending | undefined
  let signer: RootSigner | undefined
  const listeners = new Set<() => void>()
  const vault = options.vault ?? new RootVault()
  const set = (p: Pending | undefined) => {
    pending = p
    listeners.forEach((l) => l())
  }
  /** Ask the user for something; a newer request supersedes (and cancels) an unanswered one. */
  const supersede = () => {
    const p = pending
    if (!p) return
    if (p.kind === 'preview' || p.kind === 'approve') p.resolve(false)
    else p.reject(new QoreConnectError('USER_REJECTED'))
  }

  const unlock = async (reason?: string): Promise<RootSigner> => {
    if (signer && !signer.locked) return signer
    if (options.unlockRoot) return (signer = await options.unlockRoot())
    const info = await vault.info()
    if (!info) throw new QoreConnectError('VAULT_NOT_FOUND')
    if (info.kdf === 'passkey-prf') {
      signer = await vault.unlock({ kind: 'passkey', passkey: new WebAuthnPasskeyProvider({ name: options.passkeyName ?? 'QoreConnect' }) })
      return signer
    }
    let error: string | undefined
    for (;;) {
      supersede()
      const password = await new Promise<string>((resolve, reject) => set({ kind: 'unlock', reason, error, resolve, reject }))
      try {
        signer = await vault.unlock({ kind: 'password', password })
        set(undefined)
        return signer
      } catch (e) {
        error = e instanceof QoreConnectError ? e.message : String(e)
      }
    }
  }

  return {
    options,
    unlock,
    peek: () => (signer && !signer.locked ? signer : undefined),
    hooks: {
      ...options.extraHooks,
      unlockRoot: () => unlock(),
      onPreview: (req) =>
        new Promise<boolean>((resolve) => {
          supersede()
          set({ kind: 'preview', req, resolve })
        }),
      onNeedsApproval: (ctx) =>
        new Promise<boolean>((resolve) => {
          supersede()
          set({ kind: 'approve', appName: ctx.appName, origin: ctx.origin, contracts: ctx.contracts, net: ctx.net, resolve })
        }),
      onNeedsOnboarding: async ({ metamaskAddress, provider }) => {
        const metamask = await provider.upstream()
        return new Promise<RootSigner>((resolve, reject) => {
          supersede()
          set({
            kind: 'onboarding',
            appName: provider.opts.appName,
            net: provider.net,
            vault: provider.vault,
            metamask,
            metamaskAddress,
            relayerUrl: provider.opts.relayerUrl,
            contracts: provider.opts.contracts,
            resolve: (root) => {
              signer = root
              resolve(root)
            },
            reject,
          })
        })
      },
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    current: () => pending,
    set,
  }
}

/** Renders QoreConnect's modals (onboarding, approval, unlock, signing preview) for the connector that uses `ui.hooks`. */
export function QoreConnectProvider({ ui, children }: { ui: QoreConnectUI; children?: ReactNode }) {
  const p = useSyncExternalStore(ui.subscribe, ui.current, ui.current)
  const close = () => ui.set(undefined)
  return (
    <>
      {children}
      {p?.kind === 'preview' && (
        <SigningPreview
          preview={p.req.preview}
          appName={p.req.appName}
          signerAddress={p.req.metamaskAddress}
          onConfirm={() => (close(), p.resolve(true))}
          onCancel={() => (close(), p.resolve(false))}
        />
      )}
      {p?.kind === 'approve' && (
        <ApproveSheet
          appName={p.appName}
          origin={p.origin}
          contracts={p.contracts}
          net={p.net}
          limits={ui.options.limits}
          onApprove={() => (close(), p.resolve(true))}
          onCancel={() => (close(), p.resolve(false))}
        />
      )}
      {p?.kind === 'onboarding' && (
        <OnboardingModal
          appName={p.appName}
          net={p.net}
          vault={p.vault}
          metamask={p.metamask}
          metamaskAddress={p.metamaskAddress}
          relayerUrl={p.relayerUrl}
          contracts={p.contracts}
          limits={ui.options.limits}
          showTimer={ui.options.showTimer}
          forcePassword={ui.options.forcePassword}
          passkeyName={ui.options.passkeyName}
          onDone={(root) => (close(), p.resolve(root))}
          onCancel={() => (close(), p.reject(new QoreConnectError('USER_REJECTED')))}
        />
      )}
      {p?.kind === 'unlock' && <UnlockPrompt reason={p.reason} error={p.error} onSubmit={(pw) => p.resolve(pw)} onCancel={() => (close(), p.reject(new QoreConnectError('USER_REJECTED')))} />}
    </>
  )
}
