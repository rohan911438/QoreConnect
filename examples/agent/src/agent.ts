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
  type VerifyResult,
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
  /**
   * The owner this agent obeys: their root and the sub-accounts the agent was linked to. Pinned when the owner links the
   * agent from the dashboard (see `pin`). Without an owner, every instruction is refused.
   */
  owner?: { root: string; accounts: string[] }
  /** Called when the owner is pinned or gains an account, so the CLI can persist it. */
  onPin?: (owner: { root: string; accounts: string[] }) => void
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
  private owner?: { root: string; accounts: string[] }

  constructor(private readonly o: AgentOptions) {
    this.address = privateKeyToAccount(o.privateKey).address
    this.log = o.log ?? ((e, d) => console.log(`[agent] ${e}`, d ? JSON.stringify(d, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) : ''))
    this.owner = o.owner && { root: o.owner.root, accounts: [...o.owner.accounts] }
  }

  /** The pinned owner, if any. */
  get ownerInfo(): { root: string; accounts: string[] } | undefined {
    return this.owner && { root: this.owner.root, accounts: [...this.owner.accounts] }
  }

  /**
   * Pin the owner (first link) or add a sub-account for the same owner. Another root is refused: giving an agent a new
   * owner means resetting its configuration on the machine it runs on.
   */
  pin(root: string, account: string): void {
    if (!root.startsWith('qor1') || !account.startsWith('qor1')) throw new Error('root and account must be qor1 addresses')
    if (this.owner && this.owner.root !== root) throw new Error(`this agent already belongs to ${this.owner.root}`)
    this.owner ??= { root, accounts: [] }
    if (!this.owner.accounts.includes(account)) this.owner.accounts.push(account)
    this.o.onPin?.(this.ownerInfo!)
  }

  /** Possession proof the owner's dashboard needs to link this agent's key to the agent sub-account; pins the owner. */
  linkProof(account: string, root?: string): Promise<LinkProof> {
    if (root) this.pin(root, account)
    return agentLinkProof(this.o.net, account, this.o.privateKey)
  }

  /** Verify against the root key registered ON CHAIN (never a key carried in the instruction) and the pinned owner. */
  async verify(signed: SignedInstruction): Promise<VerifyResult> {
    if (!this.owner) return { ok: false, reason: 'WRONG_OWNER', detail: 'this agent has no owner yet: link it from your dashboard first' }
    const root = signed?.instruction?.root
    const lookup = this.o.rootPublicKey ?? ((r: string) => fetchRootPublicKey(this.o.net, r, this.o.fetch))
    const rootPublicKey = typeof root === 'string' && root.startsWith('qor1') ? await lookup(root) : undefined
    return verifyInstruction(signed, { rootPublicKey, chainId: this.o.net.chainId, agent: this.address, owner: this.owner })
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
