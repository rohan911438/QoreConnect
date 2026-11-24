import { afterEach, describe, expect, it } from 'vitest'
import { discoverMetaMask } from '../src/provider/provider'

/** A fake browser window: wallets answer `eip6963:requestProvider` after `delayMs`; `ethereum` is the injected provider. */
function fakeWindow(o: { wallets?: { rdns: string; provider: any }[]; delayMs?: number; ethereum?: any }) {
  const target = new EventTarget()
  const g = globalThis as any
  g.addEventListener = target.addEventListener.bind(target)
  g.removeEventListener = target.removeEventListener.bind(target)
  g.dispatchEvent = target.dispatchEvent.bind(target)
  g.ethereum = o.ethereum
  target.addEventListener('eip6963:requestProvider', () => {
    for (const wallet of o.wallets ?? []) {
      const announce = () =>
        target.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { rdns: wallet.rdns }, provider: wallet.provider } }))
      if (o.delayMs) setTimeout(announce, o.delayMs)
      else announce()
    }
  })
}

const metamask = { isMetaMask: true, name: 'metamask' }
const qorex = { isMetaMask: true, isQoreX: true, name: 'qorex' } // a wallet that also claims isMetaMask

afterEach(() => {
  const g = globalThis as any
  delete g.addEventListener
  delete g.removeEventListener
  delete g.dispatchEvent
  delete g.ethereum
})

describe('discoverMetaMask', () => {
  it('picks MetaMask over another wallet that owns window.ethereum', async () => {
    fakeWindow({ wallets: [{ rdns: 'xyz.qorex', provider: qorex }, { rdns: 'io.metamask', provider: metamask }], ethereum: qorex })
    expect(await discoverMetaMask(200)).toBe(metamask)
  })

  it('waits for a MetaMask announcement that arrives late', async () => {
    fakeWindow({ wallets: [{ rdns: 'io.metamask', provider: metamask }], delayMs: 600, ethereum: qorex })
    expect(await discoverMetaMask(1500)).toBe(metamask)
  })

  it('returns undefined, not another wallet, when only other wallets answer', async () => {
    fakeWindow({ wallets: [{ rdns: 'xyz.qorex', provider: qorex }], ethereum: qorex })
    expect(await discoverMetaMask(100)).toBeUndefined()
  })

  it('ignores QoreConnect’s own announcement', async () => {
    fakeWindow({ wallets: [{ rdns: 'xyz.qoreconnect', provider: { isQoreConnect: true } }], ethereum: metamask })
    expect(await discoverMetaMask(100)).toBe(metamask)
  })

  it('legacy: uses window.ethereum only if it is MetaMask and nothing else', async () => {
    fakeWindow({ ethereum: metamask })
    expect(await discoverMetaMask(50)).toBe(metamask)
    fakeWindow({ ethereum: qorex })
    expect(await discoverMetaMask(50)).toBeUndefined()
  })

  it('legacy: picks MetaMask from window.ethereum.providers, never providers[0] blindly', async () => {
    fakeWindow({ ethereum: { providers: [qorex, metamask] } })
    expect(await discoverMetaMask(50)).toBe(metamask)
    fakeWindow({ ethereum: { providers: [qorex] } })
    expect(await discoverMetaMask(50)).toBeUndefined()
  })
})
