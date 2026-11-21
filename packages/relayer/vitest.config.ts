import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
const alias = { '@qoreconnect/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) }
export default defineConfig({ resolve: { alias }, test: { include: ['test/**/*.test.ts'], exclude: ['test/integration/**'] } })
