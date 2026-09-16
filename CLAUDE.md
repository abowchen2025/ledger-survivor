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
- API 前綴 `/api/v1`；前端型別由 OpenAPI 用 `openapi-typescript` 產生到 `frontend/src/api/schema.d.ts`，不手改
- 時區固定 `Asia/Taipei`，日期欄位用 `DATE` 型別，不用 timestamp

## 測試佈局

- 測試條件 YAML 的 `script` 路徑**以 `backend/` 為根**：`tests/unit/`、`tests/api/`、`tests/integration/`、`tests/e2e/`（Playwright Python）
- 測試檔命名帶 TC 編號可追溯，例：`tests/unit/test_week_rule.py::test_week_belongs_to_month_thursday_boundary` 對應 `TC-EDGE-WEEK-001`
- `backend/tests/fixtures/week_cases.json` 是週歸屬規則的唯一真相，前端 `frontend/src/lib/week.test.ts` 也讀這份（相對路徑 `../../../backend/tests/fixtures/week_cases.json`）
- CI 每個 PR 跑 pytest + vitest；P0 測試失敗擋合併

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

```powershell
# 資料庫
docker compose up -d db

# 後端
cd backend; uv sync; uv run alembic upgrade head; uv run uvicorn app.main:app --reload
uv run pytest -q
uv run pytest -q -m p0          # 只跑 P0

# 前端
cd frontend; npm install; npm run dev
npm run gen:api                 # 從 http://localhost:8000/openapi.json 產生型別
npm run test
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

Phase 0a：後端骨架 + 資料表 + `week_rule` 通過測試。完成標準見 `docs/architecture_v2_2.md` 第 9 節。
