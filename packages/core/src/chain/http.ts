export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Per-request timeout for chain REST calls, so a hung upstream cannot hang a caller (P13). */
export const HTTP_TIMEOUT_MS = 15_000
/** Mutable so operators (and tests) can tune it. */
export const httpConfig = { timeoutMs: HTTP_TIMEOUT_MS }

/** fetch with up to 3 retries on transient network errors (not on HTTP errors, not on timeouts). */
function f(fetchImpl?: FetchLike): FetchLike {
  const base: FetchLike = fetchImpl ?? ((i, init) => globalThis.fetch(i, init))
  return async (input, init) => {
    let last: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await base(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(httpConfig.timeoutMs) })
      } catch (e) {
        last = e
        if (!/fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|UND_ERR|socket|network/i.test(String((e as any)?.cause?.code ?? '') + String((e as Error)?.message ?? e))) throw e
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
  const r = await f(fetchImpl)(url, { headers: { accept: 'application/json' } })
  const text = await r.text()
  if (!r.ok) throw new HttpError(r.status, text, url)
  return JSON.parse(text) as T
}

export async function postJson<T>(url: string, body: unknown, fetchImpl?: FetchLike): Promise<T> {
  const r = await f(fetchImpl)(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) })
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
