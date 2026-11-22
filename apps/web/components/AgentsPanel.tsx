'use client'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DEFAULT_AGENT_TTL_S,
  createAgent,
  explorerAddress,
  formatQor,
  listAgents,
  parseQor,
  reclaimAgentFunds,
  revokeAgent,
  type AgentView,
  type QoreNetwork,
  type RootSigner,
  type SignedInstruction,
} from '@qoreconnect/core'
import { TIPJAR_ADDRESS } from '../lib/qore'

type RootAction = (label: string, fn: (ctx: { root: RootSigner }) => Promise<ReactNode>) => Promise<void>

const hexToBytes = (h: string) => Uint8Array.from((h.startsWith('0x') ? h.slice(2) : h).match(/.{1,2}/g) ?? [], (b) => parseInt(b, 16))
const short = (a: string, n = 6) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-4)}` : a)
const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm'

/**
 * "Agents": each agent gets its own sub-account (never the main balance), a capped key scoped to exact contract
 * functions, and a root-signed instruction. Revoke stops it at the chain.
 */
export function AgentsPanel({ net, busy, rootAction, unlocked }: { net: QoreNetwork; busy: boolean; rootAction: RootAction; unlocked: () => RootSigner | undefined }) {
  const [agents, setAgents] = useState<AgentView[]>()
  const [open, setOpen] = useState(false)
  const [signed, setSigned] = useState<SignedInstruction>()
  const [agentUrl, setAgentUrl] = useState('http://localhost:8790')
  const [name, setName] = useState('tipper')
  const [task, setTask] = useState('Tip 0.1 QOR to 0x707B92f6276799f928CCe4D5873f5A2babF85347 with note "thanks from my agent"')
  const [target, setTarget] = useState(TIPJAR_ADDRESS)
  const [signature, setSignature] = useState('function tip(address creator, string note) payable')
  const [perTx, setPerTx] = useState('0.2')
  const [daily, setDaily] = useState('0.5')
  const [fund, setFund] = useState('0.7')
  const [hours, setHours] = useState('24')
  const [runResult, setRunResult] = useState<string>()
  const unlockedRef = useRef(unlocked)
  unlockedRef.current = unlocked

  const refresh = useCallback(async () => {
    const root = unlockedRef.current()
    if (!root || root.locked) return setAgents(undefined)
    setAgents(await listAgents({ net, root, maxIndex: 5 }).catch(() => []))
  }, [net])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const nextIndex = () => Math.max(0, ...(agents ?? []).map((a) => a.index)) + 1

  const create = () =>
    rootAction('Create an agent', async ({ root }) => {
      const base = agentUrl.replace(/\/$/, '')
      const index = (await listAgents({ net, root, maxIndex: 5 }).catch(() => [])).reduce((m, a) => Math.max(m, a.index), 0) + 1
      const sub = await root.deriveSubAccount(index)
      const proofRes = await fetch(`${base}/link-proof`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: sub.cosmos, root: root.qorAddress }) })
      if (!proofRes.ok) throw new Error(`The agent at ${base} did not answer (${proofRes.status}). Is it running?`)
      const p = await proofRes.json()
      const created = await createAgent({
        net,
        root,
        index,
        name: name.trim(),
        task: task.trim(),
        calls: [{ to: target.trim().toLowerCase(), signature: signature.trim() }],
        limits: { perTxUqor: parseQor(perTx), dailyUqor: parseQor(daily), denoms: ['uqor'] },
        fundUqor: parseQor(fund),
        expiryUnix: Math.floor(Date.now() / 1000) + Math.round(Number(hours) * 3600 || DEFAULT_AGENT_TTL_S),
        agentProof: { metamaskAddress: p.metamaskAddress, pubkey: hexToBytes(p.pubkey), possessionProof: hexToBytes(p.possessionProof) },
      })
      setSigned(created.signed)
      setOpen(false)
      await refresh()
      return `Agent "${name}" created on its own account ${short(created.account, 10)}, funded with ${fund} QOR. The instruction below is signed by your quantum-safe root.`
    })

  const sendToAgent = async () => {
    if (!signed) return
    setRunResult('Running…')
    try {
      const r = await fetch(`${agentUrl.replace(/\/$/, '')}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signed }) })
      const j = await r.json()
      setRunResult(j.ok ? j.steps.map((s: any) => `${s.call.summary}: ${s.outcome.status}${s.outcome.txHash ? ` (${short(s.outcome.txHash, 8)})` : ''}`).join('; ') || j.summary : `Rejected: ${j.rejected ?? j.error} ${j.detail ?? ''}`)
    } catch (e) {
      setRunResult(`Could not reach the agent: ${(e as Error).message}`)
    }
  }

  const download = () => {
    if (!signed) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(signed, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `instruction-${signed.instruction.name}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-panel p-5" aria-labelledby="agents">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="agents" className="text-lg font-semibold">
          Agents
        </h2>
        <div className="flex gap-2">
          {agents === undefined && (
            <button type="button" className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold" disabled={busy} onClick={() => rootAction('Show your agents', async () => (await refresh(), 'Agents loaded.'))}>
              Show agents
            </button>
          )}
          <button type="button" className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg" disabled={busy} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            New agent
          </button>
        </div>
      </div>
      <p className="text-sm text-muted">
        An AI agent gets its own account and budget, never your main balance. Its key can call only the functions you list, within its caps, until
        it expires. It acts only on instructions signed by your quantum-safe root.
      </p>

      {open && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Agent URL</span>
            <input className={input} value={agentUrl} onChange={(e) => setAgentUrl(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Name</span>
            <input className={input} value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Expires after (hours)</span>
            <input className={input} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">Task (signed by your root)</span>
            <textarea className={input} rows={2} value={task} required onChange={(e) => setTask(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Contract</span>
            <input className={`${input} font-mono`} value={target} pattern="^0x[0-9a-fA-F]{40}$" required onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Function</span>
            <input className={`${input} font-mono`} value={signature} required onChange={(e) => setSignature(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Per transaction (QOR)</span>
            <input className={input} inputMode="decimal" value={perTx} onChange={(e) => setPerTx(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Per day (QOR)</span>
            <input className={input} inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Budget moved to the agent (QOR)</span>
            <input className={input} inputMode="decimal" value={fund} onChange={(e) => setFund(e.target.value)} />
            <span className="text-xs text-muted">About 0.07 QOR of it pays the agent account's key registration.</span>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-fg" disabled={busy}>
              Create agent with passkey
            </button>
          </div>
        </form>
      )}

      {signed && (
        <div className="space-y-3 rounded-xl border border-line p-4" data-testid="agent-instruction">
          <p className="text-sm">
            <span className="rounded-full border border-ok px-2 py-0.5 text-xs font-semibold text-ok">Quantum-safe</span> Instruction for{' '}
            <span className="font-mono">{short(signed.instruction.agent)}</span>, signed with ML-DSA-87 ({signed.signature.length / 2} bytes).
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold" onClick={sendToAgent}>
              Send to agent and run
            </button>
            <button type="button" className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold" onClick={download}>
              Download instruction
            </button>
          </div>
          {runResult && <p className="break-words text-sm">{runResult}</p>}
        </div>
      )}

      {agents && agents.length === 0 && <p className="text-sm text-muted">No agents yet.</p>}
      {agents && agents.length > 0 && (
        <ul className="divide-y divide-line" data-testid="agent-list">
          {agents.map((a) => {
            const live = a.keys.filter((k) => !k.revoked && (k.expiryUnix === 0 || k.expiryUnix * 1000 > Date.now()))
            return (
              <li key={a.index} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-medium">
                    {a.keys[0]?.label.replace(/^agent:/, '') ?? `Agent ${a.index}`}{' '}
                    <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">Agent, capped</span>
                  </p>
                  <p className="text-muted">
                    Account{' '}
                    <a className="font-mono underline" href={explorerAddress(net, a.account)} target="_blank" rel="noreferrer">
                      {short(a.account, 10)}
                    </a>{' '}
                    · {formatQor(a.balanceUqor)} QOR ·{' '}
                    {live.length ? `key ${short('0x' + live[0]!.pubkeyHex)}, expires ${new Date(live[0]!.expiryUnix * 1000).toLocaleString()}` : 'no active key'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {live.length > 0 && (
                    <button
                      type="button"
                      className="rounded-lg bg-bad px-3.5 py-2 text-sm font-semibold text-white"
                      disabled={busy}
                      onClick={() =>
                        rootAction('Revoke this agent', async ({ root }) => {
                          await revokeAgent({ net, root, index: a.index })
                          await refresh()
                          return 'Agent revoked. The chain refuses its next action.'
                        })
                      }
                    >
                      Revoke
                    </button>
                  )}
                  {a.balanceUqor > 100_000n && (
                    <button
                      type="button"
                      className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold"
                      disabled={busy}
                      onClick={() =>
                        rootAction('Return the agent budget', async ({ root }) => {
                          const tx = await reclaimAgentFunds({ net, root, index: a.index })
                          await refresh()
                          return tx ? 'Budget returned to your main account.' : 'Nothing to return.'
                        })
                      }
                    >
                      Return budget
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted">Next agent uses sub-account #{nextIndex()}. Testnet only.</p>
    </section>
  )
}
