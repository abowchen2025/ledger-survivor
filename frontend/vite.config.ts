/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// base 固定為 /ledger-survivor/：
// - GitHub Pages 以「專案站台」形式部署，網址是 https://<owner>.github.io/ledger-survivor/，
//   所有靜態資源、manifest 的 start_url／scope、service worker 的路徑都必須帶這個前綴。
// - 本機 npm run dev 也用同一個 base，開發網址是 http://localhost:5173/ledger-survivor/，
//   目的是讓開發環境與 Pages 的路徑行為一致，避免「本機能開、上線 404」。
// - 若日後改用自訂網域（根路徑部署），只需把 base 改成 "/"，並同步改 manifest 的 start_url／scope。
const BASE = "/ledger-survivor/";

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Ledger Survivor 記帳生存遊戲",
        short_name: "Ledger",
        description: "以週為關卡、以月為賽季的個人記帳生存遊戲",
        lang: "zh-Hant",
        start_url: BASE,
        scope: BASE,
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // REQ-NFR-001：只預先快取靜態資源；API 回應的離線快取與離線寫入不在 Phase 0 範圍。
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // 目前只有純函式測試（week.ts），不需要 DOM 環境；之後有元件測試再加 jsdom。
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
