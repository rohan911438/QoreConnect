/**
 * Limit presets: one-tap safety profiles for the MetaMask session key. A preset sets the account-wide spending rule
 * (per-transaction and daily caps, enforced by the chain) and the lifetime used the next time a key is linked or renewed.
 * Approved contracts are never changed by a preset. All amounts are Diana testnet QOR.
 *
 * Sizing: a relayed call costs its gas tank about 0.066 QOR in fees (spike/RESULTS.md); fees are paid by the gas tank,
 * not by these caps, which bound only the value MetaMask can move.
 */
import type { Limits } from './rules'

export type PresetId = 'cautious' | 'everyday' | 'agent' | 'gaming'

export interface LimitPreset {
  id: PresetId
  name: string
  /** One line: who it is for. */
  tagline: string
  perTxUqor: bigint
  dailyUqor: bigint
  /** Lifetime of a key linked or renewed under this preset. */
  ttlDays: number
}

const QOR = 1_000_000n

export const LIMIT_PRESETS: readonly LimitPreset[] = [
  {
    id: 'cautious',
    name: 'Cautious',
    tagline: 'Holding more than you spend. Small caps, short-lived key.',
    perTxUqor: QOR / 4n,
    dailyUqor: 1n * QOR,
    ttlDays: 1,
  },
  {
    id: 'everyday',
    name: 'Everyday',
    tagline: 'The default: room for normal use, renewed weekly.',
    perTxUqor: 1n * QOR,
    dailyUqor: 5n * QOR,
    ttlDays: 7,
  },
  {
    id: 'agent',
    name: 'Agent',
    tagline: 'Bots and scripts: tiny caps, expires in a day.',
    perTxUqor: QOR / 10n,
    dailyUqor: 2n * QOR,
    ttlDays: 1,
  },
  {
    id: 'gaming',
    name: 'Gaming',
    tagline: 'Many tiny actions: very small per-transaction cap.',
    perTxUqor: QOR / 20n,
    dailyUqor: 3n * QOR,
    ttlDays: 3,
  },
] as const

export const DEFAULT_PRESET: PresetId = 'everyday'

export function presetById(id: string): LimitPreset | undefined {
  return LIMIT_PRESETS.find((p) => p.id === id)
}

/** The preset whose caps equal these limits, if any. */
export function matchPreset(perTxUqor: bigint, dailyUqor: bigint): LimitPreset | undefined {
  return LIMIT_PRESETS.find((p) => p.perTxUqor === perTxUqor && p.dailyUqor === dailyUqor)
}

export function presetLimits(p: LimitPreset): Limits {
  return { perTxUqor: p.perTxUqor, dailyUqor: p.dailyUqor, denoms: ['uqor'] }
}

/** Expiry (unix seconds) for a key linked or renewed now under this preset. */
export function presetExpiry(p: LimitPreset, nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000) + p.ttlDays * 86_400
}

export function qorText(uqor: bigint): string {
  const whole = uqor / QOR
  const frac = (uqor % QOR).toString().padStart(6, '0').replace(/0+$/, '')
  return `${whole}${frac ? '.' + frac : ''} QOR`
}

/**
 * Plain-English summary of what MetaMask can and cannot do under these limits. Caps, the allow-list and revocation are
 * enforced by the chain (spike Q6–Q8); the key is linked with permissions ["evm"] only (Q12); account transactions need the
 * hybrid ML-DSA signature (pqc params: hybrid_signature_mode "required"). The lifetime applies to keys linked or renewed
 * from now on.
 */
export function describeLimits(
  limits: { perTxUqor: bigint; dailyUqor: bigint; ttlDays?: number },
  ctx: { approvedDapps: number },
): { can: string[]; cannot: string[] } {
  const dapps = ctx.approvedDapps === 1 ? 'the 1 dApp you approved' : `the ${ctx.approvedDapps} dApps you approved`
  const life = limits.ttlDays ? `${limits.ttlDays} day${limits.ttlDays === 1 ? '' : 's'}` : undefined
  return {
    can: [
      `Send up to ${qorText(limits.perTxUqor)} in one transaction`,
      `Spend up to ${qorText(limits.dailyUqor)} per day in total`,
      ctx.approvedDapps ? `Call ${dapps}` : 'Call no dApp until you approve one',
      ...(life ? [`Work for ${life} after you link or renew it`] : []),
    ],
    cannot: [
      `Move more than ${qorText(limits.dailyUqor)} in a day, even if MetaMask is stolen or broken`,
      'Call any contract you have not approved',
      'Sign account changes: it is linked for EVM calls only, and Diana requires your ML-DSA signature on account transactions',
      'Keep working after you press the kill switch',
    ],
  }
}
