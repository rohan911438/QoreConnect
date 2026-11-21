/**
 * P07 G2: the demo dApp's plain-wagmi component connects, onboards and increments the Counter on Diana
 * through useWriteContract. A headless stand-in MetaMask (viem local account as EIP-1193) replaces the extension.
 * Needs SPONSOR_MNEMONIC/RELAYER_MNEMONIC in the repo-root .env; skipped otherwise.
 */
import { fetch as undiciFetch } from 'undici'
import { config as dotenv } from 'dotenv'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WagmiProvider, createConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createPublicClient, http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { DIANA, MemoryVaultStorage, QoreClient, RootVault } from '@qoreconnect/core'
import { qoreConnect, qoreTransport, qorechainDiana } from '@qoreconnect/wagmi'
import { ChainFundsSender, ChainRelay, DEFAULT_SPONSOR, RelayService, RelayerStore, SponsorService, createRelayerApp, operatorAccount } from '@qoreconnect/relayer'
import { App } from '../src/App'
import { COUNTER, counterAbi } from '../src/counter'

dotenv({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true } as any)
const MNEMONIC = process.env.SPONSOR_MNEMONIC
// happy-dom's fetch enforces browser CORS; the test talks to public endpoints directly, like a server-side proxy would.
;(globalThis as any).fetch = undiciFetch

describe.skipIf(!MNEMONIC)('demo dApp E2E on Diana (headless MetaMask)', () => {
  it('connect → onboard → increment via useWriteContract', async () => {
    const RELAYER = 'http://relayer.test'
    const store = new RelayerStore(':memory:')
    store.createTank({ id: 'demo-dapp', name: 'Demo', owner: 'test', balanceUqor: 10_000_000n, perUserDailyCapUqor: 2_000_000n })
    const client = new QoreClient(DIANA)
    const sponsor = new SponsorService(DIANA, store, new ChainFundsSender(DIANA, await operatorAccount(MNEMONIC!, 0)), DEFAULT_SPONSOR, async (r) => (await client.getPqcKey(r)).registered)
    const relay = new RelayService(DIANA, store, new ChainRelay(DIANA, await operatorAccount(process.env.RELAYER_MNEMONIC ?? MNEMONIC!, Number(process.env.RELAYER_INDEX ?? 1))))
    const app = createRelayerApp({ net: DIANA, store, sponsor, relay })
    const fetchImpl = (async (input: string, init?: RequestInit) => (String(input).startsWith(RELAYER) ? app.request(String(input).slice(RELAYER.length), init as any) : undiciFetch(input as any, init as any))) as any

    // Stand-in MetaMask and a password-protected root on this "device".
    const mmAcct = privateKeyToAccount(generatePrivateKey())
    const metamask = {
      request: async ({ method, params }: any) => {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [mmAcct.address]
        if (method === 'personal_sign') return mmAcct.signMessage({ message: { raw: params[0] } })
        throw new Error('unsupported ' + method)
      },
    }
    const vault = new RootVault(new MemoryVaultStorage())
    const root = await vault.create({ kind: 'password', password: 'e2e test only', scrypt: { N: 2 ** 10, r: 8, p: 1 } })

    // The dApp config, with the headless test wiring under `advanced` and `ui`.
    const config = createConfig({
      chains: [qorechainDiana],
      connectors: [
        qoreConnect({ appName: 'Quantum Tip Jar', contracts: [COUNTER], relayerUrl: RELAYER, gasTankId: 'demo-dapp', announce: false, ui: { unlockRoot: async () => root }, advanced: { metamask, vault, fetch: fetchImpl } }),
      ],
      transports: { [qorechainDiana.id]: qoreTransport({ fetch: fetchImpl }) },
    })
    const evm = createPublicClient({ transport: http(DIANA.evmRpc, { fetchFn: undiciFetch as any }) })
    const before = await evm.readContract({ address: COUNTER, abi: counterAbi, functionName: 'count' })

    render(
      <WagmiProvider config={config}>
        <QueryClientProvider client={new QueryClient()}>
          <App />
        </QueryClientProvider>
      </WagmiProvider>,
    )
    const t0 = Date.now()
    fireEvent.click(await screen.findByText(/Connect with QoreConnect/))
    await waitFor(() => expect(screen.getByTestId('account').textContent).toContain(root.evmAddress.slice(2, 10)), { timeout: 180_000, interval: 1_000 })
    const tConnected = Date.now()
    fireEvent.click(screen.getByText('Increment'))
    await waitFor(
      () => {
        const err = screen.queryByTestId('error')
        if (err) throw Object.assign(new Error('dApp error: ' + err.textContent), { name: 'Stop' })
        expect(screen.getByTestId('hash').textContent).toContain('(confirmed)')
      },
      { timeout: 180_000, interval: 1_000, onTimeout: (e) => e },
    )
    const after = await evm.readContract({ address: COUNTER, abi: counterAbi, functionName: 'count' })
    expect(after).toBeGreaterThanOrEqual(before + 1n)
    console.log(JSON.stringify({ root: root.qorAddress, rootEvm: root.evmAddress, metamask: mmAcct.address, tx: screen.getByTestId('hash').textContent, connectMs: tConnected - t0, incrementMs: Date.now() - tConnected, before: String(before), after: String(after) }, null, 2))
  })
})
