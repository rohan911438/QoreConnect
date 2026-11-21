import { buildRegisterPqcKeyMsg, signProofOfPossession } from '@qorechain/sdk'
import type { QoreNetwork } from './config'
import { QoreConnectError } from './errors'
import { QoreClient } from './chain/client'
import { RestBroadcaster, type Broadcaster } from './chain/tx'
import type { FetchLike } from './chain/http'
import type { RootSigner } from './vault/signer'

/** Minimal EIP-1193 provider surface (MetaMask). */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<any>
}

/**
 * The exact text MetaMask signs to request sponsorship. The relayer rebuilds it and verifies the signature,
 * so a sponsorship can only be requested by the holder of that MetaMask key for that root.
 */
export function sponsorMessage(p: { chainId: string; rootAddress: string; metamaskAddress: string }): string {
  return [
    'QoreConnect: sponsor my quantum-safe account',
    `Chain: ${p.chainId}`,
    `Account: ${p.rootAddress}`,
    `MetaMask: ${p.metamaskAddress.toLowerCase()}`,
    'This request costs you nothing and moves no funds from MetaMask.',
  ].join('\n')
}

export type OnboardEvent =
  | { step: 'checking' }
  | { step: 'sponsoring' }
  | { step: 'sponsored'; txHash?: string; amountUqor?: string }
  | { step: 'waiting-funds' }
  | { step: 'registering' }
  | { step: 'registered'; txHash?: string; alreadyRegistered: boolean; ms: number }

export interface OnboardOptions {
  net: QoreNetwork
  root: RootSigner
  /** MetaMask (or any EIP-1193 provider) used to sign the sponsor request. */
  ethereum?: Eip1193Provider
  /** Relayer base URL, e.g. https://relayer.example.com */
  relayerUrl?: string
  /** Skip sponsorship (the account is funded another way). */
  skipSponsor?: boolean
  broadcaster?: Broadcaster
  fetch?: FetchLike
  onEvent?: (e: OnboardEvent) => void
  /** Funds needed before registering (uqor). Registration measured at ~0.059 QOR in P01. */
  minBalanceUqor?: bigint
  timeoutMs?: number
}

export interface OnboardResult {
  qorAddress: string
  sponsorTx?: string
  registerTx?: string
  alreadyRegistered: boolean
  ms: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const hexToBytes = (h: string) => {
  const s = h.startsWith('0x') ? h.slice(2) : h
  return Uint8Array.from(s.match(/.{1,2}/g) ?? [], (b) => parseInt(b, 16))
}

/** Ask the relayer to sponsor `root` and return the funding tx hash. */
export async function requestSponsorship(opts: {
  net: QoreNetwork
  relayerUrl: string
  rootAddress: string
  ethereum: Eip1193Provider
  fetch?: FetchLike
}): Promise<{ txHash: string; amountUqor: string }> {
  const [metamaskAddress] = (await opts.ethereum.request({ method: 'eth_requestAccounts' })) as string[]
  if (!metamaskAddress) throw new QoreConnectError('USER_REJECTED')
  const message = sponsorMessage({ chainId: opts.net.chainId, rootAddress: opts.rootAddress, metamaskAddress })
  const hex = '0x' + Array.from(new TextEncoder().encode(message), (b) => b.toString(16).padStart(2, '0')).join('')
  let signature: string
  try {
    signature = await opts.ethereum.request({ method: 'personal_sign', params: [hex, metamaskAddress] })
  } catch (e: any) {
    if (e?.code === 4001) throw new QoreConnectError('USER_REJECTED')
    throw e
  }
  const f = opts.fetch ?? ((i: string, init?: RequestInit) => globalThis.fetch(i, init))
  const res = await f(`${opts.relayerUrl.replace(/\/$/, '')}/v1/sponsor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rootAddress: opts.rootAddress, metamaskAddress, signature }),
  }).catch((e) => {
    throw new QoreConnectError('RELAYER_UNAVAILABLE', { detail: String(e) })
  })
  const body: any = await res.json().catch(() => ({}))
  if (res.status === 429) throw new QoreConnectError('RATE_LIMITED', { detail: body?.error })
  if (!res.ok) throw new QoreConnectError('SPONSOR_REFUSED', { message: body?.error ?? undefined, detail: JSON.stringify(body) })
  return { txHash: body.txHash, amountUqor: String(body.amount) }
}

/**
 * Bring a new root on chain: sponsor → wait for funds → register ML-DSA-87 (classical bootstrap tx, P01)
 * → wait for possessionProven. Idempotent: an already-registered key skips straight to "registered".
 */
export async function onboardRoot(o: OnboardOptions): Promise<OnboardResult> {
  const t0 = Date.now()
  const emit = o.onEvent ?? (() => {})
  const client = new QoreClient(o.net, o.fetch)
  const broadcaster = o.broadcaster ?? new RestBroadcaster(o.net, { fetch: o.fetch })
  const timeout = o.timeoutMs ?? 90_000
  const address = o.root.qorAddress

  emit({ step: 'checking' })
  const before = await client.getPqcKey(address, { fresh: true })
  if (before.registered) {
    const ms = Date.now() - t0
    emit({ step: 'registered', alreadyRegistered: true, ms })
    return { qorAddress: address, alreadyRegistered: true, ms }
  }

  let sponsorTx: string | undefined
  const minBalance = o.minBalanceUqor ?? 70_000n
  if (!o.skipSponsor && (await client.getBalance(address)) < minBalance) {
    if (!o.relayerUrl || !o.ethereum) throw new QoreConnectError('INVALID_INPUT', { message: 'relayerUrl and ethereum are required for sponsorship' })
    emit({ step: 'sponsoring' })
    const s = await requestSponsorship({ net: o.net, relayerUrl: o.relayerUrl, rootAddress: address, ethereum: o.ethereum, fetch: o.fetch })
    sponsorTx = s.txHash
    emit({ step: 'sponsored', txHash: s.txHash, amountUqor: s.amountUqor })
  }

  emit({ step: 'waiting-funds' })
  const deadline = t0 + timeout
  while ((await client.getBalance(address)) < minBalance) {
    if (Date.now() > deadline) throw new QoreConnectError('TX_FAILED', { message: 'Funds did not arrive in time.' })
    await sleep(1_000)
  }

  emit({ step: 'registering' })
  const account = o.root.unsafeAccount()
  const proofOfPossession = signProofOfPossession({ chainId: o.net.chainId, account: address, algorithmId: 1, keypair: account.pqc })
  const msg = buildRegisterPqcKeyMsg(address, { pqcKeypair: account.pqc, ecdsaPubkey: hexToBytes(account.publicKey), keyType: 'hybrid', proofOfPossession })
  const res = await o.root.signAndBroadcast(o.net, [msg], broadcaster, { mode: 'classical' }, o.fetch)

  for (;;) {
    const st = await client.getPqcKey(address, { fresh: true })
    if (st.registered && st.possessionProven) break
    if (Date.now() > deadline) throw new QoreConnectError('TX_FAILED', { message: 'Key registration was not confirmed in time.', txHash: res.transactionHash })
    await sleep(1_000)
  }
  const ms = Date.now() - t0
  emit({ step: 'registered', txHash: res.transactionHash, alreadyRegistered: false, ms })
  return { qorAddress: address, sponsorTx, registerTx: res.transactionHash, alreadyRegistered: false, ms }
}
