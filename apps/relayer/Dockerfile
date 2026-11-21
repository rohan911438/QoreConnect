# Build from the repository root:  docker build -f apps/relayer/Dockerfile -t qoreconnect-relayer .
# Run: docker run -p 8787:8787 -e SPONSOR_MNEMONIC=… -e RELAYER_MNEMONIC=… -e RELAYER_INDEX=1 -e ADMIN_TOKEN=… -v relayer-data:/data qoreconnect-relayer
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/relayer/package.json packages/relayer/
COPY apps/relayer/package.json apps/relayer/
RUN pnpm install --frozen-lockfile --filter "@qoreconnect/relayer-app..."
COPY packages/core packages/core
COPY packages/relayer packages/relayer
COPY apps/relayer apps/relayer
RUN pnpm --filter @qoreconnect/core --filter @qoreconnect/relayer run build \
 && pnpm --filter @qoreconnect/relayer-app deploy --prod --legacy /out

FROM node:24-slim
RUN useradd --create-home --uid 10001 relayer && mkdir /data && chown relayer /data
WORKDIR /app
COPY --from=build --chown=relayer /out /app
USER relayer
ENV NODE_ENV=production RELAYER_PORT=8787 RELAYER_DB=/data/relayer.db
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "src/server.ts"]
