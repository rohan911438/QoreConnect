/**
 * P15 (approval scanner) on Diana, with the testnet-only QCT token (contracts/src/TestToken.sol).
 *
 * Proves, with real transactions:
 *  1. a linked MetaMask key cannot approve a token its rule does not list as an erc20/ denom (chain code 10);
 *  2. once listed, approvals count against the rule's limits: a capped one passes, an unlimited one is refused (code 5);
 *  3. the scanner finds the live approval under the ROOT's 0x address (relayed calls run as the root, spike Q3);
 *  4. prepareTokenRevoke restores coverage when needed, the revoke (approve 0) relays, and the next scan shows it closed.
 */
import { describe, expect, it } from 'vitest'
import { qorToEvm } from '@qorechain/sdk'
import { encodeFunctionData, parseAbi } from 'viem'
import { DIANA, linkSessionKey, prepareTokenRevoke, setLimits, signRelayRequest } from '@qoreconnect/core'
import {
  ApprovalScanner,
  ChainRelay,
  RelayService,
  RelayerStore,
  RelayedApprovalIndex,
  jsonRpc,
  operatorAccount,
  restPages,
  revokeCalldata,
} from '../../src/index'
import { MNEMONIC, freshRoot } from './helpers'
import deployments from '../../../../apps/demo-dapp/src/deployments.json'

const TOKEN = (deployments as any).contracts.TestToken.address as string
const DEPLOY_BLOCK = (deployments as any).contracts.TestToken.block as number
const SPENDER = '0x000000000000000000000000000000000000dead'
const MAX = (1n << 256n) - 1n
const abi = parseAbi(['function approve(address spender, uint256 value) returns (bool)'])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!MNEMONIC)('approval policy, scanner and revoke on Diana (integration)', () => {
  it('caps approvals by the rule, finds the live one, revokes it', async () => {
    const { root, mm, fetchImpl } = await freshRoot(1_500_000n)
    const ctx = { net: DIANA, root, fetch: fetchImpl }
    await linkSessionKey({ ...ctx, metamask: mm, contracts: [TOKEN] })

    const relayerAcct = await operatorAccount(MNEMONIC!, Number(process.env.RELAYER_INDEX ?? 1))
    const store = new RelayerStore(':memory:')
    store.createTank({
      id: 'appr',
      name: 'Approvals',
      owner: 'test',
      balanceUqor: 5_000_000n,
      perUserDailyCapUqor: 3_000_000n,
    })
    const svc = new RelayService(DIANA, store, new ChainRelay(DIANA, relayerAcct), {
      perAccountPerMinute: 30,
      perIpPerMinute: 60,
      maxGasLimit: 3_000_000,
    })
    const relay = async (data: string) => {
      const req = await signRelayRequest({
        net: DIANA,
        ethereum: mm,
        metamaskAddress: mm.address,
        account: root.qorAddress,
        to: TOKEN,
        data,
        valueWei: 0n,
        tankId: 'appr',
        gasLimit: 200_000,
        fetch: fetchImpl,
      })
      const r = await svc.relay(req, 'test')
      console.log(
        'relay',
        JSON.stringify({ success: r.body.success, code: r.body.code, chainCode: r.body.chainCode, tx: r.body.txHash }),
      )
      return r.body
    }
    const approve = (v: bigint) => encodeFunctionData({ abi, functionName: 'approve', args: [SPENDER, v] })

    // 1. Token not listed as a denom: any approval is refused by the chain.
    expect(await relay(approve(500_000n))).toMatchObject({ success: false, chainCode: 10 })

    // 2. Listed (rule-wide caps, in the token's base units): capped approval passes, unlimited is refused.
    await setLimits({
      ...ctx,
      limits: { perTxUqor: 1_000_000n, dailyUqor: 5_000_000n, denoms: ['uqor', `erc20/${TOKEN}`] },
    })
    expect(await relay(approve(500_000n))).toMatchObject({ success: true })
    expect(await relay(approve(MAX))).toMatchObject({ success: false, chainCode: 5 })

    // 3. The scanner finds the live approval under the root's 0x address.
    const owner = qorToEvm(root.qorAddress).toLowerCase()
    // Logs of relayed calls are not in eth_getLogs on Diana. The scanner gets them ONLY from the chain's tx search (a
    // fresh index, no relayer record): what a restarted relayer, or any other relayer, would see.
    const index = new RelayedApprovalIndex(restPages(DIANA.rest), { minIntervalMs: 0 })
    const scanner = new ApprovalScanner(jsonRpc(DIANA.evmRpc), {
      fromBlock: DEPLOY_BLOCK,
      known: async (o) => {
        await index.refresh()
        return { candidates: index.known(o), complete: index.ready }
      },
    })
    let found = await scanner.scan(owner)
    for (let i = 0; i < 10 && !found.approvals.length; i++) {
      await sleep(3_000)
      found = await scanner.scan(owner)
    }
    console.log('scan', JSON.stringify(found.approvals))
    expect(found.approvals).toHaveLength(1)
    expect(found.approvals[0]).toMatchObject({
      kind: 'erc20',
      token: TOKEN,
      spender: SPENDER,
      amount: '500000',
      unlimited: false,
      symbol: 'QCT',
    })

    // 4. Coverage removed (as if the token was dropped later): prepareTokenRevoke restores it, then the revoke relays.
    await setLimits({ ...ctx, limits: { perTxUqor: 1_000_000n, dailyUqor: 5_000_000n, denoms: ['uqor'] } })
    const prep = await prepareTokenRevoke({ ...ctx, token: TOKEN })
    expect(prep.changed).toBe(true)
    expect((await prepareTokenRevoke({ ...ctx, token: TOKEN })).changed).toBe(false)
    expect(await relay(revokeCalldata(found.approvals[0]!))).toMatchObject({ success: true })
    let after = await scanner.scan(owner)
    for (let i = 0; i < 10 && after.approvals.length; i++) {
      await sleep(3_000)
      after = await scanner.scan(owner)
    }
    expect(after.approvals).toHaveLength(0)
    expect(after.closed).toBe(1)
  }, 480_000)
})
