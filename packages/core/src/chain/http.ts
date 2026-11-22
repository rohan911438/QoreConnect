export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Per-request timeout for chain REST calls, so a hung upstream cannot hang a caller (P13). */
export const HTTP_TIMEOUT_MS = 15_000
/** Mutable so operators (and tests) can tune it. */
/**
 * Hedging delay for idempotent requests: if no response arrives within this time, a duplicate is sent and the first
 * answer wins (the losing request is aborted). Diana's REST usually answers in under 1.5 s but sometimes leaves one
 * request hanging for 15 s or more while an identical one succeeds at once (measured 22 Nov 2026). 0 disables hedging.
 */
export const HTTP_HEDGE_MS = 3_000
export const httpConfig = { timeoutMs: HTTP_TIMEOUT_MS, hedgeMs: HTTP_HEDGE_MS }

const timeoutError = () => new DOMException('The operation timed out.', 'TimeoutError')

/** One logical request: a primary attempt plus, after hedgeMs, at most one duplicate. First response wins. */
export function hedgedFetch(
  base: FetchLike,
  input: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  hedgeMs: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const ctrls: AbortController[] = []
    let done = false
    let failures = 0
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined
    const launch = () => {
      const c = new AbortController()
      ctrls.push(c)
      // The timer keeps running after the headers arrive, so a body that stalls is also cut off.
      const t = setTimeout(() => c.abort(timeoutError()), timeoutMs)
      ;(t as any).unref?.()
      base(input, { ...init, signal: c.signal }).then(
        (r) => {
          if (done) return
          done = true
          clearTimeout(hedgeTimer)
          for (const o of ctrls) if (o !== c) o.abort()
          resolve(r)
        },
        (e) => {
          clearTimeout(t)
          if (done) return
          failures++
          if (ctrls.length === 1 && hedgeMs > 0) {
            clearTimeout(hedgeTimer) // the primary failed before the hedge fired: send the duplicate now
            launch()
          } else if (failures === ctrls.length) {
            done = true
            clearTimeout(hedgeTimer)
            reject(e)
          }
        },
      )
    }
    launch()
    if (hedgeMs > 0) {
      hedgeTimer = setTimeout(() => {
        if (!done && ctrls.length === 1) launch()
      }, hedgeMs)
      ;(hedgeTimer as any).unref?.()
    }
  })
}

/** True for an aborted-by-timeout fetch (DOMException TimeoutError/AbortError, or a timeout message). */
export const isTimeout = (e: unknown): boolean =>
  /TimeoutError|AbortError/.test(String((e as any)?.name)) ||
  /timed out|aborted due to timeout/i.test(String((e as Error)?.message ?? e))

/**
 * fetch with up to 3 retries on transient network errors (never on HTTP errors). Idempotent requests (reads, simulate)
 * are also hedged (see httpConfig.hedgeMs) and retried after a timeout, with a longer timeout each time (P14).
 * Broadcasts are not idempotent from the caller's view, so they are never retried here (see RestBroadcaster).
 */
function f(fetchImpl?: FetchLike, idempotent = false): FetchLike {
  const base: FetchLike = fetchImpl ?? ((i, init) => globalThis.fetch(i, init))
  return async (input, init) => {
    let last: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const timeout = httpConfig.timeoutMs * (idempotent ? Math.min(attempt + 1, 3) : 1)
        if (idempotent && !init?.signal) return await hedgedFetch(base, input, init, timeout, httpConfig.hedgeMs)
        return await base(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeout) })
      } catch (e) {
        last = e
        const transient = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket|network/i.test(
          String((e as any)?.cause?.code ?? '') + String((e as Error)?.message ?? e),
        )
        const retryableTimeout = idempotent && !init?.signal && isTimeout(e) && attempt < 2
        if (!transient && !retryableTimeout) throw e
        await new Promise((r) => setTimeout(r, 300 * 2 ** attempt))
      }
    }
    throw last
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`)
  }
}

export async function getJson<T>(url: string, fetchImpl?: FetchLike): Promise<T> {
  const r = await f(fetchImpl, true)(url, { headers: { accept: 'application/json' } })
  const text = await r.text()
  if (!r.ok) throw new HttpError(r.status, text, url)
  return JSON.parse(text) as T
}

/** POST JSON. Pass idempotent=true only for requests that are safe to repeat (e.g. simulate). */
export async function postJson<T>(url: string, body: unknown, fetchImpl?: FetchLike, idempotent = false): Promise<T> {
  const r = await f(fetchImpl, idempotent)(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(r.status, text, url)
  }
  if (!r.ok && !parsed?.tx_response && !parsed?.gas_info) throw new HttpError(r.status, text, url)
  return parsed as T
}
