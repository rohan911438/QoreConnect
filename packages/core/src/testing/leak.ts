/**
 * Invariant 5 (architecture/06): no private key or seed is ever sent over the network.
 * A detector for secrets in captured traffic: request URLs and bodies (text) and raw transaction bytes (binary).
 * Text is checked for the mnemonic (any 3 consecutive words), and for each secret as hex or base64 at every byte
 * alignment; binary is checked for each secret's bytes (first 32 bytes, enough to identify any key).
 */
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromHex = (h: string) => Uint8Array.from((h.replace(/^0x/, '').match(/.{2}/g) ?? []).map((x) => parseInt(x, 16)))

function indexOfBytes(hay: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

export interface SecretSet {
  mnemonic?: string
  /** Hex private keys (secp256k1) or raw secret bytes. For ML-DSA secret keys use `mldsaSecretKeys`. */
  keys: (string | Uint8Array)[]
  /**
   * ML-DSA (FIPS 204) secret keys. Their first 32 bytes are rho, the PUBLIC seed that is also the first 32 bytes of the
   * public key (which is legitimately sent on chain), so the detector watches the secret parts instead: K (bytes 32–63)
   * and the start of s1 (bytes 128–159).
   */
  mldsaSecretKeys?: Uint8Array[]
}

export class LeakDetector {
  private readonly needles: { name: string; bytes: Uint8Array; text: string[] }[]
  private readonly phrases: string[]
  readonly leaks: string[] = []
  scanned = 0

  constructor(s: SecretSet) {
    const words = s.mnemonic?.trim().split(/\s+/) ?? []
    this.phrases = words.length >= 3 ? words.slice(0, -2).map((_, i) => words.slice(i, i + 3).join(' ')) : []
    const raw: Uint8Array[] = [
      ...s.keys.map((k) => (typeof k === 'string' ? fromHex(k) : k).slice(0, 32)),
      ...(s.mldsaSecretKeys ?? []).flatMap((k) => [k.slice(32, 64), k.slice(128, 160)]),
    ]
    this.needles = raw.map((bytes, i) => {
      // base64 of the secret at each of the three alignments, minus the edge characters that depend on neighbours
      const b64 = [0, 1, 2].map((o) => toB64(bytes.slice(o)).replace(/=+$/, '').slice(1, -2)).filter((x) => x.length >= 16)
      return { name: `key#${i}`, bytes, text: [toHex(bytes), ...b64] }
    })
  }

  text(where: string, s: string | undefined | null) {
    if (!s) return
    this.scanned++
    const lower = s.toLowerCase()
    for (const p of this.phrases) if (lower.includes(p)) this.leaks.push(`${where}: mnemonic words "${p.split(' ')[0]} …"`)
    for (const n of this.needles) for (const t of n.text) if ((t === n.text[0] ? lower : s).includes(t)) this.leaks.push(`${where}: ${n.name}`)
  }

  bytes(where: string, b: Uint8Array) {
    this.scanned++
    for (const n of this.needles) if (indexOfBytes(b, n.bytes) >= 0) this.leaks.push(`${where}: ${n.name} (raw bytes)`)
    this.text(where, new TextDecoder().decode(b))
  }

  /** Wrap a fetch so every outgoing URL and body is scanned before it is sent. */
  wrapFetch<F extends (input: any, init?: any) => Promise<Response>>(f: F): F {
    return (async (input: any, init?: any) => {
      this.text('url', String(input?.url ?? input))
      const body = init?.body
      if (typeof body === 'string') this.text(`body ${String(input)}`, body)
      else if (body instanceof Uint8Array) this.bytes(`body ${String(input)}`, body)
      return f(input, init)
    }) as F
  }
}
