import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))
export default defineConfig({
  resolve: { alias: { '@qoreconnect/core': src('../../packages/core/src/index.ts'), '@qoreconnect/wagmi': src('../../packages/wagmi/src/index.ts'), '@qoreconnect/relayer': src('../../packages/relayer/src/index.ts') } },
  test: { environment: 'happy-dom', include: ['test/**/*.test.tsx'], testTimeout: 500_000, hookTimeout: 60_000 },
})
