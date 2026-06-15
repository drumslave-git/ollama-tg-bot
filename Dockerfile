FROM node:24-bookworm-slim AS build

WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY dashboard/package.json ./dashboard/
COPY modules/registry/package.json ./modules/registry/
COPY modules/utils/server/package.json ./modules/utils/server/
COPY modules/addressing-detection/server/package.json ./modules/addressing-detection/server/
COPY modules/search-decision/server/package.json ./modules/search-decision/server/
COPY modules/web-search/server/package.json ./modules/web-search/server/
COPY modules/memory/server/package.json ./modules/memory/server/
COPY modules/memory/db/package.json ./modules/memory/db/
COPY modules/link-fetch/server/package.json ./modules/link-fetch/server/
COPY modules/sticker-selection/server/package.json ./modules/sticker-selection/server/
COPY modules/mood-evaluation/server/package.json ./modules/mood-evaluation/server/
COPY modules/mood-evaluation/db/package.json ./modules/mood-evaluation/db/
COPY modules/history/server/package.json ./modules/history/server/
COPY modules/history/db/package.json ./modules/history/db/

RUN npm ci --include=dev

RUN rm -rf server dashboard modules
COPY server ./server
COPY dashboard ./dashboard
COPY modules ./modules

RUN npm run build

FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY server/package.json ./server/
COPY modules/registry/package.json ./modules/registry/
COPY modules/utils/server/package.json ./modules/utils/server/
COPY modules/addressing-detection/server/package.json ./modules/addressing-detection/server/
COPY modules/search-decision/server/package.json ./modules/search-decision/server/
COPY modules/web-search/server/package.json ./modules/web-search/server/
COPY modules/memory/server/package.json ./modules/memory/server/
COPY modules/memory/db/package.json ./modules/memory/db/
COPY modules/link-fetch/server/package.json ./modules/link-fetch/server/
COPY modules/sticker-selection/server/package.json ./modules/sticker-selection/server/
COPY modules/mood-evaluation/server/package.json ./modules/mood-evaluation/server/
COPY modules/mood-evaluation/db/package.json ./modules/mood-evaluation/db/
COPY modules/history/server/package.json ./modules/history/server/
COPY modules/history/db/package.json ./modules/history/db/

RUN npm ci --workspace=server --omit=dev 2>/dev/null || \
    npm install --workspace=server --omit=dev

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/modules/registry/dist ./modules/registry/dist
COPY --from=build /app/modules/utils/server/dist ./modules/utils/server/dist
COPY --from=build /app/modules/addressing-detection/server/dist ./modules/addressing-detection/server/dist
COPY --from=build /app/modules/search-decision/server/dist ./modules/search-decision/server/dist
COPY --from=build /app/modules/web-search/server/dist ./modules/web-search/server/dist
COPY --from=build /app/modules/memory/server/dist ./modules/memory/server/dist
COPY --from=build /app/modules/memory/db/dist ./modules/memory/db/dist
COPY --from=build /app/modules/link-fetch/server/dist ./modules/link-fetch/server/dist
COPY --from=build /app/modules/sticker-selection/server/dist ./modules/sticker-selection/server/dist
COPY --from=build /app/modules/mood-evaluation/server/dist ./modules/mood-evaluation/server/dist
COPY --from=build /app/modules/mood-evaluation/db/dist ./modules/mood-evaluation/db/dist
COPY --from=build /app/modules/history/server/dist ./modules/history/server/dist
COPY --from=build /app/modules/history/db/dist ./modules/history/db/dist
COPY --from=build /app/modules ./modules
COPY --from=build /app/dashboard/dist ./dashboard/dist

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/bot.db

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
