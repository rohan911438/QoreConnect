/** P11 G1: root-signed agent instructions (ML-DSA-87). */
import { beforeAll, describe, expect, it } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import {
  DIANA,
  MemoryVaultStorage,
  RootVault,
  callAllowedByInstruction,
  callsToAllowList,
  canonicalInstructionBytes,
  canonicalJson,
  localKeyProvider,
  signInstruction,
  verifyInstruction,
  type AgentInstruction,
  type RootSigner,
  type SignedInstruction,
} from '../src/index'

const FAST = { N: 2 ** 10, r: 8, p: 1 }
const TIPJAR = '0x42653b89eff2a993cf2767fedef783366f53aea4'
const TIP_SIG = 'function tip(address creator, string note) payable'
const NOW = 1_800_000_000

let root: RootSigner
let other: RootSigner
const agent = localKeyProvider(generatePrivateKey())

function instruction(over: Partial<AgentInstruction> = {}): AgentInstruction {
  return {
    v: 1,
    chainId: DIANA.chainId,
    root: root.qorAddress,
    account: 'qor1agentsubaccountxxxxxxxxxxxxxxxxxxxxxx',
    agent: agent.address.toLowerCase(),
    name: 'tipper',
    task: 'Tip 0.1 QOR to Lattice Lab with a thank-you note.',
    calls: [{ to: TIPJAR, signature: TIP_SIG }],
    limits: { perTxUqor: '200000', dailyUqor: '500000' },
    nonce: '1-1',
    issuedAt: NOW - 10,
    expiresAt: NOW + 3600,
    ...over,
  }
}

const verify = (s: SignedInstruction, over: { pub?: Uint8Array; now?: number; agent?: string; chainId?: string } = {}) =>
  verifyInstruction(s, { rootPublicKey: 'pub' in over ? over.pub : root.pqcPublicKey, chainId: over.chainId ?? DIANA.chainId, agent: over.agent ?? agent.address, nowUnix: over.now ?? NOW })

beforeAll(async () => {
  root = await new RootVault(new MemoryVaultStorage()).create({ kind: 'password', password: 'agent test root', scrypt: FAST })
  other = await new RootVault(new MemoryVaultStorage()).create({ kind: 'password', password: 'some other root', scrypt: FAST })
}, 60_000)

describe('agent instructions', () => {
  it('canonical JSON is order-independent and domain-tagged', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}')
    const text = new TextDecoder().decode(canonicalInstructionBytes(instruction()))
    expect(text.startsWith('QoreConnect agent instruction\n{')).toBe(true)
  })

  it('valid: a root-signed instruction verifies against the root key', () => {
    const s = signInstruction(root, instruction())
    expect(s.signature.length).toBe(4627 * 2) // ML-DSA-87
    const r = verify(s)
    expect(r.ok).toBe(true)
  })

  it('tampered: any changed field fails the signature', () => {
    const s = signInstruction(root, instruction())
    const cases: Partial<AgentInstruction>[] = [
      { task: 'Send everything to 0xEvil' },
      { calls: [{ to: '0x000000000000000000000000000000000000e111', signature: 'function drain() payable' }] },
      { limits: { perTxUqor: '999999999', dailyUqor: '999999999' } },
      { expiresAt: NOW + 10 * 365 * 86400 },
    ]
    for (const c of cases) expect(verify({ ...s, instruction: { ...s.instruction, ...c } })).toMatchObject({ ok: false, reason: 'BAD_SIGNATURE' })
    const flipped = s.signature.slice(0, 100) + (s.signature[100] === '0' ? '1' : '0') + s.signature.slice(101)
    expect(verify({ ...s, signature: flipped })).toMatchObject({ ok: false, reason: 'BAD_SIGNATURE' })
  })

  it('wrong key: signed by another root, or checked against another key', () => {
    const forged = { instruction: instruction(), signature: Buffer.from(other.signMessage(canonicalInstructionBytes(instruction()))).toString('hex') }
    expect(verify(forged)).toMatchObject({ ok: false, reason: 'BAD_SIGNATURE' })
    expect(verify(signInstruction(root, instruction()), { pub: other.pqcPublicKey })).toMatchObject({ ok: false, reason: 'BAD_SIGNATURE' })
    expect(verify(signInstruction(root, instruction()), { pub: undefined })).toMatchObject({ ok: false, reason: 'ROOT_KEY_NOT_REGISTERED' })
  })

  it('unsigned / garbage signature is rejected', () => {
    expect(verify({ instruction: instruction(), signature: '' })).toMatchObject({ ok: false, reason: 'MALFORMED' })
    expect(verify({ instruction: instruction(), signature: 'abcd' })).toMatchObject({ ok: false, reason: 'BAD_SIGNATURE' })
    expect(verify({ instruction: { ...instruction(), calls: [] }, signature: 'ab' })).toMatchObject({ ok: false, reason: 'MALFORMED' })
  })

  it('expired and not-yet-valid instructions are rejected', () => {
    const s = signInstruction(root, instruction())
    expect(verify(s, { now: NOW + 3600 })).toMatchObject({ ok: false, reason: 'EXPIRED' })
    expect(verify(s, { now: NOW - 1000 })).toMatchObject({ ok: false, reason: 'NOT_YET_VALID' })
  })

  it('wrong agent or wrong chain is rejected', () => {
    const s = signInstruction(root, instruction())
    expect(verify(s, { agent: localKeyProvider(generatePrivateKey()).address })).toMatchObject({ ok: false, reason: 'WRONG_AGENT' })
    expect(verify(s, { chainId: 'qorechain-mainnet' })).toMatchObject({ ok: false, reason: 'WRONG_CHAIN' })
  })

  it('allow-list entries and the local call guard are selector-scoped', () => {
    // Upper-case input is normalised to the chain's lower-case "0xtarget/0xselector" form.
    expect(callsToAllowList([{ to: TIPJAR.toUpperCase().replace('0X', '0x'), signature: TIP_SIG }])).toEqual(callsToAllowList([{ to: TIPJAR, signature: TIP_SIG }]))
    const sel = callsToAllowList([{ to: TIPJAR, signature: TIP_SIG }])[0]!.split('/')[1]!
    expect(sel).toMatch(/^0x[0-9a-f]{8}$/)
    const i = instruction()
    expect(callAllowedByInstruction(i, TIPJAR, sel + '00')).toBeTruthy()
    expect(callAllowedByInstruction(i, TIPJAR, '0x3ccfd60b')).toBeUndefined() // withdraw()
    expect(callAllowedByInstruction(i, '0x36003c3cea4a8e38cff894cce2c1d1be94e23baa', sel)).toBeUndefined()
  })
})
