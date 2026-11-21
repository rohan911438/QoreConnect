import { describe, expect, it, vi } from 'vitest'
import { encodeFunctionData, parseAbi, toFunctionSelector } from 'viem'

const captured: any[] = []
vi.mock('@qorechain/sdk', async (orig) => {
  const real = await orig<any>()
  return {
    ...real,
    resolveEvmAuthDigestVersion: vi.fn(async () => 2),
    buildMetaMaskExecuteEvm: vi.fn(async (args: any) => {
      captured.push(args)
      return {
        typeUrl: '/qorechain.abstractaccount.v1.MsgExecuteEVM',
        value: {
          relayer: args.relayer,
          account: args.account,
          to: args.to,
          value: args.value,
          data: args.data,
          gasLimit: BigInt(args.gasLimit),
          nonce: args.nonce,
          pubkey: new Uint8Array(20),
          signature: new Uint8Array(65),
        },
      }
    }),
  }
})

const { buildPreview, callDigest, decodeCall, KNOWN_SIGNATURES, DIANA, signRelayRequest } = await import('../src/index')
const sdk = await import('@qorechain/sdk')

const ROOT = 'qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s'
const ROOT_EVM = '0x789f00f2f6705ed10df035477fc72d3c4470e4e4'
const MM = '0x974944048dec3f8ff1ba6bb076724d86c085d69b'
const COUNTER = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74'
const OTHER = '0x1111111111111111111111111111111111111111'
const QOR = 10n ** 18n

const baseCall = {
  chainId: DIANA.chainId,
  account: ROOT,
  pubkey: MM,
  to: COUNTER,
  valueWei: 0n,
  data: '0xd09de08a',
  gasLimit: 120_000,
  nonce: 3n,
}
// P05/P06 limits: 1 QOR per tx, 5 QOR per day (uqor)
const rule = { perTxLimit: 1_000_000n, dailyLimit: 5_000_000n, allowedEvmCalls: [COUNTER] }
const ctx = { net: DIANA, rootEvm: ROOT_EVM, rule, approved: [COUNTER], fourByte: false }

describe('decoding', () => {
  const abi = parseAbi(['function tipCreator(address creator, uint256 amount)'])
  const data = encodeFunctionData({ abi, functionName: 'tipCreator', args: [OTHER, 42n] })

  it('uses the dApp ABI when configured', async () => {
    const d = await decodeCall(COUNTER, data, { abis: { [COUNTER]: { abi } }, fourByte: false })
    expect(d).toMatchObject({
      kind: 'decoded',
      source: 'abi',
      name: 'tipCreator',
      args: [
        { name: 'creator', value: OTHER },
        { name: 'amount', value: '42' },
      ],
    })
  })

  it('falls back to the offline list', async () => {
    const erc20 = encodeFunctionData({
      abi: parseAbi(['function approve(address,uint256)']),
      functionName: 'approve',
      args: [OTHER, 2n ** 256n - 1n],
    })
    const d = await decodeCall(COUNTER, erc20, { fourByte: false })
    expect(d).toMatchObject({
      kind: 'decoded',
      source: 'offline',
      name: 'approve',
      args: [{ value: OTHER }, { value: 'unlimited (2^256 − 1)' }],
    })
  })

  it('falls back to 4byte.directory, then to "unknown"', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ results: [{ text_signature: 'tipCreator(address,uint256)' }] })),
    )
    expect(await decodeCall(COUNTER, data, { fetch })).toMatchObject({
      kind: 'decoded',
      source: '4byte',
      name: 'tipCreator',
    })
    const down = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await decodeCall(COUNTER, data, { fetch: down })).toEqual({ kind: 'unknown', selector: data.slice(0, 10) })
    expect(await decodeCall(COUNTER, '0x', {})).toEqual({ kind: 'transfer' })
  })

  it('offline selectors match keccak256 of their signatures', () => {
    for (const [sel, sig] of Object.entries(KNOWN_SIGNATURES))
      expect(toFunctionSelector(`function ${sig}`), sig).toBe(sel)
  })
})

