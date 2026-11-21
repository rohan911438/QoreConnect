import { z } from 'zod'
import { createPublicClient, http, recoverMessageAddress, type Hex } from 'viem'
import { decodeAuthenticatorExecutions, evmAuthSignBytesV2, qorToEvm, type UnifiedAccount } from '@qorechain/sdk'
import type { EncodeObject } from '@cosmjs/proto-signing'
import {
  ENVELOPE_GAS_OVERHEAD,
  QoreClient,
  QoreConnectError,
  RestBroadcaster,
  classifyChainRefusal,
  explorerTx,
  fromRelayRequest,
  hexToBytes,
  sendTx,
  weiToUqor,
  type AuthenticatorInfo,
  type QoreConnectErrorCode,
  type QoreNetwork,
  type RelayRequest,
  type RelayResponse,
  type SpendingRuleInfo,
  type TxResult,
} from '@qoreconnect/core'
import type { RelayerStore } from './store'
import { AccountQueue } from './chain'

/** Chain codes for typed errors (x/abstractaccount). */
export const CHAIN_CODES: Partial<Record<QoreConnectErrorCode, number>> = { LIMIT_EXCEEDED: 5, EXPIRED: 6, MODULE_DISABLED: 9, NOT_APPROVED: 10, NONCE: 11, REVOKED: 10 }

const hex = (s: string) => /^0x[0-9a-fA-F]*$/.test(s) && s.length % 2 === 0
export const RelayRequestSchema = z.object({
  account: z.string().regex(/^qor1[02-9ac-hj-np-z]{38}$/),
  pubkey: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  value: z.string().regex(/^\d{1,40}$/),
  data: z.string().refine(hex, 'data must be 0x-hex').refine((s) => s.length <= 2 + 2 * 64 * 1024, 'calldata too large'),
  gasLimit: z.string().regex(/^\d{1,9}$/),
  nonce: z.string().regex(/^\d{1,20}$/),
  tankId: z.string().min(1).max(64),
})

/** The chain-facing side of the relayer, injectable so the pipeline is testable without a network. */
export interface RelayChain {
  readonly relayerAddress: string
  authNonce(account: string, pubkeyHex: string): Promise<bigint>
  authenticators(account: string): Promise<AuthenticatorInfo[]>
  rules(account: string): Promise<SpendingRuleInfo[]>
  /** eth_call the exact call from the account's EVM address. */
  simulateCall(p: { from: string; to: string; data: string; value: bigint; gas: bigint }): Promise<{ ok: true } | { ok: false; error: string }>
  /** Broadcast in the relayer's single-writer queue and wait for inclusion. */
  submit(msg: EncodeObject, signedGasLimit: number): Promise<TxResult>
}

export interface RelayPolicy {
  perAccountPerMinute: number
  perIpPerMinute: number
  maxGasLimit: number
}

export const DEFAULT_POLICY: RelayPolicy = { perAccountPerMinute: 20, perIpPerMinute: 60, maxGasLimit: 3_000_000 }

type Reject = { status: number; code: QoreConnectErrorCode; error: string }

const reject = (status: number, code: QoreConnectErrorCode, error: string): Reject => ({ status, code, error })

/** Mandatory pre-check (P01 finding 1): refusals on chain cost the relayer a fee, so refuse locally whatever we can. */
export class RelayService {
  constructor(
    private readonly net: QoreNetwork,
    private readonly store: RelayerStore,
    private readonly chain: RelayChain,
    private readonly policy: RelayPolicy = DEFAULT_POLICY,
  ) {}

  estimateFeeUqor(gasLimit: number): bigint {
    return BigInt(Math.ceil((gasLimit + ENVELOPE_GAS_OVERHEAD) * this.net.gasPrice))
  }

