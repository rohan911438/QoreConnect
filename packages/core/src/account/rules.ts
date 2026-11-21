/**
 * Spending-rule merge logic (pure). Facts from P01 and SDK 0.14:
 * - Rules are ACCOUNT-WIDE. The first enabled rule bounds every linked key; MsgUpdateSpendingRules replaces them all.
 * - So QoreConnect keeps ONE managed rule (id "qoreconnect") FIRST, and preserves every other rule after it.
 * - An agent never shares this rule: it lives on its own sub-account (HD index >= 1) with its own rule.
 * - An EMPTY allowed_evm_calls list would not restrict targets, so the managed rule always carries at least
 *   the sentinel entry below when no dApp is approved.
 */
export const MANAGED_RULE_ID = 'qoreconnect'
/** Never-deployed placeholder target: keeps the allow-list non-empty so "no dApps approved" means "nothing callable". */
export const NO_DAPP_SENTINEL = '0x000000000000000000000000000000000000dead'

export interface Rule {
  id: string
  enabled: boolean
  perTxLimit: bigint
  dailyLimit: bigint
  allowedDenoms: string[]
  allowedEvmCalls: string[]
  denomLimits?: { denom: string; perTxLimit: string; dailyLimit: string }[]
}

export interface Limits {
  perTxUqor: bigint
  dailyUqor: bigint
  denoms?: string[]
}

export const DEFAULT_LIMITS: Limits = { perTxUqor: 1_000_000n, dailyUqor: 5_000_000n, denoms: ['uqor'] }

const ADDR = /^0x[0-9a-f]{40}$/
const SELECTOR = /^0x[0-9a-f]{8}$/

/** Normalise an allow-list entry: "0xtarget" or "0xtarget/0xselector", lower-case. Throws on malformed input. */
export function normaliseCall(entry: string): string {
  const e = entry.trim().toLowerCase()
  const [target, selector, extra] = e.split('/')
  if (extra !== undefined || !target || !ADDR.test(target) || (selector !== undefined && !SELECTOR.test(selector))) {
    throw new Error(`invalid allowed EVM call: ${entry} (use 0xTarget or 0xTarget/0xSelector)`)
  }
  return selector ? `${target}/${selector}` : target
}

const uniq = (xs: string[]) => [...new Set(xs)]
const withoutSentinel = (xs: string[]) => xs.filter((x) => x !== NO_DAPP_SENTINEL)
const ensureNonEmpty = (xs: string[]) => (xs.length ? xs : [NO_DAPP_SENTINEL])

export function managedRule(rules: Rule[]): Rule | undefined {
  return rules.find((r) => r.id === MANAGED_RULE_ID)
}

/** Put the managed rule first and keep every other rule, unchanged and in order. */
function place(rules: Rule[], managed: Rule): Rule[] {
  return [managed, ...rules.filter((r) => r.id !== MANAGED_RULE_ID)]
}

/** The rule set to write when linking a key: managed rule with these contracts and limits, others preserved. */
export function mergeForLink(rules: Rule[], contracts: string[], limits: Limits = DEFAULT_LIMITS): Rule[] {
  const existing = managedRule(rules)
  const calls = uniq([...withoutSentinel(existing?.allowedEvmCalls ?? []), ...contracts.map(normaliseCall)])
  return place(rules, {
    id: MANAGED_RULE_ID,
    enabled: true,
    perTxLimit: limits.perTxUqor,
    dailyLimit: limits.dailyUqor,
    allowedDenoms: limits.denoms ?? existing?.allowedDenoms ?? ['uqor'],
    allowedEvmCalls: ensureNonEmpty(calls),
    denomLimits: existing?.denomLimits,
  })
}

/** Add contracts to the managed rule; nothing else changes. */
export function mergeApprove(rules: Rule[], contracts: string[]): Rule[] {
  const m = managedRule(rules)
  if (!m) throw new Error('no QoreConnect rule on this account: link a key first')
  const calls = uniq([...withoutSentinel(m.allowedEvmCalls), ...contracts.map(normaliseCall)])
  return place(rules, { ...m, allowedEvmCalls: ensureNonEmpty(calls) })
}

