import { decodeFunctionData, formatEther, parseAbiItem, type Abi, type AbiFunction } from 'viem'
import { evmAuthSignBytesV2 } from '@qorechain/sdk'
import { explorerAddress, weiToUqor, formatQor, type QoreNetwork } from '../config'
import type { SpendingRuleInfo } from '../chain/client'
import type { RpcFn } from '../provider/receipts'
import { hexToBytes } from '../relay'
import { KNOWN_SIGNATURES } from './selectors'

export type HonestyLabel = 'Quantum-safe' | 'Classical, capped' | 'Agent, capped' | 'Blocked by chain'

/**
 * The exact call that will be signed. The preview renders THIS object and the signer builds the digest from
 * THIS object (frozen), so what the user reads is what MetaMask signs ("Never sign blind").
 */
export interface SignableCall {
  readonly chainId: string
  readonly account: string
  /** MetaMask address (20-byte key) that signs. */
  readonly pubkey: string
  readonly to: string
  readonly valueWei: bigint
  readonly data: string
  readonly gasLimit: number
  readonly nonce: bigint
}

export interface DecodedArg {
  name: string
  type: string
  value: string
}

export type DecodedCall =
  | {
      kind: 'decoded'
      source: 'abi' | 'offline' | '4byte'
      name: string
      signature: string
      selector: string
      args: DecodedArg[]
    }
  | { kind: 'unknown'; selector: string }
  | { kind: 'transfer' }

export interface PolicyCheck {
  id: 'allow-list' | 'per-tx' | 'daily' | 'simulation' | 'key' | 'unlimited-approval'
  label: string
  ok: boolean
  detail: string
  /** True when based on QoreConnect's own records rather than the chain (e.g. spend today). */
  estimate?: boolean
  /** Warnings do not block. */
  warning?: boolean
}

export interface Preview {
  call: SignableCall
  contract: { address: string; explorerUrl: string; name?: string }
  decoded: DecodedCall
  value: { wei: string; qor: string }
  simulation: { ok: boolean; revertReason?: string }
  checks: PolicyCheck[]
  label: HonestyLabel
  /** A chain refusal is predicted: do not ask MetaMask to sign. */
  blocked: boolean
  /** The call would revert: the relayer refuses it; signing is pointless. */
  willFail: boolean
  /** One sentence for the header. */
  summary: string
}

export interface PreviewContext {
  net: QoreNetwork
  /** Root 0x address (msg.sender of the call). */
  rootEvm: string
  /** The first enabled rule (account-wide); undefined if none. */
  rule?: Pick<SpendingRuleInfo, 'perTxLimit' | 'dailyLimit' | 'allowedEvmCalls'>
  /** Allow-list entries in force. */
  approved: string[]
  /** QoreConnect's own estimate of today's spend (uqor); the chain does not expose it. */
  spentTodayUqor?: bigint
  signer?: 'metamask' | 'agent'
  /** Known contract ABIs and names, by lower-case address. */
  abis?: Record<string, { abi: Abi; name?: string }>
  rpc?: RpcFn
  /** Look up unknown selectors on 4byte.directory (public data only: the 4-byte selector). Default true. */
  fourByte?: boolean
  fetch?: (input: string, init?: RequestInit) => Promise<Response>
}

const MAX_UINT = 2n ** 256n - 1n

function fmtArg(type: string, v: unknown): string {
  if (typeof v === 'bigint') return type.startsWith('uint') && v === MAX_UINT ? 'unlimited (2^256 − 1)' : v.toString()
  if (Array.isArray(v)) return '[' + v.map((x) => fmtArg(type.replace(/\[\]$/, ''), x)).join(', ') + ']'
  if (typeof v === 'object' && v !== null)
    return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))
  return String(v)
}

