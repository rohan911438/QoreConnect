import { useSyncExternalStore, type ReactNode } from 'react'
import type { PreviewRequest, QoreConnectHooks } from '@qoreconnect/core'
import { SigningPreview } from './preview/SigningPreview'

type Pending = { kind: 'preview'; req: PreviewRequest; resolve: (ok: boolean) => void }

/**
 * UI bridge between the connector (created outside React, in the wagmi config) and React.
 * Pass `ui.hooks` to `qoreConnect({ ui: ui.hooks })` and render `<QoreConnectProvider ui={ui}>` once.
 */
export interface QoreConnectUI {
  hooks: QoreConnectHooks
  /** @internal */
  subscribe(fn: () => void): () => void
  /** @internal */
  current(): Pending | undefined
  /** @internal */
  settle(ok: boolean): void
}

export function createQoreConnectUI(extra: Omit<QoreConnectHooks, 'onPreview'> = {}): QoreConnectUI {
  let pending: Pending | undefined
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  return {
    hooks: {
      ...extra,
      onPreview: (req) =>
        new Promise<boolean>((resolve) => {
          pending?.resolve(false) // a newer request supersedes an unanswered one
          pending = { kind: 'preview', req, resolve }
          notify()
        }),
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    current: () => pending,
    settle(ok) {
      const p = pending
      pending = undefined
      notify()
      p?.resolve(ok)
    },
  }
}

/** Renders QoreConnect's modals (signing preview) for the connector that uses `ui.hooks`. */
export function QoreConnectProvider({ ui, children }: { ui: QoreConnectUI; children?: ReactNode }) {
  const pending = useSyncExternalStore(ui.subscribe, ui.current, ui.current)
  return (
    <>
      {children}
      {pending?.kind === 'preview' && (
        <SigningPreview
          preview={pending.req.preview}
          appName={pending.req.appName}
          signerAddress={pending.req.metamaskAddress}
          onConfirm={() => ui.settle(true)}
          onCancel={() => ui.settle(false)}
        />
      )}
    </>
  )
}
