import { decodeAuthenticatorExecutions } from '@qorechain/sdk'
import { DEFAULT_CALL_GAS_LIMIT, DIANA, type QoreNetwork } from '../config'
import { QoreConnectError } from '../errors'
import { QoreClient } from '../chain/client'
import { fetchTxResult } from '../chain/tx'
import type { FetchLike } from '../chain/http'
import { RelayerClient, signRelayRequest, type RelayRequest } from '../relay'
import type { Eip1193Provider } from '../onboard'
import type { RootSigner } from '../vault/signer'
import { RootVault } from '../vault/vault'
import { approveDapp, getSessionState } from '../account/session'
import { onboardAndLink } from '../flow'
import { normaliseCall } from '../account/rules'
import { toRpcError } from './errors'
import { buildPreview, type Preview } from '../preview/preview'
import type { Abi } from 'viem'
import { CHAIN_ID_HEX, evmRpc, getReceipt, getTransaction, type RpcFn } from './receipts'


export interface TxRequest {
  from?: string
  to?: string
  data?: string
  value?: string
  gas?: string
}

/** What the preview hook sees before MetaMask is asked to sign. `preview.call` is exactly what gets signed. */
export interface PreviewRequest {
  preview: Preview
  account: { qorAddress: string; evmAddress: string }
  metamaskAddress: string
  appName: string
}

export interface QoreConnectHooks {
  /**
   * The MetaMask address is not linked to a root on this device. Return an unlocked RootSigner after onboarding
   * (UI in P09). Default: headless onboarding with `protection` (create vault → sponsor → register → link).
   */
  onNeedsOnboarding?: (ctx: { metamaskAddress: string; provider: QoreConnectProvider }) => Promise<RootSigner>
  /** The target is not in the allow-list. Resolve to approve (root-signed) or reject. Default: headless approve. */
  onNeedsApproval?: (ctx: { contract: string; unlock: () => Promise<RootSigner> }) => Promise<boolean>
  /** Show the signing preview; resolve false to cancel (maps to 4001). Default: allow. */
  onPreview?: (req: PreviewRequest) => Promise<boolean>
  /** Called before forwarding personal_sign / signTypedData to MetaMask: these are classical signatures. */
  onClassicalSignature?: (method: string) => Promise<boolean>
  /** Return an unlocked root (prompts for passkey or password in the UI). */
  unlockRoot?: () => Promise<RootSigner>
}

export interface QoreConnectProviderOptions {
  appName: string
  /** Contracts this dApp asks users to approve ("0xTarget" or "0xTarget/0xSelector"). */
  contracts: string[]
  relayerUrl: string
  gasTankId: string
  net?: QoreNetwork
  /** Upstream MetaMask provider. Default: discovered via EIP-6963 (io.metamask) or window.ethereum. */
  metamask?: Eip1193Provider
  vault?: RootVault
  hooks?: QoreConnectHooks
  fetch?: FetchLike
  /** ABIs for readable previews, by contract address. */
  abis?: Record<string, { abi: Abi; name?: string }>
  /** Look up unknown selectors on 4byte.directory (default true). */
  fourByte?: boolean
}

type Listener = (...args: any[]) => void

/** Discover MetaMask: EIP-6963 first (rdns io.metamask), then window.ethereum. */
export async function discoverMetaMask(timeoutMs = 300): Promise<Eip1193Provider | undefined> {
  const w = globalThis as any
  if (typeof w.addEventListener !== 'function') return undefined
  const found = await new Promise<Eip1193Provider | undefined>((resolve) => {
    let done = false
    const onAnnounce = (e: any) => {
      if (!done && e?.detail?.info?.rdns === 'io.metamask') {
        done = true
        resolve(e.detail.provider)
      }
    }
    w.addEventListener('eip6963:announceProvider', onAnnounce)
    w.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      w.removeEventListener('eip6963:announceProvider', onAnnounce)
      if (!done) resolve(undefined)
    }, timeoutMs)
  })
  if (found) return found
  const eth = w.ethereum
  if (eth?.providers?.length) return eth.providers.find((p: any) => p.isMetaMask) ?? eth.providers[0]
  return eth
}

/**
 * EIP-1193 provider for dApps. Accounts are the user's quantum-safe ROOT account (P01 Q3: msg.sender is the root);
 * MetaMask only signs, as a capped, scoped, revocable session key; the relayer pays gas.
 */
export class QoreConnectProvider implements Eip1193Provider {
  readonly isQoreConnect = true
  readonly net: QoreNetwork
  readonly vault: RootVault
  private readonly client: QoreClient
  private readonly relayer: RelayerClient
  private readonly listeners = new Map<string, Set<Listener>>()
  private metamask?: Eip1193Provider
  private metamaskAddress?: string
  private root?: { qorAddress: string; evmAddress: string }
  private connected = false
  private readonly rpcFn: RpcFn

