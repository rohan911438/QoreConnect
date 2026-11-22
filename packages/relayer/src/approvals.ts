/**
 * Approval scanner: token allowances and operator approvals an address has granted on Diana's EVM, checked against the
 * live state. Read-only.
 *
 * Why it matters: an allowance lets the SPENDER pull tokens with transferFrom. That call is signed by the spender, not
 * by this account, so QoreConnect's per-transaction and daily caps do not limit it. Revoking (approve(spender, 0)) is
 * the only way to close it.
 *
 * Coverage (stated in every result): Diana's EVM RPC answers eth_getLogs for at most 10,000 blocks per query (measured
 * 22 Nov 2026) and there is no indexer API, so the scan starts at `fromBlock` (default: about 1 Nov 2026) and is cached
 * per owner and extended incrementally. ERC-721 single-token approvals are not listed (only ERC-20 allowances and
 * setApprovalForAll operators).
 */

import type { ApprovalKind } from '@qoreconnect/core'

/** keccak256("Approval(address,address,uint256)") */
export const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
/** keccak256("ApprovalForAll(address,address,bool)") */
export const APPROVAL_FOR_ALL_TOPIC = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31'
/** Diana EVM: max [from, to] distance for eth_getLogs. */
export const MAX_LOG_RANGE = 10_000
/** First block scanned by default: about 1 Nov 2026 (block 9,437,184 had timestamp 31 Oct 2026; ~1.46 s per block). */
export const DEFAULT_FROM_BLOCK = 9_250_000
/** At or above this an allowance is reported as unlimited (2^255; wallets commonly approve 2^256 − 1). */
const UNLIMITED = 1n << 255n

export interface EvmRpc {
  call<T = any>(method: string, params: unknown[]): Promise<T>
}

export interface Approval {
  kind: ApprovalKind
  token: string
  symbol?: string
  decimals?: number
  spender: string
  /** ERC-20: current allowance in base units. Operator: "1". */
  amount: string
  unlimited: boolean
  lastBlock: number
  lastTx: string
}

export interface ApprovalScan {
  owner: string
  approvals: Approval[]
  /** Approvals found in the logs that are no longer active (revoked or used up). */
  closed: number
  scannedFrom: number
  scannedTo: number
  coverage: string
  checkedAt: number
}

interface Candidate {
  kind: Approval['kind']
  token: string
  spender: string
  lastBlock: number
  lastTx: string
}

const hex = (n: number) => '0x' + n.toString(16)
const topicAddr = (a: string) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0')
const addrFromTopic = (t: string) => '0x' + t.slice(-40).toLowerCase()
const word = (a: string) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0')

/** Plain JSON-RPC over fetch, with a timeout. */
export function jsonRpc(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 20_000): EvmRpc {
  let id = 0
  return {
    async call(method, params) {
      const r = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      const j: any = await r.json()
      if (j.error) throw new Error(`${method}: ${j.error.message ?? JSON.stringify(j.error)}`)
      return j.result
    },
  }
}

/** Decode an ABI-encoded `string` return (or a bytes32 symbol, as some old tokens use). */
export function decodeString(ret: string): string | undefined {
  const h = ret?.replace(/^0x/, '') ?? ''
  if (h.length < 64) return undefined
  try {
    if (h.length >= 128) {
      const len = Number.parseInt(h.slice(64, 128), 16)
      if (len > 0 && len <= 64) return Buffer.from(h.slice(128, 128 + len * 2), 'hex').toString('utf8')
    }
    const s = Buffer.from(h.slice(0, 64), 'hex').toString('utf8').replace(/\0+$/, '')
    return s || undefined
  } catch {
    return undefined
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k]!)
      }
    }),
  )
  return out
}

export class ApprovalScanner {
  private readonly cache = new Map<
    string,
    { to: number; candidates: Map<string, Candidate>; tokenInfo: Map<string, { symbol?: string; decimals?: number }> }
  >()

  constructor(
    private readonly rpc: EvmRpc,
    private readonly opts: {
      fromBlock?: number
      concurrency?: number
      now?: () => number
      /** Approvals known from relayed calls (their logs are not in eth_getLogs). */
      known?: (owner: string) => { token: string; spender: string; kind: Approval['kind']; txHash: string | null }[]
    } = {},
  ) {}

