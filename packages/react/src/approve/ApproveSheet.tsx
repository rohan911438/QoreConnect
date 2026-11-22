import { useEffect, useRef, useState } from 'react'
import { explorerAddress, formatQor, type Limits, type QoreNetwork } from '@qoreconnect/core'
import { Modal } from '../Modal'

export interface ApproveSheetProps {
  appName: string
  origin?: string
  /** "0xTarget" or "0xTarget/0xSelector" */
  contracts: string[]
  net: QoreNetwork
  /** Current limits (unchanged by this approval). */
  limits?: Limits
  /** Resolves once approved on chain; a rejection is shown with Retry. */
  onApprove: () => Promise<void> | void
  onCancel: () => void
  /** Does `address` hold contract code? Defaults to eth_getCode on `net.evmRpc`; injectable for tests. */
  hasCode?: (address: string) => Promise<boolean>
}

type CodeState = 'checking' | 'contract' | 'empty' | 'unknown'

async function rpcHasCode(net: QoreNetwork, address: string): Promise<boolean> {
  const r = await fetch(net.evmRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getCode', params: [address, 'latest'] }),
  })
  const j = (await r.json()) as { result?: unknown }
  if (typeof j.result !== 'string') throw new Error('no result')
  return j.result !== '0x' && j.result !== '0x0'
}

/**
 * Flow C: "Approve <dApp> to use your account?" Contracts shown in full; limits unchanged; one passkey tap.
 * T4: every address is checked for contract code; an address without code gets a blocking-style warning, and the sheet
 * states plainly that QoreConnect does not verify what contract code does.
 */
export function ApproveSheet(p: ApproveSheetProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const primary = useRef<HTMLButtonElement>(null)
  const [code, setCode] = useState<Record<string, CodeState>>({})
  const addrKey = [...new Set(p.contracts.map((c) => c.split('/')[0]!.toLowerCase()))].join(',')
  const { hasCode, net } = p
  useEffect(() => {
    let live = true
    const addrs = addrKey ? addrKey.split(',') : []
    const check = hasCode ?? ((a: string) => rpcHasCode(net, a))
    setCode(Object.fromEntries(addrs.map((a) => [a, 'checking' as CodeState])))
    for (const a of addrs)
      check(a).then(
        (has) => live && setCode((s) => ({ ...s, [a]: has ? 'contract' : 'empty' })),
        () => live && setCode((s) => ({ ...s, [a]: 'unknown' })),
      )
    return () => {
      live = false
    }
  }, [addrKey, hasCode, net])
  const empty = Object.values(code).filter((v) => v === 'empty').length

  const approve = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await p.onApprove()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return (
    <Modal
      testId="qc-approve"
      eyebrow="New dApp"
      title={`Approve ${p.appName} to use your account?`}
      description="MetaMask will be able to call these contracts for your account, within your existing limits."
      onClose={busy ? undefined : p.onCancel}
      initialFocus={primary}
      actions={
        <>
          <button type="button" className="qc-btn qc-secondary" onClick={p.onCancel} disabled={busy}>
            Cancel
          </button>
          <button ref={primary} type="button" className="qc-btn qc-primary" onClick={approve} disabled={busy}>
            {busy ? 'Approving…' : 'Approve with passkey'}
          </button>
        </>
      }
    >
      <dl className="qc-rows">
        {p.origin && (
          <div>
            <dt>Website</dt>
            <dd className="qc-mono qc-break">{p.origin}</dd>
          </div>
        )}
        <div>
          <dt>Contracts</dt>
          <dd>
            <ul className="qc-args">
              {p.contracts.map((c) => {
                const [addr, sel] = c.split('/')
                const st = code[addr!.toLowerCase()]
                return (
                  <li key={c}>
                    <a className="qc-mono qc-break" href={explorerAddress(p.net, addr!)} target="_blank" rel="noreferrer noopener">
                      {addr}
                    </a>
                    {sel && <span className="qc-muted"> only function {sel}</span>}
                    {st === 'empty' && <span className="qc-warn-chip">No contract code</span>}
                    {st === 'unknown' && <span className="qc-muted"> (code check unavailable)</span>}
                  </li>
                )
              })}
            </ul>
          </dd>
        </div>
        <div>
          <dt>Limits</dt>
          <dd>{p.limits ? `Unchanged: ${formatQor(p.limits.perTxUqor)} QOR per transaction, ${formatQor(p.limits.dailyUqor)} QOR per day` : 'Unchanged'}</dd>
        </div>
      </dl>
      {empty > 0 && (
        <p role="alert" className="qc-error" data-testid="qc-approve-nocode">
          {empty === 1 ? 'One address has' : `${empty} addresses have`} no contract code on chain. A dApp has no reason to ask for this. Do not
          approve unless you know why.
        </p>
      )}
      <p className="qc-help">
        QoreConnect does not verify what a contract&apos;s code does. Check the addresses and approve only contracts from a site you trust. Caps
        still apply even if a contract misbehaves, and you can remove this dApp at any time.
      </p>
      {error && (
        <p role="alert" className="qc-error">
          {error}
        </p>
      )}
    </Modal>
  )
}
