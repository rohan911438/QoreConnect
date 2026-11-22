import { useEffect, useRef, useState } from 'react'
import {
  QoreConnectError,
  WebAuthnPasskeyProvider,
  onboardAndLink,
  type Eip1193Provider,
  type FlowEvent,
  type Limits,
  type LinkProof,
  type Protection,
  type QoreNetwork,
  type RootSigner,
  type RootVault,
} from '@qoreconnect/core'
import { Modal } from '../Modal'

export interface OnboardingModalProps {
  appName: string
  net: QoreNetwork
  vault: RootVault
  metamask: Eip1193Provider
  metamaskAddress?: string
  relayerUrl: string
  contracts: string[]
  limits?: Limits
  /** Show the stopwatch (dev mode and demo recordings). */
  showTimer?: boolean
  /** Force the password path (browsers without passkey PRF, or tests). */
  forcePassword?: boolean
  passkeyName?: string
  onDone: (root: RootSigner, ms: number) => void
  onCancel: () => void
}

type StepId = 'key' | 'sign' | 'sponsor' | 'register' | 'link'
type StepState = 'pending' | 'active' | 'done'

const STEPS: { id: StepId; label: string; help: string }[] = [
  {
    id: 'key',
    label: 'Create your quantum-safe key',
    help: 'ML-DSA-87, protected by your passkey. It never leaves this device.',
  },
  { id: 'sign', label: 'Sign once in MetaMask', help: 'Proves this MetaMask belongs to you. Costs nothing.' },
  { id: 'sponsor', label: 'Sponsor your first fees', help: 'QoreConnect pays the setup fees on Diana testnet.' },
  {
    id: 'register',
    label: 'Register the quantum-safe key on QoreChain',
    help: 'Your root account now holds a post-quantum key.',
  },
  {
    id: 'link',
    label: 'Link MetaMask as a capped key',
    help: 'Classical, capped: limited spend, approved contracts only, revocable.',
  },
]

