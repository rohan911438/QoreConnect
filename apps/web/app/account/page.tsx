'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  QoreClient,
  QoreConnectError,
  RelayerClient,
  WebAuthnPasskeyProvider,
  explorerAddress,
  explorerTx,
  formatQor,
  getSessionState,
  renewSessionKey,
  renewTtlSeconds,
  parseQor,
  approveDapp,
  removeDapp,
  revokeKeys,
  setLimits,
  LIMIT_PRESETS,
  describeLimits,
  matchPreset,
  type Protection,
  type RelayActivity,
  type SessionState,
} from '@rohankumar4179/core'
import { UnlockPrompt } from '@rohankumar4179/react'
import { ConnectButton } from '../../components/ConnectButton'
import { AgentsPanel } from '../../components/AgentsPanel'
import { ApprovalsPanel } from '../../components/ApprovalsPanel'
import { PageHeader } from '../../components/PageHeader'
import { CONTRACT_NAMES, RECOVERY_PROMPT_UQOR, RELAYER_URL, qore } from '../../lib/qore'
import { timeLeft } from '../../lib/time'

type Info = { qorAddress: string; evmAddress: string; kdf: string }
type Data = {
  balance: bigint
  pqc: { registered: boolean; possessionProven: boolean }
  state: SessionState
  activity: RelayActivity[]
}

const short = (a: string, n = 6) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-4)}` : a)
const errText = (e: unknown) => (e instanceof QoreConnectError ? e.message : e instanceof Error ? e.message : String(e))
const SOON_S = 24 * 3600

const BLOCKED_CODES = new Set(['LIMIT_EXCEEDED', 'NOT_APPROVED', 'EXPIRED', 'REVOKED', 'NO_RULE'])

function Card({
  title,
  children,
  tone,
  id,
  action,
  hint,
}: {
  title: string
  children: ReactNode
  tone?: 'danger'
  id?: string
  action?: ReactNode
  hint?: string
}) {
  return (
    <section
      aria-labelledby={id}
      className={`qw-surface overflow-hidden ${tone === 'danger' ? '!border-bad/40 bg-[radial-gradient(120%_80%_at_100%_0%,var(--bad-bg),transparent_60%)]' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-5 py-4 sm:px-6">
        <div>
          <h2 id={id} className={`text-base font-semibold tracking-tight ${tone === 'danger' ? 'text-bad' : ''}`}>
            {title}
          </h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  const c = {
    ok: 'bg-ok-bg text-ok',
    warn: 'bg-warn-bg text-warn',
    bad: 'bg-bad-bg text-bad',
    muted: 'bg-panel-2 text-muted',
  }[tone]
  return <span className={`qw-chip ${c}`}>{children}</span>
}

