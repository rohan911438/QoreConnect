import {
  fetchAuthNonce,
  fetchAuthenticators,
  fetchEvmWindow,
  fetchPqcStatus,
  fetchSpendingRules,
  clearPqcStatusCache,
  pqcStatusPublicKey,
  type PqcStatus,
} from '@qorechain/sdk'
import type { QoreNetwork } from '../config'
import { getJson, HttpError, type FetchLike } from './http'

export interface PqcKeyInfo {
  registered: boolean
  possessionProven: boolean
  publicKey?: Uint8Array
  algorithmId?: number
}

export interface AuthenticatorInfo {
  scheme: string
  pubkeyHex: string
  permissions: string[]
  expiryUnix: number
  label: string
  createdAtUnix: number
  revoked: boolean
  hasSpendRule: boolean
}

export interface SpendingRuleInfo {
  id: string
  enabled: boolean
  perTxLimit: bigint
  dailyLimit: bigint
  allowedDenoms: string[]
  allowedEvmCalls: string[]
  denomLimits: { denom: string; perTxLimit: string; dailyLimit: string }[]
}

const isNotFound = (e: unknown) =>
  (e instanceof HttpError && (e.status === 404 || /not found/i.test(e.body))) || /not found|404/i.test(String((e as any)?.message ?? e))

/**
 * Typed, read-only QoreChain client over REST. `net.rest` may be a same-origin proxy (`/api/qore`) in browsers.
 * 404s are returned as "not found" values, never thrown.
 */
export class QoreClient {
  constructor(
    readonly net: QoreNetwork,
    private readonly fetchImpl?: FetchLike,
  ) {}

  private get f() {
    return this.fetchImpl as any
  }

  async getBalance(address: string, denom = 'uqor'): Promise<bigint> {
    try {
      const j = await getJson<any>(`${this.net.rest}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=${denom}`, this.fetchImpl)
      return BigInt(j.balance?.amount ?? 0)
    } catch (e) {
      if (isNotFound(e)) return 0n
      throw e
    }
  }

  async accountExists(address: string): Promise<boolean> {
    try {
      await getJson<any>(`${this.net.rest}/cosmos/auth/v1beta1/accounts/${address}`, this.fetchImpl)
      return true
    } catch (e) {
      if (isNotFound(e)) return false
      throw e
    }
  }

  async getPqcKey(address: string, opts: { fresh?: boolean } = {}): Promise<PqcKeyInfo> {
    if (opts.fresh) clearPqcStatusCache()
    let st: PqcStatus
    try {
      st = await fetchPqcStatus({ rest: this.net.rest, address, fetch: this.f })
    } catch (e) {
      if (isNotFound(e)) return { registered: false, possessionProven: false }
      throw e
    }
    return { registered: !!st.registered, possessionProven: !!st.possessionProven, publicKey: pqcStatusPublicKey(st), algorithmId: st.algorithmId }
  }

  async getAuthenticators(address: string): Promise<AuthenticatorInfo[]> {
    try {
      const list = await fetchAuthenticators({ rest: this.net.rest, address, fetch: this.f })
      return list.map((a: any) => ({
        scheme: a.scheme,
        pubkeyHex: a.pubkeyHex,
        permissions: a.permissions ?? [],
        expiryUnix: Number(a.expiryUnix ?? 0),
        label: a.label ?? '',
        createdAtUnix: Number(a.createdAtUnix ?? 0),
        revoked: !!a.revoked,
        hasSpendRule: !!a.hasSpendRule,
      }))
    } catch (e) {
      if (isNotFound(e)) return []
      throw e
    }
  }

  async getSpendingRules(address: string): Promise<SpendingRuleInfo[]> {
    try {
      const r = await fetchSpendingRules({ rest: this.net.rest, address, fetch: this.f })
      return r.rules.map((x) => ({
        id: x.id,
        enabled: x.enabled,
        perTxLimit: BigInt(x.perTxLimit),
        dailyLimit: BigInt(x.dailyLimit),
        allowedDenoms: x.allowedDenoms,
        allowedEvmCalls: x.allowedEvmCalls,
        denomLimits: x.denomLimits ?? [],
      }))
    } catch (e) {
      if (isNotFound(e)) return []
      throw e
    }
  }

  async getAuthNonce(address: string, pubkey: Uint8Array | string): Promise<bigint> {
    try {
      const n: any = await fetchAuthNonce({ rest: this.net.rest, address, pubkey, fetch: this.f })
      return BigInt(n?.nonce ?? n ?? 0)
    } catch (e) {
      if (isNotFound(e)) return 0n
      throw e
    }
  }

  async getEvmWindow(address: string): Promise<{ open: boolean; raw?: unknown }> {
    try {
      const w: any = await fetchEvmWindow({ rest: this.net.rest, address, fetch: this.f })
      return { open: !!(w?.open ?? w?.active ?? w?.window), raw: w }
    } catch (e) {
      if (isNotFound(e)) return { open: false }
      throw e
    }
  }

  async getLatestHeight(): Promise<number> {
    const j = await getJson<any>(`${this.net.rest}/cosmos/base/tendermint/v1beta1/blocks/latest`, this.fetchImpl)
    return Number(j.block?.header?.height ?? j.sdk_block?.header?.height ?? 0)
  }
}

/** REST path prefixes the browser proxy may forward (read-only). */
export const REST_PROXY_ALLOWLIST = [
  '/cosmos/auth/v1beta1/accounts/',
  '/cosmos/bank/v1beta1/balances/',
  '/cosmos/base/tendermint/v1beta1/blocks/latest',
  '/cosmos/tx/v1beta1/txs/',
  '/qorechain/pqc/v1/account/',
  '/qorechain/pqc/v1/protocol_features',
  '/qorechain/pqc/v1/evm_limits',
  '/qorechain/abstractaccount/v1/',
  '/qorechain/multilayer/v1/',
] as const

/** POST paths the proxy may forward (simulate and broadcast signed bytes only). */
export const REST_PROXY_POST_ALLOWLIST = ['/cosmos/tx/v1beta1/simulate', '/cosmos/tx/v1beta1/txs'] as const

export function isProxyPathAllowed(path: string, method: 'GET' | 'POST' = 'GET'): boolean {
  if (path.includes('..') || path.includes('//')) return false
  if (method === 'POST') return (REST_PROXY_POST_ALLOWLIST as readonly string[]).includes(path)
  return REST_PROXY_ALLOWLIST.some((p) => path === p || path.startsWith(p))
}
