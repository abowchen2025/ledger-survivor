# Ledger Survivor（記帳生存遊戲）

個人記帳網頁：以週為關卡、以月為賽季，每週在花費上限內存活就得分，月底依等級換取獎勵。單人使用，手機優先 PWA。

- 前端：React 18 + TypeScript + Vite + Zustand + Tailwind CSS + shadcn/ui + vite-plugin-pwa → GitHub Pages
- 後端：Python 3.12 + FastAPI + SQLAlchemy 2.x + Alembic → Railway
- 資料庫：PostgreSQL 16（本機用 Docker Compose，不用 SQLite）
- 時區固定 `Asia/Taipei`，日期欄位用 `DATE`

規格與決策文件在 `docs/`（`srs_fs_v1_6_1.md`、`test_conditions_v1_2.yaml`、`adr/`、`architecture_v2_2.md`；規格缺口記在 `spec-gaps.md`），開發規範在 `CLAUDE.md`。

## 目錄

```
backend/     FastAPI、SQLAlchemy models、Alembic migrations、pytest、Dockerfile
frontend/    Vite + React PWA、vitest
docs/        SRS+FS、測試條件、架構描述、ADR、spec-gaps
.github/     CI 與部署 workflow
```

## 本機啟動（PowerShell）

前置：Docker Desktop、[uv](https://docs.astral.sh/uv/)、Node.js 22（含 npm）。

> **npm 版本注意**：`frontend/package-lock.json` 由 `npm@latest`（12.x）產生，本機 npm 10.9.0 用 `npm ci` 安裝正常。若 `npm install` 失敗並出現 `Cannot read properties of null (reading 'edgesOut')`（npm 10.9.0 的 arborist 在解析 vitest 的 peer 相依時的已知 bug，堆疊在 `build-ideal-tree.js #loadPeerSet`），改用 `npx -y npm@latest install`，不必全域升級 npm。

```powershell
# 0. 環境變數（.env 不進版控；兩份都要）
Copy-Item .env.example .env                      # 後端：DATABASE_URL、API_KEY、CORS_ALLOWED_ORIGINS
Copy-Item frontend\.env.example frontend\.env    # 前端：VITE_API_BASE_URL、VITE_DEV_API_KEY（本機 dev 預設金鑰，與後端 API_KEY 相同）

# 1. 資料庫（對外埠 55432）
docker compose up -d db

# 2. 後端（uvicorn 埠 8765）
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8765
# 另開一個終端機驗證：Invoke-RestMethod http://localhost:8765/api/v1/health/ready   # DB 可連且 migration 到 head 才 200（不需金鑰）
# 受保護端點要帶金鑰（REQ-AUTH-000）：
#   Invoke-RestMethod http://localhost:8765/api/v1/auth/me -Headers @{ "X-API-Key" = "dev-local-only-not-a-secret" }   # {"user_id":1}
#   不帶或帶錯 → 401 {"detail":"unauthorized"}；API_KEY 未設定 → uvicorn 啟動失敗（fail closed，沒有旁路旗標）

# 3. 前端（開發網址 http://localhost:5173/ledger-survivor/）
cd ..\frontend
npm ci
npm run dev
# 「設定」頁的「後端連線」區塊會打 GET /api/v1/auth/me：顯示「正常（user_id=1）」代表 base URL、X-API-Key、CORS 預檢三件事都通。
# 本機 dev 用 frontend/.env 的 VITE_DEV_API_KEY，不用手動輸入；在設定頁輸入的金鑰（localStorage）會優先。
```

## 認證與跨來源（Phase 1～2 臨時方案）

- **API 金鑰閘門（REQ-AUTH-000）**：`/api/v1` 下除三個 health 端點外，所有請求都要帶 `X-API-Key`，值等於後端環境變數 `API_KEY`。缺少或不符一律 `401 {"detail":"unauthorized"}`。`API_KEY` 未設定時後端（含 `alembic upgrade head`）啟動即失敗。dependency 掛在 `backend/app/routers/protected.py` 的 router 層級：**新增業務 router 一律 include 進 `protected.router`**，不要在 `main.py` 直接 include。
- **金鑰不進版控、不進前端產物**：只存在 Railway Variables 與使用者瀏覽器的 localStorage。第一次開 Pages 到「設定」頁貼上 Railway 的 `API_KEY`，每個裝置輸入一次即可；其他頁面遇到金鑰缺少或 401 會導回設定頁。取捨見 `docs/adr/0007`。它擋隨機掃描與讀 bundle 的人，不擋針對性攻擊。Phase 3 導入 JWT 後整組移除（規格與缺口見 `docs/spec-gaps.md` 第 5 節）。
- **CORS（REQ-NFR-009）**：後端環境變數 `CORS_ALLOWED_ORIGINS` 逗號分隔的明確來源清單（只到 `scheme://host[:port]`，不可 `*`，不可帶路徑，違反者啟動時報錯）；`allow_headers` 含 `X-API-Key`、`allow_credentials=False`。Railway 上填 `https://abowchen2025.github.io`。
- **前端**：所有後端呼叫經 `frontend/src/api/client.ts`，base URL 來自建置期變數 `VITE_API_BASE_URL`（只到 host，不含 `/api/v1`），金鑰來自 `src/api/api-key.ts`（localStorage → dev 預設值 `VITE_DEV_API_KEY`，後者只在 `npm run dev` 生效）。缺 base URL 丟錯；缺金鑰丟 `ApiKeyMissingError` 且不送請求。
- `/openapi.json`、`/docs`、`/redoc` 依 `DEBUG` 開關：本機 `DEBUG=true` 全開（`npm run gen:api` 讀得到），Railway `DEBUG=false` 三個端點都是 404（見 `docs/spec-gaps.md` 第 5 節）。

## 埠號說明

| 服務 | 本機埠 | 說明 |
|---|---|---|
| PostgreSQL | **55432** | 這台機器的 5432 已被另一專案佔用，`docker-compose.yml` 以 `DB_PORT` 映射到 55432；容器內仍是 5432 |
| FastAPI（uvicorn） | **8765** | 8000 同樣被佔用；`npm run gen:api` 讀 `http://127.0.0.1:8765/openapi.json`（寫 127.0.0.1 不寫 localhost：Node 會把 localhost 解析成 IPv6 `::1`，uvicorn 預設只綁 IPv4） |
| Vite dev server | 5173 | base 是 `/ledger-survivor/`，與 GitHub Pages 一致 |

CI 的 PostgreSQL service container 直接用 5432，`DATABASE_URL` 由 workflow 設定，與本機互不影響。

## 測試

```powershell
# 後端（unit + api + integration；integration 需要 Node 22 與 frontend/node_modules）
cd backend
uv run pytest -q
uv run pytest -q -m p0                  # 只跑 P0
uv run pytest -q -m "not integration"   # 不需要 Node 的部分
uv run alembic check                    # models 與 migrations 一致

# 前端
cd frontend
npm run typecheck
npm run test          # vitest，讀 ../backend/tests/fixtures/week_cases.json
npm run build         # 產出 dist/（含 manifest.webmanifest 與 sw.js）
```

### 前後端 week_rule 一致性（TC-SEC-WEEK-004）

`backend/tests/integration/test_week_rule_consistency.py` 會執行 `npm run week:dump`（前端以 TypeScript 對 fixture 全部案例計算並輸出 JSON），再與 Python `week_rule` 的輸出逐筆比對；同時確認前端讀的是 `backend/tests/fixtures/week_cases.json` 這一份檔案（路徑與 sha256 相同）。做法見 `docs/adr/0005`。

### 產生前端 API 型別

```powershell
# 後端在 8765 跑著的時候
cd frontend
npm run gen:api       # → src/api/schema.d.ts，不要手改
```

## CI／CD（GitHub Actions）

| Workflow | 觸發 | 內容 |
|---|---|---|
| `ci.yml` | PR、push main | `backend`：PostgreSQL 16 service container + alembic upgrade/check + pytest；`frontend`：typecheck + vitest + build；`consistency`：Node + uv，跑 `tests/integration` |
| `deploy-frontend.yml` | push main（frontend/** 或 fixture 變動） | 檢查 `VITE_API_BASE_URL` Secret 已設定（缺了 build 失敗）→ build → 確認 `dist/` 不含金鑰 → `actions/deploy-pages` 部署到 GitHub Pages |
| `deploy-backend.yml` | push main（backend/** 變動） | 完整 pytest（含一致性）通過後 `railway up` 部署 `backend/`；migration 由 Railway pre-deploy step 執行 |

分支保護建議把 `ci.yml` 的三個 job 設為 required check（P0 測試失敗擋合併）。

### 需要的 GitHub 設定

| 類型 | 名稱 | 用途 | 從哪裡取得 |
|---|---|---|---|
| Secret | `RAILWAY_TOKEN` | `deploy-backend.yml` 用 Railway CLI 部署 | Railway → 專案 → Settings → Tokens，建立綁定 production 環境的 **project token** |
| Secret | `VITE_API_BASE_URL` | `deploy-frontend.yml` 建置時注入前端要打的後端網址 | Railway backend 服務的 public domain，只到 host：`https://backend-production-10c5.up.railway.app`（不含 `/api/v1`、不含結尾 `/`） |
| Variable（選填） | `RAILWAY_SERVICE` | Railway 服務名稱；未設定時用 `backend` | Railway 專案內的服務名稱 |
| Repo 設定 | Pages → Source = **GitHub Actions** | `deploy-frontend.yml` 需要 | Settings → Pages |

值一律不寫進 repo。GitHub Pages 的部署動作本身用 OIDC `id-token`，不需要 Secret；`VITE_API_BASE_URL` 是給 **build** 用的。API 金鑰**沒有** GitHub Secret：由使用者在設定頁輸入（`docs/adr/0007`）。

### Railway 服務需要的環境變數

| 名稱 | 說明 |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://...`，指向 Railway 的 PostgreSQL；注意 driver 前綴是 `postgresql+psycopg` |
| `TZ` | `Asia/Taipei` |
| `DEBUG` | `false`（關閉 traceback 與 `/openapi.json`、`/docs`、`/redoc`；本機 `.env.example` 是 `true`） |
| `API_KEY` | REQ-AUTH-000 臨時 API 金鑰，隨機值（例如 `openssl rand -hex 32`）；使用者在前端設定頁輸入同一把。缺少時 pre-deploy migration 與服務啟動都會失敗（fail closed） |
| `CORS_ALLOWED_ORIGINS` | `https://abowchen2025.github.io`（只有 scheme + host；若日後有自訂網域，逗號分隔加上） |
| `PORT` | Railway 自動注入，不用手設 |

啟動指令是 Dockerfile 的 `CMD`（只起 uvicorn）。Migration 由 Railway UI 的 **pre-deploy step** `alembic upgrade head` 在切流量前跑一次；Healthcheck Path 設 `/api/v1/health/ready`（DB 可連且 migration 已到 head 才回 200）。這兩項只能在 Railway UI 設定，`railway.json` 對本服務無效（config-as-code 已於 2026-08-28 對新服務關閉），細節與還原清單見 `docs/deployment-setup.md`、`docs/adr/0006`。

## 本機用 Docker 跑後端映像（選用）

```powershell
cd backend
docker build -t ledger-survivor-backend .
docker run --rm -p 18765:8000 -e PORT=8000 `
  -e DATABASE_URL=postgresql+psycopg://ledger:ledger@host.docker.internal:55432/ledger_survivor `
  ledger-survivor-backend sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"
Invoke-RestMethod http://localhost:18765/api/v1/health
```
