import { describe, expect, it } from 'vitest'
import {
  APPROVAL_FOR_ALL_TOPIC,
  APPROVAL_TOPIC,
  ApprovalScanner,
  MAX_LOG_RANGE,
  decodeString,
  revokeCalldata,
  type EvmRpc,
} from '../src/approvals'
import { RelayedApprovalIndex, calldataHex, type PageSource } from '../src/executions'
import { evmToQor } from '@qorechain/sdk'

const OWNER = '0x7073d2f627b3d9f9512cc2a587a75a2bab0c34f1'
const TOKEN = '0x1a219d5bdf5887678d558feca0186b367393d9f0'
const NFT = '0x2222222222222222222222222222222222222222'
const SPENDER = '0x3333333333333333333333333333333333333333'
const OTHER = '0x4444444444444444444444444444444444444444'
const pad = (a: string) => '0x' + a.slice(2).padStart(64, '0')
const u256 = (n: bigint) => '0x' + n.toString(16).padStart(64, '0')
const MAX = (1n << 256n) - 1n
// ABI string "QCT"
const QCT =
  '0x' +
  32n.toString(16).padStart(64, '0') +
  3n.toString(16).padStart(64, '0') +
  Buffer.from('QCT').toString('hex').padEnd(64, '0')

function fakeRpc(o: {
  latest: number
  logs: any[]
  allowance: Record<string, bigint>
  operator?: Record<string, boolean>
}) {
  const calls: { method: string; params: any[] }[] = []
  const rpc = {
    async call(method: string, params: any[]): Promise<any> {
      calls.push({ method, params })
      if (method === 'eth_blockNumber') return '0x' + o.latest.toString(16)
      if (method === 'eth_getLogs') {
        const { fromBlock, toBlock, topics } = params[0]
        const a = parseInt(fromBlock, 16)
        const b = parseInt(toBlock, 16)
        if (b - a + 1 > MAX_LOG_RANGE) throw new Error('maximum [from, to] blocks distance: 10000')
        expect(topics[1]).toBe(pad(OWNER))
        return o.logs.filter((l) => parseInt(l.blockNumber, 16) >= a && parseInt(l.blockNumber, 16) <= b)
      }
      if (method === 'eth_call') {
        const { to, data } = params[0]
        if (data === '0x95d89b41') return to === TOKEN ? QCT : '0x'
        if (data === '0x313ce567') return u256(18n)
        const spender = '0x' + data.slice(-40)
        if (data.startsWith('0xdd62ed3e')) return u256(o.allowance[`${to}:${spender}`] ?? 0n)
        if (data.startsWith('0xe985e9c5')) return u256(o.operator?.[`${to}:${spender}`] ? 1n : 0n)
      }
      throw new Error('unexpected ' + method)
    },
  }
  return { rpc: rpc as EvmRpc, calls }
}
const log = (address: string, topics: string[], block: number, tx = '0xt' + block) => ({
  address,
  topics,
  blockNumber: '0x' + block.toString(16),
  transactionHash: tx,
})

