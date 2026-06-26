FROM node:24-bookworm-slim AS build

WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY dashboard/package.json ./dashboard/

RUN npm ci --include=dev

RUN rm -rf server dashboard
COPY scripts ./scripts
COPY server ./server
COPY dashboard ./dashboard

RUN npm run build

FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY server/package.json ./server/

RUN npm ci --workspace=server --omit=dev 2>/dev/null || \
    npm install --workspace=server --omit=dev

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/dashboard/dist ./dashboard/dist

ENV NODE_ENV=production
# Storage is Postgres + pgvector — set DATABASE_URL at runtime (see docker-compose.yml).

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
