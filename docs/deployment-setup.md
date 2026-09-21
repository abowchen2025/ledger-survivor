# 部署環境設定清單（ABow 手動操作）

本清單列出 GitHub Pages 與 Railway 第一次部署前需要**手動**在網頁介面做的事，逐條打勾。Claude Code 不代勞這些步驟。做完後把結果（含失敗的完整錯誤）回報，再決定是否需要改 workflow。

目前狀態（2026-09-21，PR #2 合併後）：

- `Deploy frontend (GitHub Pages)` 首跑失敗於 `Configure Pages`：`Get Pages site failed. Please verify that the repository has Pages enabled and configured to build using GitHub Actions` → Pages 尚未啟用。
- `Deploy backend (Railway)` 首跑失敗於 `railway up`：`Invalid RAILWAY_TOKEN. Please check that it is valid and has access to the resource you're trying to use.` → Secret 尚未設定（log 顯示 `RAILWAY_TOKEN:` 為空）。

兩者都是環境未設定造成，不是 workflow 邏輯問題。設定完成後重跑 workflow 即可驗證。

---

## 0. 先確認的事

- [ ] **把 repo 改成 public**（2026-09-21 ABow 決定，不升級 GitHub Pro）。GitHub Free 方案的 private repo 不能用 GitHub Pages；架構描述 10.1 本來就把「開源 + 贊助連結」列為優先路線，只是提前。
  - 操作：https://github.com/abowchen2025/ledger-survivor/settings → 最下方「Danger Zone」→「Change repository visibility」→ Change to public → 依提示輸入 repo 名稱確認。
  - 改之前確認 repo 內沒有機密：`.env` 被 gitignore（只有 `.env.example`）、token 只在 GitHub Secrets、seed 是通用分類、沒有任何個人財務資料。`git log -p | grep -i` 找 `password`／`token`／`secret` 應只出現在文件與範例。
  - 驗證：`gh repo view --json isPrivate` 回 `false`；repo 首頁不再有「Private」標籤。
- [ ] 帳號能登入 https://railway.com （GitHub 帳號登入即可）。Railway 目前免費試用額度用完後需要 Hobby 方案（US$5/月起，含 US$5 用量）。

---

## A. GitHub Pages

### A1. 啟用 Pages 並選 GitHub Actions 為來源

- [ ] 開 https://github.com/abowchen2025/ledger-survivor/settings/pages
- [ ] 「Build and deployment」→「Source」下拉選 **GitHub Actions**（不是 Deploy from a branch）。選完不用再選分支或資料夾，頁面會出現「Use a suggested workflow」的卡片，**忽略它**，repo 已有 `deploy-frontend.yml`。
- [ ] 驗證：同一頁上方顯示「Your site is ready to be published at https://abowchen2025.github.io/ledger-survivor/」或類似字樣（第一次部署完成前可能還沒有網址，正常）。

### A2. 允許 `github-pages` 環境從 main 部署（通常已預設）

- [ ] 開 Settings → Environments → `github-pages`（啟用 Pages 後會自動建立）。
- [ ] 「Deployment branches and tags」若是「Selected branches」，確認 `main` 在清單內；若是「No restriction」則不用動。

### A3. 重跑前端部署

- [ ] 開 https://github.com/abowchen2025/ledger-survivor/actions/workflows/deploy-frontend.yml → 右側「Run workflow」→ Branch 選 `main` → Run workflow。
- [ ] 驗證 1：該次 run 兩個 job `build` 與 `deploy` 都綠，`deploy` job 摘要會顯示 page_url。
- [ ] 驗證 2：開 https://abowchen2025.github.io/ledger-survivor/ ，看到頁首「Ledger Survivor」、中間「本週」、下方六格導覽（本週／月曆／分期／月結／分析／設定）。點「月曆」網址變成 `/ledger-survivor/#/calendar`。
- [ ] 驗證 3：開 https://abowchen2025.github.io/ledger-survivor/manifest.webmanifest 看到 JSON，`start_url` 是 `/ledger-survivor/`。
- [ ] 驗證 4（手機）：用 Chrome（Android）或 Safari（iOS）開上面的網址，選單「加入主畫面」，圖示是深藍色方塊（純色佔位圖），開啟後沒有瀏覽器網址列。

