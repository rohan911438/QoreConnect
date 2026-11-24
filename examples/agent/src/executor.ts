/**
 * Execution: local guard first (the call must be in the ROOT-SIGNED instruction and within its per-tx cap), then an
 * EIP-191 signature by the agent key and the relayer, the same MsgExecuteEVM path as MetaMask. The chain enforces the
 * sub-account's rule (allow-list, per-tx and daily caps, expiry, revocation) regardless of what the agent decides.
 */
import type { Hex } from 'viem'
import {
  RelayerClient,
  callAllowedByInstruction,
  localKeyProvider,
  signRelayRequest,
  weiToUqor,
  type AgentInstruction,
  type FetchLike,
  type QoreNetwork,
  type RelayRequest,
  type RelayResponse,
} from '@rohankumar4179/core'
import type { PlannedCall } from './tools'

export type ExecOutcome =
  | { status: 'refused-by-agent'; reason: 'NOT_IN_SIGNED_INSTRUCTION' | 'OVER_SIGNED_PER_TX_CAP'; detail: string }
  | { status: 'refused-by-relayer'; code?: string; chainCode?: number; detail?: string }
  | { status: 'refused-by-chain'; code?: string; chainCode?: number; detail?: string; txHash?: string; explorer?: string }
  | { status: 'executed'; txHash: string; explorer?: string; feeUqor?: string }

export interface ExecutorOptions {
  net: QoreNetwork
  instruction: AgentInstruction
  privateKey: Hex
  relayerUrl: string
  tankId: string
  fetch?: FetchLike
  /** DEMO ONLY: skip the local guard to show that the chain still refuses (injection test part b). */
  unsafeSkipGuard?: boolean
  /** Override submission (tests: an attacker's own relayer that skips the pre-check). */
  submit?: (req: RelayRequest) => Promise<RelayResponse>
  gasLimit?: number
}

export function guard(i: AgentInstruction, call: Pick<PlannedCall, 'to' | 'data' | 'valueWei'>): ExecOutcome | undefined {
  if (!callAllowedByInstruction(i, call.to, call.data))
    return { status: 'refused-by-agent', reason: 'NOT_IN_SIGNED_INSTRUCTION', detail: `${call.to} ${call.data.slice(0, 10)} is not a call the root signed for` }
  const uqor = weiToUqor(call.valueWei)
  if (uqor > BigInt(i.limits.perTxUqor))
    return { status: 'refused-by-agent', reason: 'OVER_SIGNED_PER_TX_CAP', detail: `${uqor} uqor is over the signed per-transaction cap ${i.limits.perTxUqor} uqor` }
  // The daily cap is the chain's job: it counts every relayed call, including ones this process does not know about.
  return undefined
}

export async function execute(o: ExecutorOptions, call: PlannedCall): Promise<ExecOutcome> {
  if (!o.unsafeSkipGuard) {
    const refused = guard(o.instruction, call)
    if (refused) return refused
  }
  const key = localKeyProvider(o.privateKey)
  const req = await signRelayRequest({
    net: o.net,
    ethereum: key,
    metamaskAddress: key.address,
    account: o.instruction.account,
    to: call.to,
    data: call.data,
    valueWei: call.valueWei,
    tankId: o.tankId,
    gasLimit: o.gasLimit ?? 200_000,
    fetch: o.fetch,
  })
  const res = await (o.submit ?? ((r) => new RelayerClient(o.relayerUrl, o.fetch).relay(r)))(req)
  if (res.ok && res.success && res.txHash) return { status: 'executed', txHash: res.txHash, explorer: res.explorer, feeUqor: res.feeUqor }
  if (res.preRejected || !res.txHash) return { status: 'refused-by-relayer', code: res.code, chainCode: res.chainCode, detail: res.error }
  return { status: 'refused-by-chain', code: res.code, chainCode: res.chainCode, detail: res.error, txHash: res.txHash, explorer: res.explorer }
}
