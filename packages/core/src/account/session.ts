import {
  abstractaccount,
  linkAuthenticatorMsgs,
  revokeAuthenticatorMsg,
  signAuthenticatorLinkMetaMask,
} from '@qorechain/sdk'
import type { EncodeObject } from '@cosmjs/proto-signing'
import type { QoreNetwork } from '../config'
import { QoreConnectError } from '../errors'
import { QoreClient, type AuthenticatorInfo } from '../chain/client'
import { RestBroadcaster, type Broadcaster, type TxResult } from '../chain/tx'
import type { FetchLike } from '../chain/http'
import type { RootSigner } from '../vault/signer'
import type { Eip1193Provider, LinkProof } from '../onboard'
import { matchPreset } from './presets'
import {
  MANAGED_RULE_ID,
  managedRule,
  assertRuleInvariants,
  mergeApprove,
  mergeForLink,
  mergeLimits,
  mergeRemove,
  mergeRevokeCover,
  toRuleInput,
  type Limits,
  type Rule,
} from './rules'

/** Default session-key lifetime: 7 days (within the chain's max session TTL). */
export const DEFAULT_SESSION_TTL_S = 7 * 24 * 3600

export interface AccountContext {
  net: QoreNetwork
  root: RootSigner
  broadcaster?: Broadcaster
  fetch?: FetchLike
  /** Run the invariant checker after every write (default true). */
  checkInvariants?: boolean
}

export interface SessionKey extends AuthenticatorInfo {
  active: boolean
  isMetaMask: boolean
}

export interface SessionState {
  account: string
  keys: SessionKey[]
  rules: Rule[]
  managed?: Rule
  /** Approved contracts (QoreConnect rule allow-list without the sentinel). */
  approved: string[]
}

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string) =>
  Uint8Array.from((h.startsWith('0x') ? h.slice(2) : h).match(/.{1,2}/g) ?? [], (b) => parseInt(b, 16))

function parts(ctx: AccountContext) {
  return {
    client: new QoreClient(ctx.net, ctx.fetch),
    broadcaster: ctx.broadcaster ?? new RestBroadcaster(ctx.net, { fetch: ctx.fetch }),
  }
}

export async function getSessionState(
  ctx: Pick<AccountContext, 'net' | 'fetch'>,
  account: string,
): Promise<SessionState> {
  const client = new QoreClient(ctx.net, ctx.fetch)
  const [auths, rules] = await Promise.all([client.getAuthenticators(account), client.getSpendingRules(account)])
  const now = Math.floor(Date.now() / 1000)
  const keys = auths.map((a) => ({
    ...a,
    active: !a.revoked && (a.expiryUnix === 0 || a.expiryUnix > now),
    isMetaMask: a.scheme === 'secp256k1',
  }))
  const managed = rules.find((r) => r.id === MANAGED_RULE_ID)
  const approved = (managed?.allowedEvmCalls ?? []).filter((c) => c !== '0x000000000000000000000000000000000000dead')
  return { account, keys, rules, managed, approved }
}

async function writeAndCheck(
  ctx: AccountContext,
  messages: EncodeObject[],
): Promise<{ tx: TxResult; state: SessionState }> {
  const { broadcaster } = parts(ctx)
  const tx = await ctx.root.signAndBroadcast(ctx.net, messages, broadcaster, {}, ctx.fetch)
  const state = await getSessionState(ctx, ctx.root.qorAddress)
  if (ctx.checkInvariants !== false) assertRuleInvariants(state)
  return { tx, state }
}

const updateRulesMsg = (owner: string, rules: Rule[]) =>
  abstractaccount.updateSpendingRules({ owner, accountAddress: owner, rules: rules.map(toRuleInput) as any })

/**
 * Link MetaMask as a capped, scoped, expiring session key. One hybrid-signed tx from the root:
 * [MsgUpdateSpendingRules (merged), MsgRegisterAuthenticator]. No EVM window is needed (P01 Q2).
 */
export async function linkSessionKey(
  ctx: AccountContext & {
    metamask?: Eip1193Provider
    metamaskAddress?: string
    contracts: string[]
    limits?: Limits
    expiryUnix?: number
    label?: string
    proof?: LinkProof
  },
) {
  const { client } = parts(ctx)
  const proof = ctx.proof ?? (await signLinkProof(ctx.net, ctx.root.qorAddress, ctx.metamask!, ctx.metamaskAddress))
  const address = proof.metamaskAddress
  const rules = mergeForLink(await client.getSpendingRules(ctx.root.qorAddress), ctx.contracts, ctx.limits)
  const msgs = linkAuthenticatorMsgs({
    owner: ctx.root.qorAddress,
    chainId: ctx.net.chainId,
    scheme: 'secp256k1',
    pubkey: proof.pubkey,
    permissions: ['evm'],
    expiryUnix: ctx.expiryUnix ?? Math.floor(Date.now() / 1000) + DEFAULT_SESSION_TTL_S,
    label: ctx.label ?? `metamask:${address.toLowerCase().slice(0, 10)}`,
    possessionProof: proof.possessionProof,
    spendingRules: rules.map(toRuleInput) as any,
  })
  const r = await writeAndCheck(ctx, msgs)
  return { ...r, pubkeyHex: hex(proof.pubkey), metamaskAddress: address }
}

