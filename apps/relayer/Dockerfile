# Build from the repository root: docker build -f apps/relayer/Dockerfile .
FROM node:24-slim
RUN corepack enable && useradd -m relayer
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @qoreconnect/relayer-app... && pnpm --filter @qoreconnect/core --filter @qoreconnect/relayer run build
USER relayer
ENV NODE_ENV=production RELAYER_PORT=8787 RELAYER_DB=/data/relayer.db
EXPOSE 8787
CMD ["pnpm", "--filter", "@qoreconnect/relayer-app", "start"]
