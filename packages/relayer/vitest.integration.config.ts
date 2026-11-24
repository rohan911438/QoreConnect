import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
const alias = { '@rohankumar4179/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) }
export default defineConfig({ resolve: { alias }, test: { include: ['test/integration/**/*.test.ts'], testTimeout: 400_000, hookTimeout: 60_000 } })
