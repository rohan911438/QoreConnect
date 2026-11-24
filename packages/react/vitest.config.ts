import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
export default defineConfig({
  resolve: { alias: { '@rohankumar4179/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) } },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], exclude: ['test/integration/**'] },
})
