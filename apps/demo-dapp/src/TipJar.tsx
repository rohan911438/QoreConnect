import { useEffect, useState } from 'react'
import { formatEther, parseEther } from 'viem'
import { useAccount, usePublicClient, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { CREATORS, EXPLORER, TIPJAR, short, tipJarAbi } from './contracts'
import { refusalOf } from './errors'

const PRESETS = ['0.05', '0.1', '0.25', '0.5'] as const
const fmt = (v?: bigint) => (v === undefined ? '…' : Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 4 }))

type TipLog = { from: string; creator: string; amount: bigint; note: string; block: bigint; tx: string }

function useRecentTips(refreshKey: unknown) {
  const client = usePublicClient()
  const [tips, setTips] = useState<TipLog[]>()
  useEffect(() => {
    if (!client) return
    let live = true
    ;(async () => {
      try {
        const head = await client.getBlockNumber()
        const logs = await client.getContractEvents({ address: TIPJAR, abi: tipJarAbi, eventName: 'Tipped', fromBlock: head > 9_000n ? head - 9_000n : 0n, toBlock: head })
        if (!live) return
        setTips(
          logs
            .map((l) => ({ from: l.args.from!, creator: l.args.creator!, amount: l.args.amount!, note: l.args.note ?? '', block: l.blockNumber, tx: l.transactionHash }))
            .reverse()
            .slice(0, 8),
        )
      } catch {
        if (live) setTips([])
      }
    })()
    return () => {
      live = false
    }
  }, [client, refreshKey])
  return tips
}

