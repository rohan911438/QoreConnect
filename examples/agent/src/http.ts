/**
 * Browser access rules for the agent's local HTTP server.
 *
 * The dashboard that talks to the agent is either the hosted site (https://qoreconnect-web.vercel.app) or a local dev
 * server. Both must be allowed by CORS, and Chrome additionally asks a public site for permission before it may call a
 * server on the user's own machine (Private Network Access preflight), which needs
 * `Access-Control-Allow-Private-Network: true` in the answer.
 */

export const PUBLIC_DASHBOARD = 'https://qoreconnect-web.vercel.app'
export const PUBLIC_RELAYER = 'https://qoreconnect-relayer.onrender.com'
export const DEFAULT_ORIGINS = [PUBLIC_DASHBOARD, 'http://localhost:3000', 'http://127.0.0.1:3000']

/** AGENT_CORS_ORIGIN: comma-separated origins, or unset for the defaults. Trailing slashes are ignored. */
export function allowedOrigins(env: string | undefined): string[] {
  const list = (env ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return list.length ? list : DEFAULT_ORIGINS
}

/**
 * CORS headers for one request: the request's own Origin is echoed back only if it is allowed (a browser accepts a
 * single origin per response), so a page on any other site cannot use the agent.
 */
export function corsHeaders(
  origin: string | undefined,
  allowed: string[],
  requestHeaders: Record<string, string | string[] | undefined> = {},
): Record<string, string> {
  const h: Record<string, string> = { vary: 'Origin' }
  if (!origin || !allowed.includes(origin)) return h
  h['access-control-allow-origin'] = origin
  h['access-control-allow-headers'] = 'content-type'
  h['access-control-allow-methods'] = 'GET, POST, OPTIONS'
  h['access-control-max-age'] = '600'
  if (String(requestHeaders['access-control-request-private-network'] ?? '').toLowerCase() === 'true') {
    h['access-control-allow-private-network'] = 'true'
  }
  return h
}