  private async logs(owner: string, from: number, to: number): Promise<any[]> {
    const ranges: [number, number][] = []
    for (let a = from; a <= to; a += MAX_LOG_RANGE) ranges.push([a, Math.min(a + MAX_LOG_RANGE - 1, to)])
    const chunks = await pool(ranges, this.opts.concurrency ?? 6, async ([a, b]) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.rpc.call<any[]>('eth_getLogs', [
            {
              fromBlock: hex(a),
              toBlock: hex(b),
              topics: [[APPROVAL_TOPIC, APPROVAL_FOR_ALL_TOPIC], topicAddr(owner)],
            },
          ])
        } catch (e) {
          if (attempt >= 2) throw e
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
        }
      }
    })
    return chunks.flat()
  }

  /** Scan (incrementally) and verify every candidate against the current chain state. */
  async scan(ownerInput: string): Promise<ApprovalScan> {
    const owner = ownerInput.toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(owner)) throw new Error('owner must be a 0x address')
    const latest = Number.parseInt(await this.rpc.call<string>('eth_blockNumber', []), 16)
    const fromBlock = this.opts.fromBlock ?? DEFAULT_FROM_BLOCK
    let entry = this.cache.get(owner)
    if (!entry) {
      entry = { to: fromBlock - 1, candidates: new Map(), tokenInfo: new Map() }
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!) // bounded: oldest owner first
      this.cache.set(owner, entry)
    }
    if (latest > entry.to) {
      for (const l of await this.logs(owner, entry.to + 1, latest)) {
        const t = (l.topics ?? []) as string[]
        const isErc20 = t[0] === APPROVAL_TOPIC && t.length === 3
        const isOperator = t[0] === APPROVAL_FOR_ALL_TOPIC && t.length === 3
        if (!isErc20 && !isOperator) continue // ERC-721 single-token Approval has 4 topics: not listed
        const c: Candidate = {
          kind: isErc20 ? 'erc20' : 'operator',
          token: String(l.address).toLowerCase(),
          spender: addrFromTopic(t[2]!),
          lastBlock: Number.parseInt(l.blockNumber, 16),
          lastTx: l.transactionHash,
        }
        const key = `${c.kind}:${c.token}:${c.spender}`
        const prev = entry.candidates.get(key)
        if (!prev || prev.lastBlock <= c.lastBlock) entry.candidates.set(key, c)
      }
      entry.to = latest
    }

    for (const k of this.opts.known?.(owner) ?? []) {
      const key = `${k.kind}:${k.token}:${k.spender}`
      if (!entry.candidates.has(key))
        entry.candidates.set(key, {
          kind: k.kind,
          token: k.token,
          spender: k.spender,
          lastBlock: 0,
          lastTx: k.txHash ?? '',
        })
    }
    const checked = await pool([...entry.candidates.values()], this.opts.concurrency ?? 6, async (c) => {
      const data =
        c.kind === 'erc20' ? `0xdd62ed3e${word(owner)}${word(c.spender)}` : `0xe985e9c5${word(owner)}${word(c.spender)}`
      const ret = await this.rpc.call<string>('eth_call', [{ to: c.token, data }, 'latest']).catch(() => '0x')
      const value = ret && ret !== '0x' ? BigInt(ret.slice(0, 66)) : 0n
      if (value === 0n) return undefined
      let info = entry!.tokenInfo.get(c.token)
      if (!info) {
        const [sym, dec] = await Promise.all([
          this.rpc.call<string>('eth_call', [{ to: c.token, data: '0x95d89b41' }, 'latest']).catch(() => '0x'),
          c.kind === 'erc20'
            ? this.rpc.call<string>('eth_call', [{ to: c.token, data: '0x313ce567' }, 'latest']).catch(() => '0x')
            : '0x',
        ])
        info = {
          symbol: decodeString(sym),
          decimals: dec && dec.length >= 66 ? Number(BigInt(dec.slice(0, 66))) : undefined,
        }
        entry!.tokenInfo.set(c.token, info)
      }
      const a: Approval = {
        kind: c.kind,
        token: c.token,
        symbol: info.symbol,
        decimals: info.decimals,
        spender: c.spender,
        amount: c.kind === 'erc20' ? value.toString() : '1',
        unlimited: c.kind === 'operator' || value >= UNLIMITED,
        lastBlock: c.lastBlock,
        lastTx: c.lastTx,
      }
      return a
    })
    const approvals = checked
      .filter((a): a is Approval => !!a)
      .sort((a, b) => Number(b.unlimited) - Number(a.unlimited) || b.lastBlock - a.lastBlock)
    return {
      owner,
      approvals,
      closed: entry.candidates.size - approvals.length,
      scannedFrom: fromBlock,
      scannedTo: entry.to,
      coverage: `Approvals granted through this relayer, plus Approval and ApprovalForAll events from block ${fromBlock.toLocaleString('en-US')} (about 1 Nov 2026) to ${entry.to.toLocaleString('en-US')}; each is checked against the current allowance. Diana does not publish logs of calls run through QoreConnect keys, and this relayer forgets its records when it restarts, so approvals made through another relayer may be missing. ERC-721 single-token approvals are not listed.`,
      checkedAt: this.opts.now?.() ?? Date.now(),
    }
  }
}

export { approvalInCalldata, revokeCalldata } from '@qoreconnect/core'
