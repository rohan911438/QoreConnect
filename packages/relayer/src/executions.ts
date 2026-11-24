/**
 * Approvals granted through QoreConnect on ANY relayer, rebuilt from the chain itself.
 *
 * Diana does not publish logs of EVM calls run through MsgExecuteEVM to eth_getLogs (verified 22 Nov 2026), and no tx
 * event names the account (only the relayer that paid). But the Cosmos tx search lists every MsgExecuteEVM
 * (`query=message.action='/qorechain.abstractaccount.v1.MsgExecuteEVM'`, newest first; 539 txs on 22 Nov 2026), and each
 * message carries the account, the target contract and the calldata. This index reads them all once, then only new
 * ones, and keeps every approve / setApprovalForAll it finds. After a restart it is rebuilt from the chain, so nothing
 * is lost. The scanner checks every entry against the live allowance, so failed or revoked approvals drop out.
 */
import { qorToEvm } from '@qorechain/sdk'
import { approvalInCalldata, type ApprovalKind } from '@rohankumar4179/core'

export const EXECUTE_EVM_QUERY = "message.action='/qorechain.abstractaccount.v1.MsgExecuteEVM'"
export const SEARCH_PAGE = 100

export interface ExecuteEvmTx {
  txhash: string
  height: number
  msgs: { account: string; to: string; data: string }[]
}
export interface ExecuteEvmPage {
  total: number
  txs: ExecuteEvmTx[]
}
export type PageSource = (page: number, limit: number) => Promise<ExecuteEvmPage>

export interface KnownApproval {
  token: string
  spender: string
  kind: ApprovalKind
  txHash: string | null
}

/** The page reaches blocks the node no longer keeps; history is readable from `lowestHeight` on. */
export class PrunedHistoryError extends Error {
  constructor(readonly lowestHeight: number) {
    super(`tx history before block ${lowestHeight} is pruned`)
  }
}

/** Base64 (as the REST API returns it) or 0x-hex calldata → lower-case 0x hex. */
export function calldataHex(data: string): string {
  if (!data) return '0x'
  if (/^0x[0-9a-fA-F]*$/.test(data)) return data.toLowerCase()
  return '0x' + Buffer.from(data, 'base64').toString('hex')
}

/** Default page source: the Cosmos REST tx search, newest first, with a timeout. */
export function restPages(rest: string, fetchImpl: typeof fetch = fetch, timeoutMs = 60_000): PageSource {
  return async (page, limit) => {
    const u = `${rest}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(EXECUTE_EVM_QUERY)}&order_by=2&limit=${limit}&page=${page}`
    const r = await fetchImpl(u, { signal: AbortSignal.timeout(timeoutMs) })
    const j: any = await r.json().catch(() => ({}))
    // Diana's node prunes old blocks: a page that reaches them fails with "lowest height is N" (8,790,799 = 25 Oct 2026
    // on 22 Nov 2026).
    const pruned = /lowest height is (\d+)/.exec(String(j.message ?? ''))
    if (pruned) throw new PrunedHistoryError(Number(pruned[1]))
    if (!r.ok) throw new Error(`tx search HTTP ${r.status}`)
    const txs: ExecuteEvmTx[] = (j.tx_responses ?? []).map((t: any, i: number) => ({
      txhash: String(t.txhash),
      height: Number(t.height),
      msgs: ((j.txs?.[i] ?? t.tx)?.body?.messages ?? [])
        .filter((m: any) => String(m['@type']).endsWith('.MsgExecuteEVM'))
        .map((m: any) => ({ account: String(m.account), to: String(m.to), data: String(m.data ?? '') })),
    }))
    return { total: Number(j.total ?? j.pagination?.total ?? 0), txs }
  }
}

export class RelayedApprovalIndex {
  private readonly seen = new Set<string>()
  private readonly byOwner = new Map<string, Map<string, KnownApproval>>()
  private complete = false
  private inFlight?: Promise<void>
  private lastOk = 0
  /** First block whose transactions the node still keeps (0 = full history readable). */
  historyFrom = 0

  constructor(
    private readonly pages: PageSource,
    private readonly opts: { minIntervalMs?: number; concurrency?: number; now?: () => number } = {},
  ) {}

  /** True once every MsgExecuteEVM on the chain has been read at least once. */
  get ready() {
    return this.complete
  }

