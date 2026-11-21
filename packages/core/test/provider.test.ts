import { beforeEach, describe, expect, it, vi } from 'vitest'

const ROOT_QOR = 'qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s'
const ROOT_EVM = '0x789f00f2f6705ed10df035477fc72d3c4470e4e4'
const MM = '0x974944048dec3f8ff1ba6bb076724d86c085d69b'
const COUNTER = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74'
const HASH = 'AB'.repeat(32)

const state = { approved: [COUNTER], linked: true }
vi.mock('../src/account/session', () => ({
  getSessionState: vi.fn(async () => ({
    account: ROOT_QOR,
    keys: state.linked ? [{ pubkeyHex: MM.slice(2), active: true, isMetaMask: true }] : [],
    rules: [],
    approved: state.approved,
  })),
  approveDapp: vi.fn(async () => ({})),
  linkSessionKey: vi.fn(async () => ({})),
}))
vi.mock('../src/relay', () => ({
  signRelayRequest: vi.fn(async (o: any) => ({ account: o.account, to: o.to, data: o.data, gasLimit: String(o.gasLimit), tankId: o.tankId })),
  RelayerClient: class {
    relayOrThrow = vi.fn(async () => ({ ok: true, success: true, txHash: HASH }))
  },
}))
vi.mock('../src/chain/tx', async (orig) => ({
  ...(await orig<any>()),
  fetchTxResult: vi.fn(async () => ({
    code: 0,
    transactionHash: HASH,
    height: 10,
    gasUsed: 1000n,
    events: [],
    msgResponses: [{ typeUrl: '/qorechain.abstractaccount.v1.MsgExecuteEVMResponse', value: new Uint8Array([0x08, 0x01]) }],
    tx: { body: { messages: [{ '@type': '/qorechain.abstractaccount.v1.MsgExecuteEVM', account: ROOT_QOR, to: COUNTER, value: '0', data: '', gas_limit: '200000' }] } },
  })),
}))

const { QoreConnectProvider, MemoryVaultStorage, RootVault, ProviderRpcError } = await import('../src/index')
const session = await import('../src/account/session')
const relay = await import('../src/relay')

function metamask() {
  const calls: { method: string; params?: any }[] = []
  return {
    calls,
    request: vi.fn(async ({ method, params }: any) => {
      calls.push({ method, params })
      if (method === 'eth_requestAccounts') return [MM]
      if (method === 'personal_sign') return '0xsig'
      throw new Error('unexpected ' + method)
    }),
  }
}

/** EVM RPC mock: estimateGas, receipts (null for relayed hashes), blocks. */
const rpcFetch = vi.fn(async (_url: string, init?: RequestInit) => {
  const { method, id } = JSON.parse(String(init?.body))
  const result = method === 'eth_estimateGas' ? '0x186a0' : method === 'eth_blockNumber' ? '0xa' : method === 'eth_getBlockByNumber' ? { hash: '0x' + '11'.repeat(32) } : null
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }))
})

async function setup(opts: { vault?: boolean } = {}) {
  const vault = new RootVault(new MemoryVaultStorage())
  if (opts.vault !== false) {
    await vault.storage.put('root', { version: 1, kdf: 'scrypt', salt: '', iv: '', ciphertext: '', qorAddress: ROOT_QOR, evmAddress: ROOT_EVM, createdAt: 0 })
  }
  const mm = metamask()
  const p = new QoreConnectProvider({ appName: 'Test', contracts: [COUNTER], relayerUrl: 'http://relayer', gasTankId: 'demo-dapp', metamask: mm, vault, fetch: rpcFetch as any })
  return { p, mm }
}

beforeEach(() => {
  state.approved = [COUNTER]
  state.linked = true
  vi.clearAllMocks()
})

