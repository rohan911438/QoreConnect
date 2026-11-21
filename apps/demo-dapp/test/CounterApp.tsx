import { useAccount, useConnect, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { COUNTER, counterAbi } from './counter'

/** A plain wagmi component: nothing QoreChain- or QoreConnect-specific here. */
export function App() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, error: connectError, isPending: connecting } = useConnect()
  const { data: count, refetch } = useReadContract({ address: COUNTER, abi: counterAbi, functionName: 'count' })
  const { writeContract, data: hash, isPending, error } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash, query: { enabled: !!hash } })
  if (isSuccess) void refetch()

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 520, margin: '48px auto', padding: 16 }}>
      <h1>Quantum Tip Jar</h1>
      <p data-testid="count">Count: {count?.toString() ?? '…'}</p>
      {!isConnected ? (
        connectors.map((c) => (
          <button key={c.uid} onClick={() => connect({ connector: c })} disabled={connecting}>
            {connecting ? 'Connecting…' : `Connect with ${c.name}`}
          </button>
        ))
      ) : (
        <>
          <p data-testid="account">Account: {address}</p>
          <button onClick={() => writeContract({ address: COUNTER, abi: counterAbi, functionName: 'increment' })} disabled={isPending}>
            {isPending ? 'Waiting for MetaMask…' : 'Increment'}
          </button>
        </>
      )}
      {hash && <p data-testid="hash">Tx: {hash} {isSuccess ? '(confirmed)' : '(pending)'}</p>}
      {(error || connectError) && <p data-testid="error" style={{ color: 'crimson' }}>{(error ?? connectError)?.message}</p>}
    </main>
  )
}