describe('approval scanner', () => {
  it('finds live allowances, drops revoked ones, never queries more than 10,000 blocks at once', async () => {
    const f = fakeRpc({
      latest: 125_000,
      logs: [
        log(TOKEN, [APPROVAL_TOPIC, pad(OWNER), pad(SPENDER)], 101_000),
        log(TOKEN, [APPROVAL_TOPIC, pad(OWNER), pad(OTHER)], 102_000),
        log(NFT, [APPROVAL_FOR_ALL_TOPIC, pad(OWNER), pad(SPENDER)], 120_000),
        log(NFT, [APPROVAL_TOPIC, pad(OWNER), pad(SPENDER), u256(7n)], 121_000), // ERC-721 single token: not listed
      ],
      allowance: { [`${TOKEN}:${SPENDER}`]: MAX, [`${TOKEN}:${OTHER}`]: 0n },
      operator: { [`${NFT}:${SPENDER}`]: true },
    })
    const s = new ApprovalScanner(f.rpc, { fromBlock: 100_000 })
    const r = await s.scan(OWNER)
    expect(f.calls.filter((c) => c.method === 'eth_getLogs')).toHaveLength(3) // 100,000–124,999 + 125,000
    expect(r.approvals.map((a) => [a.kind, a.token, a.spender, a.unlimited])).toEqual([
      ['operator', NFT, SPENDER, true],
      ['erc20', TOKEN, SPENDER, true],
    ])
    expect(r.approvals[1]).toMatchObject({ symbol: 'QCT', decimals: 18, amount: MAX.toString() })
    expect(r.closed).toBe(1)
    expect(r).toMatchObject({ scannedFrom: 100_000, scannedTo: 125_000 })
    expect(r.coverage).toContain('100,000')
  })

  it('second scan only reads new blocks, and sees a revoke', async () => {
    const o = {
      latest: 105_000,
      logs: [log(TOKEN, [APPROVAL_TOPIC, pad(OWNER), pad(SPENDER)], 101_000)],
      allowance: { [`${TOKEN}:${SPENDER}`]: 5n } as Record<string, bigint>,
    }
    const f = fakeRpc(o)
    const s = new ApprovalScanner(f.rpc, { fromBlock: 100_000 })
    expect((await s.scan(OWNER)).approvals).toHaveLength(1)
    o.latest = 105_010
    o.allowance[`${TOKEN}:${SPENDER}`] = 0n
    const before = f.calls.length
    const r = await s.scan(OWNER)
    const newLogs = f.calls.slice(before).filter((c) => c.method === 'eth_getLogs')
    expect(newLogs).toHaveLength(1)
    expect(parseInt(newLogs[0]!.params[0].fromBlock, 16)).toBe(105_001)
    expect(r.approvals).toHaveLength(0)
    expect(r.closed).toBe(1)
    expect(r.approvals.length).toBe(0)
  })

  it('a limited allowance is not reported as unlimited', async () => {
    const f = fakeRpc({
      latest: 100_010,
      logs: [log(TOKEN, [APPROVAL_TOPIC, pad(OWNER), pad(SPENDER)], 100_001)],
      allowance: { [`${TOKEN}:${SPENDER}`]: 10n ** 18n },
    })
    const r = await new ApprovalScanner(f.rpc, { fromBlock: 100_000 }).scan(OWNER)
    expect(r.approvals[0]).toMatchObject({ unlimited: false, amount: (10n ** 18n).toString() })
  })

  it('builds the revoke calldata', () => {
    expect(revokeCalldata({ kind: 'erc20', spender: SPENDER })).toBe(
      '0x095ea7b3' + pad(SPENDER).slice(2) + '0'.repeat(64),
    )
    expect(revokeCalldata({ kind: 'operator', spender: SPENDER })).toBe(
      '0xa22cb465' + pad(SPENDER).slice(2) + '0'.repeat(64),
    )
  })

  it('decodes ABI and bytes32 symbols', () => {
    expect(decodeString(QCT)).toBe('QCT')
    expect(decodeString('0x' + Buffer.from('MKR').toString('hex').padEnd(64, '0'))).toBe('MKR')
    expect(decodeString('0x')).toBeUndefined()
  })
})

describe('approvals known from relayed calls', () => {
  it('parses approve / setApprovalForAll calldata, ignoring revokes', async () => {
    const { approvalInCalldata } = await import('../src/approvals')
    const sp = pad(SPENDER).slice(2)
    expect(approvalInCalldata('0x095ea7b3' + sp + u256(5n).slice(2))).toEqual({ kind: 'erc20', spender: SPENDER })
    expect(approvalInCalldata('0x095ea7b3' + sp + '0'.repeat(64))).toBeUndefined()
    expect(approvalInCalldata('0xa22cb465' + sp + u256(1n).slice(2))).toEqual({ kind: 'operator', spender: SPENDER })
    expect(approvalInCalldata('0xd09de08a')).toBeUndefined()
  })

  it('the store keeps one row per approval, and the scanner verifies it live', async () => {
    const { RelayerStore } = await import('../src/store')
    const store = new RelayerStore(':memory:')
    store.recordApprovalCandidate({
      owner: OWNER.toUpperCase().replace('0X', '0x'),
      token: TOKEN,
      spender: SPENDER,
      kind: 'erc20',
      txHash: 'A',
    })
    store.recordApprovalCandidate({ owner: OWNER, token: TOKEN, spender: SPENDER, kind: 'erc20', txHash: 'B' })
    expect(store.approvalCandidates(OWNER)).toEqual([
      expect.objectContaining({ token: TOKEN, spender: SPENDER, kind: 'erc20', txHash: 'B' }),
    ])
    const f = fakeRpc({ latest: 100_010, logs: [], allowance: { [`${TOKEN}:${SPENDER}`]: 7n } })
    const r = await new ApprovalScanner(f.rpc, {
      fromBlock: 100_000,
      known: (o) => ({ candidates: store.approvalCandidates(o), complete: true }),
    }).scan(OWNER)
    expect(r.approvals).toEqual([expect.objectContaining({ token: TOKEN, spender: SPENDER, amount: '7', lastTx: 'B' })])
    expect(r.coverage).toContain('on any relayer')
  })

  it('says so when the chain history of relayed calls could not be read in full', async () => {
    const f = fakeRpc({ latest: 100_010, logs: [], allowance: {} })
    const r = await new ApprovalScanner(f.rpc, {
      fromBlock: 100_000,
      known: async () => ({ candidates: [], complete: false }),
    }).scan(OWNER)
    expect(r.coverage).toContain('scan again to retry')
  })
})