describe('QoreConnectProvider routing', () => {
  it('chain id and accounts before/after connect; root address is the account (P01 Q3)', async () => {
    const { p } = await setup()
    const events: string[] = []
    p.on('connect', () => events.push('connect'))
    p.on('accountsChanged', (a: string[]) => events.push('accounts:' + a.join()))
    expect(await p.request({ method: 'eth_chainId' })).toBe('0x2648')
    expect(await p.request({ method: 'eth_accounts' })).toEqual([])
    expect(await p.request({ method: 'eth_requestAccounts' })).toEqual([ROOT_EVM])
    expect(await p.request({ method: 'eth_accounts' })).toEqual([ROOT_EVM])
    expect(await p.request({ method: 'qoreconnect_sessionKey' })).toBe(MM)
    expect(events).toEqual(['connect', `accounts:${ROOT_EVM}`])
  })

  it('accepts only chain 9800', async () => {
    const { p } = await setup()
    expect(await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2648' }] })).toBeNull()
    await expect(p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] })).rejects.toMatchObject({ code: 4902 })
  })

  it('refuses raw signing methods', async () => {
    const { p } = await setup()
    await expect(p.request({ method: 'eth_sign', params: [] })).rejects.toMatchObject({ code: 4200 })
  })

  it('personal_sign is forwarded to MetaMask with the session-key address swapped in', async () => {
    const { p, mm } = await setup()
    await p.request({ method: 'eth_requestAccounts' })
    expect(await p.request({ method: 'personal_sign', params: ['0x68656c6c6f', ROOT_EVM] })).toBe('0xsig')
    expect(mm.calls.at(-1)).toEqual({ method: 'personal_sign', params: ['0x68656c6c6f', MM] })
  })

  it('eth_sendTransaction: estimate +20%, sign via MetaMask, relay, verify, return 0x hash', async () => {
    const { p } = await setup()
    await p.request({ method: 'eth_requestAccounts' })
    const hash = await p.request({ method: 'eth_sendTransaction', params: [{ from: ROOT_EVM, to: COUNTER, data: '0xd09de08a' }] })
    expect(hash).toBe('0x' + HASH.toLowerCase())
    const sign = vi.mocked(relay.signRelayRequest).mock.calls[0]![0] as any
    expect(sign).toMatchObject({ account: ROOT_QOR, to: COUNTER, gasLimit: Math.ceil(100_000 * 1.2), tankId: 'demo-dapp', metamaskAddress: MM })
  })

  it('preview hook can cancel (maps to 4001)', async () => {
    const vault = new RootVault(new MemoryVaultStorage())
    await vault.storage.put('root', { version: 1, kdf: 'scrypt', salt: '', iv: '', ciphertext: '', qorAddress: ROOT_QOR, evmAddress: ROOT_EVM, createdAt: 0 })
    const p = new QoreConnectProvider({ appName: 'T', contracts: [], relayerUrl: 'http://r', gasTankId: 't', metamask: metamask(), vault, fetch: rpcFetch as any, hooks: { onPreview: async () => false } })
    await p.request({ method: 'eth_requestAccounts' })
    const err = await p.request({ method: 'eth_sendTransaction', params: [{ to: COUNTER, data: '0x' }] }).catch((e) => e)
    expect(err).toBeInstanceOf(ProviderRpcError)
    expect(err).toMatchObject({ code: 4001, data: { qoreconnect: { code: 'USER_REJECTED' } } })
  })

  it('unapproved contract asks the approval hook; rejection maps to 4100', async () => {
    state.approved = []
    const vault = new RootVault(new MemoryVaultStorage())
    await vault.storage.put('root', { version: 1, kdf: 'scrypt', salt: '', iv: '', ciphertext: '', qorAddress: ROOT_QOR, evmAddress: ROOT_EVM, createdAt: 0 })
    const onNeedsApproval = vi.fn(async () => false)
    const p = new QoreConnectProvider({ appName: 'T', contracts: [], relayerUrl: 'http://r', gasTankId: 't', metamask: metamask(), vault, fetch: rpcFetch as any, hooks: { onNeedsApproval } })
    await p.request({ method: 'eth_requestAccounts' })
    await expect(p.request({ method: 'eth_sendTransaction', params: [{ to: COUNTER, data: '0x' }] })).rejects.toMatchObject({ code: 4100 })
    expect(onNeedsApproval).toHaveBeenCalledWith(expect.objectContaining({ contract: COUNTER }))
  })

  it('unlinked MetaMask triggers onboarding hook', async () => {
    state.linked = false
    const onNeedsOnboarding = vi.fn(async () => ({ qorAddress: ROOT_QOR, evmAddress: ROOT_EVM }) as any)
    const p = new QoreConnectProvider({ appName: 'T', contracts: [COUNTER], relayerUrl: 'http://r', gasTankId: 't', metamask: metamask(), vault: new RootVault(new MemoryVaultStorage()), fetch: rpcFetch as any, hooks: { onNeedsOnboarding } })
    expect(await p.request({ method: 'eth_requestAccounts' })).toEqual([ROOT_EVM])
    expect(onNeedsOnboarding).toHaveBeenCalledOnce()
    expect(session.linkSessionKey).not.toHaveBeenCalled()
  })

  it('synthesises a receipt for relayed hashes the EVM RPC does not know', async () => {
    const { p } = await setup()
    const r = await p.request({ method: 'eth_getTransactionReceipt', params: ['0x' + HASH.toLowerCase()] })
    expect(r).toMatchObject({ status: '0x1', blockNumber: '0xa', from: ROOT_EVM, to: COUNTER, logs: [] })
  })

  it('passes other methods through to the EVM RPC', async () => {
    const { p } = await setup()
    expect(await p.request({ method: 'eth_blockNumber' })).toBe('0xa')
  })
})
