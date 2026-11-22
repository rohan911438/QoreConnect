import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * P09 E2E: real Diana testnet, a real relayer process (fresh database per run) and the production web build.
 * Needs SPONSOR_MNEMONIC / RELAYER_MNEMONIC / ADMIN_TOKEN in the repo-root .env (the relayer loads it).
 */
const RELAYER_PORT = 8788
const WEB_PORT = 3100
/** E2E_BASE_URL=https://… runs the same specs against a deployment (its own relayer); no local servers are started. */
const BASE_URL = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 600_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // channel 'chromium' = full Chromium in new headless mode; PW_CHANNEL=msedge uses the installed Edge instead.
  use: { baseURL: BASE_URL ?? `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL ?? 'chromium' },
  webServer: BASE_URL ? [] : [
    {
      command: 'pnpm --filter @qoreconnect/relayer-app start',
      cwd: '../..',
      url: `http://localhost:${RELAYER_PORT}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        RELAYER_PORT: String(RELAYER_PORT),
        RELAYER_DB: join(tmpdir(), `qoreconnect-e2e-${Date.now()}.db`),
        SPONSOR_PER_IP_PER_DAY: '50',
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      // NEXT_PUBLIC_* is inlined at build time, so build against the E2E relayer.
      // Set E2E_PREBUILT=1 to reuse an existing build made with the same NEXT_PUBLIC_RELAYER_URL.
      command: process.env.E2E_PREBUILT ? `pnpm exec next start -p ${WEB_PORT}` : `pnpm exec next build && pnpm exec next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}`,
      timeout: 900_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_RELAYER_URL: `http://localhost:${RELAYER_PORT}` },
    },
  ],
})
