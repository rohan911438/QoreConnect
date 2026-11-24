'use client'
import { useEffect, useState } from 'react'
import { RootVault, WebAuthnPasskeyProvider, QoreConnectError, type Protection } from '@rohankumar4179/core'

/** Manual test page for P03 (G4/G5). Not linked from the product UI. */
export default function DevVault() {
  const [vault] = useState(() => new RootVault())
  const [info, setInfo] = useState<string>('…')
  const [prf, setPrf] = useState<boolean | null>(null)
  const [forcePassword, setForcePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [out, setOut] = useState('')

  const refresh = async () => {
    const i = await vault.info()
    setInfo(i ? `${i.qorAddress}\n${i.evmAddress}\nprotected by: ${i.kdf}` : 'no vault on this device')
  }
  useEffect(() => {
    refresh()
    new WebAuthnPasskeyProvider().isSupported().then(setPrf)
  }, [])

  const protection = (): Protection =>
    forcePassword ? { kind: 'password', password } : { kind: 'passkey', passkey: new WebAuthnPasskeyProvider({ name: 'QoreConnect (dev)' }) }

  const run = (fn: () => Promise<string>) => async () => {
    setOut('working…')
    try {
      setOut(await fn())
      await refresh()
    } catch (e) {
      setOut(e instanceof QoreConnectError ? `${e.code}: ${e.message}` : String(e))
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8 font-mono text-sm">
      <h1 className="text-xl font-semibold">/dev/vault</h1>
      <p>PRF likely supported: {String(prf)}</p>
      <pre className="whitespace-pre-wrap rounded bg-neutral-100 p-3">{info}</pre>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={forcePassword} onChange={(e) => setForcePassword(e.target.checked)} /> force password (PRF off)
      </label>
      {forcePassword && <input className="w-full border p-2" type="password" placeholder="password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} />}
      <div className="flex flex-wrap gap-2">
        <button className="rounded border px-3 py-1" onClick={run(async () => { const s = await vault.create(protection()); return `created ${s.qorAddress}` })}>Create</button>
        <button className="rounded border px-3 py-1" onClick={run(async () => { const s = await vault.unlock(protection()); const ok = s.verifyMessage(new Uint8Array([1]), s.signMessage(new Uint8Array([1]))); s.lock(); return `unlocked ${s.qorAddress} (ML-DSA self-check ${ok})` })}>Unlock</button>
        <button className="rounded border px-3 py-1" onClick={run(async () => (await vault.exportRecoveryCode(protection())).split(' ').length + ' words exported (not shown on the dev page)')}>Export check</button>
        <button className="rounded border px-3 py-1" onClick={run(async () => { await vault.remove(); return 'removed' })}>Remove</button>
      </div>
      <pre className="whitespace-pre-wrap rounded bg-neutral-100 p-3">{out}</pre>
    </main>
  )
}