  /** Returns false if the tx was already indexed. */
  private add(tx: ExecuteEvmTx): boolean {
    if (this.seen.has(tx.txhash)) return false
    this.seen.add(tx.txhash)
    for (const m of tx.msgs) {
      const a = approvalInCalldata(calldataHex(m.data))
      if (!a) continue
      let owner: string
      try {
        owner = qorToEvm(m.account).toLowerCase()
      } catch {
        continue
      }
      const token = m.to.toLowerCase()
      const key = `${a.kind}:${token}:${a.spender}`
      const map = this.byOwner.get(owner) ?? new Map<string, KnownApproval>()
      // Pages are newest first, but the first build reads pages in parallel: keep the highest block per key.
      const prev = map.get(key) as (KnownApproval & { height?: number }) | undefined
      if (!prev || (prev.height ?? 0) < tx.height)
        map.set(key, { token, spender: a.spender, kind: a.kind, txHash: tx.txhash, height: tx.height } as KnownApproval)
      this.byOwner.set(owner, map)
    }
    return true
  }

  /** One page of 100 (see readSpan for pages that reach pruned blocks). */
  private async readPage(p: number): Promise<ExecuteEvmPage> {
    const r = await this.readSpan(p, SEARCH_PAGE)
    return { total: r.total, txs: r.txs }
  }

  /**
   * Page `p` of size `size`. If it reaches pruned blocks, note where history starts and read the same range again in
   * pages ten times smaller (100 → 10 → 1), up to the boundary, so no readable transaction is lost. `stop` = the
   * boundary was reached inside this span.
   */
  private async readSpan(p: number, size: number): Promise<ExecuteEvmPage & { stop: boolean }> {
    try {
      return { ...(await this.pages(p, size)), stop: false }
    } catch (e) {
      if (!(e instanceof PrunedHistoryError)) throw e
      this.historyFrom = Math.max(this.historyFrom, e.lowestHeight)
      if (size === 1) return { total: 0, txs: [], stop: true }
      const sub = Math.max(1, Math.floor(size / 10))
      const per = size / sub
      const txs: ExecuteEvmTx[] = []
      for (let q = (p - 1) * per + 1; q <= p * per; q++) {
        const r = await this.readSpan(q, sub)
        txs.push(...r.txs)
        if (r.stop || r.txs.length < sub) break
      }
      return { total: 0, txs, stop: true }
    }
  }

  private async run() {
    const first = await this.readPage(1)
    let sawKnown = false
    for (const t of first.txs) if (!this.add(t)) sawKnown = true
    const pages = Math.ceil(first.total / SEARCH_PAGE)
    if (this.complete) {
      // Incremental: older pages only until a tx we already have (everything older than it is indexed).
      if (sawKnown) return
      for (let p = 2; p <= pages; p++) {
        const r = await this.readPage(p)
        let known = false
        for (const t of r.txs) if (!this.add(t)) known = true
        if (known || !r.txs.length) return
      }
      return
    }
    // First build: every page, a few at a time. New txs arriving meanwhile only shift items to later pages
    // (duplicates, skipped), never past what we read.
    const todo = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2)
    const n = this.opts.concurrency ?? 3
    await Promise.all(
      Array.from({ length: Math.min(n, todo.length) }, async () => {
        for (let p = todo.shift(); p !== undefined; p = todo.shift()) {
          for (const t of (await this.readPage(p)).txs) this.add(t)
        }
      }),
    )
    this.complete = true
  }

  /** Read new MsgExecuteEVM txs. Concurrent callers share one run; at most one run per `minIntervalMs` once built. */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight
    const now = this.opts.now?.() ?? Date.now()
    if (this.complete && now - this.lastOk < (this.opts.minIntervalMs ?? 10_000)) return Promise.resolve()
    this.inFlight = this.run()
      .then(() => {
        this.lastOk = this.opts.now?.() ?? Date.now()
      })
      .finally(() => {
        this.inFlight = undefined
      })
    return this.inFlight
  }

  known(owner: string): KnownApproval[] {
    return [...(this.byOwner.get(owner.toLowerCase())?.values() ?? [])].map(({ token, spender, kind, txHash }) => ({
      token,
      spender,
      kind,
      txHash,
    }))
  }
}
