# Ledger Survivor（記帳生存遊戲）

個人記帳網頁：以週為關卡、以月為賽季，每週在花費上限內存活就得分，月底依等級換取獎勵。單人使用，手機優先 PWA。

## 權威文件（改動前先讀，衝突時以此順序為準）

1. `docs/srs_fs_v1_2.md` — SRS+FS，功能模組 4.1～4.12 各含畫面／API／業務規則／驗收條件；每條規則帶 REQ 編號，附錄含需求追溯矩陣
2. `docs/test_conditions_v1_1.yaml` — 測試條件，Claude Code 依 `script` 路徑產生對應測試碼；`req` 欄位回追 SRS 的 REQ 編號
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
- `tests/integration/test_frontend_payload_contract.py` 用 subprocess 跑前端 `npm run payload:dump`（`frontend/scripts/payload-dump.ts`，只能呼叫 `lib/card-payload.ts`、`lib/expense-payload.ts` 這些表單真正用的組裝函式），把前端實際產生的 payload 逐筆丟進後端 Pydantic Create／Update schema 驗證（`docs/adr/0008`）。新增業務表單時：組裝函式進 `lib/`、dump 加 case、後端測試的 `SCHEMAS` 與 `REQUIRED_SCENARIOS` 登記
- `tests/api/test_health.py` 的 `/health/ready` 正常路徑需要本機 DB 已 `alembic upgrade head`；DB 不可用會失敗不會 skip。健康檢查三端點規格見 `docs/spec-gaps.md` 第 6 節（REQ-NFR-008）、`docs/adr/0006`
- 雲端部署設定（pre-deploy `alembic upgrade head`、Healthcheck Path `/api/v1/health/ready`、target port 8080）只存在 Railway UI，`railway.json` 對本服務無效且已刪除；清單見 `docs/deployment-setup.md` 開頭
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
- 新增業務 router 一律 include 進 `routers/protected.py` 的 `router`（REQ-AUTH-000 金鑰閘門掛在那一層），不要在 `main.py` 直接 include；只有 `routers/health.py` 三個端點豁免
- 前端不直接呼叫 `fetch`，一律經 `frontend/src/api/client.ts`（統一帶 base URL 與 `X-API-Key`）；金鑰由使用者在設定頁輸入、存 localStorage，**不得**做成建置期變數或 GitHub Secret 嵌進產物（`docs/adr/0007`）；頁面在 catch 用 `useAuthFailureRedirect` 導向設定頁
- 前端**不得**引用整個 `import.meta.env`，也不用 zustand 的 `devtools` middleware（它內部讀 `import.meta.env`）：Vite 會把含所有 `VITE_*` 的物件字面值嵌進 dist，`VITE_DEV_API_KEY` 就會外洩，`deploy-frontend.yml` 的哨兵檢查會擋下部署。本機驗法：`VITE_DEV_API_KEY=canary npm run build` 後 `grep -r canary dist` 必須沒有結果
- 前端表單的 API payload 一律在 `frontend/src/lib/*-payload.ts` 逐欄位依 `schema.d.ts` 的 Create／Update 型別組裝，元件不得展開表單狀態物件當 payload 送出（TypeScript 不檢查展開的多餘屬性；2026-09-24 新增卡片多送 `is_active` 被後端 400 就是這樣漏的）；表單 `onSubmit` 依 mode 分 Create／Update 型別，不用 `Create & Update` 交集。後端 `RequestModel` 的 `extra="forbid"` 不得放寬
- 表單送出狀態一律在 `finally` 重設；後端 `error.fields` 裡沒有對應輸入框的欄位要經 `api/errors.ts::splitFieldErrors` 併進表單頂部整體錯誤（含欄位名與訊息），不得靜默吞掉
- 分期不建 `expenses` 記錄；期初卡債不進分類分析
- 不得為了 CI 綠燈 skip／xfail 測試而不寫原因
- 修改測試預期值要另開 `test:` commit 並在 PR 說明列出改了什麼、為什麼
- 「測過了」需要證據：貼測試執行輸出，口頭宣告不算
- **不自行 merge PR**，等 ABow 說「授權你合併 #N」
- **每次合併後必須檢查該次 push 觸發的所有 workflow**（`gh run list --commit <merge sha>`：CI、Deploy frontend、Deploy backend；後兩者只在對應路徑有變動時觸發，沒觸發要說明是路徑過濾而非失敗），三條的結果全部寫進回報；任何一條失敗都用 `gh run view <id> --log-failed` 查原因，列在「未完成 / 需要決定」，不得只報成功的那幾條（2026-09-23 Deploy backend #9 失敗未回報的教訓）

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

