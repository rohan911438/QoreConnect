import { createConfig } from 'wagmi'
import { qoreConnect, qoreTransport, qorechainDiana } from '@qoreconnect/wagmi' // QoreConnect 1/9
import { createQoreConnectUI } from '@qoreconnect/react' // QoreConnect 2/9
import { TIPJAR, tipJarAbi } from './contracts'

export const ui = createQoreConnectUI() // QoreConnect 3/9: onboarding, approval and signing-preview modals

export const config = createConfig({
  chains: [qorechainDiana],
  connectors: [
    qoreConnect({ appName: 'Quantum Tip Jar', contracts: [TIPJAR], gasTankId: 'demo-dapp', ui: ui.hooks, // QoreConnect 4/9
      relayerUrl: import.meta.env.VITE_RELAYER_URL ?? 'http://localhost:8787', // QoreConnect 5/9
      advanced: { abis: { [TIPJAR]: { abi: tipJarAbi, name: 'Quantum Tip Jar' } } } }), // QoreConnect 6/9 (readable previews)
  ],
  transports: { [qorechainDiana.id]: qoreTransport() }, // QoreConnect 7/9 (drop-in for http())
})
