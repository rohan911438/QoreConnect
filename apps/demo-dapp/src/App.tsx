import { useEffect, useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { TipJar } from './TipJar'
import { AttackDemo } from './AttackDemo'
import { short } from './contracts'

function useHashRoute() {
  const [hash, setHash] = useState(() => (typeof location === 'undefined' ? '' : location.hash))
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash.startsWith('#/attack') ? 'attack' : 'home'
}

/** Plain wagmi from here down: nothing QoreConnect-specific. */
export function App() {
  const route = useHashRoute()
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()

  return (
    <div className="shell">
      <header className="top">
        <a className="brand" href="#/">
          <span className="logo" aria-hidden="true">
            Q
          </span>
          <span>Quantum Tip Jar</span>
        </a>
        <span className="pill">Diana testnet</span>
        <nav className="nav">
          <a href="#/" aria-current={route === 'home' ? 'page' : undefined}>
            Tip
          </a>
          <a href="#/attack" aria-current={route === 'attack' ? 'page' : undefined}>
            Attack demo
          </a>
        </nav>
        <div className="who">
          {isConnected ? (
            <>
              <span className="chip mono" data-testid="account" title={address}>
                {short(address)}
              </span>
              <button className="btn ghost" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            connectors.map((c) => (
              <button key={c.uid} className="btn primary" onClick={() => connect({ connector: c })} disabled={isPending}>
                {isPending ? 'Connecting…' : `Connect with ${c.name}`}
              </button>
            ))
          )}
        </div>
      </header>
      {error && (
        <p className="banner bad" role="alert">
          {error.message.split('\n')[0]}
        </p>
      )}
      <main>{route === 'attack' ? <AttackDemo /> : <TipJar />}</main>
      <footer className="foot">
        <p>
          A demo dApp for <a href="https://github.com/rohan911438/QoreConnect">QoreConnect</a>: MetaMask works on QoreChain through a quantum-safe root
          account. Your MetaMask key acts as a <strong>classical, capped</strong> key: it can only call this tip jar, within your limits. Testnet only;
          QOR here has no value.
        </p>
      </footer>
    </div>
  )
}
