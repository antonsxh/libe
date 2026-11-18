# ---- build ----
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- runtime deps ----
FROM oven/bun:1.4 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# ---- runtime ----
FROM oven/bun:1.4-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
	CMD bun -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "bun run scripts/migrate.ts && exec bun build/index.js"]