  private async precheck(r: RelayRequest, ip: string): Promise<Reject | undefined> {
    const gasLimit = Number(r.gasLimit)
    if (gasLimit < 21_000 || gasLimit > this.policy.maxGasLimit) return reject(400, 'INVALID_INPUT', `gasLimit must be between 21000 and ${this.policy.maxGasLimit}`)

    // Tank policy
    const tank = this.store.getTank(r.tankId)
    if (!tank) return reject(404, 'INVALID_INPUT', `unknown gas tank "${r.tankId}"`)
    if (tank.paused) return reject(403, 'TANK_EMPTY', 'this gas tank is paused')
    const fee = this.estimateFeeUqor(gasLimit)
    if (tank.balanceUqor < fee) return reject(402, 'TANK_EMPTY', "this dApp's gas budget is used up")
    if (tank.allowedContracts?.length && !tank.allowedContracts.includes(r.to.toLowerCase())) return reject(403, 'NOT_APPROVED', 'this gas tank does not pay for calls to that contract')
    if (this.store.accountSpentToday(tank.id, r.account) + fee > tank.perUserDailyCapUqor) return reject(429, 'RATE_LIMITED', 'daily gas allowance for this account is used up')

    // Rate limits
    if (!this.store.hit(`relay-acct:${r.account}`, this.policy.perAccountPerMinute, 60_000)) return reject(429, 'RATE_LIMITED', 'too many requests for this account')
    if (!this.store.hit(`relay-ip:${ip}`, this.policy.perIpPerMinute, 60_000)) return reject(429, 'RATE_LIMITED', 'too many requests from this network')

    // Signature (local): the MetaMask key must have signed exactly this call.
    const digest = evmAuthSignBytesV2({
      chainId: this.net.chainId,
      account: r.account,
      pubkey: hexToBytes(r.pubkey),
      to: r.to.toLowerCase(),
      value: r.value,
      data: hexToBytes(r.data),
      nonce: BigInt(r.nonce),
      gasLimit: BigInt(r.gasLimit),
    } as any)
    const signer = await recoverMessageAddress({ message: { raw: digest }, signature: r.signature as Hex }).catch(() => undefined)
    if (!signer || signer.toLowerCase() !== r.pubkey.toLowerCase()) return reject(400, 'INVALID_INPUT', 'signature does not match the key for this call')

    // Freshness (early code 11, no broadcast)
    const [nonce, auths, rules] = await Promise.all([this.chain.authNonce(r.account, r.pubkey), this.chain.authenticators(r.account), this.chain.rules(r.account)])
    if (BigInt(r.nonce) !== nonce) return reject(409, 'NONCE', `stale signature: key sequence is ${nonce}, request has ${r.nonce}`)

    // Key state
    const key = auths.find((a) => a.pubkeyHex.toLowerCase() === r.pubkey.slice(2).toLowerCase())
    if (!key || key.revoked) return reject(403, 'REVOKED', 'this key is not linked or was revoked')
    if (key.expiryUnix && key.expiryUnix <= Math.floor(Date.now() / 1000)) return reject(403, 'EXPIRED', 'this key has expired')
    if (!key.permissions.some((p) => p === 'evm' || p === 'all')) return reject(403, 'NOT_APPROVED', 'this key may not make EVM calls')

    // Rule: the first enabled rule bounds the key (account-wide, P01 Q6)
    const rule = rules.find((x) => x.enabled)
    if (!rule) return reject(403, 'NO_RULE', 'the account has no enabled spending rule')
    const target = r.to.toLowerCase()
    const selector = r.data.length >= 10 ? r.data.slice(0, 10).toLowerCase() : undefined
    if (rule.allowedEvmCalls.length && !rule.allowedEvmCalls.some((c) => c === target || (selector && c === `${target}/${selector}`))) {
      return reject(403, 'NOT_APPROVED', 'this contract is not approved for the account')
    }
    const valueUqor = weiToUqor(BigInt(r.value))
    if (rule.perTxLimit > 0n && valueUqor > rule.perTxLimit) return reject(403, 'LIMIT_EXCEEDED', `value ${valueUqor} uqor is over the per-transaction limit ${rule.perTxLimit} uqor`)
    if (rule.dailyLimit > 0n && valueUqor > rule.dailyLimit) return reject(403, 'LIMIT_EXCEEDED', `value ${valueUqor} uqor is over the daily limit ${rule.dailyLimit} uqor`)

    // Simulation: would the call revert?
    const sim = await this.chain.simulateCall({ from: qorToEvm(r.account), to: target, data: r.data, value: BigInt(r.value), gas: BigInt(r.gasLimit) })
    if (!sim.ok) return reject(422, 'TX_FAILED', `the call would revert: ${sim.error.slice(0, 200)}`)
    return undefined
  }

  async relay(body: unknown, ip: string): Promise<{ status: number; body: RelayResponse }> {
    const parsed = RelayRequestSchema.safeParse(body)
    if (!parsed.success) return { status: 400, body: { ok: false, code: 'INVALID_INPUT', error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), preRejected: true } }
    const r = parsed.data as RelayRequest
    const pre = await this.precheck(r, ip)
    if (pre) {
      this.store.recordRelay({ tankId: r.tankId, account: r.account, signer: r.pubkey.toLowerCase(), target: r.to.toLowerCase(), success: false, error: `${pre.code}: ${pre.error}`, ip })
      return { status: pre.status, body: { ok: false, code: pre.code, chainCode: CHAIN_CODES[pre.code], error: pre.error, preRejected: true } }
    }

