import type { NextConfig } from 'next'
import { BASE_CSP, SECURITY_HEADERS } from './lib/csp'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@qoreconnect/core', '@qoreconnect/react'],
  async headers() {
    // Every page: base CSP and hardening headers. Vault pages additionally get a nonce CSP from proxy.ts;
    // browsers enforce both policies, so the stricter one wins there.
    return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: BASE_CSP }, ...SECURITY_HEADERS] }]
  },
}
export default config