describe('policy prediction (before signing)', () => {
  it('within limits → Classical, capped', async () => {
    const p = await buildPreview({ ...baseCall, valueWei: QOR / 2n }, { ...ctx, spentTodayUqor: 0n })
    expect(p).toMatchObject({ blocked: false, label: 'Classical, capped' })
    expect(p.checks.every((c) => c.ok)).toBe(true)
  })

  it('P06 over-limit case: 2 QOR against a 1 QOR per-tx limit → Blocked by chain', async () => {
    const p = await buildPreview({ ...baseCall, valueWei: 2n * QOR }, ctx)
    expect(p).toMatchObject({ blocked: true, label: 'Blocked by chain' })
    expect(p.checks.find((c) => c.id === 'per-tx')).toMatchObject({ ok: false })
  })

  it('daily allowance used up (estimate from relayer records) → Blocked by chain', async () => {
    const p = await buildPreview({ ...baseCall, valueWei: QOR }, { ...ctx, spentTodayUqor: 4_500_000n })
    expect(p.blocked).toBe(true)
    expect(p.checks.find((c) => c.id === 'daily')).toMatchObject({ ok: false, estimate: true })
  })

  it('P06 not-allowed case: target outside the allow-list → Blocked by chain', async () => {
    const p = await buildPreview({ ...baseCall, to: OTHER }, ctx)
    expect(p).toMatchObject({ blocked: true, label: 'Blocked by chain' })
    expect(p.checks.find((c) => c.id === 'allow-list')).toMatchObject({ ok: false })
  })

  it('selector-scoped approvals match target/selector', async () => {
    const p = await buildPreview(baseCall, { ...ctx, approved: [`${COUNTER}/0xd09de08a`] })
    expect(p.blocked).toBe(false)
  })

  it('simulation revert is reported and marks the call as failing', async () => {
    const reason =
      '0x08c379a0' +
      32n.toString(16).padStart(64, '0') +
      8n.toString(16).padStart(64, '0') +
      Buffer.from('too poor').toString('hex').padEnd(64, '0')
    const rpc = vi.fn(async () => {
      throw Object.assign(new Error('execution reverted'), { data: reason })
    })
    const p = await buildPreview(baseCall, { ...ctx, rpc })
    expect(p).toMatchObject({ willFail: true, blocked: false, simulation: { ok: false, revertReason: 'too poor' } })
    expect(rpc).toHaveBeenCalledWith('eth_call', [expect.objectContaining({ from: ROOT_EVM, to: COUNTER }), 'latest'])
  })

  it('agent signer gets the Agent, capped label', async () => {
    expect((await buildPreview(baseCall, { ...ctx, signer: 'agent' })).label).toBe('Agent, capped')
  })
})

describe('digest binding', () => {
  it('the previewed object is frozen', async () => {
    const p = await buildPreview(baseCall, ctx)
    expect(Object.isFrozen(p.call)).toBe(true)
    expect(() => ((p.call as any).valueWei = 1n)).toThrow()
  })

  it('changing any field after preview changes the digest', () => {
    const d0 = Buffer.from(callDigest(baseCall)).toString('hex')
    const variants: Record<string, unknown> = {
      account: 'qor1xeh8dtsvzxg90hqnd5xvra49lhhp46x3gkyruc',
      pubkey: OTHER,
      to: OTHER,
      valueWei: 1n,
      data: '0xd09de08b',
      gasLimit: 120_001,
      nonce: 4n,
      chainId: 'qorechain-other',
    }
    for (const [k, v] of Object.entries(variants))
      expect(Buffer.from(callDigest({ ...baseCall, [k]: v } as any)).toString('hex'), k).not.toBe(d0)
  })

  it('signRelayRequest signs exactly the previewed call (same digest as callDigest)', async () => {
    const p = await buildPreview({ ...baseCall, valueWei: QOR / 4n }, ctx)
    captured.length = 0
    await signRelayRequest({
      net: DIANA,
      ethereum: { request: async () => '0x' },
      metamaskAddress: OTHER,
      account: 'ignored',
      to: OTHER,
      tankId: 't',
      call: p.call,
    })
    const a = captured[0]
    expect(a).toMatchObject({
      account: ROOT,
      to: COUNTER,
      address: MM,
      value: (QOR / 4n).toString(),
      gasLimit: 120_000,
      nonce: 3n,
    })
    const signed = sdk.evmAuthSignBytesV2({
      chainId: a.chainId,
      account: a.account,
      pubkey: Uint8Array.from(Buffer.from(a.address.slice(2), 'hex')),
      to: a.to,
      value: a.value,
      data: a.data,
      nonce: a.nonce,
      gasLimit: BigInt(a.gasLimit),
    } as any)
    expect(Buffer.from(signed).toString('hex')).toBe(Buffer.from(callDigest(p.call)).toString('hex'))
  })
})
