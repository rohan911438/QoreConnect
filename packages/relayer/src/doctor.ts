/**
 * Doctor (Flow G): explains why an account's next relayed transaction would fail. Checks run in a fixed order and
 * the first failure is the answer, with a one-click fix. Read-only; never signs anything.
 */
import { evmToQor, qorToEvm } from '@qorechain/sdk'
import { ruleBoundsEveryDenom, type AuthenticatorInfo, type PqcKeyInfo, type SpendingRuleInfo } from '@rohankumar4179/core'
import type { Tank } from './store'

export type DoctorCheckId = 'pqc-key' | 'evm-window' | 'linked-key' | 'rule' | 'target' | 'tank'
export type FixKind = 'onboard' | 'link' | 'renew' | 'set-rule' | 'approve' | 'contact-dapp'

export interface DoctorCheck {
  id: DoctorCheckId
  title: string
  status: 'pass' | 'fail' | 'info' | 'skip'
  detail: string
  fix?: { kind: FixKind; label: string }
}

export interface DoctorReport {
  account: string
  evmAddress: string
  target?: string
  tankId?: string
  healthy: boolean
  firstFailure?: DoctorCheck
  checks: DoctorCheck[]
  checkedAt: number
}

export interface DoctorChain {
  getPqcKey(address: string): Promise<PqcKeyInfo>
  getEvmWindow(address: string): Promise<{ open: boolean }>
  getAuthenticators(address: string): Promise<AuthenticatorInfo[]>
  getSpendingRules(address: string): Promise<SpendingRuleInfo[]>
}

export class DoctorInputError extends Error {}

/** Accepts `qor1…` or `0x…` (the account's own EVM address). */
export function normaliseAccount(input: string): { account: string; evmAddress: string } {
  const a = input.trim()
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return { account: evmToQor(a), evmAddress: a.toLowerCase() }
  if (/^qor1[0-9a-z]{38,58}$/.test(a)) {
    try {
      return { account: a, evmAddress: qorToEvm(a).toLowerCase() }
    } catch {
      /* fall through */
    }
  }
  throw new DoctorInputError('Enter a qor1… address or a 0x… address.')
}

/**
 * Does the allow-list let a call to `target` (optionally a selector) through? Same matching as the relayer pre-check and
 * the chain: an empty list allows any target; "0xtarget" covers every function; "0xtarget/0xselector" covers only that
 * function, so it does not cover the target when no selector (or another one) is given.
 */
export function allowListCovers(entries: string[], target: string, selector?: string): boolean {
  if (!entries.length) return true
  const t = target.toLowerCase()
  const s = selector?.toLowerCase()
  return entries.some((e) => {
    const [to, sel] = e.toLowerCase().split('/')
    return to === t && (!sel || sel === s)
  })
}

