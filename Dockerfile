# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/diary.sqlite
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server ./server
COPY --from=build /app/src/diaryModel.js ./src/diaryModel.js
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/scripts/backup-db.mjs ./scripts/backup-db.mjs
RUN mkdir -p /app/data/backups && chown -R node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=6s --start-period=10s --retries=3 \
  CMD node --input-type=module -e "const r = await fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health', { signal: AbortSignal.timeout(5000) }); process.exit(r.ok ? 0 : 1)"
CMD ["node", "server/index.mjs"]