function decodeWith(abi: Abi, data: string, source: 'abi' | 'offline' | '4byte'): DecodedCall | undefined {
  try {
    const { functionName, args } = decodeFunctionData({ abi, data: data as `0x${string}` })
    const fn = abi.find(
      (x): x is AbiFunction =>
        x.type === 'function' && x.name === functionName && (x.inputs?.length ?? 0) === (args?.length ?? 0),
    )
    const inputs = fn?.inputs ?? []
    return {
      kind: 'decoded',
      source,
      name: functionName,
      signature: `${functionName}(${inputs.map((i) => i.type).join(',')})`,
      selector: data.slice(0, 10).toLowerCase(),
      args: (args ?? []).map((v, i) => ({
        name: inputs[i]?.name || `arg${i}`,
        type: inputs[i]?.type ?? 'unknown',
        value: fmtArg(inputs[i]?.type ?? '', v),
      })),
    }
  } catch {
    return undefined
  }
}

async function lookup4byte(selector: string, f: NonNullable<PreviewContext['fetch']>): Promise<string[]> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 2_500)
  try {
    const r = await f(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}&ordering=created_at`, {
      signal: ctl.signal,
    })
    const j: any = await r.json()
    return (j.results ?? []).map((x: any) => String(x.text_signature))
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

/** Decode calldata: configured ABI → offline list → 4byte.directory → unknown. */
export async function decodeCall(
  to: string,
  data: string,
  ctx: Pick<PreviewContext, 'abis' | 'fourByte' | 'fetch'>,
): Promise<DecodedCall> {
  if (!data || data === '0x') return { kind: 'transfer' }
  const selector = data.slice(0, 10).toLowerCase()
  const known = ctx.abis?.[to.toLowerCase()]
  if (known) {
    const d = decodeWith(known.abi, data, 'abi')
    if (d) return d
  }
  const offline = KNOWN_SIGNATURES[selector]
  if (offline) {
    const d = decodeWith([parseAbiItem(`function ${offline}`) as AbiFunction], data, 'offline')
    if (d) return d
  }
  if (ctx.fourByte !== false) {
    const f = ctx.fetch ?? ((i: string, init?: RequestInit) => globalThis.fetch(i, init))
    for (const sig of await lookup4byte(selector, f)) {
      try {
        const d = decodeWith([parseAbiItem(`function ${sig}`) as AbiFunction], data, '4byte')
        if (d) return d
      } catch {
        /* malformed signature from the directory */
      }
    }
  }
  return { kind: 'unknown', selector }
}

/** Revert reason from an eth_call error (Error(string) or custom error data). */
function revertReason(e: any): string {
  const data: string | undefined = e?.data?.data ?? e?.data
  if (typeof data === 'string' && data.startsWith('0x08c379a0')) {
    try {
      const len = Number(BigInt('0x' + data.slice(74, 138)))
      const hex = data.slice(138, 138 + len * 2)
      return new TextDecoder().decode(Uint8Array.from(hex.match(/.{2}/g) ?? [], (b) => parseInt(b, 16)))
    } catch {
      /* fall through */
    }
  }
  return String(e?.message ?? e).replace(/^execution reverted:?\s*/i, '') || 'reverted'
}

/**
 * Build the signing preview: decoded call, value, simulation, and a policy check that predicts a chain refusal
 * BEFORE MetaMask is asked to sign.
 */
export async function buildPreview(call: SignableCall, ctx: PreviewContext): Promise<Preview> {
  const frozen = Object.freeze({
    ...call,
    to: call.to.toLowerCase(),
    pubkey: call.pubkey.toLowerCase(),
  }) as SignableCall
  const decoded = await decodeCall(frozen.to, frozen.data, ctx)
  const valueUqor = weiToUqor(frozen.valueWei)
  const checks: PolicyCheck[] = []

  // Allow-list (account-wide rule; target or target/selector)
  const selector = frozen.data.length >= 10 ? frozen.data.slice(0, 10).toLowerCase() : undefined
  const listed = ctx.approved.some((c) => c === frozen.to || (selector && c === `${frozen.to}/${selector}`))
  const unrestricted = !!ctx.rule && ctx.rule.allowedEvmCalls.length === 0
  checks.push({
    id: 'allow-list',
    label: 'Contract approved for your account',
    ok: listed || unrestricted,
    detail: listed
      ? 'On your allow-list'
      : unrestricted
        ? 'Your rule allows any contract'
        : 'Not on your allow-list: the chain would refuse this call',
  })

  if (!ctx.rule) {
    checks.push({
      id: 'per-tx',
      label: 'Spending rule',
      ok: false,
      detail: 'No enabled spending rule: the chain refuses value-moving keys without one',
    })
  } else {
    const r = ctx.rule
    checks.push({
      id: 'per-tx',
      label: 'Within per-transaction limit',
      ok: r.perTxLimit === 0n || valueUqor <= r.perTxLimit,
      detail:
        r.perTxLimit === 0n ? 'No per-transaction limit' : `${formatQor(valueUqor)} of ${formatQor(r.perTxLimit)} QOR`,
    })
    if (r.dailyLimit > 0n) {
      const spent = ctx.spentTodayUqor
      const remaining = spent === undefined ? r.dailyLimit : r.dailyLimit > spent ? r.dailyLimit - spent : 0n
      checks.push({
        id: 'daily',
        label: 'Within daily limit',
        ok: valueUqor <= remaining,
        detail:
          spent === undefined
            ? `${formatQor(valueUqor)} of ${formatQor(r.dailyLimit)} QOR per day (spend today unknown)`
            : `${formatQor(valueUqor)} QOR; ${formatQor(remaining)} of ${formatQor(r.dailyLimit)} QOR left today (estimate)`,
        estimate: spent !== undefined,
      })
    }
  }

  if (decoded.kind === 'decoded' && decoded.name === 'approve' && decoded.args[1]?.value.startsWith('unlimited')) {
    checks.push({
      id: 'unlimited-approval',
      label: 'Token approval amount',
      ok: false,
      warning: true,
      detail: `Unlimited approval to ${decoded.args[0]?.value}. Consider approving only what you need.`,
    })
  }

  // Simulation from the root (msg.sender)
  let simulation: Preview['simulation'] = { ok: true }
  if (ctx.rpc) {
    try {
      await ctx.rpc('eth_call', [
        {
          from: ctx.rootEvm,
          to: frozen.to,
          data: frozen.data,
          value: '0x' + frozen.valueWei.toString(16),
          gas: '0x' + frozen.gasLimit.toString(16),
        },
        'latest',
      ])
    } catch (e) {
      simulation = { ok: false, revertReason: revertReason(e) }
    }
    checks.push({
      id: 'simulation',
      label: 'Simulation',
      ok: simulation.ok,
      detail: simulation.ok ? 'Succeeds against the current chain state' : `Would revert: ${simulation.revertReason}`,
    })
  }

  const blocked = checks.some((c) => !c.ok && !c.warning && c.id !== 'simulation')
  const willFail = !simulation.ok
  const label: HonestyLabel = blocked
    ? 'Blocked by chain'
    : ctx.signer === 'agent'
      ? 'Agent, capped'
      : 'Classical, capped'
  const fnText =
    decoded.kind === 'decoded'
      ? `${decoded.name}()`
      : decoded.kind === 'transfer'
        ? 'a transfer'
        : `unknown function ${decoded.selector}`
  const summary = blocked
    ? 'The chain would refuse this. Nothing will be signed.'
    : willFail
      ? 'This call would fail. Nothing will be signed.'
      : `Call ${fnText} on ${frozen.to.slice(0, 6)}…${frozen.to.slice(-4)}${frozen.valueWei > 0n ? ` sending ${formatEther(frozen.valueWei)} QOR` : ''}.`

  return {
    call: frozen,
    contract: {
      address: frozen.to,
      explorerUrl: explorerAddress(ctx.net, frozen.to),
      name: ctx.abis?.[frozen.to]?.name,
    },
    decoded,
    value: { wei: frozen.valueWei.toString(), qor: formatEther(frozen.valueWei) },
    simulation,
    checks,
    label,
    blocked,
    willFail,
    summary,
  }
}

/** The 32-byte digest MetaMask signs for this call (EVM auth digest v2: binds gasLimit). */
export function callDigest(call: SignableCall): Uint8Array {
  return evmAuthSignBytesV2({
    chainId: call.chainId,
    account: call.account,
    pubkey: hexToBytes(call.pubkey),
    to: call.to.toLowerCase(),
    value: call.valueWei.toString(),
    data: hexToBytes(call.data),
    nonce: call.nonce,
    gasLimit: BigInt(call.gasLimit),
  } as any)
}