  constructor(readonly opts: QoreConnectProviderOptions) {
    this.net = opts.net ?? DIANA
    this.vault = opts.vault ?? new RootVault()
    this.client = new QoreClient(this.net, opts.fetch)
    this.relayer = new RelayerClient(opts.relayerUrl, opts.fetch)
    this.metamask = opts.metamask
    this.rpcFn = evmRpc(this.net, opts.fetch)
  }

  // ---- events ----
  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return this
  }
  removeListener(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn)
    return this
  }
  off(event: string, fn: Listener) {
    return this.removeListener(event, fn)
  }
  private emit(event: string, ...args: unknown[]) {
    for (const fn of this.listeners.get(event) ?? []) {
      try {
        fn(...args)
      } catch {
        /* listener errors must not break the provider */
      }
    }
  }

  /** The connected MetaMask (session key) address. */
  get sessionKeyAddress() {
    return this.metamaskAddress
  }
  get rootAccount() {
    return this.root
  }

  async request({ method, params }: { method: string; params?: unknown[] | object }): Promise<any> {
    try {
      return await this.route(method, (params ?? []) as any[])
    } catch (e) {
      throw toRpcError(e)
    }
  }

  private async route(method: string, params: any[]): Promise<any> {
    switch (method) {
      case 'eth_chainId':
        return CHAIN_ID_HEX
      case 'net_version':
        return String(this.net.evmChainId)
      case 'eth_requestAccounts':
        await this.connect()
        return [this.root!.evmAddress]
      case 'eth_accounts':
        return this.connected && this.root ? [this.root.evmAddress] : []
      case 'eth_coinbase':
        return this.connected && this.root ? this.root.evmAddress : null
      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain': {
        const id = String(params?.[0]?.chainId ?? '').toLowerCase()
        if (id === CHAIN_ID_HEX || id === '9800') return null
        throw Object.assign(new Error('QoreConnect supports QoreChain Diana (9800) only'), { code: 4902 })
      }
      case 'wallet_requestPermissions':
        await this.connect()
        return [{ parentCapability: 'eth_accounts' }]
      case 'wallet_getPermissions':
        return this.connected ? [{ parentCapability: 'eth_accounts' }] : []
      case 'wallet_revokePermissions':
        await this.disconnect()
        return null
      case 'eth_sendTransaction':
        return this.sendTransaction(params[0] as TxRequest)
      case 'eth_getTransactionReceipt':
        return this.receipt(params[0] as string)
      case 'eth_getTransactionByHash':
        return this.transaction(params[0] as string)
      case 'personal_sign':
      case 'eth_signTypedData_v4':
      case 'eth_signTypedData': {
        if (this.opts.hooks?.onClassicalSignature && !(await this.opts.hooks.onClassicalSignature(method))) throw new QoreConnectError('USER_REJECTED')
        const mm = await this.requireMetaMask()
        // The dApp sees the root as the account; MetaMask signs with its own key. Swap the address param.
        const p = [...params]
        const idx = method === 'personal_sign' ? 1 : 0
        if (typeof p[idx] === 'string' && this.root && p[idx].toLowerCase() === this.root.evmAddress.toLowerCase()) p[idx] = this.metamaskAddress
        return mm.request({ method, params: p })
      }
      case 'eth_sign':
      case 'eth_signTransaction':
      case 'eth_sendRawTransaction':
        throw Object.assign(new Error(`${method} is not supported: QoreConnect never signs raw EVM transactions with MetaMask`), { code: 4200 })
      case 'qoreconnect_sessionKey':
        return this.metamaskAddress ?? null
      case 'qoreconnect_root':
        return this.root ?? null
      default:
        return this.rpc(method, params)
    }
  }

  /** Pass-through JSON-RPC to the QoreChain EVM endpoint. */
  rpc(method: string, params: unknown[] = []): Promise<any> {
    return this.rpcFn(method, params)
  }

  private async requireMetaMask(): Promise<Eip1193Provider> {
    if (!this.metamask) this.metamask = await discoverMetaMask()
    if (!this.metamask) throw new QoreConnectError('INVALID_INPUT', { message: 'MetaMask was not found. Install MetaMask to use QoreConnect.' })
    return this.metamask
  }

  private async unlock(): Promise<RootSigner> {
    if (this.opts.hooks?.unlockRoot) return this.opts.hooks.unlockRoot()
    throw new QoreConnectError('VAULT_LOCKED', { message: 'Unlocking needs the QoreConnect UI (or a hooks.unlockRoot implementation).' })
  }

  /** Is this MetaMask address an active session key of `account`? */
  async isLinked(account: string, metamaskAddress: string): Promise<boolean> {
    const s = await getSessionState({ net: this.net, fetch: this.opts.fetch }, account)
    return s.keys.some((k) => k.active && k.pubkeyHex.toLowerCase() === metamaskAddress.slice(2).toLowerCase())
  }

  private connecting?: Promise<{ accounts: string[]; chainId: string }>

  /** Concurrent callers (wagmi reconnect + a click) share one connect/onboarding flow. */
  connect(): Promise<{ accounts: string[]; chainId: string }> {
    if (!this.connecting) this.connecting = this.doConnect().finally(() => (this.connecting = undefined))
    return this.connecting
  }

  /** True only if this device has a root AND the current MetaMask account (no prompt) is linked to it. */
  async isAuthorized(): Promise<boolean> {
    try {
      const info = await this.vault.info()
      if (!info) return false
      const mm = await this.requireMetaMask()
      const [addr] = ((await mm.request({ method: 'eth_accounts' })) as string[]) ?? []
      return !!addr && (await this.isLinked(info.qorAddress, addr.toLowerCase()))
    } catch {
      return false
    }
  }

  private async doConnect(): Promise<{ accounts: string[]; chainId: string }> {
    const mm = await this.requireMetaMask()
    const [addr] = ((await mm.request({ method: 'eth_requestAccounts' })) as string[]) ?? []
    if (!addr) throw new QoreConnectError('USER_REJECTED')
    this.metamaskAddress = addr.toLowerCase()
    const info = await this.vault.info()
    if (!info || !(await this.isLinked(info.qorAddress, this.metamaskAddress))) {
      const signer = await this.onboard()
      this.root = { qorAddress: signer.qorAddress, evmAddress: signer.evmAddress }
    } else {
      this.root = { qorAddress: info.qorAddress, evmAddress: info.evmAddress }
    }
    const wasConnected = this.connected
    this.connected = true
    if (!wasConnected) this.emit('connect', { chainId: CHAIN_ID_HEX })
    this.emit('accountsChanged', [this.root.evmAddress])
    this.watchMetaMask(mm)
    return { accounts: [this.root.evmAddress], chainId: CHAIN_ID_HEX }
  }

  /** Default headless onboarding (no UI): uses hooks.unlockRoot for an existing vault, or creates one via the hook. */
  private async onboard(): Promise<RootSigner> {
    if (this.opts.hooks?.onNeedsOnboarding) return this.opts.hooks.onNeedsOnboarding({ metamaskAddress: this.metamaskAddress!, provider: this })
    return this.headlessOnboard(await this.unlock())
  }

  /** Bring an unlocked root on chain and link the current MetaMask with this dApp's contracts. */
  async headlessOnboard(root: RootSigner): Promise<RootSigner> {
    const mm = await this.requireMetaMask()
    if (await this.isLinked(root.qorAddress, this.metamaskAddress!)) return root
    await onboardAndLink({ net: this.net, vault: this.vault, root, metamask: mm, metamaskAddress: this.metamaskAddress, relayerUrl: this.opts.relayerUrl, contracts: this.opts.contracts, fetch: this.opts.fetch })
    return root
  }

  async disconnect() {
    this.connected = false
    this.emit('accountsChanged', [])
    this.emit('disconnect', { code: 4900, message: 'disconnected' })
  }

  private watching = false
  private watchMetaMask(mm: Eip1193Provider) {
    const m = mm as any
    if (this.watching || typeof m.on !== 'function') return
    this.watching = true
    m.on('accountsChanged', async (accs: string[]) => {
      const next = accs?.[0]?.toLowerCase()
      if (!next) return this.disconnect()
      if (next === this.metamaskAddress) return
      this.metamaskAddress = next
      // A different MetaMask account is only usable if it is linked to this root too.
      if (!this.root || !(await this.isLinked(this.root.qorAddress, next).catch(() => false))) return this.disconnect()
    })
    m.on('chainChanged', () => this.emit('chainChanged', CHAIN_ID_HEX))
  }

  private async ensureApproved(to: string, data: string) {
    const state = await getSessionState({ net: this.net, fetch: this.opts.fetch }, this.root!.qorAddress)
    const target = to.toLowerCase()
    const selector = data.length >= 10 ? data.slice(0, 10).toLowerCase() : undefined
    const ok = state.approved.some((c) => c === target || (selector && c === `${target}/${selector}`))
    if (ok) return
    const hook = this.opts.hooks?.onNeedsApproval
    const approve = hook ? await hook({ contract: target, unlock: () => this.unlock() }) : true
    if (!approve) throw new QoreConnectError('NOT_APPROVED')
    if (!hook) {
      const root = await this.unlock()
      await approveDapp({ net: this.net, root, fetch: this.opts.fetch, contracts: [normaliseCall(target)] })
    }
  }

  async sendTransaction(tx: TxRequest): Promise<string> {
    if (!this.connected || !this.root) await this.connect()
    const root = this.root!
    if (tx.from && tx.from.toLowerCase() !== root.evmAddress.toLowerCase()) throw new QoreConnectError('INVALID_INPUT', { message: 'from must be the connected QoreConnect account' })
    if (!tx.to) throw new QoreConnectError('INVALID_INPUT', { message: 'Contract deployment is not supported through QoreConnect yet.' })
    const to = tx.to.toLowerCase()
    const data = tx.data ?? '0x'
    const valueWei = tx.value ? BigInt(tx.value) : 0n
    await this.ensureApproved(to, data)

    let gasLimit = tx.gas ? Number(BigInt(tx.gas)) : 0
    if (!gasLimit) {
      try {
        const est = BigInt(await this.rpc('eth_estimateGas', [{ from: root.evmAddress, to, data, value: '0x' + valueWei.toString(16) }]))
        gasLimit = Math.ceil(Number(est) * 1.2)
      } catch {
        gasLimit = DEFAULT_CALL_GAS_LIMIT
      }
    }
    const preview = await this.preview({ to, data, valueWei, gasLimit })
    // The user always sees the preview, including why a call is blocked; then predicted refusals never reach MetaMask (P08 G2).
    const go = this.opts.hooks?.onPreview ? await this.opts.hooks.onPreview({ preview, account: root, metamaskAddress: this.metamaskAddress!, appName: this.opts.appName }) : true
    if (preview.blocked) {
      const failed = preview.checks.find((c) => !c.ok && !c.warning && c.id !== 'simulation')!
      throw new QoreConnectError(failed.id === 'allow-list' ? 'NOT_APPROVED' : 'LIMIT_EXCEEDED', { message: `Blocked by chain: ${failed.detail}` })
    }
    if (preview.willFail) throw new QoreConnectError('TX_FAILED', { message: `This call would revert: ${preview.simulation.revertReason}` })
    if (!go) throw new QoreConnectError('USER_REJECTED')
    const mm = await this.requireMetaMask()
    const req: RelayRequest = await signRelayRequest({ net: this.net, ethereum: mm, metamaskAddress: preview.call.pubkey, account: preview.call.account, to: preview.call.to, tankId: this.opts.gasTankId, fetch: this.opts.fetch, call: preview.call })
    const res = await this.relayer.relayOrThrow(req)
    // Verify on chain by hash (do not trust the relayer's word alone).
    const onChain = await fetchTxResult(this.net, res.txHash, this.opts.fetch)
    const [exec] = onChain ? decodeAuthenticatorExecutions(onChain as any) : []
    if (!onChain || !exec?.success) throw new QoreConnectError('TX_FAILED', { message: 'The relayer reported success but the chain does not confirm it.', txHash: res.txHash })
    return '0x' + res.txHash.toLowerCase()
  }

  /** Build the signing preview for a call from the connected account (no signature is requested). */
  async preview(tx: { to: string; data: string; valueWei: bigint; gasLimit: number }): Promise<Preview> {
    const root = this.root!
    const [state, nonce, spentTodayUqor] = await Promise.all([
      getSessionState({ net: this.net, fetch: this.opts.fetch }, root.qorAddress),
      this.client.getAuthNonce(root.qorAddress, this.metamaskAddress!),
      this.relayer.spentToday(root.qorAddress),
    ])
    const rule = state.managed ?? state.rules.find((r) => r.enabled)
    return buildPreview(
      { chainId: this.net.chainId, account: root.qorAddress, pubkey: this.metamaskAddress!, to: tx.to, valueWei: tx.valueWei, data: tx.data, gasLimit: tx.gasLimit, nonce },
      { net: this.net, rootEvm: root.evmAddress, rule, approved: state.approved, spentTodayUqor, signer: 'metamask', abis: lower(this.opts.abis), rpc: this.rpcFn, fourByte: this.opts.fourByte, fetch: this.opts.fetch as any },
    )
  }

  async receipt(hash: string) {
    return getReceipt(this.net, hash, this.rpcFn, this.opts.fetch)
  }

  async transaction(hash: string) {
    return getTransaction(this.net, hash, this.rpcFn, this.opts.fetch)
  }
}

const lower = <T>(m?: Record<string, T>) => (m ? Object.fromEntries(Object.entries(m).map(([k, v]) => [k.toLowerCase(), v])) : undefined)
