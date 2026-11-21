import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QoreConnectProvider } from '@qoreconnect/react' // QoreConnect 8/9
import { config, ui } from './wagmi'
import { App } from './App'
import './styles.css'

const queryClient = new QueryClient()
createRoot(document.getElementById('root')!).render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <QoreConnectProvider ui={ui}>{/* QoreConnect 9/9 */}
        <App />
      </QoreConnectProvider>
    </QueryClientProvider>
  </WagmiProvider>,
)
