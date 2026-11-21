import { bank, deriveUnifiedAccount, type UnifiedAccount } from '@qorechain/sdk'
import { RestBroadcaster, sendTx, type QoreNetwork } from '@qoreconnect/core'
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
      const msg = bank.send({ fromAddress: this.account.cosmos, toAddress: to, amount: [{ denom: 'uqor', amount: amountUqor.toString() }] })
      const r = await sendTx(this.net, this.account, [msg], new RestBroadcaster(this.net))
      return r.transactionHash
    })
  }
}
