export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function f(fetchImpl?: FetchLike): FetchLike {
  return fetchImpl ?? ((i, init) => globalThis.fetch(i, init))
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
