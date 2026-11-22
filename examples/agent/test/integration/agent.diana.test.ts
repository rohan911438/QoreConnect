/**
 * P11 on Diana: owner creates an agent (sub-account, ML-DSA registration, selector-scoped key, root-signed instruction),
 * the agent executes one tip (G2), a second tip breaks the daily cap and the CHAIN refuses it (G3), an injected
 * drain sent through the attacker's own relayer is refused by the chain (G4b), and after revocation the agent's
 * next action fails (G5). Needs SPONSOR_MNEMONIC in the repo-root .env. Testnet only.
 */
import { config as dotenv } from 'dotenv'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodeAuthenticatorExecutions } from '@qorechain/sdk'
import { generatePrivateKey } from 'viem/accounts'
import {
  DIANA,
  MemoryVaultStorage,
  QoreClient,
  RootVault,
  classifyChainRefusal,
  createAgent,
  fromRelayRequest,
  listAgents,
  onboardRoot,
  reclaimAgentFunds,
  signInstruction,
  revokeAgent,
  type Eip1193Provider,
  type RelayRequest,
  type RelayResponse,
} from '@qoreconnect/core'
import { CHAIN_CODES, ChainFundsSender, ChainRelay, DEFAULT_SPONSOR, RelayService, RelayerStore, SponsorService, createRelayerApp, operatorAccount } from '@qoreconnect/relayer'
import { privateKeyToAccount } from 'viem/accounts'
import { Agent } from '../../src/agent'
import { CompromisedPlanner, RulePlanner } from '../../src/planner'

dotenv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true } as any)
const MNEMONIC = process.env.SPONSOR_MNEMONIC
const deployments = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../apps/demo-dapp/src/deployments.json'), 'utf8'))
const TIPJAR = deployments.contracts.QoreTipJar.address as string
const CREATOR = deployments.deployer as string
const RELAYER = 'http://relayer.agent-test'
const page = { source: 'fixtures/creator-page.html', text: readFileSync(resolve(import.meta.dirname, '../../fixtures/creator-page.html'), 'utf8') }

