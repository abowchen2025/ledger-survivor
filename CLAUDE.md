# Ledger Survivor（記帳生存遊戲）

個人記帳網頁：以週為關卡、以月為賽季，每週在花費上限內存活就得分，月底依等級換取獎勵。單人使用，手機優先 PWA。

## 權威文件（改動前先讀，衝突時以此順序為準）

1. `docs/srs_fs_v1_2.md` — SRS+FS，功能模組 4.1～4.12 各含畫面／API／業務規則／驗收條件；每條規則帶 REQ 編號，附錄含需求追溯矩陣
2. `docs/test_conditions_v1_0.yaml` — 測試條件，Claude Code 依 `script` 路徑產生對應測試碼；`req` 欄位回追 SRS 的 REQ 編號
3. `docs/architecture_v2_2.md` — 系統架構描述，設計理由與範圍界線
4. `docs/adr/` — 架構決策記錄，一個決策一個檔

## 技術架構

- 前端 `frontend/`：React 18 + TypeScript + Vite + Zustand + Tailwind CSS + shadcn/ui + Recharts + vite-plugin-pwa → GitHub Pages
- 後端 `backend/`：Python 3.12 + FastAPI + SQLAlchemy 2.x + Alembic → Railway
- 資料庫：PostgreSQL 16；本機 `docker compose up -d db`，**不用 SQLite 替代**
- API 前綴 `/api/v1`；前端型別由 OpenAPI 用 `openapi-typescript` 產生到 `frontend/src/api/schema.d.ts`，不手改（來源網址用 `127.0.0.1:8765` 不用 `localhost`，原因見下方常用指令）
- 時區固定 `Asia/Taipei`，日期欄位用 `DATE` 型別，不用 timestamp

## 測試佈局

- 測試條件 YAML 的 `script` 路徑**以 `backend/` 為根**：`tests/unit/`、`tests/api/`、`tests/integration/`、`tests/e2e/`（Playwright Python）
- 測試檔命名帶 TC 編號可追溯，例：`tests/unit/test_week_rule.py::test_week_belongs_to_month_thursday_boundary` 對應 `TC-EDGE-WEEK-001`
- `backend/tests/fixtures/week_cases.json` 是週歸屬規則的唯一真相，前端 `frontend/src/lib/week.test.ts` 也讀這份（相對路徑 `../../../backend/tests/fixtures/week_cases.json`）
- `tests/integration/test_week_rule_consistency.py`（TC-SEC-WEEK-004）用 subprocess 跑前端 `npm run week:dump`，比對兩端輸出而非各自對答案（`docs/adr/0005`）；標記 `integration`，需要 Node 22 與 `frontend/node_modules`，缺了會失敗不會 skip
- CI（`.github/workflows/ci.yml`）每個 PR 跑 backend pytest（PostgreSQL service container）+ frontend vitest/build + 一致性測試；P0 測試失敗擋合併

## 核心規則（不可自行改動，動到要先問）

- 週一為一週之始；一週歸屬於「週四所在的月份」，不切割
- 週上限預設 = （月薪 + 額外收入 − 固定支出 − 分期月付 − 儲蓄目標）÷ 該月週數；`weekly_targets` 只存覆寫值
- 分期月付 = 繳款月等於該月的所有期款總和（現金時鐘），不是「進行中分期的期款」
- 帳單月：消費日 ≤ 結帳日 → 當月，否則次月；繳款月 = 帳單月 + `due_month_offset`；偏移由繳款日 ≤ 結帳日 → 1、否則 0 推算
- **兩個時鐘各自獨立**：行為時鐘（消費日）驅動週花費、計分、分析；現金時鐘（繳款日）驅動分期月付、現金流。任何功能只能看其中一個
- 「獎勵」分類（`counts_toward_target = false`）不計入週花費
- 週分數、月等級、HP、分類佔比、現金流一律即時計算，不落庫
- 所有表帶 `user_id`，初版固定為 1，查詢一律過濾 `user_id`

## 禁止事項

- 不存完整信用卡號，只存 `last4`
- 路由（`routers/`）不放業務邏輯，一律進 `services/`
- 分期不建 `expenses` 記錄；期初卡債不進分類分析
- 不得為了 CI 綠燈 skip／xfail 測試而不寫原因
- 修改測試預期值要另開 `test:` commit 並在 PR 說明列出改了什麼、為什麼
- 「測過了」需要證據：貼測試執行輸出，口頭宣告不算
- **不自行 merge PR**，等 ABow 說「授權你合併 #N」

## 遇到以下情況停下來回報，不要自己決定

- SRS+FS、測試條件、架構描述三者之間有矛盾
- 測試條件的 `expected` 無法由 SRS+FS 推出唯一實作
- 需要新增 SRS 沒有的資料表欄位或 API
- 動到上述「核心規則」任何一條

## 常用指令（PowerShell）

埠號說明：本機 5432 與 8000 已被另一專案（rachel-qa）佔用，所以 **DB 對外映射 55432、uvicorn 用 8765**；來源見 `.env.example`。容器內 PostgreSQL 仍是 5432。

```powershell
# 資料庫（對外埠 55432）
docker compose up -d db
docker compose exec -T db psql -U ledger -d ledger_survivor            # 進 psql；-T 讓非互動管線可用
docker compose exec -T db psql -U ledger -d ledger_survivor -c "SELECT id, email FROM users;"

# 後端（uvicorn 埠 8765）
cd backend; uv sync; uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8765
uv run pytest -q
uv run pytest -q -m p0          # 只跑 P0

# 前端
cd frontend; npm install; npm run dev
npm run gen:api                 # 從 http://127.0.0.1:8765/openapi.json 產生型別（一定寫 127.0.0.1，不要「順手」改回 localhost：Node 會把 localhost 解析成 IPv6 ::1，uvicorn 預設只綁 IPv4，會 ECONNREFUSED）
npm run test
npm run build                   # 產出 dist/（manifest.webmanifest、sw.js）
npm run week:dump               # 一致性測試用：前端對 fixture 全部案例的輸出（JSON）
```

## 回報格式（每輪結束時）

```
## 完成
- [檔案路徑] 做了什麼

## 測試證據
（貼 pytest／vitest 輸出，含通過與失敗數）

## 未完成 / 需要決定
- 什麼沒做、為什麼、需要 ABow 決定什麼

## 下一步建議
```

## 語言與文件規範

- 中文產出遵循台灣技術社群用語：程式碼（不說代碼）、資料（不說數據）、品質（不說質量）、實作（不說落地）、修正（不說補丁）、面向（不說維度）
- 識別字英文，註解可中文；Commit message 英文，Conventional Commits
- 每完成一個 Phase 更新本檔「目前階段」與 `docs/adr/`

## 目前階段

Phase 1：核心記帳（收入設定、信用卡主檔、花費 CRUD、首頁快速記帳、月曆）。完成標準見 `docs/architecture_v2_2.md` 第 9 節。

已完成：Phase 0a（後端骨架、12 張表、seed、`week_rule` 測試）、Phase 0b（前端骨架六頁、PWA、前後端 `week_rule` 一致性測試 TC-SEC-WEEK-004、CI 三條 workflow、Dockerfile／railway.json、README）。路由方式 HashRouter 為提議狀態，見 `docs/adr/0004`。