/**
 * Renew a MetaMask key: register the same key again with a new expiry. Contracts and limits stay as they are.
 * Verified on Diana (renew.test.ts): re-registering replaces the entry, whether the key is active, expired or revoked.
 * The lifetime defaults to the one of the matching limit preset (e.g. 1 day for Cautious), else 7 days.
 * Costs one MetaMask signature (possession proof) and one root signature.
 */
export async function renewSessionKey(
  ctx: AccountContext & {
    metamask?: Eip1193Provider
    metamaskAddress?: string
    proof?: LinkProof
    ttlSeconds?: number
    nowMs?: number
  },
) {
  const { client } = parts(ctx)
  const rule = managedRule(await client.getSpendingRules(ctx.root.qorAddress))
  if (!rule) throw new QoreConnectError('NO_RULE')
  const ttl = ctx.ttlSeconds ?? renewTtlSeconds(rule.perTxLimit, rule.dailyLimit)
  const expiryUnix = Math.floor((ctx.nowMs ?? Date.now()) / 1000) + ttl
  const r = await linkSessionKey({ ...ctx, contracts: [], expiryUnix })
  return { ...r, expiryUnix }
}

/** Lifetime for a renewal: the matching preset's, else the default 7 days. */
export function renewTtlSeconds(perTxUqor: bigint, dailyUqor: bigint): number {
  const p = matchPreset(perTxUqor, dailyUqor)
  return p ? p.ttlDays * 86_400 : DEFAULT_SESSION_TTL_S
}

/** Ask MetaMask for the authenticator-link possession proof (one personal_sign; reused for sponsorship and linking). */
export async function signLinkProof(
  net: QoreNetwork,
  rootAddress: string,
  metamask: Eip1193Provider,
  metamaskAddress?: string,
): Promise<LinkProof> {
  const address = metamaskAddress ?? ((await metamask.request({ method: 'eth_requestAccounts' })) as string[])[0]
  if (!address) throw new QoreConnectError('USER_REJECTED')
  try {
    const p = await signAuthenticatorLinkMetaMask({
      chainId: net.chainId,
      account: rootAddress,
      provider: metamask as any,
      address,
    })
    return { metamaskAddress: address.toLowerCase(), pubkey: p.pubkey, possessionProof: p.possessionProof }
  } catch (e: any) {
    if (e?.code === 4001) throw new QoreConnectError('USER_REJECTED')
    throw e
  }
}

/** Approve more contracts ("0xTarget" or "0xTarget/0xSelector"). Read → merge → write the full rule set. */
export async function approveDapp(ctx: AccountContext & { contracts: string[] }) {
  const { client } = parts(ctx)
  const rules = mergeApprove(await client.getSpendingRules(ctx.root.qorAddress), ctx.contracts)
  return writeAndCheck(ctx, [updateRulesMsg(ctx.root.qorAddress, rules)])
}

/**
 * Make sure the linked key may revoke an ERC-20 approval on `token` (see mergeRevokeCover). One root-signed write if the
 * rule does not cover it yet; none otherwise. The revoke itself is then an ordinary relayed approve(spender, 0).
 */
export async function prepareTokenRevoke(ctx: AccountContext & { token: string }) {
  const { client } = parts(ctx)
  const before = await client.getSpendingRules(ctx.root.qorAddress)
  const rules = mergeRevokeCover(before, ctx.token)
  if (rules === before) return { changed: false as const }
  const r = await writeAndCheck(ctx, [updateRulesMsg(ctx.root.qorAddress, rules)])
  return { ...r, changed: true as const }
}

/** Remove one dApp's contracts only. */
export async function removeDapp(ctx: AccountContext & { contracts: string[] }) {
  const { client } = parts(ctx)
  const rules = mergeRemove(await client.getSpendingRules(ctx.root.qorAddress), ctx.contracts)
  return writeAndCheck(ctx, [updateRulesMsg(ctx.root.qorAddress, rules)])
}

/** Change per-tx and daily limits on the QoreConnect rule. */
export async function setLimits(ctx: AccountContext & { limits: Limits }) {
  const { client } = parts(ctx)
  const rules = mergeLimits(await client.getSpendingRules(ctx.root.qorAddress), ctx.limits)
  return writeAndCheck(ctx, [updateRulesMsg(ctx.root.qorAddress, rules)])
}

/**
 * Revoke keys in ONE transaction. `'all-classical'` revokes every active secp256k1 (MetaMask) key: the Q-Day kill switch.
 */
export async function revokeKeys(ctx: AccountContext & { keys: string[] | 'all-classical' }) {
  const state = await getSessionState(ctx, ctx.root.qorAddress)
  const targets =
    ctx.keys === 'all-classical'
      ? state.keys.filter((k) => k.active && k.isMetaMask)
      : state.keys.filter(
          (k) =>
            !k.revoked &&
            (ctx.keys as string[]).map((x) => x.toLowerCase().replace(/^0x/, '')).includes(k.pubkeyHex.toLowerCase()),
        )
  if (!targets.length) return { tx: undefined, state, revoked: 0 }
  const msgs = targets.map((k) =>
    revokeAuthenticatorMsg({
      owner: ctx.root.qorAddress,
      scheme: k.scheme as 'secp256k1',
      pubkey: fromHex(k.pubkeyHex),
    }),
  )
  const r = await writeAndCheck(ctx, msgs)
  return { ...r, revoked: targets.length }
}
