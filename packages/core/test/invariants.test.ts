/**
 * The five invariants from architecture/06, against mocked chain state (runs in CI).
 * The same invariants run on Diana in packages/relayer/test/integration/invariants.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import {
  DIANA,
  LeakDetector,
  MemoryVaultStorage,
  RootVault,
  assertRuleInvariants,
  mergeApprove,
  mergeForLink,
  mergeLimits,
  mergeRemove,
  signRelayRequest,
  type Rule,
} from '../src/index'

const A = '0x42653b89eff2a993cf2767fedef783366f53aea4'
const B = '0x1a5b03240e7b3ce11fb8e59ef5da1cb60fbe9eab'
const C = '0x36003c3cea4a8e38cff894cce2c1d1be94e23baa'
const foreign: Rule = { id: 'someone-else', enabled: true, perTxLimit: 7n, dailyLimit: 9n, allowedDenoms: ['uqor'], allowedEvmCalls: [C] }

/** Deterministic PRNG so the sequence test is reproducible. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}

describe('Invariants 1 and 2: rule updates (random sequences of link / approve / remove / limits)', () => {
  it('every sequence keeps foreign rules intact and leaves the linked key bounded', () => {
    const r = rng(42)
    const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!
    for (let run = 0; run < 200; run++) {
      let rules: Rule[] = r() < 0.5 ? [foreign] : []
      rules = mergeForLink(rules, [pick([A, B, `${A}/0x12345678`])])
      for (let step = 0; step < 8; step++) {
        const before = rules.filter((x) => x.id !== 'qoreconnect')
        const op = pick(['approve', 'remove', 'limits'] as const)
        rules =
          op === 'approve'
            ? mergeApprove(rules, [pick([A, B, `${B}/0xabcdef01`])])
            : op === 'remove'
              ? mergeRemove(rules, [pick([A, B])])
              : mergeLimits(rules, { perTxUqor: BigInt(1 + Math.floor(r() * 1e6)), dailyUqor: BigInt(1e6 + Math.floor(r() * 5e6)) })
        // Invariant 2: every other rule still exists, unchanged.
        expect(rules.filter((x) => x.id !== 'qoreconnect')).toEqual(before)
        // Invariant 1: a linked value key is bounded by an enabled rule with finite caps for every denom.
        expect(() =>
          assertRuleInvariants({ rules, keys: [{ pubkeyHex: 'ab', permissions: ['evm'], revoked: false, expiryUnix: 0, hasSpendRule: true } as any] }),
        ).not.toThrow()
        expect(rules[0]!.id).toBe('qoreconnect')
      }
    }
  })
})

describe('Invariant 5: no private key or seed is sent over the network', () => {
  it('the detector itself catches a mnemonic, hex keys and base64 keys at any alignment', () => {
    const pk = generatePrivateKey()
    const secret = new Uint8Array(64).map((_, i) => (i * 37 + 11) & 0xff)
    const d = new LeakDetector({ mnemonic: 'alpha bravo charlie delta echo', keys: [pk, secret] })
    d.text('a', `{"note":"BRAVO charlie delta"}`)
    d.text('b', `x${pk.slice(2).toUpperCase()}`.toLowerCase())
    d.text('c', btoa(String.fromCharCode(7, ...secret.slice(0, 40))))
    d.bytes('d', new Uint8Array([1, 2, ...secret.slice(0, 32), 3]))
    d.text('clean', 'hello world')
    expect(d.leaks).toHaveLength(4)
  })

  it('a relay request signed by MetaMask carries the signature, never the key', async () => {
    const { privateKeyToAccount } = await import('viem/accounts')
    const pk = generatePrivateKey()
    const acct = privateKeyToAccount(pk)
    const metamask = { request: async ({ method, params }: any) => (method === 'personal_sign' ? acct.signMessage({ message: { raw: params[0] } }) : [acct.address]) }
    const d = new LeakDetector({ keys: [pk] })
    const fetchImpl = d.wrapFetch(async (url: string) =>
      new Response(JSON.stringify(/applied_plan/.test(url) ? { height: '100' } : /nonce/.test(url) ? { nonce: '0' } : {}), { status: 200 }),
    )
    const req = await signRelayRequest({
      net: DIANA,
      ethereum: metamask as any,
      metamaskAddress: acct.address,
      account: 'qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s',
      to: A,
      data: '0x',
      tankId: 'demo-dapp',
      gasLimit: 100_000,
      fetch: fetchImpl,
    } as any)
    d.text('relay request', JSON.stringify(req))
    expect(d.scanned).toBeGreaterThan(0)
    expect(d.leaks).toEqual([])
  })

  it('a root-signed hybrid transaction sends signatures and public keys, never the seed or secret keys', async () => {
    const vault = new RootVault(new MemoryVaultStorage())
    const root = await vault.create({ kind: 'password', password: 'invariant five', scrypt: { N: 2 ** 10, r: 8, p: 1 } })
    const mnemonic = await vault.exportRecoveryCode({ kind: 'password', password: 'invariant five' })
    const acct = root.unsafeAccount()
    const d = new LeakDetector({ mnemonic, keys: [acct.privateKey, acct.pqc.secretKey] })
    const fetchImpl = d.wrapFetch(async (url: string) => {
      const body = /accounts\//.test(url)
        ? { account: { '@type': '/cosmos.auth.v1beta1.BaseAccount', account_number: '7', sequence: '0' } }
        : /simulate/.test(url)
          ? { gas_info: { gas_used: '120000' } }
          : /applied_plan/.test(url)
            ? { height: '100' }
            : /blocks\/latest/.test(url)
              ? { block: { header: { height: '200' } } }
              : {}
      return new Response(JSON.stringify(body), { status: 200 })
    })
    const sent: Uint8Array[] = []
    const broadcaster = { broadcast: async (tx: Uint8Array) => (sent.push(tx), { code: 0, transactionHash: 'AA'.repeat(32), height: 1, gasUsed: 1n, gasWanted: 1n, events: [] }) }
    const msg = { typeUrl: '/cosmos.bank.v1beta1.MsgSend', value: { fromAddress: root.qorAddress, toAddress: root.qorAddress, amount: [{ denom: 'uqor', amount: '1' }] } }
    await root.signAndBroadcast(DIANA, [msg], broadcaster as any, {}, fetchImpl)
    expect(sent).toHaveLength(1)
    for (const tx of sent) d.bytes('broadcast tx', tx)
    expect(d.leaks).toEqual([])
    root.lock()
  })
})