export function TipJar() {
  const { address, isConnected } = useAccount()
  const [creatorId, setCreatorId] = useState<string>(CREATORS[0].id)
  const [amount, setAmount] = useState<string>('0.1')
  const [note, setNote] = useState('')
  const creator = CREATORS.find((c) => c.id === creatorId)!

  const stats = useReadContracts({
    contracts: CREATORS.flatMap((c) => [
      { address: TIPJAR, abi: tipJarAbi, functionName: 'totalReceived', args: [c.address] } as const,
      { address: TIPJAR, abi: tipJarAbi, functionName: 'tipCount', args: [c.address] } as const,
    ]),
  })
  const total = useReadContract({ address: TIPJAR, abi: tipJarAbi, functionName: 'totalTipped' })
  const mine = useReadContract({ address: TIPJAR, abi: tipJarAbi, functionName: 'balanceOf', args: [address!], query: { enabled: !!address } })

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash, query: { enabled: !!hash } })
  const done = receipt.isSuccess
  const tips = useRecentTips(done ? hash : 'initial')
  useEffect(() => {
    if (done) {
      void stats.refetch()
      void total.refetch()
      void mine.refetch()
    }
  }, [done])

  let value: bigint | undefined
  try {
    value = parseEther(amount || '0')
  } catch {
    value = undefined
  }
  const noteBytes = new TextEncoder().encode(note).length
  const valid = !!value && value > 0n && noteBytes <= 140
  const refusal = error ? refusalOf(error) : undefined

  const send = () => {
    reset()
    writeContract({ address: TIPJAR, abi: tipJarAbi, functionName: 'tip', args: [creator.address, note.trim()], value })
  }
  const withdraw = () => {
    reset()
    writeContract({ address: TIPJAR, abi: tipJarAbi, functionName: 'withdraw' })
  }

  return (
    <>
      <section className="hero">
        <div>
          <h1>Tip the people building QoreChain.</h1>
          <p className="lead">Send QOR with MetaMask. No gas to buy, no new wallet to install. Your account is protected by a quantum-safe root key.</p>
        </div>
        <div className="stat">
          <span className="label">Tipped through this jar</span>
          <span className="big" data-testid="total-tipped">
            {fmt(total.data)} <small>QOR</small>
          </span>
          <a className="muted mono" href={`${EXPLORER}/address/${TIPJAR}`} target="_blank" rel="noreferrer">
            {short(TIPJAR, 8)}
          </a>
        </div>
      </section>

      <section className="grid">
        <div className="card" aria-labelledby="pick">
          <h2 id="pick">1. Pick a creator</h2>
          <ul className="creators" role="radiogroup" aria-label="Creator">
            {CREATORS.map((c, i) => (
              <li key={c.id}>
                <button
                  role="radio"
                  aria-checked={c.id === creatorId}
                  className={`creator ${c.id === creatorId ? 'on' : ''}`}
                  onClick={() => setCreatorId(c.id)}
                  style={{ ['--hue' as any]: c.hue }}
                >
                  <span className="avatar" aria-hidden="true">
                    {c.name
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <span className="cbody">
                    <strong>{c.name}</strong>
                    <span className="muted">{c.blurb}</span>
                    <span className="cstats">
                      {fmt(stats.data?.[i * 2]?.result as bigint | undefined)} QOR · {String((stats.data?.[i * 2 + 1]?.result as bigint | undefined) ?? '…')} tips
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card" aria-labelledby="send">
          <h2 id="send">2. Send a tip</h2>
          <fieldset className="presets">
            <legend>Amount (QOR)</legend>
            {PRESETS.map((p) => (
              <button key={p} className={`seg ${amount === p ? 'on' : ''}`} onClick={() => setAmount(p)} aria-pressed={amount === p}>
                {p}
              </button>
            ))}
            <input className="input amount" inputMode="decimal" aria-label="Custom amount in QOR" value={amount} onChange={(e) => setAmount(e.target.value.replace(',', '.'))} />
          </fieldset>
          <label className="field">
            <span>Note (optional)</span>
            <textarea className="input" rows={2} maxLength={140} value={note} placeholder="Thanks for the workshop!" onChange={(e) => setNote(e.target.value)} />
            <span className={`muted small ${noteBytes > 140 ? 'bad' : ''}`}>{noteBytes}/140</span>
          </label>
          <p className="muted small">
            Within your account limits (default 1 QOR per transaction, 5 QOR per day). You will see exactly what you sign before MetaMask opens.
          </p>
          {isConnected ? (
            <button className="btn primary wide" data-testid="send-tip" disabled={!valid || isPending || (!!hash && !done && !receipt.isError)} onClick={send}>
              {isPending ? 'Check the preview, then MetaMask…' : hash && !done && !receipt.isError ? 'Confirming on QoreChain…' : `Tip ${amount || '0'} QOR to ${creator.name}`}
            </button>
          ) : (
            <p className="banner">Connect to send a tip.</p>
          )}
          {hash && (
            <p className={`banner ${done ? 'ok' : ''}`} data-testid="tip-status">
              {done ? 'Tip confirmed. ' : 'Submitted. '}
              <a className="mono" href={`${EXPLORER}/tx/${hash.slice(2).toUpperCase()}`} target="_blank" rel="noreferrer">
                {short(hash, 10)}
              </a>
            </p>
          )}
          {refusal && !refusal.rejected && (
            <p className="banner bad" role="alert" data-testid="tip-error">
              {refusal.code ? <strong>{refusal.code.replace('_', ' ').toLowerCase()}: </strong> : null}
              {refusal.message}
            </p>
          )}
          {refusal?.rejected && <p className="banner">Cancelled. Nothing was signed.</p>}
          {!!mine.data && mine.data > 0n && (
            <div className="withdraw">
              <span>
                Tips waiting for you: <strong>{fmt(mine.data)} QOR</strong>
              </span>
              <button className="btn" onClick={withdraw} disabled={isPending}>
                Withdraw
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="recent">
        <h2 id="recent">Recent tips</h2>
        {tips === undefined ? (
          <p className="muted">Loading…</p>
        ) : tips.length === 0 ? (
          <p className="muted">No tips in the last few hours. Be the first.</p>
        ) : (
          <ul className="feed">
            {tips.map((t) => (
              <li key={t.tx + t.note}>
                <span className="mono">{short(t.from)}</span> tipped <strong>{fmt(t.amount)} QOR</strong> to{' '}
                {CREATORS.find((c) => c.address.toLowerCase() === t.creator.toLowerCase())?.name ?? <span className="mono">{short(t.creator)}</span>}
                {t.note && <q>{t.note}</q>}
                <a className="muted small mono" href={`${EXPLORER}/block/${t.block}`} target="_blank" rel="noreferrer">
                  block {String(t.block)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}