---

## B. Railway

設計：Railway 上建一個 **Empty Service**（不連 GitHub repo），由 GitHub Actions 的 `deploy-backend.yml` 用 `railway up` 推送 `backend/` 目錄部署。**不要**在 Railway 端再連接 GitHub repo，否則每次 push main 會部署兩次（Railway 自動一次、Actions 一次）。

### B1. 建專案與 PostgreSQL

- [ ] https://railway.com/new → 「Empty Project」。建好後左上角把專案名稱改成 `ledger-survivor`（Project Settings → General）。
- [ ] 專案畫布上「+ Create」→「Database」→「Add PostgreSQL」。等它變成綠色（Deployed）。
- [ ] 驗證：點 Postgres 服務 → 「Variables」分頁看得到 `PGHOST`、`PGUSER`、`PGPASSWORD`、`PGDATABASE`、`DATABASE_URL`、`RAILWAY_PRIVATE_DOMAIN` 等變數。**不用**複製這些值，下一步用參照。

### B2. 建後端服務（Empty Service）

- [ ] 「+ Create」→「Empty Service」。點進去 → Settings → 「Service Name」改成 **`backend`**（要和 workflow 的 `--service "backend"` 一致；若取別的名字，B4 要另設 `RAILWAY_SERVICE` 變數）。
- [ ] 同一個 Settings 頁確認 **Source** 區塊是空的（沒有連 GitHub repo）。
- [ ] Settings → 「Networking」→「Public Networking」→ **Generate Domain**。會問 target port，填 **8080**（Railway 注入給容器的 `PORT` 環境變數是 8080，啟動指令 `uvicorn ... --port ${PORT:-8000}` 會聽 8080；Dockerfile 的 `EXPOSE 8000` 只是本機 docker run 的預設，與 Railway 無關）。**target port 必須等於 Deploy Logs 裡 `Uvicorn running on http://0.0.0.0:<埠>` 的埠號**，不一致會得到 502。2026-09-21 第一次填 8000 就是因此 502。記下網址，形如 `backend-production-xxxx.up.railway.app`。
- [ ] 驗證：Settings 頁顯示 domain；此時服務還沒有任何 deployment，正常。
- [ ] 記下服務 id：服務頁網址 `railway.com/project/<project id>/service/<service id>` 的最後一段。`backend/Dockerfile` 的 cache mount id 必須是 `s/<service id>-/root/.cache/uv`；目前寫的是 `374d7d08-9b81-47dd-9da9-23f4d73449ee`，若不一致要改 Dockerfile。

### B3. 設後端環境變數

- [ ] `backend` 服務 → 「Variables」分頁 → 「Raw Editor」，貼入（Railway 的 `${{Postgres.XXX}}` 是「參照變數」，會自動代入同專案 Postgres 服務的值；若你的 Postgres 服務名稱不是 `Postgres`，把大括號裡的名字改成實際名稱）：

  ```
  DATABASE_URL=postgresql+psycopg://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}
  TZ=Asia/Taipei
  DEBUG=false
  ```

  說明：
  - 前綴一定是 `postgresql+psycopg://`。Postgres 服務自己提供的 `DATABASE_URL` 是 `postgresql://`，SQLAlchemy 會去找 psycopg2，映像裡沒有，會啟動失敗。
  - 用 `RAILWAY_PRIVATE_DOMAIN`（內網），不走公網 `PGHOST`，免費且較快。
  - `PORT` 不用設，Railway 自動注入。
- [ ] 驗證：Variables 分頁看到三個變數，`DATABASE_URL` 的值顯示為已解析的連線字串（滑鼠移過去會展開）。

