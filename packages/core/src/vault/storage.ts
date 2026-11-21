/**
 * Encrypted vault record. Never contains the mnemonic in plaintext.
 */
export interface VaultRecord {
  version: 1
  /** "passkey-prf" (HKDF over WebAuthn PRF output) or "scrypt" (password fallback). */
  kdf: 'passkey-prf' | 'scrypt'
  /** base64 salt for HKDF (passkey) or scrypt (password). */
  salt: string
  /** base64 PRF evaluation input (passkey only). */
  prfSalt?: string
  /** base64 WebAuthn credential id (passkey only). */
  credentialId?: string
  /** scrypt parameters (password only). */
  scrypt?: { N: number; r: number; p: number }
  iv: string
  ciphertext: string
  /** Public data, bound into the AES-GCM additional data so it cannot be swapped. */
  qorAddress: string
  evmAddress: string
  createdAt: number
}

export interface VaultStorage {
  get(id: string): Promise<VaultRecord | undefined>
  put(id: string, record: VaultRecord): Promise<void>
  delete(id: string): Promise<void>
  list(): Promise<string[]>
}

/** In-memory storage (tests, SSR). */
export class MemoryVaultStorage implements VaultStorage {
  readonly records = new Map<string, VaultRecord>()
  async get(id: string) {
    return this.records.get(id)
  }
  async put(id: string, r: VaultRecord) {
    this.records.set(id, structuredClone(r))
  }
  async delete(id: string) {
    this.records.delete(id)
  }
  async list() {
    return [...this.records.keys()]
  }
}

/** IndexedDB storage (browser). */
export class IndexedDbVaultStorage implements VaultStorage {
  constructor(
    private readonly dbName = 'qoreconnect',
    private readonly store = 'vaults',
    private readonly idb: IDBFactory = globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = this.idb.open(this.dbName, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(this.store)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open()
    try {
      return await new Promise<T>((resolve, reject) => {
        const t = db.transaction(this.store, mode)
        const req = fn(t.objectStore(this.store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    } finally {
      db.close()
    }
  }

  get(id: string) {
    return this.tx('readonly', (s) => s.get(id) as IDBRequest<VaultRecord | undefined>)
  }
  async put(id: string, r: VaultRecord) {
    await this.tx('readwrite', (s) => s.put(r, id))
  }
  async delete(id: string) {
    await this.tx('readwrite', (s) => s.delete(id))
  }
  async list() {
    return (await this.tx('readonly', (s) => s.getAllKeys())).map(String)
  }
}

export function defaultStorage(): VaultStorage {
  return typeof globalThis.indexedDB !== 'undefined' ? new IndexedDbVaultStorage() : new MemoryVaultStorage()
}
