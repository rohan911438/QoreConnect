import { createConfig } from 'wagmi'
import { qoreConnect, qoreTransport, qorechainDiana } from '@qoreconnect/wagmi'
import { COUNTER } from './counter'

export const config = createConfig({
  chains: [qorechainDiana],
  connectors: [
    qoreConnect({ appName: 'Quantum Tip Jar', contracts: [COUNTER], relayerUrl: import.meta.env.VITE_RELAYER_URL ?? 'http://localhost:8787', gasTankId: 'demo-dapp' }),
  ],
  transports: { [qorechainDiana.id]: qoreTransport() },
})