### B4. 取得 Project Token，加到 GitHub Secrets

- [ ] Railway 專案畫布右上「Settings」（專案層級，不是服務層級）→ 左側「Tokens」→ 「Create Token」：Name 填 `github-actions`，Environment 選 **production**。建立後**立刻複製**（只顯示一次）。
- [ ] 開 https://github.com/abowchen2025/ledger-survivor/settings/secrets/actions → 「New repository secret」→ Name **`RAILWAY_TOKEN`**，Secret 貼上 token → Add secret。
- [ ] （只有服務名稱不是 `backend` 時）同一頁切到「Variables」分頁 → New repository variable → Name `RAILWAY_SERVICE`，Value 填實際服務名稱。
- [ ] 驗證：Secrets 清單看到 `RAILWAY_TOKEN`（值看不到，正常）。

### B5. 觸發後端部署

- [ ] 開 https://github.com/abowchen2025/ledger-survivor/actions/workflows/deploy-backend.yml → Run workflow → Branch `main` → Run。
- [ ] 驗證 1：`test` job 綠（8 passed）、`deploy` job 綠，`railway up` 步驟 log 最後顯示 build 與 deploy 完成。
- [ ] 驗證 2：Railway `backend` 服務 → Deployments 分頁最新一筆狀態 **Active**；點進 Deploy Logs 找到：
  ```
  INFO  [alembic.runtime.migration] Running upgrade  -> 0001, initial schema
  INFO  [alembic.runtime.migration] Running upgrade 0001 -> 0002, seed builtin data
  INFO:     Uvicorn running on http://0.0.0.0:8000
  ```
  （migration 名稱以實際 log 為準；重點是看到 `-> 0001` 與 `0001 -> 0002` 兩行，且沒有 traceback。）
- [ ] 驗證 3：瀏覽器開 `https://<B2 的 domain>/api/v1/health`，看到 `{"status":"ok"}`。
- [ ] 驗證 4：Railway Postgres 服務 → 「Data」分頁 → 看到 13 張表（12 張業務表 + `alembic_version`）；打開 `category_groups` 有 7 列、`categories` 有 23 列、`users` 有 1 列。
- [ ] 驗證 5（時區）：Postgres Data 分頁的 Query 執行 `SHOW timezone;`，預期 `Asia/Taipei` 或 `UTC` 都可接受（應用層用 `DATE` 型別，不依賴 DB 時區；若是 `UTC` 記下來即可，不用改）。

### B6. 用量警示（REQ-NFR-006）

- [ ] Railway 右上頭像 → Account Settings → 「Usage」→「Usage Limits」：Hard limit 或 Alert 設 **US$10**（超過通知）。
- [ ] 驗證：Usage 頁顯示已設定的門檻。

### B7. 警告：部署環境只能放測試資料

> **在 REQ-AUTH-000（臨時 API 金鑰閘門，`docs/spec-gaps.md` 第 5 節）實作完成之前，Railway 上的後端是公開網址、沒有任何認證，任何人拿到網址就能讀寫。**
> 這段期間 Railway 環境只能用來驗證部署與 migration，**不要輸入任何真實花費資料**。Phase 1 開發期間用本機環境與假資料。
> REQ-AUTH-000 完成後這則警告會改成「設定 `API_KEY`／`VITE_API_KEY`」的步驟。

---

## C. 全部做完後回報

- [ ] `Deploy frontend` 與 `Deploy backend` 最新一次 run 的網址與狀態
- [ ] Pages 網址、Railway 後端 domain
- [ ] 任何失敗步驟的**完整** log（Actions 頁面該步驟展開後全選複製）

---

## D. 常見失敗與處理

