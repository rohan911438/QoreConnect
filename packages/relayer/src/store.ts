import { DatabaseSync } from 'node:sqlite'

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
        ip TEXT,
        created_at INTEGER NOT NULL
      );
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
  }

  /** Record a hit in a rate-limit bucket if fewer than `max` happened within `windowMs`. Returns false when limited. */
  hit(bucket: string, max: number, windowMs: number, now = Date.now()): boolean {
    this.db.prepare('DELETE FROM rate_limits WHERE ts < ?').run(now - 7 * 86_400_000)
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE bucket = ? AND ts >= ?').get(bucket, now - windowMs) as { n: number }
    if (row.n >= max) return false
    this.db.prepare('INSERT INTO rate_limits (bucket, ts) VALUES (?, ?)').run(bucket, now)
    return true
  }

  findSponsorship(metamask: string, root: string): any {
    return this.db.prepare('SELECT * FROM sponsorships WHERE metamask = ? OR root = ?').get(metamask.toLowerCase(), root)
  }

  /** Reserve a sponsorship slot atomically (UNIQUE constraints). Returns the row id, or undefined if taken. */
  reserveSponsorship(p: { metamask: string; root: string; ip: string; amountUqor: string }, now = Date.now()): number | undefined {
    try {
      const r = this.db
        .prepare(`INSERT INTO sponsorships (metamask, root, ip, amount_uqor, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`)
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
    const rows = this.db.prepare('SELECT amount_uqor FROM sponsorships WHERE created_at >= ?').all(now - 86_400_000) as { amount_uqor: string }[]
    return rows.reduce((a, r) => a + BigInt(r.amount_uqor), 0n)
  }

  recordMeterEvent(kind: string, account?: string, txHash?: string, now = Date.now()) {
    this.db.prepare('INSERT INTO meter_events (kind, account, tx_hash, created_at) VALUES (?, ?, ?, ?)').run(kind, account ?? null, txHash ?? null, now)
  }

  close() {
    this.db.close()
  }
}