/** Remove exactly these entries (one dApp's contracts); other dApps and rules stay. */
export function mergeRemove(rules: Rule[], contracts: string[]): Rule[] {
  const m = managedRule(rules)
  if (!m) return rules
  const drop = new Set(contracts.map(normaliseCall))
  // Removing a bare target also removes its target/selector entries.
  const calls = m.allowedEvmCalls.filter((c) => !drop.has(c) && !drop.has(c.split('/')[0]!))
  return place(rules, { ...m, allowedEvmCalls: ensureNonEmpty(withoutSentinel(calls)) })
}

/** Change limits on the managed rule only. */
export function mergeLimits(rules: Rule[], limits: Limits): Rule[] {
  const m = managedRule(rules)
  if (!m) throw new Error('no QoreConnect rule on this account: link a key first')
  if (limits.perTxUqor <= 0n && limits.dailyUqor <= 0n) throw new Error('at least one of perTx or daily must be > 0')
  if (limits.dailyUqor > 0n && limits.perTxUqor > limits.dailyUqor) throw new Error('per-transaction limit cannot exceed the daily limit')
  return place(rules, { ...m, perTxLimit: limits.perTxUqor, dailyLimit: limits.dailyUqor, allowedDenoms: limits.denoms ?? m.allowedDenoms })
}

/** Does this rule bound every denom (the chain's condition for keys with value permissions)? */
export function ruleBoundsEveryDenom(r: Rule): boolean {
  if (r.perTxLimit > 0n || r.dailyLimit > 0n) return true
  if (!r.allowedDenoms.length) return false
  return r.allowedDenoms.every((d) => r.denomLimits?.some((l) => l.denom === d && (BigInt(l.perTxLimit || 0) > 0n || BigInt(l.dailyLimit || 0) > 0n)))
}

export class RuleInvariantError extends Error {}

export interface KeyView {
  pubkeyHex: string
  permissions: string[]
  revoked: boolean
  expiryUnix: number
}

const VALUE_PERMISSIONS = ['send', 'evm', 'deploy', 'svm', 'all']

/**
 * Invariants (P05 item 6). Throws RuleInvariantError with a readable reason.
 * 1. If any active key has a value permission, the first enabled rule exists and bounds every denom.
 * 2. That first enabled rule is the QoreConnect rule (so our caps are the ones that apply).
 * 3. Its allow-list is never empty (empty would mean "any contract").
 */
export function assertRuleInvariants(state: { rules: Rule[]; keys: KeyView[] }, nowUnix = Math.floor(Date.now() / 1000)): void {
  const active = state.keys.filter((k) => !k.revoked && (k.expiryUnix === 0 || k.expiryUnix > nowUnix))
  const valueKeys = active.filter((k) => k.permissions.some((p) => VALUE_PERMISSIONS.includes(p)))
  if (!valueKeys.length) return
  const first = state.rules.find((r) => r.enabled)
  if (!first) throw new RuleInvariantError(`${valueKeys.length} active key(s) can move value but the account has no enabled rule`)
  if (!ruleBoundsEveryDenom(first)) throw new RuleInvariantError(`first enabled rule "${first.id}" does not bound every denom`)
  if (first.id !== MANAGED_RULE_ID) throw new RuleInvariantError(`first enabled rule is "${first.id}", not the QoreConnect rule; QoreConnect caps would not apply`)
  if (!first.allowedEvmCalls.length) throw new RuleInvariantError('QoreConnect rule has an empty allow-list, which would allow any contract')
}

/** Shape the SDK's link/update builders accept. */
export function toRuleInput(r: Rule) {
  return {
    id: r.id,
    enabled: r.enabled,
    perTxLimit: r.perTxLimit.toString(),
    dailyLimit: r.dailyLimit.toString(),
    allowedDenoms: r.allowedDenoms,
    allowedEvmCalls: r.allowedEvmCalls,
    ...(r.denomLimits?.length ? { denomLimits: r.denomLimits } : {}),
  }
}