| 現象 | 原因 | 處理 |
|---|---|---|
| `Configure Pages`：`Get Pages site failed ... Not Found` | Pages 未啟用，或 Source 不是 GitHub Actions | 做 A1 |
| `Configure Pages` 成功但 `deploy` job 報 `environment protection rules` | `github-pages` 環境限制了分支 | 做 A2 |
| Pages 網址 404 | private repo 在 Free 方案不支援 Pages；或第一次部署尚未完成（等 1～2 分鐘） | 做第 0 節；或等一下再重整 |
| Pages 網址顯示 README 內容而不是 App | Source 選成「Deploy from a branch」 | A1 改成 GitHub Actions，重跑 A3 |
| Pages 開得起來但點導覽沒反應／空白 | 瀏覽器快取到舊 service worker | 開發者工具 → Application → Service Workers → Unregister，重整；正式使用者不會遇到（`registerType: autoUpdate`） |
| `railway up`：`Invalid RAILWAY_TOKEN` | Secret 未設、貼錯、或建立的是 Account token 而非 Project token、或 token 綁的環境不是 production | 重做 B4，確認在「專案 Settings → Tokens」建立 |
| `railway up`：`Service not found` 或 `Multiple services found` | 服務名稱與 `backend` 不一致 | 改服務名稱為 `backend`，或設 GitHub Variable `RAILWAY_SERVICE` |
| Railway build：`dockerfile invalid: flag '--mount=type=cache,target=...' is missing an id argument` | Railway 的 builder 驗證 Dockerfile 時要求 cache mount 帶明確 `id`；本機 Docker BuildKit 會自動推導所以本機 build 過、雲端失敗（2026-09-21 實際發生） | `backend/Dockerfile` 兩個 `--mount=type=cache` 都已帶 Railway 規定格式的 `id=s/<service id>-/root/.cache/uv`（任意字串如 `uv-cache-deps` 也會被擋，2026-09-21 第二次失敗就是這樣）。**若在 Railway 重建 backend 服務，service id 會變，Dockerfile 要跟著改**。凡是本機驗證過的部署設定都不能當作雲端也會過 |
| Railway Deploy Logs：`ModuleNotFoundError: No module named 'psycopg2'` | `DATABASE_URL` 前綴是 `postgresql://` 而非 `postgresql+psycopg://` | 改 B3 的變數 |
| Deploy Logs：`could not translate host name "postgres.railway.internal"` 或 `Connection refused` | Postgres 服務未就緒、或參照變數的服務名稱打錯、或兩個服務不在同一專案／環境 | 確認 Postgres 是綠色；Variables 頁把 `DATABASE_URL` 展開看解析後的值 |
| Deploy Logs：`password authentication failed` | 參照到錯的變數（例如手抄了舊密碼） | B3 改用 `${{Postgres.PGPASSWORD}}` 參照，不要手抄 |
| 網域回 `502 {"message":"Application failed to respond"}`（header `x-railway-fallback: true`），但 Deployment 是 Active | 網域的 target port 與應用實際監聽的埠不一致：Railway 注入 `PORT=8080`，uvicorn 聽 8080，網域卻指到 8000 | 看 Deploy Logs 的 `Uvicorn running on http://0.0.0.0:<埠>`，到 Settings → Networking 把網域的 target port 改成同一個埠（B2 應填 8080）；不要在 Variables 手動設 `PORT` |
| Deployment 一直 `Deploying` 然後 `Failed`，log 有 `Healthcheck failed` | 服務沒在 Railway 給的 `PORT` 上監聽；或 migration 失敗導致 uvicorn 沒起來 | 看 Deploy Logs 上方 alembic 那幾行有沒有 traceback；不要在 Variables 手動設 `PORT` |
| `alembic upgrade head` 報 `UnicodeDecodeError` | 不會在 Linux 容器發生（那是 Windows cp950 問題）；若真的出現，把完整 log 貼回 | 回報 |
| 每次 push main 部署兩次 | Railway 服務連了 GitHub repo，又有 Actions 部署 | B2：服務 Settings → Source → Disconnect |
| `test` job 綠但 `deploy` job 被跳過 | `deploy` 需要 `test` 成功；或 workflow 是被 `paths` 過濾掉（只改了 docs） | 手動 Run workflow |
