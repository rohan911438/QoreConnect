/**
 * Q-Day exposure report: how much of an account's value a quantum attacker (or anyone holding its classical keys)
 * could take, and why. Read-only; never signs anything. Testnet (Diana) only.
 *
 * Facts the model relies on, each checked on Diana:
 * - The chain parameter `hybrid_signature_mode` is "required" and `allow_classical_fallback` is false
 *   (GET /qorechain/pqc/v1/params, read live on every report). An account with a registered ML-DSA-87 key therefore
 *   cannot be moved by a classical signature alone.
 * - Registering the ML-DSA key is signed with the account's classical key ("classical bootstrap", spike/RESULTS.md Q4,
 *   tx A4A820DD…F839). Whoever controls the classical key of an account WITHOUT a registered ML-DSA key can register
 *   their own ML-DSA key first, so that account is fully claimable once its classical key is broken.
 * - A classical public key becomes public when the account signs its first transaction (cosmos auth `pub_key`, or any
 *   EVM transaction, since the key can be recovered from an ECDSA signature). Shor's algorithm needs the public key.
 * - Capped MetaMask keys can spend at most the account-wide daily limit of the first enabled spending rule, and only
 *   until they expire or are revoked (spike/RESULTS.md; enforced by the chain).
 *
 * The score is a heuristic summary of these facts, documented in docs/exposure.md. It is not an audit.
 */
import {
  ruleBoundsEveryDenom,
  type AuthenticatorInfo,
  type PqcKeyInfo,
  type PqcParams,
  type SpendingRuleInfo,
} from '@qoreconnect/core'
import { normaliseAccount } from './doctor'

export interface ExposureChain {
  getBalance(address: string): Promise<bigint>
  getPqcKey(address: string): Promise<PqcKeyInfo>
  getPqcParams(): Promise<PqcParams>
  getAccountPubkey(address: string): Promise<{ exists: boolean; pubkeyType?: string }>
  getAuthenticators(address: string): Promise<AuthenticatorInfo[]>
  getSpendingRules(address: string): Promise<SpendingRuleInfo[]>
  /** EVM transaction count (nonce) of the account's 0x address. */
  getEvmNonce(evmAddress: string): Promise<number>
}

export type ExposureStatus = 'protected' | 'capped' | 'claimable' | 'hidden' | 'empty'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface ExposureFinding {
  id: string
  severity: 'good' | 'warn' | 'bad' | 'info'
  title: string
  detail: string
  source?: string
}

export interface ExposureReport {
  account: string
  evmAddress: string
  status: ExposureStatus
  /** 0–100, higher is safer. Undefined for an empty, never-used account. */
  score?: number
  grade?: Grade
  headline: string
  balanceUqor: string
  /** Worst case today: the most that classical keys could move (whole balance when the account is claimable). */
  atRiskUqor: string
  /** For capped keys: the most per day. */
  atRiskPerDayUqor?: string
  pqcRegistered: boolean
  publicKeyExposed: boolean
  exposedBy: ('cosmos-tx' | 'evm-tx')[]
  classicalKeys: { active: number; withoutExpiry: number; latestExpiryUnix?: number }
  chainParams: PqcParams
  findings: ExposureFinding[]
  nextStep?: { kind: 'onboard' | 'set-rule' | 'set-expiry' | 'revoke' | 'none'; label: string }
  checkedAt: number
}

export const PARAMS_SOURCE = 'https://api-testnet.qore.host/qorechain/pqc/v1/params'
export const BOOTSTRAP_SOURCE =
  'https://explore.qore.network/tx/A4A820DDBCAA23E64B67A40E8755C2EBC69CC637CAA4EA61563DB736A5C3F839'

export function gradeOf(score: number): Grade {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 50 ? 'C' : score >= 25 ? 'D' : 'F'
}

const qor = (u: bigint) => {
  const whole = u / 1_000_000n
  const frac = (u % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return `${whole}${frac ? '.' + frac.slice(0, 4) : ''} QOR`
}
const day = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10)

/** Daily limit in uqor of a spending rule (a per-denom uqor limit wins over the rule-wide one). */
function dailyUqor(rule: SpendingRuleInfo): bigint {
  const d = rule.denomLimits.find((l) => l.denom === 'uqor')
  return d ? BigInt(d.dailyLimit) : rule.dailyLimit
}

