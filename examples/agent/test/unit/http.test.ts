import { describe, expect, it } from 'vitest'
import { DEFAULT_ORIGINS, PUBLIC_DASHBOARD, allowedOrigins, corsHeaders } from '../../src/http'

describe('agent server browser access', () => {
  it('allows the hosted dashboard and local dev by default', () => {
    expect(allowedOrigins(undefined)).toEqual(DEFAULT_ORIGINS)
    expect(allowedOrigins('')).toEqual(DEFAULT_ORIGINS)
    expect(DEFAULT_ORIGINS).toContain(PUBLIC_DASHBOARD)
    expect(DEFAULT_ORIGINS).toContain('http://localhost:3000')
  })

  it('AGENT_CORS_ORIGIN replaces the defaults (comma-separated, trailing slashes ignored)', () => {
    expect(allowedOrigins('https://a.example/, http://localhost:4000')).toEqual(['https://a.example', 'http://localhost:4000'])
  })

  it('echoes an allowed origin, so the hosted site can call the agent', () => {
    const h = corsHeaders(PUBLIC_DASHBOARD, DEFAULT_ORIGINS)
    expect(h['access-control-allow-origin']).toBe(PUBLIC_DASHBOARD)
    expect(h['access-control-allow-methods']).toContain('POST')
    expect(h['access-control-allow-headers']).toBe('content-type')
  })

  it('gives no access to any other site', () => {
    const h = corsHeaders('https://evil.example', DEFAULT_ORIGINS, { 'access-control-request-private-network': 'true' })
    expect(h['access-control-allow-origin']).toBeUndefined()
    expect(h['access-control-allow-private-network']).toBeUndefined()
    expect(corsHeaders(undefined, DEFAULT_ORIGINS)['access-control-allow-origin']).toBeUndefined()
  })

  it('answers Chrome’s private-network preflight for an allowed site', () => {
    const h = corsHeaders(PUBLIC_DASHBOARD, DEFAULT_ORIGINS, { 'access-control-request-private-network': 'true' })
    expect(h['access-control-allow-private-network']).toBe('true')
    expect(corsHeaders(PUBLIC_DASHBOARD, DEFAULT_ORIGINS)['access-control-allow-private-network']).toBeUndefined()
  })
})
