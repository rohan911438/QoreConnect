import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QoreConnectProvider } from '@qoreconnect/react'
import { config, ui } from './wagmi'
import { App } from './App'

const queryClient = new QueryClient()
createRoot(document.getElementById('root')!).render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <QoreConnectProvider ui={ui}>
        <App />
      </QoreConnectProvider>
    </QueryClientProvider>
  </WagmiProvider>,
)
