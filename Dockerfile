FROM node:24-bookworm-slim AS build

WORKDIR /app

# devDependencies (typescript, vite) required for npm run build
ENV NODE_ENV=development

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY dashboard/package.json ./dashboard/
COPY server/src/modules/utils/package.json ./server/src/modules/utils/
COPY server/src/modules/addressing-detection/package.json ./server/src/modules/addressing-detection/
COPY server/src/modules/search-decision/package.json ./server/src/modules/search-decision/
COPY server/src/modules/web-search/package.json ./server/src/modules/web-search/
COPY server/src/modules/memory/package.json ./server/src/modules/memory/
COPY server/src/modules/link-fetch/package.json ./server/src/modules/link-fetch/

RUN npm ci --include=dev

RUN rm -rf server dashboard
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
COPY server/src/modules/utils/package.json ./server/src/modules/utils/
COPY server/src/modules/addressing-detection/package.json ./server/src/modules/addressing-detection/
COPY server/src/modules/search-decision/package.json ./server/src/modules/search-decision/
COPY server/src/modules/web-search/package.json ./server/src/modules/web-search/
COPY server/src/modules/memory/package.json ./server/src/modules/memory/
COPY server/src/modules/link-fetch/package.json ./server/src/modules/link-fetch/

RUN npm ci --workspace=server --omit=dev 2>/dev/null || \
    npm install --workspace=server --omit=dev

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/src/modules/utils/dist ./server/src/modules/utils/dist
COPY --from=build /app/server/src/modules/addressing-detection/dist ./server/src/modules/addressing-detection/dist
COPY --from=build /app/server/src/modules/search-decision/dist ./server/src/modules/search-decision/dist
COPY --from=build /app/server/src/modules/web-search/dist ./server/src/modules/web-search/dist
COPY --from=build /app/server/src/modules/memory/dist ./server/src/modules/memory/dist
COPY --from=build /app/server/src/modules/link-fetch/dist ./server/src/modules/link-fetch/dist
COPY --from=build /app/dashboard/dist ./dashboard/dist

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/bot.db

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
