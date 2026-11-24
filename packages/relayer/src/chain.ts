import {
  bank,
  buildRegisterPqcKeyMsg,
  deriveUnifiedAccount,
  signProofOfPossession,
  type UnifiedAccount,
} from '@qorechain/sdk'
import { QoreClient, RestBroadcaster, sendTx, type QoreNetwork } from '@rohankumar4179/core'
import type { FundsSender } from './sponsor'

/** Serialises transactions from one account so sequence numbers never race. */
export class AccountQueue {
  private tail: Promise<unknown> = Promise.resolve()
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn)
    this.tail = next.catch(() => undefined)
    return next
  }
}

/** Server-side operator accounts only (relayer, sponsor). User root keys are never derived on a server. */
export function operatorAccount(mnemonic: string, index = 0): Promise<UnifiedAccount> {
  return deriveUnifiedAccount(mnemonic, index)
}

/** Production sender: a hybrid-signed bank send from the sponsor account. */
export class ChainFundsSender implements FundsSender {
  private readonly queue = new AccountQueue()
  constructor(
    private readonly net: QoreNetwork,
    private readonly account: UnifiedAccount,
  ) {}

  send(to: string, amountUqor: bigint): Promise<string> {
    return this.queue.run(async () => {
      const msg = bank.send({
        fromAddress: this.account.cosmos,
        toAddress: to,
        amount: [{ denom: 'uqor', amount: amountUqor.toString() }],
      })
      const r = await sendTx(this.net, this.account, [msg], new RestBroadcaster(this.net))
      return r.transactionHash
    })
  }
}

/**
 * Operator accounts sign hybrid envelopes, so they need a registered ML-DSA-87 key, like any root (P01).
 * Registers it with the classical bootstrap tx when missing. Idempotent; call at startup.
 */
export async function ensurePqcRegistered(
  net: QoreNetwork,
  account: UnifiedAccount,
): Promise<{ registered: true; txHash?: string }> {
  const client = new QoreClient(net)
  if ((await client.getPqcKey(account.cosmos, { fresh: true })).registered) return { registered: true }
  const proofOfPossession = signProofOfPossession({
    chainId: net.chainId,
    account: account.cosmos,
    algorithmId: 1,
    keypair: account.pqc,
  })
  const pub = account.publicKey.startsWith('0x') ? account.publicKey.slice(2) : account.publicKey
  const ecdsaPubkey = Uint8Array.from(pub.match(/.{1,2}/g) ?? [], (b) => parseInt(b, 16))
  const msg = buildRegisterPqcKeyMsg(account.cosmos, {
    pqcKeypair: account.pqc,
    ecdsaPubkey,
    keyType: 'hybrid',
    proofOfPossession,
  })
  const r = await sendTx(net, account, [msg], new RestBroadcaster(net), { mode: 'classical' })
  for (let i = 0; i < 30; i++) {
    if ((await client.getPqcKey(account.cosmos, { fresh: true })).registered)
      return { registered: true, txHash: r.transactionHash }
    await new Promise((res) => setTimeout(res, 1_000))
  }
  throw new Error(`ML-DSA registration for ${account.cosmos} not confirmed (tx ${r.transactionHash})`)
}
