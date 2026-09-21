# ADR-0004：前端路由用 HashRouter，base 固定 `/ledger-survivor/`

- 狀態：提議（Phase 0b 先以此實作，待 ABow 決定是否改 BrowserRouter）
- 日期：2026-09-21
- 來源：架構描述 v2.2 第 2.1 節（前端部署 GitHub Pages）；SRS+FS v1.2 REQ-NFR-001（PWA）

## 背景

前端部署在 GitHub Pages 的「專案站台」，網址是 `https://<owner>.github.io/ledger-survivor/`。Pages 是純靜態主機，沒有 SPA fallback：直接開啟或重新整理 `/ledger-survivor/calendar` 這種深層路徑，Pages 會回自己的 404 頁，React 根本沒機會啟動。

兩個可行做法：

| | HashRouter | BrowserRouter + 404.html 轉址 |
|---|---|---|
| 網址 | `/ledger-survivor/#/calendar` | `/ledger-survivor/calendar` |
| 伺服器設定 | 不需要 | 建置時複製 `index.html` 為 `404.html`，或在 `404.html` 用 script 把路徑塞進 query 再導回 `index.html` |
| 深層連結／重新整理 | 正常 | 靠 404.html 變通；Pages 仍回 HTTP 404 狀態碼 |
| PWA 加入主畫面 | `start_url`＝`/ledger-survivor/`，正常 | 同左 |
| 缺點 | 網址帶 `#`，日後若要分享特定頁的連結較不好看 | 多一層變通機制；404 狀態碼對 SEO 與部分爬蟲不友善（本專案單人使用，影響小） |

## 決策（提議）

- `vite.config.ts` 的 `base` 固定 `/ledger-survivor/`，本機開發與 Pages 用同一個 base，避免「本機能開、上線 404」。
- 路由用 `createHashRouter`。單人、手機優先、從主畫面圖示開啟為主要情境，深層連結需求低；HashRouter 零變通、零風險，最符合 Phase 0「骨架先上線」的目標。
- 若日後要改 BrowserRouter：`frontend/src/router.tsx` 把 `createHashRouter` 換成 `createBrowserRouter` 並加 `{ basename: import.meta.env.BASE_URL }`，再於 `deploy-frontend.yml` 建置後複製 `dist/index.html` 為 `dist/404.html`。改動範圍就這兩處。

## 影響

- 所有站內連結用 react-router 的 `<Link>`／`<NavLink>`，不要手寫 `href="/calendar"`。
- E2E 測試（Playwright）的網址要帶 `#/`。
- manifest 的 `start_url` 與 `scope` 都是 `/ledger-survivor/`，與 base 一致。
