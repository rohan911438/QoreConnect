/** "3 d 4 h", "5 h 12 min", "8 min" or "expired". */
export function timeLeft(expiryUnix: number, nowMs: number): string {
  const s = expiryUnix - Math.floor(nowMs / 1000)
  if (s <= 0) return 'expired'
  const d = Math.floor(s / 86_400)
  const h = Math.floor((s % 86_400) / 3600)
  const m = Math.max(1, Math.floor((s % 3600) / 60))
  return d ? `${d} d ${h} h` : h ? `${h} h ${m} min` : `${m} min`
}