    const msg = fromRelayRequest(r, this.chain.relayerAddress)
    let res: TxResult
    try {
      res = await this.chain.submit(msg, Number(r.gasLimit))
    } catch (e) {
      const qe = e instanceof QoreConnectError ? e : undefined
      const code = qe?.code ?? 'RELAYER_UNAVAILABLE'
      const detail = [String((e as Error).message), qe?.detail].filter(Boolean).join(' | ').slice(0, 500)
      this.store.recordRelay({ tankId: r.tankId, account: r.account, signer: r.pubkey.toLowerCase(), target: r.to.toLowerCase(), txHash: qe?.txHash, success: false, code: qe?.chainCode, error: detail, ip })
      return { status: 502, body: { ok: false, code, chainCode: qe?.chainCode, error: detail, txHash: qe?.txHash } }
    }

    const fee = BigInt(res.feeUqor || '0')
    const [result] = decodeAuthenticatorExecutions(res as any, [msg])
    const success = !!result?.success
    const code = success ? undefined : classifyChainRefusal(result?.reason ?? (result as any)?.vmError, undefined)
    this.store.debitTank(r.tankId, fee)
    this.store.recordRelay({ tankId: r.tankId, account: r.account, signer: r.pubkey.toLowerCase(), target: r.to.toLowerCase(), txHash: res.transactionHash, success, code: code ? CHAIN_CODES[code] : 0, error: success ? undefined : result?.reason, feeUqor: fee, valueUqor: weiToUqor(BigInt(r.value)), ip })
    if (success) this.store.recordMeterEvent('relayed', r.account, res.transactionHash)
    return {
      status: 200,
      body: {
        ok: true,
        success,
        txHash: res.transactionHash,
        feeUqor: fee.toString(),
        explorer: explorerTx(this.net, res.transactionHash),
        ...(success ? {} : { code, chainCode: code ? CHAIN_CODES[code] : undefined, error: result?.reason || 'execution failed on chain (the signature is used up)' }),
      },
    }
  }
}

/** Production chain side: REST reads, viem eth_call, hybrid-signed envelopes from one relayer account. */
export class ChainRelay implements RelayChain {
  private readonly queue = new AccountQueue()
  private readonly client: QoreClient
  private readonly evm
  readonly relayerAddress: string

  constructor(
    private readonly net: QoreNetwork,
    private readonly account: UnifiedAccount,
  ) {
    this.client = new QoreClient(net)
    this.evm = createPublicClient({ transport: http(net.evmRpc) })
    this.relayerAddress = account.cosmos
  }

  authNonce(account: string, pubkeyHex: string) {
    return this.client.getAuthNonce(account, pubkeyHex)
  }
  authenticators(account: string) {
    return this.client.getAuthenticators(account)
  }
  rules(account: string) {
    return this.client.getSpendingRules(account)
  }

  async simulateCall(p: { from: string; to: string; data: string; value: bigint; gas: bigint }) {
    try {
      await this.evm.call({ account: p.from as Hex, to: p.to as Hex, data: p.data as Hex, value: p.value, gas: p.gas })
      return { ok: true as const }
    } catch (e: any) {
      const msg = String(e?.shortMessage ?? e?.message ?? e)
      // A balance shortfall for `value` is a real failure; RPC/network trouble is not a revert, so let the chain decide.
      if (/execution reverted|revert|insufficient funds/i.test(msg)) return { ok: false as const, error: msg }
      return { ok: true as const }
    }
  }

  submit(msg: EncodeObject, signedGasLimit: number): Promise<TxResult> {
    const once = () =>
      sendTx(this.net, this.account, [msg], new RestBroadcaster(this.net), { gas: 'auto', minGas: signedGasLimit + ENVELOPE_GAS_OVERHEAD })
    return this.queue.run(async () => {
      try {
        return await once()
      } catch (e) {
        // Sequence mismatch: refresh (sendTx re-reads the sequence) and retry once.
        if (/sequence mismatch|incorrect account sequence/i.test(String((e as Error)?.message) + String((e as any)?.detail))) return once()
        throw e
      }
    })
  }
}
