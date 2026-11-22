'use client'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  explorerAddress,
  explorerTx,
  formatUnits,
  prepareTokenRevoke,
  revokeCalldata,
  type QoreNetwork,
  type RootSigner,
} from '@qoreconnect/core'
import { RELAYER_URL, qore } from '../lib/qore'

type RootAction = (label: string, fn: (ctx: { root: RootSigner }) => Promise<ReactNode>) => Promise<void>

interface Approval {
  kind: 'erc20' | 'operator'
  token: string
  symbol?: string
  decimals?: number
  spender: string
  amount: string
  unlimited: boolean
  lastTx: string
}
interface Scan {
  approvals: Approval[]
  closed: number
  coverage: string
  checkedAt: number
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * Token approvals this account has granted, checked live. An allowance lets the SPENDER move tokens with transferFrom,
 * which QoreConnect's limits do not cover, so the panel offers a revoke (approve(spender, 0)) for each one.
 */
export function ApprovalsPanel({
  net,
  account,
  evmAddress,
  busy,
  rootAction,
}: {
  net: QoreNetwork
  account: string
  evmAddress: string
  busy: boolean
  rootAction: RootAction
}) {
  const [scan, setScan] = useState<Scan>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const r = await fetch(`${RELAYER_URL}/v1/approvals/${account}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setScan(j)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => {
    void load()
  }, [load])

  const revoke = (a: Approval) =>
    rootAction(`Revoke ${a.symbol ?? 'token'} approval`, async ({ root }) => {
      // Diana lets a linked key touch a token only if the rule lists it; add it first if needed (one root signature).
      await prepareTokenRevoke({ net, root, token: a.token })
      const hash = (await qore().provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: evmAddress, to: a.token, data: revokeCalldata(a) }],
      })) as string
      await load()
      return (
        <>
          Revoked: {short(a.spender)} can no longer move your {a.symbol ?? 'tokens'}.{' '}
          {hash && (
            <a className="underline" href={explorerTx(net, hash)} target="_blank" rel="noreferrer noopener">
              View transaction
            </a>
          )}
        </>
      )
    })

  return (
    <section className="qw-surface overflow-hidden" id="approvals" data-testid="approvals-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3.5">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">Token approvals</h2>
        <button
          type="button"
          className="text-sm text-muted hover:text-fg"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Scanning…' : 'Scan again'}
        </button>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-sm text-muted">
          An approval lets another contract move your tokens by itself. That transfer is signed by the spender, so your
          daily limit does not cover it: revoke the ones you no longer need. On Diana, MetaMask through QoreConnect
          cannot grant an unlimited approval at all, because the chain counts approvals against your limits.
        </p>
        {error && (
          <p role="alert" className="text-sm text-bad">
            Could not scan: {error}
          </p>
        )}
        {!scan && !error && <p className="text-sm text-muted">Scanning…</p>}
        {scan && scan.approvals.length === 0 && (
          <p className="text-sm" data-testid="no-approvals">
            No open approvals found.
            {scan.closed
              ? ` ${scan.closed} earlier approval${scan.closed === 1 ? ' was' : 's were'} already revoked or used up.`
              : ''}
          </p>
        )}
        {scan && scan.approvals.length > 0 && (
          <ul className="divide-y divide-line" data-testid="approval-list">
            {scan.approvals.map((a) => (
              <li
                key={`${a.kind}:${a.token}:${a.spender}`}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{a.symbol ?? short(a.token)}</strong>
                    <span
                      className={`qw-chip border ${a.unlimited ? 'border-bad/30 bg-bad-bg text-bad' : 'border-warn/30 bg-warn-bg text-warn'}`}
                    >
                      {a.kind === 'operator'
                        ? 'All tokens (operator)'
                        : a.unlimited
                          ? 'Unlimited'
                          : `${formatUnits(BigInt(a.amount), a.decimals ?? 18)} ${a.symbol ?? ''}`.trim()}
                    </span>
                  </div>
                  <div className="text-muted">
                    Spender{' '}
                    <a
                      className="font-mono underline decoration-line underline-offset-2 hover:text-fg"
                      href={explorerAddress(net, a.spender)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {short(a.spender)}
                    </a>{' '}
                    · token <span className="font-mono">{short(a.token)}</span>
                  </div>
                </div>
                {a.kind === 'erc20' ? (
                  <button
                    type="button"
                    className="qw-btn qw-btn-danger shrink-0"
                    disabled={busy}
                    onClick={() => void revoke(a)}
                    data-testid="revoke-approval"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-muted">Revoke from the app that asked for it</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {scan && <p className="text-xs leading-relaxed text-muted">{scan.coverage}</p>}
      </div>
    </section>
  )
}