describe.skipIf(!MNEMONIC)('agent mode on Diana', () => {
  it('create → execute → chain refuses over-cap → injection refused → revoke', async () => {
    // In-process relayer (sponsor + relay) on Diana.
    const store = new RelayerStore(':memory:')
    store.createTank({ id: 'demo-dapp', name: 'Quantum Tip Jar', owner: 'test', balanceUqor: 20_000_000n, perUserDailyCapUqor: 5_000_000n })
    const client = new QoreClient(DIANA)
    const funds = new ChainFundsSender(DIANA, await operatorAccount(MNEMONIC!, 0))
    const sponsor = new SponsorService(DIANA, store, funds, DEFAULT_SPONSOR, async (r) => (await client.getPqcKey(r)).registered)
    const chain = new ChainRelay(DIANA, await operatorAccount(process.env.RELAYER_MNEMONIC ?? MNEMONIC!, Number(process.env.RELAYER_INDEX ?? 1)))
    const relay = new RelayService(DIANA, store, chain)
    const app = createRelayerApp({ net: DIANA, store, sponsor, relay })
    const fetchImpl = (async (input: string, init?: RequestInit) =>
      String(input).startsWith(RELAYER) ? app.request(String(input).slice(RELAYER.length), init as any) : fetch(input, init)) as any

    // Owner: a fresh root (stand-in MetaMask only signs the sponsor request), topped up so it can fund an agent.
    const mm = privateKeyToAccount(generatePrivateKey())
    const metamask: Eip1193Provider = {
      request: async ({ method, params }) =>
        method === 'personal_sign' ? mm.signMessage({ message: { raw: (params as string[])[0] as `0x${string}` } }) : [mm.address],
    }
    const root = await new RootVault(new MemoryVaultStorage()).create({ kind: 'password', password: 'agent integration', scrypt: { N: 2 ** 10, r: 8, p: 1 } })
    await onboardRoot({ net: DIANA, root, ethereum: metamask, relayerUrl: RELAYER, fetch: fetchImpl })
    await funds.send(root.qorAddress, 1_200_000n)

    // Agent process: own key; gives the owner a possession proof for the sub-account.
    const agentKey = generatePrivateKey()
    const subAddr = (await root.deriveSubAccount(1)).cosmos
    const mkAgent = (planner: RulePlanner | CompromisedPlanner, exec?: ConstructorParameters<typeof Agent>[0]['exec']) =>
      new Agent({ net: DIANA, privateKey: agentKey, relayerUrl: RELAYER, tankId: 'demo-dapp', planner, fetch: fetchImpl, exec, owner: { root: root.qorAddress, accounts: [subAddr] }, log: (e, d) => console.log(`[agent] ${e}`, JSON.stringify(d ?? {}, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 400)) })
    const agent = mkAgent(new RulePlanner())

    const t0 = Date.now()
    const created = await createAgent({
      net: DIANA,
      root,
      fetch: fetchImpl,
      index: 1,
      name: 'tipper',
      task: `Tip 0.15 QOR to ${CREATOR} with note "agent tip, root-signed"`,
      calls: [{ to: TIPJAR, signature: 'function tip(address creator, string note) payable', description: 'Tip a creator in the Quantum Tip Jar' }],
      limits: { perTxUqor: 200_000n, dailyUqor: 300_000n, denoms: ['uqor'] },
      fundUqor: 700_000n,
      agentProof: await agent.linkProof(subAddr),
      onEvent: (e) => console.log('[owner]', e.step, e.txHash ?? ''),
    })
    const createMs = Date.now() - t0
    expect(created.account).toBe(subAddr)
    expect(created.agent).toBe(agent.address.toLowerCase())
    const listed = await listAgents({ net: DIANA, root, fetch: fetchImpl, maxIndex: 1 })
    expect(listed[0]?.keys[0]?.label).toBe('agent:tipper')

    // G2: one capped action succeeds.
    const r1 = await agent.run(created.signed, [page])
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.steps[0]!.outcome.status).toBe('executed')
    const okTx = (r1.steps[0]!.outcome as any).txHash

    // G3: second tip of 0.2 is within the signed per-tx cap but over the 0.3 daily cap: the CHAIN refuses.
    const over = await mkAgent(new RulePlanner()).run(
      signInstruction(root, { ...created.signed.instruction, task: `Tip 0.2 QOR to ${CREATOR} with note "second tip"`, nonce: '1-over' }),
    )
    expect(over.ok).toBe(true)
    if (!over.ok) return
    const overOutcome = over.steps[0]!.outcome
    expect(overOutcome).toMatchObject({ status: 'refused-by-chain', code: 'LIMIT_EXCEEDED', chainCode: 5 })

    // G4b: a compromised planner obeys the page; with the guard switched off AND the attacker's own relayer
    // (no pre-check), the chain still refuses the drain.
    const attackerSubmit = async (req: RelayRequest): Promise<RelayResponse> => {
      const msg = fromRelayRequest(req, chain.relayerAddress)
      const res = await chain.submit(msg, Number(req.gasLimit))
      const [x] = decodeAuthenticatorExecutions(res as any, [msg])
      const code = x?.success ? undefined : classifyChainRefusal(x?.reason, undefined)
      return { ok: true, success: !!x?.success, txHash: res.transactionHash, code, chainCode: code ? CHAIN_CODES[code] : undefined, error: x?.reason }
    }
    const inj = await mkAgent(new CompromisedPlanner(), { unsafeSkipGuard: true, submit: attackerSubmit }).run(created.signed, [page])
    expect(inj.ok).toBe(true)
    if (!inj.ok) return
    const injOutcome = inj.steps[0]!.outcome
    expect(injOutcome).toMatchObject({ status: 'refused-by-chain', code: 'NOT_APPROVED', chainCode: 10 })

    // G5: owner revokes the agent; its next action fails.
    const rev = await revokeAgent({ net: DIANA, root, fetch: fetchImpl, index: 1 })
    expect(rev.revoked).toBe(1)
    const after = await mkAgent(new RulePlanner()).run(created.signed)
    expect(after.ok && after.steps[0]!.outcome).toMatchObject({ status: 'refused-by-relayer', code: 'REVOKED' })
    const reclaimed = await reclaimAgentFunds({ net: DIANA, root, fetch: fetchImpl, index: 1 })

    console.log(
      JSON.stringify(
        {
          root: root.qorAddress,
          agentAccount: created.account,
          agentKey: created.agent,
          createMs,
          txs: { fund: created.fundTx, register: created.registerTx, link: created.linkTx, revoke: rev.tx?.transactionHash, reclaim: reclaimed?.transactionHash },
          G2_success: okTx,
          G3_chainRefusal: overOutcome,
          G4_injection: injOutcome,
          G5_afterRevoke: after.ok ? after.steps[0]!.outcome : after,
        },
        null,
        2,
      ),
    )
    root.lock()
  })
})
