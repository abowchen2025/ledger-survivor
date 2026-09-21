# Ledger Survivor（記帳生存遊戲）

個人記帳網頁：以週為關卡、以月為賽季，每週在花費上限內存活就得分，月底依等級換取獎勵。單人使用，手機優先 PWA。

- 前端：React 18 + TypeScript + Vite + Zustand + Tailwind CSS + shadcn/ui + vite-plugin-pwa → GitHub Pages
- 後端：Python 3.12 + FastAPI + SQLAlchemy 2.x + Alembic → Railway
- 資料庫：PostgreSQL 16（本機用 Docker Compose，不用 SQLite）
- 時區固定 `Asia/Taipei`，日期欄位用 `DATE`

規格與決策文件在 `docs/`（`srs_fs_v1_2.md`、`test_conditions_v1_0.yaml`、`architecture_v2_2.md`、`adr/`），開發規範在 `CLAUDE.md`。

## 目錄

```
backend/     FastAPI、SQLAlchemy models、Alembic migrations、pytest、Dockerfile、railway.json
frontend/    Vite + React PWA、vitest
docs/        SRS+FS、測試條件、架構描述、ADR、spec-gaps
.github/     CI 與部署 workflow
```

## 本機啟動（PowerShell）

前置：Docker Desktop、[uv](https://docs.astral.sh/uv/)、Node.js 22（含 npm）。

```powershell
# 0. 環境變數（.env 不進版控）
Copy-Item .env.example .env

# 1. 資料庫（對外埠 55432）
docker compose up -d db

# 2. 後端（uvicorn 埠 8765）
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8765
# 另開一個終端機驗證：Invoke-RestMethod http://localhost:8765/api/v1/health

# 3. 前端（開發網址 http://localhost:5173/ledger-survivor/）
cd ..\frontend
npm ci
npm run dev
```

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
| `deploy-frontend.yml` | push main（frontend/** 或 fixture 變動） | build 後以 `actions/deploy-pages` 部署到 GitHub Pages |
| `deploy-backend.yml` | push main（backend/** 變動） | 完整 pytest（含一致性）通過後 `railway up` 部署 `backend/` |

分支保護建議把 `ci.yml` 的三個 job 設為 required check（P0 測試失敗擋合併）。

### 需要的 GitHub 設定

| 類型 | 名稱 | 用途 | 從哪裡取得 |
|---|---|---|---|
| Secret | `RAILWAY_TOKEN` | `deploy-backend.yml` 用 Railway CLI 部署 | Railway → 專案 → Settings → Tokens，建立綁定 production 環境的 **project token** |
| Variable（選填） | `RAILWAY_SERVICE` | Railway 服務名稱；未設定時用 `backend` | Railway 專案內的服務名稱 |
| Repo 設定 | Pages → Source = **GitHub Actions** | `deploy-frontend.yml` 需要 | Settings → Pages |

值一律不寫進 repo。GitHub Pages 部署不需要任何 Secret（用 OIDC `id-token`）。

### Railway 服務需要的環境變數

| 名稱 | 說明 |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://...`，指向 Railway 的 PostgreSQL；注意 driver 前綴是 `postgresql+psycopg` |
| `TZ` | `Asia/Taipei` |
| `DEBUG` | `false` |
| `PORT` | Railway 自動注入，不用手設 |

啟動指令在 `backend/railway.json`：先 `alembic upgrade head` 再起 uvicorn；健康檢查路徑 `/api/v1/health`。

## 本機用 Docker 跑後端映像（選用）

```powershell
cd backend
docker build -t ledger-survivor-backend .
docker run --rm -p 18765:8000 -e PORT=8000 `
  -e DATABASE_URL=postgresql+psycopg://ledger:ledger@host.docker.internal:55432/ledger_survivor `
  ledger-survivor-backend sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"
Invoke-RestMethod http://localhost:18765/api/v1/health
```
