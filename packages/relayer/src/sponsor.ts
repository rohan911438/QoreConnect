import { verifyMessage, isAddress, getAddress } from 'viem'
import { sponsorMessage, type QoreNetwork } from '@qoreconnect/core'
import type { RelayerStore } from './store'

export interface SponsorConfig {
  /** Amount sent to each new root (uqor). P01: 0.2 QOR covers registration, link, rules and revoke; plus 20%. */
  amountUqor: bigint
  perIpPerDay: number
  globalDailyBudgetUqor: bigint
}

export const DEFAULT_SPONSOR: SponsorConfig = { amountUqor: 240_000n, perIpPerDay: 3, globalDailyBudgetUqor: 50_000_000n }

/** Sends funds: the sponsor account in production, a fake in tests. */
export interface FundsSender {
  send(to: string, amountUqor: bigint): Promise<string>
}

export type SponsorOutcome =
  | { ok: true; txHash: string; amount: string }
  | { ok: false; status: 400 | 403 | 409 | 429 | 502 | 503; error: string }

const QOR_ADDR = /^qor1[02-9ac-hj-np-z]{38}$/

export class SponsorService {
  constructor(
    private readonly net: QoreNetwork,
    private readonly store: RelayerStore,
    private readonly sender: FundsSender,
    private readonly cfg: SponsorConfig = DEFAULT_SPONSOR,
    private readonly isRegistered: (root: string) => Promise<boolean> = async () => false,
  ) {}

  async sponsor(req: { rootAddress?: unknown; metamaskAddress?: unknown; signature?: unknown }, ip: string): Promise<SponsorOutcome> {
    const { rootAddress, metamaskAddress, signature } = req ?? {}
    if (typeof rootAddress !== 'string' || !QOR_ADDR.test(rootAddress)) return { ok: false, status: 400, error: 'invalid rootAddress' }
    if (typeof metamaskAddress !== 'string' || !isAddress(metamaskAddress)) return { ok: false, status: 400, error: 'invalid metamaskAddress' }
    if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return { ok: false, status: 400, error: 'invalid signature' }

    const message = sponsorMessage({ chainId: this.net.chainId, rootAddress, metamaskAddress })
    const valid = await verifyMessage({ address: getAddress(metamaskAddress), message, signature: signature as `0x${string}` }).catch(() => false)
    if (!valid) return { ok: false, status: 403, error: 'signature does not match the MetaMask address' }

    if (this.store.findSponsorship(metamaskAddress, rootAddress)) return { ok: false, status: 409, error: 'this MetaMask address or account was already sponsored' }
    if (await this.isRegistered(rootAddress)) return { ok: false, status: 409, error: 'account is already on chain' }
    if (this.store.sponsoredToday() + this.cfg.amountUqor > this.cfg.globalDailyBudgetUqor) return { ok: false, status: 503, error: 'daily sponsorship budget reached' }
    if (!this.store.hit(`sponsor-ip:${ip}`, this.cfg.perIpPerDay, 86_400_000)) return { ok: false, status: 429, error: 'too many sponsorships from this network today' }

    const id = this.store.reserveSponsorship({ metamask: metamaskAddress, root: rootAddress, ip, amountUqor: String(this.cfg.amountUqor) })
    if (id === undefined) return { ok: false, status: 409, error: 'this MetaMask address or account was already sponsored' }
    try {
      const txHash = await this.sender.send(rootAddress, this.cfg.amountUqor)
      this.store.completeSponsorship(id, txHash)
      this.store.recordMeterEvent('sponsored', rootAddress, txHash)
      return { ok: true, txHash, amount: String(this.cfg.amountUqor) }
    } catch (e) {
      this.store.releaseSponsorship(id)
      return { ok: false, status: 502, error: `sponsor transfer failed: ${String((e as Error)?.message ?? e).slice(0, 200)}` }
    }
  }
}
