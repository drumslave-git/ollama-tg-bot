import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const DEV_UI_PORT = 5173;
// Read PORT from the repo-root .env (where the server also reads it) so the
// dashboard proxy always targets the API's real port — including when the box's
// default 3000 is unusable and PORT has been moved.
const rootEnv = loadEnv("development", path.resolve(__dirname, ".."), "");
const DEV_API_PORT = Number(rootEnv.PORT ?? 3000);
const dashboardSrc = path.resolve(__dirname, "src");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@llm-tg-bot/dashboard": dashboardSrc,
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
