import { createConfig } from 'wagmi'
import { qoreConnect, qoreTransport, qorechainDiana } from '@qoreconnect/wagmi'
import { createQoreConnectUI } from '@qoreconnect/react'
import { COUNTER, counterAbi } from './counter'

/** QoreConnect's modals (signing preview); rendered by <QoreConnectProvider ui={ui}> in main.tsx. */
export const ui = createQoreConnectUI()

export const config = createConfig({
  chains: [qorechainDiana],
  connectors: [
    qoreConnect({
      appName: 'Quantum Tip Jar',
      contracts: [COUNTER],
      relayerUrl: import.meta.env.VITE_RELAYER_URL ?? 'http://localhost:8787',
      gasTankId: 'demo-dapp',
      ui: ui.hooks,
      advanced: { abis: { [COUNTER]: { abi: counterAbi, name: 'Counter' } } },
    }),
  ],
  transports: { [qorechainDiana.id]: qoreTransport() },
})