export async function runDoctor(
  chain: DoctorChain,
  input: { address: string; target?: string; selector?: string; tankId?: string; signer?: string },
  ctx: { getTank?: (id: string) => Tank | undefined; now?: number } = {},
): Promise<DoctorReport> {
  const { account, evmAddress } = normaliseAccount(input.address)
  const target = input.target?.trim().toLowerCase() || undefined
  if (target && !/^0x[0-9a-f]{40}$/.test(target)) throw new DoctorInputError('The target must be a 0x… contract address.')
  const nowS = Math.floor((ctx.now ?? Date.now()) / 1000)
  const checks: DoctorCheck[] = []
  const done = (): DoctorReport => {
    const firstFailure = checks.find((c) => c.status === 'fail')
    return { account, evmAddress, target, tankId: input.tankId, healthy: !firstFailure, firstFailure, checks, checkedAt: ctx.now ?? Date.now() }
  }
  const skipRest = (ids: [DoctorCheckId, string][]) => ids.forEach(([id, title]) => checks.push({ id, title, status: 'skip', detail: 'Skipped until the check above passes.' }))

  // 1. Quantum-safe root key registered.
  const pqc = await chain.getPqcKey(account)
  if (!pqc.registered) {
    checks.push({
      id: 'pqc-key',
      title: 'Quantum-safe root key',
      status: 'fail',
      detail: 'No ML-DSA-87 key is registered for this account, so it has no quantum-safe root and cannot link MetaMask.',
      fix: { kind: 'onboard', label: 'Create a quantum-safe account' },
    })
    skipRest([
      ['evm-window', 'EVM window'],
      ['linked-key', 'MetaMask linked'],
      ['rule', 'Spending limits'],
      ['target', 'dApp approved'],
      ['tank', 'Gas tank'],
    ])
    return done()
  }
  checks.push({ id: 'pqc-key', title: 'Quantum-safe root key', status: 'pass', detail: `ML-DSA-87 key registered${pqc.possessionProven ? ', possession proven' : ''}.` })

  // 2. EVM window: informational. Relayed calls run through the linked key and do not need it.
  const win = await chain.getEvmWindow(account).catch(() => ({ open: false }))
  checks.push({
    id: 'evm-window',
    title: 'EVM window',
    status: 'info',
    detail: win.open
      ? 'Open: the root can also send EVM transactions directly.'
      : 'Closed. Not needed for MetaMask calls through QoreConnect; only for direct EVM transactions from the root.',
  })

  // 3. A linked classical key, active.
  const [auths, rules] = await Promise.all([chain.getAuthenticators(account), chain.getSpendingRules(account)])
  const mm = auths.filter((a) => a.scheme === 'secp256k1' && (!input.signer || a.pubkeyHex.toLowerCase() === input.signer.toLowerCase().replace(/^0x/, '')))
  const active = mm.filter((a) => !a.revoked && (a.expiryUnix === 0 || a.expiryUnix > nowS))
  if (!active.length) {
    const expired = mm.filter((a) => !a.revoked && a.expiryUnix !== 0 && a.expiryUnix <= nowS).sort((a, b) => b.expiryUnix - a.expiryUnix)[0]
    const revoked = mm.some((a) => a.revoked)
    checks.push(
      expired
        ? {
            id: 'linked-key',
            title: 'MetaMask linked',
            status: 'fail',
            detail: `MetaMask was linked but its key expired on ${new Date(expired.expiryUnix * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC. The chain refuses its transactions.`,
            fix: { kind: 'renew', label: 'Renew MetaMask (one passkey tap)' },
          }
        : {
            id: 'linked-key',
            title: 'MetaMask linked',
            status: 'fail',
            detail: revoked ? 'Every MetaMask key on this account was revoked (kill switch or manual revoke).' : 'No MetaMask key is linked to this account.',
            fix: { kind: 'link', label: 'Link MetaMask' },
          },
    )
    skipRest([
      ['rule', 'Spending limits'],
      ['target', 'dApp approved'],
      ['tank', 'Gas tank'],
    ])
    return done()
  }
  const soonest = Math.min(...active.map((a) => a.expiryUnix || Infinity))
  checks.push({
    id: 'linked-key',
    title: 'MetaMask linked',
    status: 'pass',
    detail: `${active.length} active key${active.length > 1 ? 's' : ''}${Number.isFinite(soonest) ? `, expires ${new Date(soonest * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}.`,
  })

  // 4. An enabled rule bounding every denom.
  // The FIRST enabled rule is the one the chain and the relayer enforce (account-wide, P01 Q6).
  const managed = rules.find((r) => r.enabled)
  if (!managed || !ruleBoundsEveryDenom(managed)) {
    checks.push({
      id: 'rule',
      title: 'Spending limits',
      status: 'fail',
      detail: managed ? 'The spending rule does not cap every denomination it allows.' : 'No enabled spending rule. Without one the chain refuses capped keys.',
      fix: { kind: 'set-rule', label: 'Set default limits' },
    })
    skipRest([
      ['target', 'dApp approved'],
      ['tank', 'Gas tank'],
    ])
    return done()
  }
  checks.push({ id: 'rule', title: 'Spending limits', status: 'pass', detail: `Limits set: ${managed.perTxLimit} uqor per transaction, ${managed.dailyLimit} uqor per day.` })

  // 5. Target contract on the allow-list.
  if (!target) checks.push({ id: 'target', title: 'dApp approved', status: 'skip', detail: 'No contract given. Add ?target=0x… to check one.' })
  else if (!allowListCovers(managed.allowedEvmCalls, target, input.selector)) {
    checks.push({
      id: 'target',
      title: 'dApp approved',
      status: 'fail',
      detail: `${target} is not on this account's allow-list, so MetaMask cannot call it (chain code 10).`,
      fix: { kind: 'approve', label: 'Approve this dApp' },
    })
    checks.push({ id: 'tank', title: 'Gas tank', status: 'skip', detail: 'Skipped until the check above passes.' })
    return done()
  } else checks.push({ id: 'target', title: 'dApp approved', status: 'pass', detail: `${target} is approved.` })

  // 6. The dApp's gas tank can pay.
  const tank = input.tankId ? ctx.getTank?.(input.tankId) : undefined
  if (!input.tankId) checks.push({ id: 'tank', title: 'Gas tank', status: 'skip', detail: 'No gas tank given.' })
  else if (!tank || tank.paused || tank.balanceUqor <= 0n)
    checks.push({
      id: 'tank',
      title: 'Gas tank',
      status: 'fail',
      detail: !tank ? `Gas tank "${input.tankId}" does not exist on this relayer.` : tank.paused ? `Gas tank "${input.tankId}" is paused.` : `Gas tank "${input.tankId}" is empty.`,
      fix: { kind: 'contact-dapp', label: 'Tell the dApp its gas tank needs attention' },
    })
  else checks.push({ id: 'tank', title: 'Gas tank', status: 'pass', detail: `Gas tank "${tank.name}" can pay fees.` })

  return done()
}
