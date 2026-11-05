# --- build stage: toolchain for better-sqlite3 (node-gyp), full install,
# compile server (tsc) + client (vite), then prune to prod deps ---
FROM node:22-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json vite.config.ts postcss.config.js tailwind.config.js drizzle.config.ts ./
COPY src ./src
COPY client ./client
COPY static ./static
COPY drizzle ./drizzle
RUN npm run build && npm prune --omit=dev

# --- runtime stage: same base (native module compatible), prod modules only ---
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY static ./static

# SQLite lives on a volume (compose mounts /data); boot applies migrations
# + seeds settings, validates env, then serves API + SPA on $PORT.
VOLUME /data
EXPOSE 8097

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8097)+'/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