describe('relayed approval index (chain tx search)', () => {
  // OWNER as a qor1 address, as MsgExecuteEVM carries it.
  const ACCOUNT = evmToQor(OWNER)
  const approveB64 = (spender: string, v: bigint) =>
    Buffer.from('095ea7b3' + pad(spender).slice(2) + u256(v).slice(2), 'hex').toString('base64')
  const tx = (n: number, data: string, to = TOKEN, account = ACCOUNT) => ({
    txhash: `H${n}`,
    height: n,
    msgs: [{ account, to, data }],
  })

  function source(all: ReturnType<typeof tx>[]) {
    const calls: number[] = []
    const pages: PageSource = async (page, limit) => {
      calls.push(page)
      const sorted = [...all].sort((a, b) => b.height - a.height)
      return { total: sorted.length, txs: sorted.slice((page - 1) * limit, page * limit) }
    }
    return { pages, calls }
  }

  it('decodes base64 calldata and keeps approvals per owner, ignoring revokes and other calls', () => {
    expect(calldataHex(Buffer.from('d09de08a', 'hex').toString('base64'))).toBe('0xd09de08a')
    expect(calldataHex('0xABCD')).toBe('0xabcd')
  })

  it('first build reads every page; later refreshes stop at the first known tx', async () => {
    const all = Array.from({ length: 250 }, (_, i) => tx(i + 1, Buffer.from('d09de08a', 'hex').toString('base64')))
    all[10] = tx(11, approveB64(SPENDER, 5n))
    all[200] = tx(201, approveB64(OTHER, 0n)) // a revoke: not an approval
    const s = source(all)
    const idx = new RelayedApprovalIndex(s.pages, { minIntervalMs: 0 })
    await idx.refresh()
    expect(idx.ready).toBe(true)
    expect(s.calls.sort()).toEqual([1, 2, 3])
    expect(idx.known(OWNER)).toEqual([{ token: TOKEN, spender: SPENDER, kind: 'erc20', txHash: 'H11' }])
    expect(idx.known(OTHER)).toEqual([])

    // One new approval arrives: only page 1 is read again.
    all.push(tx(251, approveB64(OTHER, 9n)))
    s.calls.length = 0
    await idx.refresh()
    expect(s.calls).toEqual([1])
    expect(
      idx
        .known(OWNER)
        .map((k) => k.spender)
        .sort(),
    ).toEqual([OTHER, SPENDER].sort())
  })

  it('concurrent callers share one run, and a failed build is retried next time', async () => {
    let fail = true
    const s = source([tx(1, approveB64(SPENDER, 1n))])
    const pages: PageSource = async (p, l) => {
      if (fail) throw new Error('timeout')
      return s.pages(p, l)
    }
    const idx = new RelayedApprovalIndex(pages, { minIntervalMs: 0 })
    await expect(idx.refresh()).rejects.toThrow('timeout')
    expect(idx.ready).toBe(false)
    fail = false
    await Promise.all([idx.refresh(), idx.refresh()])
    expect(s.calls).toEqual([1])
    expect(idx.ready).toBe(true)
    expect(idx.known(OWNER)).toHaveLength(1)
  })
})

describe('relayed approval index: pruned history', () => {
  it('reads up to the pruning boundary in small pages and reports where history starts', async () => {
    const { PrunedHistoryError } = await import('../src/executions')
    const ACCOUNT = evmToQor(OWNER)
    const data = Buffer.from('095ea7b3' + pad(SPENDER).slice(2) + u256(3n).slice(2), 'hex').toString('base64')
    // 130 txs, newest first; the node keeps heights >= 1000 only (txs 1..115 readable: heights 1114..1000).
    const all = Array.from({ length: 130 }, (_, i) => ({
      txhash: `H${i}`,
      height: 1114 - i,
      msgs: [{ account: ACCOUNT, to: TOKEN, data: i === 112 ? data : '' }],
    }))
    const pages: PageSource = async (page, limit) => {
      const slice = all.slice((page - 1) * limit, page * limit)
      if (slice.some((t) => t.height < 1000)) throw new PrunedHistoryError(1000)
      return { total: all.length, txs: slice }
    }
    const idx = new RelayedApprovalIndex(pages, { minIntervalMs: 0 })
    await idx.refresh()
    expect(idx.ready).toBe(true)
    expect(idx.historyFrom).toBe(1000)
    expect(idx.known(OWNER)).toEqual([expect.objectContaining({ txHash: 'H112' })])
  })
})
