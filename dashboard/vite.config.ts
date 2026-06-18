import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DEV_UI_PORT = 5173;
const DEV_API_PORT = 3000;
const dashboardSrc = path.resolve(__dirname, "src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@llm-tg-bot/dashboard": dashboardSrc,
      "@llm-tg-bot/modules-memory-ui": path.resolve(
        __dirname,
        "../modules/memory/ui/src/index.tsx",
      ),
      "@llm-tg-bot/modules-mood-evaluation-ui": path.resolve(
        __dirname,
        "../modules/mood-evaluation/ui/src/index.tsx",
      ),
      "@llm-tg-bot/modules-sticker-selection-ui": path.resolve(
        __dirname,
        "../modules/sticker-selection/ui/src/index.tsx",
      ),
      "@llm-tg-bot/modules-vision-ui": path.resolve(
        __dirname,
        "../modules/vision/ui/src/index.tsx",
      ),
      "@llm-tg-bot/modules-history-ui": path.resolve(
        __dirname,
        "../modules/history/ui/src/index.tsx",
      ),
    },
  },
  server: {
    host: true,
    port: DEV_UI_PORT,
    proxy: {
      "/api": `http://127.0.0.1:${DEV_API_PORT}`,
      "/socket.io": {
        target: `http://127.0.0.1:${DEV_API_PORT}`,
        ws: true,
      },
    },
  },
});