const STEP_OF: Partial<Record<FlowEvent['step'], [StepId, StepState]>> = {
  creating: ['key', 'active'],
  created: ['key', 'done'],
  signing: ['sign', 'active'],
  signed: ['sign', 'done'],
  checking: ['sponsor', 'active'],
  sponsoring: ['sponsor', 'active'],
  sponsored: ['sponsor', 'done'],
  'waiting-funds': ['sponsor', 'active'],
  registering: ['register', 'active'],
  registered: ['register', 'done'],
  linking: ['link', 'active'],
  linked: ['link', 'done'],
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/** After this long without progress, tell the user the testnet is slow (so the window does not look frozen). */
const SLOW_AFTER_MS = 12_000
/** Timeouts and network errors are retried automatically this many times before the user sees an error. */
const AUTO_RETRIES = 2
/** Chain or network hiccups are worth retrying; a rejected signature or a refused transaction is not. */
export const isTransient = (e: unknown): boolean => {
  const text = `${(e as any)?.code ?? ''} ${(e as any)?.name ?? ''} ${(e as Error)?.message ?? e}`
  return (
    !/REJECT|DENIED|LIMIT|INSUFFICIENT|UNAUTHORI/i.test(text) &&
    /timed? ?out|TimeoutError|network|fetch failed|not included in time|HTTP 5\d\d|ECONNRESET/i.test(text)
  )
}

/**
 * Flow A: one explanation screen → passkey → progress (sponsor, register, link) with ONE MetaMask signature → done.
 * Every failure shows a clear message and a Retry that resumes where it stopped.
 */
export function OnboardingModal(p: OnboardingModalProps) {
  const [phase, setPhase] = useState<'intro' | 'running' | 'error' | 'done'>('intro')
  const [steps, setSteps] = useState<Record<StepId, StepState>>({
    key: 'pending',
    sign: 'pending',
    sponsor: 'pending',
    register: 'pending',
    link: 'pending',
  })
  const [error, setError] = useState<string>()
  const [existing, setExisting] = useState<{ qorAddress: string; kdf: string } | null>(null)
  const [usePassword, setUsePassword] = useState(!!p.forcePassword)
  const [password, setPassword] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [slow, setSlow] = useState(false)
  const lastProgress = useRef(0)
  const autoRetries = useRef(0)
  const [result, setResult] = useState<{ root: RootSigner; ms: number }>()
  const t0 = useRef<number>(0)
  const root = useRef<RootSigner | undefined>(undefined)
  const proof = useRef<LinkProof | undefined>(undefined)
  const primary = useRef<HTMLButtonElement>(null)
  const passkey = useRef(new WebAuthnPasskeyProvider({ name: p.passkeyName ?? 'QoreConnect' }))

  useEffect(() => {
    p.vault.info().then((i) => setExisting(i ? { qorAddress: i.qorAddress, kdf: i.kdf } : null))
    if (!p.forcePassword) passkey.current.isSupported().then((ok) => !ok && setUsePassword(true))
  }, [p.vault, p.forcePassword])

  useEffect(() => {
    if (phase !== 'running') return setSlow(false)
    const id = setInterval(() => setSlow(Date.now() - lastProgress.current > SLOW_AFTER_MS), 1000)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'running' || !p.showTimer) return
    const id = setInterval(() => setElapsed(Date.now() - t0.current), 100)
    return () => clearInterval(id)
  }, [phase, p.showTimer])

  const protection = (): Protection =>
    usePassword ? { kind: 'password', password } : { kind: 'passkey', passkey: passkey.current }
  const passwordNeeded = existing ? existing.kdf === 'scrypt' : usePassword
  const canStart = !passwordNeeded || password.length >= 8

  const run = async () => {
    if (!t0.current) t0.current = Date.now()
    setPhase('running')
    setError(undefined)
    lastProgress.current = Date.now()
    try {
      if (!root.current) {
        if (existing) {
          setSteps((s) => ({ ...s, key: 'active' }))
          const prot: Protection =
            existing.kdf === 'scrypt' ? { kind: 'password', password } : { kind: 'passkey', passkey: passkey.current }
          root.current = await p.vault.unlock(prot)
        }
      }
      const r = await onboardAndLink({
        net: p.net,
        vault: p.vault,
        root: root.current,
        protection: root.current ? undefined : protection(),
        metamask: p.metamask,
        metamaskAddress: p.metamaskAddress,
        relayerUrl: p.relayerUrl,
        contracts: p.contracts,
        limits: p.limits,
        linkProof: proof.current,
        onEvent: (e) => {
          lastProgress.current = Date.now()
          setSlow(false)
          if (e.step === 'created') {
            if (!root.current) setSteps((s) => ({ ...s, key: 'done' }))
            if (e.root) root.current = e.root
          }
          if (e.step === 'signed' && e.proof) proof.current = e.proof
          const m = STEP_OF[e.step]
          if (m) setSteps((s) => ({ ...s, [m[0]]: s[m[0]] === 'done' ? 'done' : m[1] }))
          if (e.step === 'registered') setSteps((s) => ({ ...s, sponsor: 'done', register: 'done' }))
        },
      })
      root.current = r.root
      proof.current = r.linkProof
      const ms = Date.now() - t0.current
      setElapsed(ms)
      setResult({ root: r.root, ms })
      setPhase('done')
    } catch (e) {
      // Resume automatically after a testnet hiccup; completed steps (and the MetaMask signature) are kept.
      if (isTransient(e) && autoRetries.current < AUTO_RETRIES) {
        autoRetries.current++
        await new Promise((r) => setTimeout(r, 1500))
        return run()
      }
      autoRetries.current = 0
      setSteps(
        (s) =>
          Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === 'active' ? 'pending' : v])) as Record<
            StepId,
            StepState
          >,
      )
      setError(e instanceof QoreConnectError ? e.message : e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  const timer = p.showTimer && (phase === 'running' || phase === 'done' || phase === 'error') && (
    <p className="qc-timer" aria-live="off" data-testid="qc-timer">
      {fmt(elapsed)}
    </p>
  )

  if (phase === 'intro') {
    return (
      <Modal
        testId="qc-onboarding"
        eyebrow={`${p.appName} · QoreChain Diana testnet`}
        title={existing ? 'Link this MetaMask' : 'Give your account a quantum-safe key'}
        description={
          existing
            ? 'This device already holds your quantum-safe key. Unlock it and sign once in MetaMask to link this MetaMask as a capped key.'
            : 'Crypto without the homework: one passkey tap and one MetaMask signature. Under a minute.'
        }
        onClose={p.onCancel}
        initialFocus={primary}
        actions={
          <>
            <button type="button" className="qc-btn qc-secondary" onClick={p.onCancel}>
              Not now
            </button>
            <button ref={primary} type="button" className="qc-btn qc-primary" onClick={run} disabled={!canStart}>
              {passwordNeeded ? 'Continue' : existing ? 'Unlock with passkey' : 'Create with passkey'}
            </button>
          </>
        }
      >
        <ul className="qc-list">
          <li>
            <strong>Quantum-safe root.</strong> A post-quantum key (ML-DSA-87) controls your account. It stays on this
            device.
          </li>
          <li>
            <strong>MetaMask convenience.</strong> MetaMask keeps signing, as a classical key with limits: approved
            contracts only, a daily cap, revocable in one step.
          </li>
          <li>
            <strong>No gas to buy.</strong> Fees are sponsored on Diana testnet.
          </li>
        </ul>
        {passwordNeeded && (
          <label className="qc-field">
            <span>
              {existing
                ? 'Password for your quantum-safe key'
                : 'This browser has no passkey support. Choose a password (8+ characters).'}
            </span>
            <input
              type="password"
              autoComplete={existing ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
      </Modal>
    )
  }

  if (phase === 'done' && result) {
    return (
      <Modal
        testId="qc-onboarding"
        eyebrow="Done"
        title="You're on QoreChain"
        description={`Your account has a quantum-safe root and MetaMask is linked as a capped key${p.showTimer ? `, in ${fmt(result.ms)}` : ''}.`}
        initialFocus={primary}
        actions={
          <button
            ref={primary}
            type="button"
            className="qc-btn qc-primary"
            onClick={() => p.onDone(result.root, result.ms)}
          >
            Continue to {p.appName}
          </button>
        }
      >
        {timer}
        <dl className="qc-rows">
          <div>
            <dt>Account</dt>
            <dd className="qc-mono qc-break">{result.root.qorAddress}</dd>
          </div>
          <div>
            <dt>Root key</dt>
            <dd>
              <span className="qc-badge qc-ok">Quantum-safe</span>
            </dd>
          </div>
          <div>
            <dt>MetaMask</dt>
            <dd>
              <span className="qc-badge qc-warn">Classical, capped</span>
            </dd>
          </div>
        </dl>
      </Modal>
    )
  }

  return (
    <Modal
      testId="qc-onboarding"
      eyebrow={`${p.appName} · QoreChain Diana testnet`}
      title={phase === 'error' ? 'Something stopped' : 'Setting up your account'}
      description={phase === 'error' ? undefined : 'Keep this window open. MetaMask will ask for one signature.'}
      onClose={phase === 'error' ? p.onCancel : undefined}
      initialFocus={primary}
      actions={
        phase === 'error' ? (
          <>
            <button type="button" className="qc-btn qc-secondary" onClick={p.onCancel}>
              Cancel
            </button>
            <button ref={primary} type="button" className="qc-btn qc-primary" onClick={run}>
              Retry
            </button>
          </>
        ) : undefined
      }
    >
      {timer}
      <ol className="qc-steps" aria-label="Progress">
        {STEPS.map((s) => (
          <li
            key={s.id}
            className={`qc-step qc-step-${steps[s.id]}`}
            aria-current={steps[s.id] === 'active' ? 'step' : undefined}
          >
            <span className="qc-dot" aria-hidden="true">
              {steps[s.id] === 'done' ? '✓' : ''}
            </span>
            <span>
              <strong>{s.label}</strong>
              <span className="qc-visually-hidden"> ({steps[s.id]})</span>
              <span className="qc-muted qc-block">{s.help}</span>
            </span>
          </li>
        ))}
      </ol>
      {phase === 'running' && slow && (
        <p role="status" className="qc-slow" data-testid="qc-slow">
          QoreChain Diana testnet is responding slowly. Still working, no need to retry.
        </p>
      )}
      {phase === 'error' && (
        <p role="alert" className="qc-error">
          {error} Retry continues from the last completed step.
        </p>
      )}
    </Modal>
  )
}
