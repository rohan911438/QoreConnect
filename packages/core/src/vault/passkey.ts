import { QoreConnectError } from '../errors'
import { randomBytes } from './crypto'

/**
 * A minimal abstraction over WebAuthn with the PRF extension, injectable for tests.
 * The PRF output (32 bytes) is the input key material for the vault's AES key.
 */
export interface PasskeyProvider {
  /** Create a credential and return its id plus PRF output for `prfSalt` (may need a follow-up assertion). */
  create(opts: { userName: string; prfSalt: Uint8Array }): Promise<{ credentialId: Uint8Array; prfOutput: Uint8Array }>
  /** Assert with an existing credential and return PRF output for `prfSalt`. */
  evaluate(opts: { credentialId: Uint8Array; prfSalt: Uint8Array }): Promise<Uint8Array>
  /** Whether PRF is likely supported (best effort). */
  isSupported(): Promise<boolean>
}

const ab = (u: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(u.byteLength)
  new Uint8Array(out).set(u)
  return out
}

/** Browser WebAuthn implementation. Requires a secure context and user verification. */
export class WebAuthnPasskeyProvider implements PasskeyProvider {
  constructor(private readonly rp: { name: string; id?: string } = { name: 'QoreConnect' }) {}

  async isSupported(): Promise<boolean> {
    const PKC = (globalThis as any).PublicKeyCredential
    if (!PKC || !globalThis.navigator?.credentials) return false
    try {
      if (typeof PKC.getClientCapabilities === 'function') {
        const caps = await PKC.getClientCapabilities()
        if (caps && 'extension:prf' in caps) return !!caps['extension:prf']
      }
    } catch {
      /* fall through */
    }
    return true // unknown: try, and fall back to password if PRF output is missing
  }

  async create({ userName, prfSalt }: { userName: string; prfSalt: Uint8Array }) {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: this.rp,
        user: { id: ab(randomBytes(16)), name: userName, displayName: userName },
        challenge: ab(randomBytes(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        extensions: { prf: { eval: { first: ab(prfSalt) } } } as any,
      },
    })) as PublicKeyCredential | null
    if (!cred) throw new QoreConnectError('USER_REJECTED')
    const credentialId = new Uint8Array(cred.rawId)
    const ext: any = cred.getClientExtensionResults()
    if (ext?.prf?.results?.first) return { credentialId, prfOutput: new Uint8Array(ext.prf.results.first) }
    if (ext?.prf && ext.prf.enabled === false) throw new QoreConnectError('PRF_UNSUPPORTED')
    // Some authenticators only return PRF output on assertion.
    const prfOutput = await this.evaluate({ credentialId, prfSalt })
    return { credentialId, prfOutput }
  }

  async evaluate({ credentialId, prfSalt }: { credentialId: Uint8Array; prfSalt: Uint8Array }) {
    const a = (await navigator.credentials.get({
      publicKey: {
        challenge: ab(randomBytes(32)),
        allowCredentials: [{ type: 'public-key', id: ab(credentialId) }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: ab(prfSalt) } } } as any,
      },
    })) as PublicKeyCredential | null
    if (!a) throw new QoreConnectError('USER_REJECTED')
    const ext: any = a.getClientExtensionResults()
    const first = ext?.prf?.results?.first
    if (!first) throw new QoreConnectError('PRF_UNSUPPORTED')
    return new Uint8Array(first)
  }
}
