import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  agentLinkProof,
  fetchRootPublicKey,
  verifyInstruction,
  type FetchLike,
  type InstructionRejection,
  type LinkProof,
  type QoreNetwork,
  type SignedInstruction,
} from '@qoreconnect/core'
import { execute, type ExecutorOptions } from './executor'
import { DEFAULT_BUDGET, type Budget, type PlanRun, type Planner, type UntrustedDoc } from './planner'

export interface AgentOptions {
  net: QoreNetwork
  privateKey: Hex
  relayerUrl: string
  tankId: string
  planner: Planner
  budget?: Budget
  /** Hard cap on runs per rolling hour (cost cap). */
  runsPerHour?: number
  fetch?: FetchLike
  log?: (event: string, data?: Record<string, unknown>) => void
  /** Override the on-chain root key lookup (unit tests only). */
  rootPublicKey?: (root: string) => Promise<Uint8Array | undefined>
  /** Test hooks forwarded to the executor. */
  exec?: Pick<ExecutorOptions, 'unsafeSkipGuard' | 'submit'>
}

export type RunResult =
  | { ok: false; rejected: InstructionRejection | 'RATE_LIMITED'; detail: string }
  | ({ ok: true; account: string; instructionNonce: string } & PlanRun)

export class Agent {
  readonly address: Hex
  private readonly runs: number[] = []
  private readonly log: NonNullable<AgentOptions['log']>

  constructor(private readonly o: AgentOptions) {
    this.address = privateKeyToAccount(o.privateKey).address
    this.log = o.log ?? ((e, d) => console.log(`[agent] ${e}`, d ? JSON.stringify(d, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : ''))
  }

  /** Possession proof the owner's dashboard needs to link this agent's key to the agent sub-account. */
  linkProof(account: string): Promise<LinkProof> {
    return agentLinkProof(this.o.net, account, this.o.privateKey)
  }

  /** Verify against the root key registered ON CHAIN (never a key carried in the instruction). */
  async verify(signed: SignedInstruction) {
    const root = signed?.instruction?.root
    const lookup = this.o.rootPublicKey ?? ((r: string) => fetchRootPublicKey(this.o.net, r, this.o.fetch))
    const rootPublicKey = typeof root === 'string' && root.startsWith('qor1') ? await lookup(root) : undefined
    return verifyInstruction(signed, { rootPublicKey, chainId: this.o.net.chainId, agent: this.address })
  }

  async run(signed: SignedInstruction, docs: UntrustedDoc[] = []): Promise<RunResult> {
    const now = Date.now()
    while (this.runs.length && this.runs[0]! < now - 3_600_000) this.runs.shift()
    const limit = this.o.runsPerHour ?? 10
    if (this.runs.length >= limit) {
      this.log('run rejected', { reason: 'RATE_LIMITED', limit })
      return { ok: false, rejected: 'RATE_LIMITED', detail: `at most ${limit} runs per hour` }
    }
    const v = await this.verify(signed)
    if (!v.ok) {
      this.log('instruction REJECTED', { reason: v.reason, detail: v.detail })
      return { ok: false, rejected: v.reason, detail: v.detail }
    }
    this.runs.push(now)
    const i = v.instruction
    this.log('instruction verified', { name: i.name, root: i.root, account: i.account, expires: new Date(i.expiresAt * 1000).toISOString() })
    const plan = await this.o.planner.run(
      i,
      docs,
      async (call) => {
        const outcome = await execute(
          { net: this.o.net, instruction: i, privateKey: this.o.privateKey, relayerUrl: this.o.relayerUrl, tankId: this.o.tankId, fetch: this.o.fetch, ...this.o.exec },
          call,
        )
        this.log(`action ${outcome.status}`, { call: call.summary, to: call.to, ...outcome })
        return outcome
      },
      this.o.budget ?? DEFAULT_BUDGET,
    )
    this.log('run finished', { planner: plan.planner, steps: plan.steps.length, tokens: plan.tokens, stoppedBy: plan.stoppedBy, summary: plan.summary })
    return { ok: true, account: i.account, instructionNonce: i.nonce, ...plan }
  }
}
