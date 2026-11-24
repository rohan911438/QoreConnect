import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))
export default defineConfig({
  resolve: { alias: { '@rohankumar4179/core': src('../../packages/core/src/index.ts'), '@rohankumar4179/wagmi': src('../../packages/wagmi/src/index.ts'), '@rohankumar4179/relayer': src('../../packages/relayer/src/index.ts'), '@rohankumar4179/react': src('../../packages/react/src/index.ts') } },
  test: { environment: 'happy-dom', include: ['test/**/*.test.tsx'], testTimeout: 300_000, hookTimeout: 60_000 },
})