function Btn({
  children,
  onClick,
  tone = 'default',
  disabled,
  testId,
}: {
  children: ReactNode
  onClick: () => void
  tone?: 'default' | 'primary' | 'danger'
  disabled?: boolean
  testId?: string
}) {
  const c = { default: '', primary: 'qw-btn-primary', danger: 'qw-btn-danger' }[tone]
  return (
    <button type="button" data-testid={testId} onClick={onClick} disabled={disabled} className={`qw-btn ${c}`}>
      {children}
    </button>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' }) {
  return (
    <div className="qw-surface p-5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p
        className={`mt-2 font-display text-3xl font-semibold tracking-[-0.03em] ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : ''}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  )
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="break-all font-mono text-[13px]">{children}</span>
}

export default function AccountPage() {
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [data, setData] = useState<Data>()
  const [loadError, setLoadError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: ReactNode }>()
  const [killed, setKilled] = useState(false)
  const [mmAddress, setMmAddress] = useState<string>()
  // Ticks every 30 s so key countdowns stay current.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  /** Set by the Doctor's "Approve this dApp" fix: /account?approve=0x…#dapps */
  const [approveTarget, setApproveTarget] = useState<string>()

  const load = useCallback(async () => {
    const { vault, net } = qore()
    const i = await vault.info()
    setInfo(i ?? null)
    if (!i) return
    try {
      const client = new QoreClient(net)
      const [balance, pqc, state, activity] = await Promise.all([
        client.getBalance(i.qorAddress),
        client.getPqcKey(i.qorAddress, { fresh: true }),
        getSessionState({ net }, i.qorAddress),
        new RelayerClient(RELAYER_URL).activity(i.qorAddress),
      ])
      setData({ balance, pqc, state, activity })
      setLoadError(undefined)
    } catch (e) {
      setLoadError(errText(e))
    }
  }, [])

  useEffect(() => {
    void load()
    const p = qore().provider
    setMmAddress(p.sessionKeyAddress)
    const t = new URLSearchParams(location.search).get('approve')?.toLowerCase()
    if (t && /^0x[0-9a-f]{40}$/.test(t)) setApproveTarget(t)
  }, [load])

  /** Run a root-signed change: unlock (passkey tap or password), sign, reload. */
  const rootAction = async (
    label: string,
    fn: (ctx: { root: Awaited<ReturnType<ReturnType<typeof qore>['ui']['unlock']>> }) => Promise<ReactNode>,
  ) => {
    setBusy(label)
    setNotice(undefined)
    try {
      const root = await qore().ui.unlock(label)
      const text = await fn({ root })
      setNotice({ tone: 'ok', text })
      await load()
    } catch (e) {
      if (!(e instanceof QoreConnectError && e.code === 'USER_REJECTED')) setNotice({ tone: 'bad', text: errText(e) })
    } finally {
      setBusy(undefined)
    }
  }

  if (info === undefined)
    return (
      <div className="space-y-4 pt-16" aria-busy="true">
        <p className="text-muted">Loading your account…</p>
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="qw-surface h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )

  if (info === null) {
    return (
      <div className="space-y-10">
        <PageHeader
          eyebrow="Account · Diana testnet"
          title="Your account"
          intro="No quantum-safe key on this device yet."
        />
        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="qw-surface qw-ring relative overflow-hidden p-7 sm:p-9">
            <div
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-[radial-gradient(90%_80%_at_0%_0%,var(--aurora-1),transparent_60%)]"
            />
            <p className="qw-eyebrow">New here</p>
            <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight">Create a quantum-safe root</h2>
            <p className="mt-3 max-w-md text-muted">
              One passkey tap, one MetaMask signature, nothing to pay. About half a minute.
            </p>
            <ol className="mt-6 space-y-2.5 text-sm">
              {[
                'Passkey creates an ML-DSA-87 key on this device',
                'MetaMask links as a capped session key',
                'Setup gas is sponsored',
              ].map((t, i) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-line bg-panel font-mono text-[11px] text-accent">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
            <div className="mt-8">
              <ConnectButton size="lg" />
            </div>
          </div>
          <Restore onRestored={load} />
        </div>
      </div>
    )
  }

  const { net } = qore()
  const state = data?.state
  const rule = state?.managed
  const classical = state?.keys.filter((k) => k.active && k.isMetaMask) ?? []
  const allKeys = state?.keys.filter((k) => !k.revoked) ?? []
  const rootActive = !!data?.pqc.registered && !!data?.pqc.possessionProven
  const dailyCap = rule && classical.length ? rule.dailyLimit : 0n
  const renewDays = rule ? renewTtlSeconds(rule.perTxLimit, rule.dailyLimit) / 86_400 : 7
  const renewLabel = `Renew for ${renewDays} day${renewDays === 1 ? '' : 's'}`
  // The MetaMask key that needs attention: the connected one if linked, else the one expiring first.
  const mmKeys = allKeys.filter((k) => k.isMetaMask && k.expiryUnix > 0)
  const focusKey =
    mmKeys.find((k) => mmAddress && ('0x' + k.pubkeyHex).toLowerCase() === mmAddress.toLowerCase()) ??
    [...mmKeys].sort((a, b) => a.expiryUnix - b.expiryUnix)[0]
  const focusLeft = focusKey ? focusKey.expiryUnix - Math.floor(now / 1000) : Infinity
  const renew = (addr: string) =>
    rootAction(renewLabel, async ({ root }) => {
      const mm = await qore().provider.upstream()
      const r = await renewSessionKey({ net, root, metamask: mm, metamaskAddress: addr })
      return `Renewed until ${new Date(r.expiryUnix * 1000).toLocaleString()}. Your limits and approved dApps are unchanged.`
    })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account · QoreChain Diana testnet"
        title="Your account"
        actions={
          <Btn onClick={() => void load()} disabled={!!busy}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
            </svg>
            Refresh
          </Btn>
        }
      />

      {notice && (
        <div
          role="status"
          className={`qw-rise rounded-2xl border px-4 py-3 text-sm ${notice.tone === 'ok' ? 'border-ok/30 bg-ok-bg text-ok' : 'border-bad/30 bg-bad-bg text-bad'}`}
        >
          {notice.text}
        </div>
      )}
      {loadError && (
        <div role="alert" className="rounded-2xl border border-bad/30 bg-bad-bg px-4 py-3 text-sm text-bad">
          Could not read your account from QoreChain: {loadError}{' '}
          <button className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {data && data.balance >= RECOVERY_PROMPT_UQOR && <RecoveryNudge />}

      {focusKey && focusLeft < SOON_S && (
        <div
          role="alert"
          data-testid="expiry-alert"
          className={`qw-rise flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${focusLeft <= 0 ? 'border-bad/30 bg-bad-bg text-bad' : 'border-warn/30 bg-warn-bg text-warn'}`}
        >
          <span>
            {focusLeft <= 0
              ? `Your MetaMask key ${short('0x' + focusKey.pubkeyHex)} has expired, so dApps cannot use it. Renew it to keep your limits and approved dApps.`
              : `Your MetaMask key ${short('0x' + focusKey.pubkeyHex)} expires in ${timeLeft(focusKey.expiryUnix, now)}.`}
          </span>
          {mmAddress && ('0x' + focusKey.pubkeyHex).toLowerCase() === mmAddress.toLowerCase() ? (
            <Btn
              tone="primary"
              disabled={!!busy}
              onClick={() => renew('0x' + focusKey.pubkeyHex)}
              testId="expiry-renew"
            >
              {renewLabel}
            </Btn>
          ) : (
            <span className="font-medium">Connect this MetaMask to renew it.</span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Balance"
          value={
            data ? (
              <>
                {formatQor(data.balance)} <span className="text-base text-muted">QOR</span>
              </>
            ) : (
              '…'
            )
          }
          sub="Diana testnet, no real value"
        />
        <Stat
          label="Quantum-safe root"
          value={!data ? '…' : rootActive ? 'Active' : 'Not set'}
          tone={rootActive ? 'ok' : 'warn'}
          sub="ML-DSA-87 + secp256k1 hybrid"
        />
        <Stat
          label="Classical keys"
          value={state ? classical.length : '…'}
          sub={classical.length ? 'capped, scoped, revocable' : 'only your root can act'}
        />
        <Stat label="Approved dApps" value={state ? state.approved.length : '…'} sub="MetaMask can call only these" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Card
            title="Account"
            id="acct"
            action={
              rootActive ? (
                <Badge tone="ok">Quantum-safe root: active</Badge>
              ) : (
                <Badge tone="warn">Quantum-safe root: not registered</Badge>
              )
            }
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-[140px_1fr]">
              <dt className="text-muted">Account (qor1)</dt>
              <dd data-testid="qor-address">
                <a
                  className="hover:underline"
                  href={explorerAddress(net, info.qorAddress)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Mono>{info.qorAddress}</Mono>
                </a>
              </dd>
              <dt className="text-muted">EVM address (0x)</dt>
              <dd>
                <Mono>{info.evmAddress}</Mono>
              </dd>
              <dt className="text-muted">Balance</dt>
              <dd>{data ? `${formatQor(data.balance)} QOR` : '…'}</dd>
              <dt className="text-muted">Root key</dt>
              <dd>
                ML-DSA-87 + secp256k1 hybrid, protected by{' '}
                {info.kdf === 'passkey-prf' ? 'your passkey' : 'your password'} on this device.{' '}
                {data && (data.pqc.possessionProven ? 'Possession proven on chain.' : 'Possession not proven yet.')}
              </dd>
            </dl>
          </Card>

          <Card title="Keys" id="keys">
            {!state ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : allKeys.length === 0 ? (
              <p className="text-sm text-muted" data-testid="no-keys">
                No session keys. Only your quantum-safe root key can act.
              </p>
            ) : (
              <ul className="divide-y divide-line" data-testid="key-list">
                {allKeys.map((k) => {
                  const addr = '0x' + k.pubkeyHex
                  const expired = k.expiryUnix > 0 && k.expiryUnix * 1000 < now
                  const soon = !expired && k.expiryUnix > 0 && k.expiryUnix - now / 1000 < SOON_S
                  const isCurrent = mmAddress && addr.toLowerCase() === mmAddress.toLowerCase()
                  return (
                    <li
                      key={k.pubkeyHex}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{k.isMetaMask ? 'MetaMask' : k.label}</strong>
                          <Badge tone={expired ? 'muted' : 'warn'}>{expired ? 'Expired' : 'Classical, capped'}</Badge>
                          {isCurrent && <Badge tone="muted">This MetaMask</Badge>}
                        </div>
                        <div>
                          <Mono>{addr}</Mono>
                        </div>
                        <div className="text-muted">
                          {k.expiryUnix ? (
                            <span
                              className={soon ? 'font-medium text-warn' : undefined}
                              data-testid="key-countdown"
                              title={new Date(k.expiryUnix * 1000).toLocaleString()}
                            >
                              {expired
                                ? `Expired ${new Date(k.expiryUnix * 1000).toLocaleString()}`
                                : `Expires in ${timeLeft(k.expiryUnix, now)}`}
                            </span>
                          ) : (
                            'No expiry'
                          )}
                          {rule &&
                            ` · ${formatQor(rule.perTxLimit)} QOR per tx · ${formatQor(rule.dailyLimit)} QOR per day`}
                          {` · ${state.approved.length} approved contract${state.approved.length === 1 ? '' : 's'}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Btn disabled={!!busy || !isCurrent} testId="renew-key" onClick={() => renew(addr)}>
                          {renewLabel}
                        </Btn>
                        <Btn
                          testId="revoke-one"
                          disabled={!!busy}
                          onClick={() =>
                            rootAction('Revoke this key', async ({ root }) => {
                              await revokeKeys({ net, root, keys: [k.pubkeyHex] })
                              return `Revoked ${short(addr)}.`
                            })
                          }
                        >
                          Revoke
                        </Btn>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            {state &&
              allKeys.some((k) => !mmAddress || ('0x' + k.pubkeyHex).toLowerCase() !== mmAddress.toLowerCase()) && (
                <p className="mt-2 text-xs text-muted">
                  Renew needs that MetaMask account connected, because MetaMask signs the renewal.
                </p>
              )}
            {state && !mmAddress && (
              <div className="mt-4">
                <ConnectButton />
              </div>
            )}
          </Card>

          <Card title="Approved dApps" id="dapps">
            {approveTarget && state && !state.approved.includes(approveTarget) && (
              <div
                className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn"
                data-testid="approve-from-doctor"
              >
                <span>
                  Approve <Mono>{short(approveTarget)}</Mono>
                  {CONTRACT_NAMES[approveTarget] ? ` (${CONTRACT_NAMES[approveTarget]})` : ''} so MetaMask can call it
                  within your limits?
                </span>
                <Btn
                  disabled={!!busy}
                  onClick={() =>
                    rootAction('Approve this dApp', async ({ root }) => {
                      await approveDapp({ net, root, contracts: [approveTarget] })
                      setApproveTarget(undefined)
                      return 'Approved. MetaMask can now call this contract for your account, within your limits.'
                    })
                  }
                >
                  Approve
                </Btn>
              </div>
            )}
            {!state ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : state.approved.length === 0 ? (
              <p className="text-sm text-muted">
                No approved contracts. dApps ask for approval the first time they need it.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {state.approved.map((c) => {
                  const [addr, sel] = c.split('/')
                  return (
                    <li
                      key={c}
                      className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{CONTRACT_NAMES[addr!] ?? 'Contract'}</div>
                        <a
                          className="hover:underline"
                          href={explorerAddress(net, addr!)}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <Mono>{addr}</Mono>
                        </a>
                        {sel && <span className="text-muted"> · function {sel} only</span>}
                      </div>
                      <Btn
                        disabled={!!busy}
                        onClick={() =>
                          rootAction('Remove this dApp', async ({ root }) => {
                            await removeDapp({ net, root, contracts: [c] })
                            return 'Removed. MetaMask can no longer call this contract for your account.'
                          })
                        }
                      >
                        Remove
                      </Btn>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <ApprovalsPanel
            net={net}
            account={info.qorAddress}
            evmAddress={info.evmAddress}
            busy={!!busy}
            rootAction={rootAction}
          />

          {rule && (
            <LimitsEditor
              perTx={rule.perTxLimit}
              daily={rule.dailyLimit}
              approvedDapps={state?.approved.length ?? 0}
              busy={!!busy}
              onSave={(perTxUqor, dailyUqor) =>
                rootAction('Change your limits', async ({ root }) => {
                  await setLimits({ net, root, limits: { perTxUqor, dailyUqor } })
                  return `Limits set: ${formatQor(perTxUqor)} QOR per transaction, ${formatQor(dailyUqor)} QOR per day.`
                })
              }
            />
          )}

          <AgentsPanel net={net} busy={!!busy} rootAction={rootAction} unlocked={() => qore().ui.peek()} />

          <Card title="Activity" id="activity">
            {!data ? (
              <p className="text-sm text-muted">Loading…</p>
            ) : data.activity.length === 0 ? (
              <p className="text-sm text-muted">No relayed transactions yet.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {data.activity.map((a, i) => {
                  const code = a.error?.split(':')[0] ?? ''
                  const blocked = !a.success && BLOCKED_CODES.has(code)
                  return (
                    <li
                      key={(a.txHash ?? '') + i}
                      className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {a.success ? (
                            <Badge tone="warn">Classical, capped</Badge>
                          ) : blocked ? (
                            <Badge tone="bad">Blocked by chain</Badge>
                          ) : (
                            <Badge tone="muted">Failed</Badge>
                          )}
                          <span>
                            {a.target ? (CONTRACT_NAMES[a.target] ?? short(a.target)) : 'Call'}
                            {a.valueUqor && a.valueUqor !== '0' ? ` · ${formatQor(a.valueUqor)} QOR` : ''}
                          </span>
                        </div>
                        <div className="text-muted">
                          {new Date(a.createdAt).toLocaleString()} · signed by MetaMask{' '}
                          {short(a.signer.startsWith('0x') ? a.signer : '0x' + a.signer)}
                          {!a.success && a.error ? ` · ${a.error.slice(0, 120)}` : ''}
                        </div>
                      </div>
                      {a.txHash && (
                        <a
                          className="shrink-0 text-accent hover:underline"
                          href={explorerTx(net, a.txHash)}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          Explorer
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24">
          <Card title="Q-Day damage cap" id="cap">
            <p className="text-base" data-testid="damage-cap">
              {classical.length === 0 ? (
                <>No classical key can act for this account. Only your quantum-safe root can sign.</>
              ) : (
                <>
                  If your MetaMask key were broken today, the most an attacker could take is{' '}
                  <strong>{formatQor(dailyCap)} QOR per day</strong>, only through{' '}
                  {state?.approved.length
                    ? `${state.approved.length} approved contract${state.approved.length > 1 ? 's' : ''}`
                    : 'no contracts (none approved)'}
                  , until you revoke it.
                </>
              )}
            </p>
          </Card>

          <Card title="Q-Day kill switch" id="kill" tone="danger">
            {killed && classical.length === 0 ? (
              <p className="font-medium" data-testid="kill-success">
                Only your quantum-safe root key can act now.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">
                  If quantum computers break classical keys, revoke every classical key in one transaction, signed by
                  your quantum-safe root. dApps stop working with MetaMask until you link it again.
                </p>
                {classical.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {classical.map((k) => (
                      <li key={k.pubkeyHex}>
                        Will revoke: MetaMask <Mono>{short('0x' + k.pubkeyHex)}</Mono>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">There are no active classical keys.</p>
                )}
                <Btn
                  tone="danger"
                  testId="kill-switch"
                  disabled={!!busy || classical.length === 0}
                  onClick={() =>
                    rootAction('Revoke every classical key', async ({ root }) => {
                      const r = await revokeKeys({ net, root, keys: 'all-classical' })
                      setKilled(true)
                      return (
                        <>
                          Revoked {r.revoked} classical key{r.revoked === 1 ? '' : 's'}.{' '}
                          {r.tx && (
                            <a
                              className="underline"
                              href={explorerTx(net, r.tx.transactionHash)}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              View transaction
                            </a>
                          )}
                        </>
                      )
                    })
                  }
                >
                  {busy === 'Revoke every classical key' ? 'Revoking…' : 'Revoke every classical key'}
                </Btn>
              </div>
            )}
          </Card>

          <Recovery info={info} />
        </aside>
      </div>
      <p className="text-sm text-muted">
        Looking for a dApp to try? Open the{' '}
        <Link className="underline" href="/">
          home page
        </Link>{' '}
        for the demo and the developer guide.
      </p>
    </div>
  )
}

const tryQor = (v: string): bigint | undefined => {
  try {
    return parseQor(v)
  } catch {
    return undefined
  }
}

function LimitsEditor({
  perTx,
  daily,
  approvedDapps,
  busy,
  onSave,
}: {
  perTx: bigint
  daily: bigint
  approvedDapps: number
  busy: boolean
  onSave: (perTx: bigint, daily: bigint) => void
}) {
  const [a, setA] = useState(formatQor(perTx))
  const [b, setB] = useState(formatQor(daily))
  const [err, setErr] = useState<string>()
  useEffect(() => {
    setA(formatQor(perTx))
    setB(formatQor(daily))
  }, [perTx, daily])
  const save = () => {
    try {
      const x = parseQor(a)
      const y = parseQor(b)
      if (x <= 0n || y <= 0n) throw new Error('Limits must be above zero.')
      if (x > y) throw new Error('The per-transaction limit cannot be above the daily limit.')
      setErr(undefined)
      onSave(x, y)
    } catch (e) {
      setErr(errText(e))
    }
  }
  const x = tryQor(a)
  const y = tryQor(b)
  const current = matchPreset(perTx, daily)
  const picked = x !== undefined && y !== undefined ? matchPreset(x, y) : undefined
  const changed = x !== perTx || y !== daily
  const summary =
    x !== undefined && y !== undefined && x > 0n && y > 0n
      ? describeLimits({ perTxUqor: x, dailyUqor: y, ttlDays: picked?.ttlDays }, { approvedDapps })
      : undefined
  return (
    <Card title="Limits" id="limits">
      <p className="mb-4 text-sm text-muted">
        The chain enforces these for every classical key on this account. Changing them needs your quantum-safe root.
        {current ? (
          <>
            {' '}
            Current profile: <strong className="text-fg">{current.name}</strong>.
          </>
        ) : (
          <> Current profile: custom.</>
        )}
      </p>
      <div
        className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        role="group"
        aria-label="Safety profiles"
        data-testid="limit-presets"
      >
        {LIMIT_PRESETS.map((p) => {
          const on = picked?.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              data-testid={`preset-${p.id}`}
              onClick={() => {
                setA(formatQor(p.perTxUqor))
                setB(formatQor(p.dailyUqor))
                setErr(undefined)
              }}
              className={`rounded-2xl border p-3 text-left transition ${on ? 'border-accent bg-panel-2 shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_18%,transparent)]' : 'border-line hover:border-muted'}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{p.name}</span>
                {current?.id === p.id && (
                  <span className="text-[11px] uppercase tracking-wider text-muted">current</span>
                )}
              </span>
              <span className="mt-1 block font-mono text-xs text-muted">
                {formatQor(p.perTxUqor)} / tx · {formatQor(p.dailyUqor)} / day · {p.ttlDays}d
              </span>
              <span className="mt-1.5 block text-xs leading-snug text-muted">{p.tagline}</span>
            </button>
          )
        })}
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Per transaction (QOR)</span>
          <input inputMode="decimal" className="qw-input" value={a} onChange={(e) => setA(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          <span>Per day (QOR)</span>
          <input inputMode="decimal" className="qw-input" value={b} onChange={(e) => setB(e.target.value)} />
        </label>
        <Btn tone="primary" onClick={save} disabled={busy || !changed} testId="limits-save">
          Save with passkey
        </Btn>
      </div>
      {summary && (
        <div
          className="mt-5 grid gap-4 rounded-2xl border border-line p-4 text-sm sm:grid-cols-2"
          data-testid="limits-summary"
        >
          <div>
            <p className="mb-2 font-medium text-ok">With these limits MetaMask can</p>
            <ul className="space-y-1.5 text-muted">
              {summary.can.map((l) => (
                <li key={l}>✓ {l}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 font-medium text-bad">MetaMask cannot</p>
            <ul className="space-y-1.5 text-muted">
              {summary.cannot.map((l) => (
                <li key={l}>✕ {l}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {err}
        </p>
      )}
    </Card>
  )
}

/** Ask for the vault's protection (passkey tap or password) for recovery export. */
function useProtection(kdf: string) {
  const [ask, setAsk] = useState<{ resolve: (p: Protection) => void; reject: (e: unknown) => void }>()
  const get = (): Promise<Protection> =>
    kdf === 'passkey-prf'
      ? Promise.resolve({ kind: 'passkey', passkey: new WebAuthnPasskeyProvider({ name: 'QoreConnect' }) })
      : new Promise((resolve, reject) => setAsk({ resolve, reject }))
  const prompt = ask && (
    <UnlockPrompt
      reason="Your password decrypts the recovery code on this device."
      onSubmit={(password) => {
        ask.resolve({ kind: 'password', password })
        setAsk(undefined)
      }}
      onCancel={() => {
        ask.reject(new QoreConnectError('USER_REJECTED'))
        setAsk(undefined)
      }}
    />
  )
  return { get, prompt }
}

function RecoveryNudge() {
  return (
    <div className="rounded-2xl border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn">
      Your account now holds funds.{' '}
      <a href="#recovery" className="font-semibold underline">
        Save your recovery code
      </a>{' '}
      so you can restore it if this device is lost.
    </div>
  )
}

function Recovery({ info }: { info: Info }) {
  const { get, prompt } = useProtection(info.kdf)
  const [words, setWords] = useState<string[]>()
  const [quiz, setQuiz] = useState<{ index: number; answer: string }>()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()

  const reveal = async () => {
    setError(undefined)
    try {
      const code = await qore().vault.exportRecoveryCode(await get())
      const list = code.split(' ')
      setWords(list)
      setQuiz({ index: Math.floor(Math.random() * list.length), answer: '' })
    } catch (e) {
      if (!(e instanceof QoreConnectError && e.code === 'USER_REJECTED')) setError(errText(e))
    }
  }

  return (
    <Card title="Recovery" id="recovery">
      {prompt}
      <div className="space-y-4 text-sm">
        <p>
          Your quantum-safe key lives only on this device. The recovery code (24 words) restores it anywhere. Anyone
          with the code controls your account: write it on paper, never share it, and never type it into a website you
          do not trust.
        </p>
        {!words ? (
          <Btn tone="primary" onClick={reveal}>
            Save recovery code
          </Btn>
        ) : saved ? (
          <p className="text-ok">Recovery code confirmed. Keep it somewhere safe.</p>
        ) : (
          <div className="space-y-4">
            <ol
              className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-bg/50 p-4 font-mono text-[13px] sm:grid-cols-3"
              aria-label="Recovery code"
            >
              {words.map((w, i) => (
                <li key={i}>
                  <span className="text-muted">{i + 1}.</span> {w}
                </li>
              ))}
            </ol>
            {quiz && (
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (quiz.answer.trim().toLowerCase() === words[quiz.index]) {
                    setSaved(true)
                    setWords([])
                  } else setError(`That is not word ${quiz.index + 1}. Check what you wrote down.`)
                }}
              >
                <label className="grid gap-1">
                  <span>Check: type word {quiz.index + 1}</span>
                  <input
                    className="qw-input"
                    value={quiz.answer}
                    onChange={(e) => setQuiz({ ...quiz, answer: e.target.value })}
                  />
                </label>
                <button type="submit" className="qw-btn qw-btn-primary">
                  I wrote it down
                </button>
              </form>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
        <details className="rounded-2xl border border-line bg-bg/40 p-4">
          <summary className="cursor-pointer font-medium">Restore on a new device</summary>
          <p className="mt-2 text-muted">
            Open QoreConnect on the new device and choose Restore on the account page. Restoring here would replace the
            key stored on this device.
          </p>
        </details>
      </div>
    </Card>
  )
}

function Restore({ onRestored }: { onRestored: () => void }) {
  const [words, setWords] = useState('')
  const [password, setPassword] = useState('')
  const [usePassword, setUsePassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    const forced = new URLSearchParams(location.search).get('protect') === 'password'
    if (forced) setUsePassword(true)
    else new WebAuthnPasskeyProvider().isSupported().then((ok) => !ok && setUsePassword(true))
  }, [])
  const restore = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const protection: Protection = usePassword
        ? { kind: 'password', password }
        : { kind: 'passkey', passkey: new WebAuthnPasskeyProvider({ name: 'QoreConnect' }) }
      await qore().vault.restore(words, protection)
      onRestored()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="qw-surface space-y-4 p-7 sm:p-9">
      <p className="qw-eyebrow">Have a recovery code?</p>
      <h2 className="font-display text-2xl font-semibold tracking-tight">Restore on this device</h2>
      <p className="text-sm text-muted">
        Enter your 24-word recovery code. It is checked and encrypted on this device and never sent anywhere.
      </p>
      <label className="grid gap-1.5 text-sm font-medium">
        <span>Recovery code</span>
        <textarea
          rows={3}
          autoComplete="off"
          spellCheck={false}
          className="qw-input font-mono"
          value={words}
          onChange={(e) => setWords(e.target.value)}
        />
      </label>
      {usePassword && (
        <label className="grid gap-1.5 text-sm font-medium">
          <span>New password for this device (8+ characters)</span>
          <input
            type="password"
            autoComplete="new-password"
            className="qw-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      <Btn
        tone="primary"
        onClick={restore}
        disabled={busy || words.trim().split(/\s+/).length < 12 || (usePassword && password.length < 8)}
      >
        {busy ? 'Restoring…' : usePassword ? 'Restore' : 'Restore with passkey'}
      </Btn>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  )
}
