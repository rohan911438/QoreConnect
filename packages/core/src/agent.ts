/**
 * Agent mode (Flow E). An agent gets its own sub-account (HD index >= 1 of the root seed) with its own budget, rule and
 * linked secp256k1 key, so it can never touch the main balance (rules are account-wide, P01 finding 1).
 * The owner hands the agent a ROOT-SIGNED instruction (ML-DSA-87); the agent acts only on instructions that verify
 * against the root's key registered on chain. Text from web pages or tool results can never become an instruction.
 */
import { pqcVerify } from '@qorechain/sdk'
import { toFunctionSelector, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { EncodeObject } from '@cosmjs/proto-signing'
import type { QoreNetwork } from './config'
import { QoreConnectError } from './errors'
import { QoreClient } from './chain/client'
import { RestBroadcaster, type Broadcaster } from './chain/tx'
import type { FetchLike } from './chain/http'
import { RootSigner } from './vault/signer'
import { onboardRoot, type Eip1193Provider, type LinkProof } from './onboard'
import { getSessionState, linkSessionKey, revokeKeys, signLinkProof, type SessionKey } from './account/session'
import { normaliseCall, type Limits } from './account/rules'

export const INSTRUCTION_VERSION = 1
export const AGENT_LABEL_PREFIX = 'agent:'
/** Default agent key lifetime: 24 h. */
export const DEFAULT_AGENT_TTL_S = 24 * 3600

/** One function the agent may call: target + human-readable signature (gives the selector and the tool schema). */
export interface AgentCall {
  to: string
  /** e.g. "function tip(address creator, string note) payable" */
  signature: string
  /** Optional plain-language hint shown to the planner. */
  description?: string
}

export interface AgentInstruction {
  v: typeof INSTRUCTION_VERSION
  chainId: string
  /** Root account (qor1) whose registered ML-DSA-87 key signs this instruction. */
  root: string
  /** The agent's sub-account (qor1) that executes. */
  account: string
  /** The agent's own key (0x address) this instruction is for. */
  agent: string
  name: string
  task: string
  calls: AgentCall[]
  limits: { perTxUqor: string; dailyUqor: string }
  nonce: string
  issuedAt: number
  expiresAt: number
}

export interface SignedInstruction {
  instruction: AgentInstruction
  /** ML-DSA-87 signature over canonicalInstructionBytes(instruction), hex. */
  signature: string
}

export type InstructionRejection =
  | 'MALFORMED'
  | 'WRONG_CHAIN'
  | 'WRONG_AGENT'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'ROOT_KEY_NOT_REGISTERED'
  | 'BAD_SIGNATURE'

export type VerifyResult = { ok: true; instruction: AgentInstruction } | { ok: false; reason: InstructionRejection; detail: string }

const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')
const fromHex = (h: string) => Uint8Array.from((h.startsWith('0x') ? h.slice(2) : h).match(/.{1,2}/g) ?? [], (b) => parseInt(b, 16))

/** Deterministic JSON: sorted keys at every level, no whitespace. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(',')}}`
}

/** The exact bytes the root signs: a domain tag plus canonical JSON (so the signature cannot be replayed elsewhere). */
export function canonicalInstructionBytes(i: AgentInstruction): Uint8Array {
  return new TextEncoder().encode(`QoreConnect agent instruction\n${canonicalJson(i)}`)
}

/** Sign an instruction with the root's ML-DSA-87 key. */
export function signInstruction(root: RootSigner, i: AgentInstruction): SignedInstruction {
  if (i.root !== root.qorAddress) throw new QoreConnectError('INVALID_INPUT', { message: 'instruction.root must be the signing root' })
  return { instruction: i, signature: hex(root.signMessage(canonicalInstructionBytes(i))) }
}

function malformed(i: any): string | undefined {
  if (!i || typeof i !== 'object') return 'not an object'
  if (i.v !== INSTRUCTION_VERSION) return `unsupported version ${i.v}`
  for (const k of ['chainId', 'root', 'account', 'agent', 'name', 'task', 'nonce'] as const)
    if (typeof i[k] !== 'string' || !i[k]) return `missing ${k}`
  if (!/^0x[0-9a-fA-F]{40}$/.test(i.agent)) return 'agent must be a 0x address'
  if (typeof i.issuedAt !== 'number' || typeof i.expiresAt !== 'number') return 'missing issuedAt/expiresAt'
  if (!Array.isArray(i.calls) || !i.calls.length) return 'calls must be a non-empty list'
  for (const c of i.calls) {
    if (!c || typeof c.to !== 'string' || typeof c.signature !== 'string') return 'bad call entry'
    try {
      normaliseCall(c.to)
    } catch {
      return `bad call target ${c.to}`
    }
  }
  if (!i.limits || !/^\d+$/.test(String(i.limits.perTxUqor)) || !/^\d+$/.test(String(i.limits.dailyUqor))) return 'bad limits'
  return undefined
}

/**
 * Verify a signed instruction. `rootPublicKey` must come from the CHAIN (see fetchRootPublicKey), never from the
 * instruction itself. Checks shape, chain, intended agent, validity window and the ML-DSA-87 signature.
 */
export function verifyInstruction(
  signed: SignedInstruction,
  o: { rootPublicKey: Uint8Array | undefined; chainId: string; agent: string; nowUnix?: number; skewS?: number },
): VerifyResult {
  const i = signed?.instruction as AgentInstruction
  const bad = malformed(i)
  if (bad) return { ok: false, reason: 'MALFORMED', detail: bad }
  if (typeof signed.signature !== 'string' || !/^(0x)?[0-9a-fA-F]+$/.test(signed.signature))
    return { ok: false, reason: 'MALFORMED', detail: 'signature must be hex' }
  if (i.chainId !== o.chainId) return { ok: false, reason: 'WRONG_CHAIN', detail: `instruction is for ${i.chainId}` }
  if (i.agent.toLowerCase() !== o.agent.toLowerCase()) return { ok: false, reason: 'WRONG_AGENT', detail: `instruction is for ${i.agent}` }
  const now = o.nowUnix ?? Math.floor(Date.now() / 1000)
  const skew = o.skewS ?? 120
  if (i.issuedAt > now + skew) return { ok: false, reason: 'NOT_YET_VALID', detail: `issued in the future (${i.issuedAt})` }
  if (i.expiresAt <= now) return { ok: false, reason: 'EXPIRED', detail: `expired at ${new Date(i.expiresAt * 1000).toISOString()}` }
  if (!o.rootPublicKey?.length) return { ok: false, reason: 'ROOT_KEY_NOT_REGISTERED', detail: `no ML-DSA key registered for ${i.root}` }
  let valid = false
  try {
    valid = pqcVerify(o.rootPublicKey, canonicalInstructionBytes(i), fromHex(signed.signature))
  } catch {
    valid = false
  }
  if (!valid) return { ok: false, reason: 'BAD_SIGNATURE', detail: 'ML-DSA-87 signature does not verify against the root key on chain' }
  return { ok: true, instruction: i }
}

/** The root's ML-DSA-87 public key as registered on chain (REST; undefined when not registered). */
export async function fetchRootPublicKey(net: QoreNetwork, root: string, fetchImpl?: FetchLike): Promise<Uint8Array | undefined> {
  const k = await new QoreClient(net, fetchImpl).getPqcKey(root, { fresh: true })
  return k.registered ? k.publicKey : undefined
}

// ---------------------------------------------------------------------------------------------------------------------
// Owner side: create, list and revoke agents

export interface AgentContext {
  net: QoreNetwork
  root: RootSigner
  fetch?: FetchLike
  broadcaster?: Broadcaster
}

/** A RootSigner-shaped wrapper for an agent sub-account (signs its own hybrid txs). */
export async function agentAccountSigner(root: RootSigner, index: number): Promise<RootSigner> {
  const sub = await root.deriveSubAccount(index)
  return new RootSigner(sub, '', 0)
}

export interface CreateAgentOptions extends AgentContext {
  /** Sub-account index (>= 1). One index per agent. */
  index: number
  name: string
  task: string
  calls: AgentCall[]
  limits: Limits
  /** Budget moved from the root to the agent sub-account (uqor). Also pays its registration fee (~0.06 QOR). */
  fundUqor: bigint
  /** The agent's possession proof for linking its key to the sub-account (from the agent: linkProofFor(account)). */
  agentProof: LinkProof
  expiryUnix?: number
  onEvent?: (e: { step: string; txHash?: string }) => void
}

export interface CreatedAgent {
  account: string
  accountEvm: string
  index: number
  agent: string
  fundTx?: string
  registerTx?: string
  linkTx?: string
  signed: SignedInstruction
}

const sendMsg = (from: string, to: string, uqor: bigint): EncodeObject => ({
  typeUrl: '/cosmos.bank.v1beta1.MsgSend',
  value: { fromAddress: from, toAddress: to, amount: [{ denom: 'uqor', amount: uqor.toString() }] },
})

/** Selector-scoped allow-list entries ("0xTarget/0xSelector") for the calls. */
export function callsToAllowList(calls: AgentCall[]): string[] {
  return calls.map((c) => normaliseCall(`${c.to}/${toFunctionSelector(c.signature.replace(/^function\s+/, ''))}`))
}

/**
 * Create an agent: fund its sub-account from the root, register the sub-account's ML-DSA key, link the agent key with
 * a selector-scoped rule and expiry, then sign the instruction with the root. Idempotent per step.
 */
export async function createAgent(o: CreateAgentOptions): Promise<CreatedAgent> {
  const emit = o.onEvent ?? (() => {})
  const client = new QoreClient(o.net, o.fetch)
  const broadcaster = o.broadcaster ?? new RestBroadcaster(o.net, { fetch: o.fetch })
  const sub = await agentAccountSigner(o.root, o.index)
  const expiryUnix = o.expiryUnix ?? Math.floor(Date.now() / 1000) + DEFAULT_AGENT_TTL_S

  let fundTx: string | undefined
  if ((await client.getBalance(sub.qorAddress)) < o.fundUqor / 2n) {
    emit({ step: 'funding' })
    const r = await o.root.signAndBroadcast(o.net, [sendMsg(o.root.qorAddress, sub.qorAddress, o.fundUqor)], broadcaster, {}, o.fetch)
    fundTx = r.transactionHash
    emit({ step: 'funded', txHash: fundTx })
  }
  emit({ step: 'registering' })
  const reg = await onboardRoot({ net: o.net, root: sub, skipSponsor: true, fetch: o.fetch, broadcaster })
  emit({ step: 'registered', txHash: reg.registerTx })

  emit({ step: 'linking' })
  const allow = callsToAllowList(o.calls)
  const link = await linkSessionKey({
    net: o.net,
    root: sub,
    fetch: o.fetch,
    broadcaster,
    contracts: allow,
    limits: o.limits,
    expiryUnix,
    label: `${AGENT_LABEL_PREFIX}${o.name.slice(0, 40)}`,
    proof: o.agentProof,
  })
  emit({ step: 'linked', txHash: link.tx?.transactionHash })

  const now = Math.floor(Date.now() / 1000)
  const instruction: AgentInstruction = {
    v: INSTRUCTION_VERSION,
    chainId: o.net.chainId,
    root: o.root.qorAddress,
    account: sub.qorAddress,
    agent: o.agentProof.metamaskAddress.toLowerCase(),
    name: o.name,
    task: o.task,
    calls: o.calls.map((c) => ({ ...c, to: c.to.toLowerCase() })),
    limits: { perTxUqor: o.limits.perTxUqor.toString(), dailyUqor: o.limits.dailyUqor.toString() },
    nonce: `${o.index}-${now}`,
    issuedAt: now,
    expiresAt: expiryUnix,
  }
  const signed = signInstruction(o.root, instruction)
  sub.lock()
  return {
    account: instruction.account,
    accountEvm: sub.evmAddress,
    index: o.index,
    agent: instruction.agent,
    fundTx,
    registerTx: reg.registerTx,
    linkTx: link.tx?.transactionHash,
    signed,
  }
}

export interface AgentView {
  index: number
  account: string
  accountEvm: string
  balanceUqor: bigint
  keys: SessionKey[]
}

/** Agents on sub-accounts 1..maxIndex that have (or had) an agent key. */
export async function listAgents(ctx: AgentContext & { maxIndex?: number }): Promise<AgentView[]> {
  const client = new QoreClient(ctx.net, ctx.fetch)
  const out: AgentView[] = []
  for (let index = 1; index <= (ctx.maxIndex ?? 5); index++) {
    const sub = await ctx.root.deriveSubAccount(index)
    const state = await getSessionState(ctx, sub.cosmos).catch(() => undefined)
    const keys = (state?.keys ?? []).filter((k) => (k.label ?? '').startsWith(AGENT_LABEL_PREFIX))
    if (!keys.length) continue
    out.push({ index, account: sub.cosmos, accountEvm: sub.evm, balanceUqor: await client.getBalance(sub.cosmos), keys })
    sub.pqc.secretKey.fill(0)
  }
  return out
}

/** Revoke every agent key on a sub-account (one hybrid tx from the sub-account, derived from the root). */
export async function revokeAgent(ctx: AgentContext & { index: number }) {
  const sub = await agentAccountSigner(ctx.root, ctx.index)
  try {
    const state = await getSessionState(ctx, sub.qorAddress)
    const keys = state.keys.filter((k) => !k.revoked && (k.label ?? '').startsWith(AGENT_LABEL_PREFIX)).map((k) => k.pubkeyHex)
    return await revokeKeys({ net: ctx.net, root: sub, fetch: ctx.fetch, broadcaster: ctx.broadcaster, keys })
  } finally {
    sub.lock()
  }
}

/** Return an agent sub-account's remaining balance to the root (leaves `keepUqor` for the fee). */
export async function reclaimAgentFunds(ctx: AgentContext & { index: number; keepUqor?: bigint }) {
  const sub = await agentAccountSigner(ctx.root, ctx.index)
  try {
    const bal = await new QoreClient(ctx.net, ctx.fetch).getBalance(sub.qorAddress)
    const amount = bal - (ctx.keepUqor ?? 60_000n)
    if (amount <= 0n) return undefined
    return await sub.signAndBroadcast(ctx.net, [sendMsg(sub.qorAddress, ctx.root.qorAddress, amount)], ctx.broadcaster ?? new RestBroadcaster(ctx.net, { fetch: ctx.fetch }), {}, ctx.fetch)
  } finally {
    sub.lock()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Agent side: a local secp256k1 key behind a minimal EIP-1193 interface (personal_sign only, like MetaMask)

export function localKeyProvider(privateKey: Hex): Eip1193Provider & { address: Hex } {
  const acct = privateKeyToAccount(privateKey)
  return {
    address: acct.address,
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [acct.address]
      if (method === 'personal_sign') return acct.signMessage({ message: { raw: (params as string[])[0] as Hex } })
      throw new QoreConnectError('INVALID_INPUT', { message: `agent key: ${method} is not supported` })
    },
  }
}

/** The agent's possession proof for linking its key to `account` (the owner's agent sub-account). */
export function agentLinkProof(net: QoreNetwork, account: string, privateKey: Hex): Promise<LinkProof> {
  const p = localKeyProvider(privateKey)
  return signLinkProof(net, account, p, p.address)
}

/** Is `to` + `data` one of the instruction's calls (target and selector)? Local guard before anything is signed. */
export function callAllowedByInstruction(i: AgentInstruction, to: string, data: string): AgentCall | undefined {
  const sel = data.slice(0, 10).toLowerCase()
  return i.calls.find((c) => c.to.toLowerCase() === to.toLowerCase() && toFunctionSelector(c.signature.replace(/^function\s+/, '')) === sel)
}
