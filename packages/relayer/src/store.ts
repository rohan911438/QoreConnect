import { DatabaseSync } from 'node:sqlite'

export interface Tank {
  id: string
  name: string
  owner: string
  balanceUqor: bigint
  perUserDailyCapUqor: bigint
  allowedContracts?: string[]
  paused: boolean
}

/**
 * Relayer persistence on Node's built-in SQLite (node:sqlite, Node >= 22.5).
 * Deviation from the plan (Drizzle): no native module to build on Windows or in the container; same tables.
 */
export class RelayerStore {
  readonly db: DatabaseSync

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sponsorships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metamask TEXT NOT NULL UNIQUE,
        root TEXT NOT NULL UNIQUE,
        ip TEXT NOT NULL,
        amount_uqor TEXT NOT NULL,
        tx_hash TEXT,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS rate_limits_bucket ON rate_limits(bucket, ts);
      CREATE TABLE IF NOT EXISTS tanks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        balance_uqor TEXT NOT NULL,
        per_user_daily_cap_uqor TEXT NOT NULL,
        allowed_contracts TEXT,
        paused INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS relays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tank_id TEXT NOT NULL,
        account TEXT NOT NULL,
        signer TEXT NOT NULL,
        target TEXT,
        tx_hash TEXT,
        evm_tx_hash TEXT,
        success INTEGER,
        code INTEGER,
        error TEXT,
        fee_uqor TEXT,
        value_uqor TEXT,
        ip TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS relays_account ON relays(account, created_at);
      CREATE INDEX IF NOT EXISTS relays_tank_account ON relays(tank_id, account, created_at);
      CREATE TABLE IF NOT EXISTS meter_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        account TEXT,
        tx_hash TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meter_snapshots (ts INTEGER PRIMARY KEY, data TEXT NOT NULL);
    `)
    // Migrations for databases created by earlier versions.
    const cols = (this.db.prepare('PRAGMA table_info(relays)').all() as { name: string }[]).map((c) => c.name)
    if (!cols.includes('value_uqor')) this.db.exec('ALTER TABLE relays ADD COLUMN value_uqor TEXT')
  }

  /** Record a hit in a rate-limit bucket if fewer than `max` happened within `windowMs`. Returns false when limited. */
  hit(bucket: string, max: number, windowMs: number, now = Date.now()): boolean {
    this.db.prepare('DELETE FROM rate_limits WHERE ts < ?').run(now - 7 * 86_400_000)
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE bucket = ? AND ts >= ?')
      .get(bucket, now - windowMs) as { n: number }
    if (row.n >= max) return false
    this.db.prepare('INSERT INTO rate_limits (bucket, ts) VALUES (?, ?)').run(bucket, now)
    return true
  }

  findSponsorship(metamask: string, root: string): any {
    return this.db
      .prepare('SELECT * FROM sponsorships WHERE metamask = ? OR root = ?')
      .get(metamask.toLowerCase(), root)
  }

  /** Reserve a sponsorship slot atomically (UNIQUE constraints). Returns the row id, or undefined if taken. */
  reserveSponsorship(
    p: { metamask: string; root: string; ip: string; amountUqor: string },
    now = Date.now(),
  ): number | undefined {
    try {
      const r = this.db
        .prepare(
          `INSERT INTO sponsorships (metamask, root, ip, amount_uqor, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
        )
        .run(p.metamask.toLowerCase(), p.root, p.ip, p.amountUqor, now)
      return Number(r.lastInsertRowid)
    } catch {
      return undefined
    }
  }

  completeSponsorship(id: number, txHash: string) {
    this.db.prepare(`UPDATE sponsorships SET status = 'funded', tx_hash = ? WHERE id = ?`).run(txHash, id)
  }

  /** A failed transfer releases the slot so the user can retry. */
  releaseSponsorship(id: number) {
    this.db.prepare('DELETE FROM sponsorships WHERE id = ?').run(id)
  }

  sponsoredToday(now = Date.now()): bigint {
    const rows = this.db
      .prepare('SELECT amount_uqor FROM sponsorships WHERE created_at >= ?')
      .all(now - 86_400_000) as { amount_uqor: string }[]
    return rows.reduce((a, r) => a + BigInt(r.amount_uqor), 0n)
  }

  // ---- gas tanks ----

  createTank(
    t: {
      id: string
      name: string
      owner: string
      balanceUqor: bigint
      perUserDailyCapUqor: bigint
      allowedContracts?: string[]
    },
    now = Date.now(),
  ): Tank {
    this.db
      .prepare(
        'INSERT INTO tanks (id, name, owner, balance_uqor, per_user_daily_cap_uqor, allowed_contracts, paused, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
      )
      .run(
        t.id,
        t.name,
        t.owner,
        t.balanceUqor.toString(),
        t.perUserDailyCapUqor.toString(),
        t.allowedContracts?.length ? JSON.stringify(t.allowedContracts.map((c) => c.toLowerCase())) : null,
        now,
      )
    return this.getTank(t.id)!
  }

  getTank(id: string): Tank | undefined {
    const r = this.db.prepare('SELECT * FROM tanks WHERE id = ?').get(id) as any
    if (!r) return undefined
    return {
      id: r.id,
      name: r.name,
      owner: r.owner,
      balanceUqor: BigInt(r.balance_uqor),
      perUserDailyCapUqor: BigInt(r.per_user_daily_cap_uqor),
      allowedContracts: r.allowed_contracts ? JSON.parse(r.allowed_contracts) : undefined,
      paused: !!r.paused,
    }
  }

  updateTank(id: string, patch: { balanceUqor?: bigint; perUserDailyCapUqor?: bigint; paused?: boolean }) {
    const t = this.getTank(id)
    if (!t) return undefined
    this.db
      .prepare('UPDATE tanks SET balance_uqor = ?, per_user_daily_cap_uqor = ?, paused = ? WHERE id = ?')
      .run(
        (patch.balanceUqor ?? t.balanceUqor).toString(),
        (patch.perUserDailyCapUqor ?? t.perUserDailyCapUqor).toString(),
        (patch.paused ?? t.paused) ? 1 : 0,
        id,
      )
    return this.getTank(id)
  }

  /** Debit a tank (never below zero; the balance is an accounting budget, not on-chain funds). */
  debitTank(id: string, feeUqor: bigint) {
    const t = this.getTank(id)
    if (!t) return
    const next = t.balanceUqor > feeUqor ? t.balanceUqor - feeUqor : 0n
    this.db.prepare('UPDATE tanks SET balance_uqor = ? WHERE id = ?').run(next.toString(), id)
  }

  /** Fees this account consumed from this tank in the last 24 h. */
  accountSpentToday(tankId: string, account: string, now = Date.now()): bigint {
    const rows = this.db
      .prepare(
        'SELECT fee_uqor FROM relays WHERE tank_id = ? AND account = ? AND created_at >= ? AND fee_uqor IS NOT NULL',
      )
      .all(tankId, account, now - 86_400_000) as { fee_uqor: string }[]
    return rows.reduce((a, r) => a + BigInt(r.fee_uqor), 0n)
  }

  tankSpentToday(tankId: string, now = Date.now()): bigint {
    const rows = this.db
      .prepare('SELECT fee_uqor FROM relays WHERE tank_id = ? AND created_at >= ? AND fee_uqor IS NOT NULL')
      .all(tankId, now - 86_400_000) as { fee_uqor: string }[]
    return rows.reduce((a, r) => a + BigInt(r.fee_uqor), 0n)
  }

  recordRelay(
    r: {
      tankId: string
      account: string
      signer: string
      target?: string
      txHash?: string
      success?: boolean
      code?: number
      error?: string
      feeUqor?: bigint
      valueUqor?: bigint
      ip?: string
    },
    now = Date.now(),
  ) {
    this.db
      .prepare(
        'INSERT INTO relays (tank_id, account, signer, target, tx_hash, success, code, error, fee_uqor, value_uqor, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        r.tankId,
        r.account,
        r.signer,
        r.target ?? null,
        r.txHash ?? null,
        r.success === undefined ? null : r.success ? 1 : 0,
        r.code ?? null,
        r.error ?? null,
        r.feeUqor?.toString() ?? null,
        r.valueUqor?.toString() ?? null,
        r.ip ?? null,
        now,
      )
  }

  /** Value moved by successful relayed calls for this account in the last 24 h (QoreConnect's records; an estimate of chain-side daily spend). */
  accountValueToday(account: string, now = Date.now()): bigint {
    const rows = this.db
      .prepare(
        'SELECT value_uqor FROM relays WHERE account = ? AND success = 1 AND created_at >= ? AND value_uqor IS NOT NULL',
      )
      .all(account, now - 86_400_000) as { value_uqor: string }[]
    return rows.reduce((a, r) => a + BigInt(r.value_uqor), 0n)
  }

  accountActivity(account: string, limit = 25) {
    const rows = this.db
      .prepare(
        'SELECT tx_hash, signer, target, success, code, error, fee_uqor, value_uqor, tank_id, created_at FROM relays WHERE account = ? ORDER BY id DESC LIMIT ?',
      )
      .all(account, limit) as any[]
    return rows.map((r) => ({
      txHash: r.tx_hash ?? null,
      signer: r.signer,
      target: r.target,
      success: r.success === 1,
      code: r.code,
      error: r.error,
      feeUqor: r.fee_uqor,
      valueUqor: r.value_uqor,
      tankId: r.tank_id,
      createdAt: r.created_at,
    }))
  }

  getRelay(txHash: string): any {
    return this.db
      .prepare(
        'SELECT tank_id, account, signer, target, tx_hash, success, code, error, fee_uqor, created_at FROM relays WHERE tx_hash = ?',
      )
      .get(txHash.toUpperCase())
  }

  recordMeterEvent(kind: string, account?: string, txHash?: string, now = Date.now()) {
    this.db
      .prepare('INSERT INTO meter_events (kind, account, tx_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(kind, account ?? null, txHash ?? null, now)
  }

  close() {
    this.db.close()
  }
}
