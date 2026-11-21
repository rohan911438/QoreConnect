import { scryptAsync } from '@noble/hashes/scrypt'

/** scrypt parameters for the password fallback (architecture/06, T15). N = 2^17, r = 8, p = 1. */
export const SCRYPT = { N: 2 ** 17, r: 8, p: 1, dkLen: 32 } as const

const subtle = () => {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('WebCrypto (crypto.subtle) is required')
  return s
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  globalThis.crypto.getRandomValues(b)
  return b
}

/** Copy into a fresh ArrayBuffer-backed view (WebCrypto rejects SharedArrayBuffer views). */
const buf = (u: Uint8Array): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(new ArrayBuffer(u.byteLength))
  out.set(u)
  return out
}

/** HKDF-SHA-256 from passkey PRF output to a 256-bit AES key. */
export async function hkdfAesKey(ikm: Uint8Array, salt: Uint8Array, info = 'qoreconnect:vault:v1'): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', buf(ikm), 'HKDF', false, ['deriveKey'])
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: new TextEncoder().encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** scrypt from a password to a 256-bit AES key. */
export async function scryptAesKey(password: string, salt: Uint8Array, params: { N: number; r: number; p: number } = SCRYPT): Promise<CryptoKey> {
  const raw = await scryptAsync(new TextEncoder().encode(password.normalize('NFKC')), salt, { ...params, dkLen: 32 })
  try {
    return await subtle().importKey('raw', buf(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  } finally {
    raw.fill(0)
  }
}

export async function aesGcmEncrypt(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = randomBytes(12)
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad) }, key, buf(plaintext))
  return { iv, ciphertext: new Uint8Array(ct) }
}

export async function aesGcmDecrypt(key: CryptoKey, iv: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad) }, key, buf(ciphertext))
  return new Uint8Array(pt)
}

export const toB64 = (u: Uint8Array) => {
  let s = ''
  for (const byte of u) s += String.fromCharCode(byte)
  return btoa(s)
}
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