Phase 1 第一輪（分支 `phase-1-auth-cors`，PR #3，2026-09-22～23）：REQ-AUTH-000 臨時 API 金鑰閘門（fail closed、router 層級、三個 health 豁免、`/auth/me` 保留）、金鑰由使用者輸入存 localStorage（`docs/adr/0007`）、OpenAPI 文件依 `DEBUG` 開關、CORS 來源白名單（REQ-NFR-009，暫定編號）、前端 `api/client.ts`、測試條件升 v1.1。規格缺口見 `docs/spec-gaps.md` 第 5、7 節。

Phase 1 第二輪（分支 `phase-1-core-api`，2026-09-23）：四個模組的後端 API（分類 `/category-groups`、`/categories`；信用卡 `/cards`；收入 `/months/{m}/income`、`/extra-incomes`、`/recurring-expenses`；花費 `/expenses`）。這個 PR 定下業務 API 的寫法模式，後續模組照做：router 只收參數、呼叫 service、回 schema；業務規則與所有 DB 查詢在 `services/`，簽名一律 `(db, user_id, ...)`，`user_id` 來自 `deps.CurrentUserId`；錯誤由 service `raise` `errors.ApiError` 子類別（400／403／404／409 統一 `{"error": {code, message, fields}}`，422 改回 400，401 不變）；請求 schema 繼承 `schemas/common.py::RequestModel` 並以 `field_messages` 宣告 SRS 檢核失敗文案；存取他人資料回 404；花費所屬月份的結算判定依週歸屬規則（`services/settlement.py`）。API 測試用 `tests/conftest.py` 的 `db`／`client` fixture（交易內執行、結束 rollback，需要本機 DB 已 `alembic upgrade head`）。規格決定見 `docs/spec-gaps.md` 第 8 節。

Phase 1 第三輪（分支 `phase-1-quick-entry`，PR #5，2026-09-23）：前端 API 模組、錯誤格式解讀、三個 store、首頁快速記帳表單與本週清單、設定頁信用卡管理（含 due_month_offset 即時預覽，前後端共用 `card_due_offset` fixture）。

Phase 1 修正輪（分支 `fix-card-create-payload`，2026-09-24）：Pages 新增卡片 400 的修正——payload 改在 `lib/card-payload.ts`、`lib/expense-payload.ts` 逐欄位組裝、新增不送 `is_active`、顏色送出值與畫面一致、`finally` 重設送出狀態、無對應輸入框的欄位錯誤顯示在表單頂部；新增 `npm run payload:dump` 與後端契約測試 `tests/integration/test_frontend_payload_contract.py`（`docs/adr/0008`）。

Phase 1 第四輪（分支 `phase-1-settings-calendar`，2026-09-24）：設定頁收入設定（月份預設遊戲月、月薪三種狀態、額外收入、固定支出含過期灰階）、設定頁分類管理（一級唯讀、二級 CRUD、刪除 200／204 兩種結果、共用 `category-store`）、月曆頁（`lib/calendar-grid.ts` 以 week.ts 產生格線、跨月週標籤、每日與每週合計排除獎勵、點日期沿用 `WeekExpenseList`）。新寫入全部進 `payload:dump` 與契約測試。規格決定見 `docs/spec-gaps.md` 第 9 節。

已完成：Phase 0a（後端骨架、12 張表、seed、`week_rule` 測試）、Phase 0b（前端骨架六頁、PWA、前後端 `week_rule` 一致性測試 TC-SEC-WEEK-004、CI 三條 workflow、Dockerfile、README；`railway.json` 已刪除，Railway 設定只在 UI）。路由方式 HashRouter 已採納（`docs/adr/0004`）；雲端 migration 走 Railway pre-deploy、健康檢查拆 live／ready（`docs/adr/0006`）。Pages 與 Railway 皆已上線，見 `docs/deployment-setup.md` 開頭「目前狀態」。