export async function runExposure(
  chain: ExposureChain,
  input: { address: string },
  ctx: { now?: number } = {},
): Promise<ExposureReport> {
  const { account, evmAddress } = normaliseAccount(input.address)
  const now = ctx.now ?? Date.now()
  const nowS = Math.floor(now / 1000)
  const [balance, pqc, params, pub, nonce] = await Promise.all([
    chain.getBalance(account),
    chain.getPqcKey(account),
    chain.getPqcParams(),
    chain.getAccountPubkey(account),
    chain.getEvmNonce(evmAddress).catch(() => 0),
  ])
  const exposedBy: ExposureReport['exposedBy'] = []
  if (pub.pubkeyType) exposedBy.push('cosmos-tx')
  if (nonce > 0) exposedBy.push('evm-tx')
  const publicKeyExposed = exposedBy.length > 0
  const findings: ExposureFinding[] = []
  const base = {
    account,
    evmAddress,
    balanceUqor: balance.toString(),
    pqcRegistered: pqc.registered,
    publicKeyExposed,
    exposedBy,
    chainParams: params,
    checkedAt: now,
  }
  const pqcEnforced = params.hybridSignatureMode === 'required' && !params.allowClassicalFallback

  // ---- No quantum-safe root ----
  if (!pqc.registered) {
    const noKeys = { active: 0, withoutExpiry: 0 }
    findings.push({
      id: 'no-pqc',
      severity: 'bad',
      title: 'No quantum-safe key',
      detail:
        'This account has no ML-DSA-87 key on QoreChain. Its classical key can register one, so whoever breaks or steals that key first can take the account over.',
      source: BOOTSTRAP_SOURCE,
    })
    if (!pub.exists && balance === 0n && !publicKeyExposed) {
      return {
        ...base,
        status: 'empty',
        headline: 'Unused address: nothing is at risk yet.',
        atRiskUqor: '0',
        classicalKeys: noKeys,
        findings: [
          {
            id: 'empty',
            severity: 'info',
            title: 'Unused address',
            detail: 'No balance and no transactions on Diana. Add a quantum-safe key before you use it.',
          },
        ],
        nextStep: { kind: 'onboard', label: 'Create a quantum-safe account' },
      }
    }
    if (publicKeyExposed) {
      findings.push({
        id: 'pubkey-exposed',
        severity: 'bad',
        title: 'Public key already on-chain',
        detail: `The classical public key was revealed by ${exposedBy.includes('cosmos-tx') ? 'a QoreChain transaction' : 'an EVM transaction'}. A large quantum computer could derive the private key from it (Shor's algorithm).`,
      })
      const score = balance > 0n ? 5 : 20
      return {
        ...base,
        status: 'claimable',
        score,
        grade: gradeOf(score),
        headline:
          balance > 0n ? `All ${qor(balance)} is claimable on Q-Day.` : 'Claimable on Q-Day (no balance right now).',
        atRiskUqor: balance.toString(),
        classicalKeys: noKeys,
        findings,
        nextStep: { kind: 'onboard', label: 'Add a quantum-safe root now' },
      }
    }
    findings.push({
      id: 'pubkey-hidden',
      severity: 'warn',
      title: 'Public key not revealed yet',
      detail:
        'This account has never signed a transaction, so only the hash of its key is public. That protection ends with its first transaction.',
    })
    return {
      ...base,
      status: 'hidden',
      score: 35,
      grade: gradeOf(35),
      headline: `${qor(balance)} is safe only until this account first signs.`,
      atRiskUqor: balance.toString(),
      classicalKeys: noKeys,
      findings,
      nextStep: { kind: 'onboard', label: 'Add a quantum-safe root before the first transaction' },
    }
  }

  // ---- Quantum-safe root registered ----
  findings.push(
    pqcEnforced
      ? {
          id: 'pqc-root',
          severity: 'good',
          title: 'Quantum-safe root',
          detail: `ML-DSA-87 key registered${pqc.possessionProven ? ' (possession proven)' : ''}. Diana requires hybrid signatures and allows no classical fallback, so a classical signature alone cannot move this account.`,
          source: PARAMS_SOURCE,
        }
      : {
          id: 'pqc-root-weak',
          severity: 'warn',
          title: 'Quantum-safe key, but the chain allows classical fallback',
          detail: `ML-DSA-87 key registered, but the chain reports hybrid mode "${params.hybridSignatureMode}" with classical fallback ${params.allowClassicalFallback ? 'allowed' : 'not allowed'}. Classical signatures may still move funds.`,
          source: PARAMS_SOURCE,
        },
  )

  const [auths, rules] = await Promise.all([chain.getAuthenticators(account), chain.getSpendingRules(account)])
  const active = auths.filter(
    (a) => a.scheme === 'secp256k1' && !a.revoked && (a.expiryUnix === 0 || a.expiryUnix > nowS),
  )
  const withoutExpiry = active.filter((a) => a.expiryUnix === 0).length
  const latestExpiry = active.length && !withoutExpiry ? Math.max(...active.map((a) => a.expiryUnix)) : undefined
  const classicalKeys = { active: active.length, withoutExpiry, latestExpiryUnix: latestExpiry }

  if (!pqcEnforced) {
    const score = 40
    return {
      ...base,
      status: 'capped',
      score,
      grade: gradeOf(score),
      headline: 'Quantum-safe key registered, but the chain still accepts classical signatures.',
      atRiskUqor: balance.toString(),
      classicalKeys,
      findings,
    }
  }

  if (!active.length) {
    findings.push({
      id: 'no-classical',
      severity: 'good',
      title: 'No active classical keys',
      detail: 'No MetaMask key can spend from this account.',
    })
    return {
      ...base,
      status: 'protected',
      score: 100,
      grade: 'A',
      headline: 'Fully quantum-safe: no classical key can move these funds.',
      atRiskUqor: '0',
      classicalKeys,
      findings,
      nextStep: { kind: 'none', label: 'Nothing to do' },
    }
  }

  // Capped classical keys: the chain enforces the FIRST enabled rule account-wide; without one it refuses them.
  const rule = rules.find((r) => r.enabled)
  if (!rule || !ruleBoundsEveryDenom(rule)) {
    findings.push({
      id: 'no-rule',
      severity: 'warn',
      title: 'MetaMask key without limits',
      detail: rule
        ? 'The spending rule does not cap every denomination it allows, so its limits cannot be summed up here. Set limits for every denomination.'
        : 'A MetaMask key is linked but there is no enabled spending rule. The chain refuses such a key today, but set limits so it stays capped.',
    })
    const score = 70
    return {
      ...base,
      status: 'capped',
      score,
      grade: gradeOf(score),
      headline: 'Quantum-safe root; set limits on the linked MetaMask key.',
      atRiskUqor: rule ? balance.toString() : '0',
      classicalKeys,
      findings,
      nextStep: { kind: 'set-rule', label: 'Set default limits' },
    }
  }

  const perDay = dailyUqor(rule)
  const days = latestExpiry ? Math.max(1, Math.ceil((latestExpiry - nowS) / 86_400)) : Infinity
  const ceiling = Number.isFinite(days) ? perDay * BigInt(days) : balance
  const atRisk = ceiling < balance ? ceiling : balance
  const ratio = balance > 0n ? Number((atRisk * 10_000n) / balance) / 10_000 : 0
  let score = 95 - Math.round(40 * ratio) - (withoutExpiry ? 10 : 0)
  score = Math.max(40, Math.min(95, score))
  findings.push({
    id: 'capped-keys',
    severity: ratio > 0.5 || withoutExpiry ? 'warn' : 'good',
    title: `${active.length} capped MetaMask key${active.length > 1 ? 's' : ''}`,
    detail: `Classical and capped: at most ${qor(perDay)} per day${latestExpiry ? ` until ${day(latestExpiry)}` : ', with no expiry'}. The kill switch revokes ${active.length > 1 ? 'them' : 'it'} at once.`,
  })
  if (withoutExpiry)
    findings.push({
      id: 'no-expiry',
      severity: 'warn',
      title: 'A MetaMask key never expires',
      detail:
        'Keys without an expiry stay valid until revoked. Give them an end date so a forgotten key stops working by itself.',
    })
  return {
    ...base,
    status: 'capped',
    score,
    grade: gradeOf(score),
    headline: `Quantum-safe root. Worst case if MetaMask is broken: ${qor(atRisk)}${balance > 0n ? ` of ${qor(balance)}` : ''}.`,
    atRiskUqor: atRisk.toString(),
    atRiskPerDayUqor: perDay.toString(),
    classicalKeys,
    findings,
    nextStep: withoutExpiry
      ? { kind: 'set-expiry', label: 'Give MetaMask keys an end date' }
      : ratio > 0.5
        ? { kind: 'set-rule', label: 'Lower the daily limit' }
        : { kind: 'none', label: 'Nothing urgent' },
  }
}
