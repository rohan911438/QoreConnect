import { createConnector } from '@wagmi/core'
import { custom, defineChain, getAddress, numberToHex, type Address, type Chain, type Transport } from 'viem'
import {
  CHAIN_ID_HEX,
  DIANA,
  qoreRequest,
  type FetchLike,
  type QoreNetwork,
  QORECONNECT_ICON,
  QoreConnectProvider,
  announceProvider,
  type QoreConnectHooks,
  type QoreConnectProviderOptions,
} from '@qoreconnect/core'

export const PACKAGE = '@qoreconnect/wagmi'
export { QoreConnectProvider, QORECONNECT_ICON } from '@qoreconnect/core'

export interface QoreConnectParameters {
  /** Shown in onboarding and approval screens. */
  appName: string
  /** Contracts users approve for this dApp ("0xTarget" or "0xTarget/0xSelector"). */
  contracts: string[]
  /** QoreConnect relayer, e.g. https://relayer.qoreconnect.xyz */
  relayerUrl: string
  /** Gas tank that pays this dApp's fees. */
  gasTankId: string
  /** UI hooks (onboarding, approvals, preview). `@qoreconnect/react` provides them. */
  ui?: QoreConnectHooks
  /** Announce QoreConnect to EIP-6963 wallet pickers such as RainbowKit (default true). */
  announce?: boolean
  /** Advanced: network, upstream MetaMask, vault, fetch. */
  advanced?: Pick<QoreConnectProviderOptions, 'net' | 'metamask' | 'vault' | 'fetch'>
}

qoreConnect.type = 'qoreConnect' as const

/**
 * wagmi connector: MetaMask users get a quantum-safe QoreChain account; MetaMask signs as a capped session key
 * and the relayer pays gas. Existing wagmi hooks (useWriteContract, useSendTransaction, ...) work unchanged.
 */
export function qoreConnect(parameters: QoreConnectParameters) {
  let provider: QoreConnectProvider | undefined

  const getOrCreate = () => {
    if (!provider) {
      provider = new QoreConnectProvider({
        appName: parameters.appName,
        contracts: parameters.contracts,
        relayerUrl: parameters.relayerUrl,
        gasTankId: parameters.gasTankId,
        hooks: parameters.ui,
        ...parameters.advanced,
      })
      if (parameters.announce !== false) announceProvider(provider, { name: 'QoreConnect', icon: QORECONNECT_ICON, rdns: 'xyz.qoreconnect' })
    }
    return provider
  }

  return createConnector<QoreConnectProvider>((config) => {
    let accountsChanged: ((a: string[]) => void) | undefined
    let disconnect: ((error?: Error) => void) | undefined

    return {
      id: 'qoreconnect',
      name: 'QoreConnect',
      type: qoreConnect.type,
      icon: QORECONNECT_ICON,
      rdns: 'xyz.qoreconnect',

      async setup() {
        getOrCreate()
      },

      async connect({ chainId } = {}) {
        const p = getOrCreate()
        const accounts = ((await p.request({ method: 'eth_requestAccounts' })) as string[]).map((a) => getAddress(a))
        if (!accountsChanged) {
          accountsChanged = this.onAccountsChanged.bind(this)
          p.on('accountsChanged', accountsChanged)
        }
        if (!disconnect) {
          disconnect = this.onDisconnect.bind(this)
          p.on('disconnect', disconnect)
        }
        const current = await this.getChainId()
        if (chainId && chainId !== current) throw new Error(`QoreConnect supports chain ${current} only`)
        return { accounts, chainId: current } as any
      },

      async disconnect() {
        const p = getOrCreate()
        if (accountsChanged) p.removeListener('accountsChanged', accountsChanged)
        if (disconnect) p.removeListener('disconnect', disconnect)
        accountsChanged = undefined
        disconnect = undefined
        await p.disconnect()
      },

      async getAccounts() {
        const accounts = (await getOrCreate().request({ method: 'eth_accounts' })) as string[]
        return accounts.map((a) => getAddress(a)) as readonly Address[]
      },

      async getChainId() {
        return Number(await getOrCreate().request({ method: 'eth_chainId' }))
      },

      async getProvider() {
        return getOrCreate()
      },

      async isAuthorized() {
        return getOrCreate().isAuthorized()
      },

      async switchChain({ chainId }) {
        const chain = config.chains.find((c) => c.id === chainId)
        if (!chain || numberToHex(chainId) !== CHAIN_ID_HEX) throw new Error(`QoreConnect supports QoreChain (9800) only, not ${chainId}`)
        return chain
      },

      onAccountsChanged(accounts) {
        if (accounts.length === 0) this.onDisconnect()
        else config.emitter.emit('change', { accounts: accounts.map((a) => getAddress(a)) })
      },

      onChainChanged(chain) {
        config.emitter.emit('change', { chainId: Number(chain) })
      },

      onDisconnect() {
        config.emitter.emit('disconnect')
      },
    }
  })
}


/**
 * Drop-in replacement for `http('https://evm-testnet.qore.host')`: the same JSON-RPC, plus receipts for calls relayed
 * through QoreConnect (they run inside a Cosmos envelope, so plain EVM RPC returns null for them). With it,
 * `useWaitForTransactionReceipt` works unchanged.
 */
export function qoreTransport(opts: { net?: QoreNetwork; fetch?: FetchLike } = {}): Transport {
  const net = opts.net ?? DIANA
  return custom({ request: qoreRequest(net, opts.fetch) }, { key: 'qoreconnect', name: 'QoreConnect (QoreChain EVM)', retryCount: 2 })
}

/**
 * QoreChain Diana testnet (EVM chain id 9800), same values as `qorechainTestnet` from `@qorechain/evm`, defined with
 * your app's own viem so wagmi's `Chain` type always matches.
 */
export const qorechainDiana: Chain & { id: 9800 } = defineChain({
  id: 9800,
  name: 'QoreChain Testnet',
  nativeCurrency: { name: 'QOR', symbol: 'QOR', decimals: 18 },
  rpcUrls: { default: { http: ['https://evm-testnet.qore.host'], webSocket: ['wss://evm-ws-testnet.qore.host'] } },
  blockExplorers: { default: { name: 'QoreChain Explorer', url: 'https://explore.qore.network' } },
  testnet: true,
})
