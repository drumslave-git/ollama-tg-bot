import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const DEV_UI_PORT = 5173;
const DEV_API_PORT = 3000;
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
