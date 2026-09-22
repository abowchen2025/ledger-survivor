# 規格缺口（實作已決定、待 SRS+FS 補述）

實作走在 SRS 前面的地方都記在這裡，由 ABow 統一帶回 `docs/srs_fs_v1_2.md`。補進 SRS 後把該列刪除。
資料庫層的實際定義以 `backend/alembic/versions/0001_initial_schema.py` 為準。


### 1. 唯一約束

| 項目 | 目前實作 | 待 SRS 補述 |
|---|---|---|
| `category_groups` 唯一約束 | `unique(user_id, code)`，約束名 `uq_category_groups_user_code` | 第三章 `category_groups` 加 `unique(user_id, code)` |
| `categories` 唯一約束 | `unique(user_id, group_id, name)`，約束名 `uq_categories_user_group_name` | 第三章 `categories` 加 `unique(user_id, group_id, name)`；同組下二級分類名稱不可重複 |

### 2. CHECK 格式限制

| 項目 | 目前實作 | 待 SRS 補述 |
|---|---|---|
| `credit_cards.last4` 格式 | `VARCHAR(4)` + `CHECK (last4 ~ '^[0-9]{4}$')`：長度 4 且只能是數字 | `last4` 型別與格式限制（只存末四碼，四位數字） |
| 所有 `month` 類欄位格式 | `VARCHAR(7)` + `CHECK (col ~ '^[0-9]{4}-(0[1-9]\|1[0-2])$')`，套用於 `monthly_incomes.month`、`extra_incomes.month`、`recurring_expenses.start_month`／`end_month`（可 NULL）、`installments.first_month`、`reward_ledger.month` | 明確寫出 `YYYY-MM` 格式且月份限 01～12 |
| `credit_cards.color` 格式 | `VARCHAR(7)` + `CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')` | `color` 為 `#RRGGBB` 十六進位，可為 NULL |

### 3. `necessity = excluded` 與基準總和排除規則

| 項目 | 目前實作 | 待 SRS 補述 |
|---|---|---|
| `necessity` 第四個值 | 允許值 `necessary / flexible / want / excluded`，欄位 `NOT NULL`；REWARD 類（`counts_toward_target=false`）用 `excluded`，不用 NULL | 4.x 分類模組 `necessity` 列舉加 `excluded`（不列入），並註明 REWARD 使用此值 |
| 基準總和檢查排除 REWARD | `benchmark_min_pct`／`max_pct` 對 REWARD 維持 NULL；REQ-CATEGORY-004 的 90～110% 總和檢查只計算 `counts_toward_target = true` 的分類 | REQ-CATEGORY-004 加註「只計 `counts_toward_target = true` 的分類，REWARD 不參與」；REWARD 的基準欄位允許 NULL |
| 基準總和檢查的定義（規格漏洞，2026-09-21 ABow 決定） | 架構描述 6.5 與 REQ-CATEGORY-004 只寫「總和落在 90～110%」，未定義用 min、max 或中點。內建 6 類目前 min 合計 70%、max 合計 115%、中點合計 92.5%。決定改為兩層檢查，**Phase 3 才實作，本輪只記錄**：①硬性檢查（擋下）：`min 合計 ≤ 100 ≤ max 合計`，各類區間須能容納一組真實的 100% 分配，目前 70 ≤ 100 ≤ 115 通過；②軟性提示（只警告不擋）：中點合計落在 90～110%，目前 92.5% 通過。兩層都只計 `counts_toward_target = true` 的分類 | REQ-CATEGORY-004 改寫為上述兩層檢查，並註明硬性／軟性的差別（擋下 vs 提示）；架構描述 6.5 第 2 條同步修改 |

### 4. 欄位型別決定（SRS 寫「—」者）

| 項目 | 目前實作 | 待 SRS 補述 |
|---|---|---|
| 列舉欄位實作方式 | 字串 + CHECK，不用 PostgreSQL 原生 ENUM（ADR-0003） | 第三章加一句「列舉欄位以字串 + CHECK 實作，允許值見各模組」 |
| SRS 寫「—」的欄位型別：`users` | `email VARCHAR(255)`、`password_hash VARCHAR(255)`、`created_at TIMESTAMPTZ DEFAULT now()` | 補型別 |
| 同上：`monthly_incomes` | `month VARCHAR(7)`、`salary NUMERIC(12,2)`、`savings_target NUMERIC(12,2)`、`note TEXT` | 補型別 |
| 同上：`extra_incomes` | `month VARCHAR(7)`、`amount NUMERIC(12,2)`、`name VARCHAR(50)` | 補型別 |
| 同上：`recurring_expenses` | `name VARCHAR(50)`、`amount NUMERIC(12,2)`、`start_month`／`end_month VARCHAR(7)` | 補型別 |
| 同上：`credit_cards` | `name VARCHAR(20)`、`bank VARCHAR(20)`、`last4 VARCHAR(4)`、`statement_day`／`due_day SMALLINT CHECK 1～31`、`due_month_offset SMALLINT CHECK IN (0,1)`、`opening_billed_unpaid`／`opening_unbilled NUMERIC(12,2)`、`opening_as_of DATE`、`color VARCHAR(7)` | 補型別；`statement_day`／`due_day` 範圍 1～31 |
| 同上：`installments` | `name VARCHAR(50)`、`purchase_date DATE`、`total_amount`／`monthly_amount NUMERIC(12,2)`、`total_periods INTEGER CHECK ≥ 2`、`paid_periods INTEGER`、`first_month VARCHAR(7)`、`first_month_override_reason VARCHAR(100)`；`NOT (is_settled AND is_cancelled)` 以 CHECK 實作 | 補型別；`total_periods ≥ 2` 這條規則 SRS 未明寫 |
| 同上：`category_groups` | `code VARCHAR(20)`、`name VARCHAR(10)`、`necessity VARCHAR(10)`、`benchmark_min_pct`／`max_pct NUMERIC(5,2)` + `CHECK (min ≤ max)`、`sort_order INTEGER` | 補型別 |
| 同上：`categories` | `name VARCHAR(20)`、`sort_order INTEGER` | 補型別 |
| 同上：`expenses` | `date DATE`、`amount NUMERIC(12,2) CHECK ≠ 0`、`item VARCHAR(50)`、`payment_method VARCHAR(20) CHECK IN ('cash','credit_card','mobile_pay','transfer')`、`note TEXT` | 補型別；`payment_method` 允許值清單 SRS 未列 |
| 同上：`weekly_targets` | `iso_year`／`iso_week SMALLINT`、`amount NUMERIC(12,2)`、`reason VARCHAR(100)`、`locked_at TIMESTAMPTZ` | 補型別 |
| 同上：`reward_ledger` | `month VARCHAR(7)`、`grade VARCHAR(10) CHECK IN ('S','A','B','C','DEAD')`、`reward_amount`／`consume_pool_delta`／`invest_pool_delta NUMERIC(12,2)`、`note TEXT` | 補型別；`grade` 允許值清單（陣亡 = `DEAD`） |
| 同上：`achievements` | `code VARCHAR(50)`、`unlocked_at TIMESTAMPTZ DEFAULT now()` | 補型別 |
| 金額精度 | 所有金額 `NUMERIC(12,2)`，保留兩位小數（分期每期金額除不盡時用到） | 第三章加一句金額型別統一 `NUMERIC(12,2)` |

### 5. 無認證期的臨時 API 金鑰閘門（REQ-AUTH-000，2026-09-21 ABow 決定；**已實作**，2026-09-22，分支 `phase-1-auth-cors`）

**為什麼是規格缺口**：REQ-AUTH-* 排在 Phase 3。Phase 1～2 之間後端部署在 Railway 的公開網址上，沒有任何認證，而這段期間會用真實財務資料連續記帳。repo 改為 public（2026-09-21 決定，見架構描述 10.1）不改變這件事，只是讓網址更容易被找到。原規格漏掉了這段「無認證期」。

**在 REQ-AUTH-000 實作完成之前，部署到 Railway 的環境只能放測試資料，不得輸入任何真實花費。Phase 1 開發期間用本機環境與假資料。**

**實作位置**：`backend/app/config.py`（`api_key` 必填、空值拒絕）、`backend/app/security.py`（`require_api_key`）、`backend/app/routers/protected.py`（router 層級掛 dependency，所有業務 router 一律 include 進來）、`backend/tests/api/test_api_key_gate.py`。

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| 編號／階段／優先 | `REQ-AUTH-000`，Phase 1，P0 | 4.x 認證模組（或第二章 RBAC）新增此條，放在 REQ-AUTH-001 之前，標註「臨時，Phase 3 移除」 |
| 後端 | 讀環境變數 `API_KEY`；以 FastAPI dependency 檢查請求標頭 `X-API-Key`，掛在 `routers/protected.py` 的 **router 層級**（不逐個端點掛，新增端點不會漏），套用到 `/api/v1` 下所有路由。比對用 `secrets.compare_digest`（常數時間） | 條文 |
| 失敗回應 | 標頭缺少或不符**一律** `401`，錯誤訊息固定同一句（例如 `{"detail": "unauthorized"}`），不透露「缺少」與「不符」的差異，避免用回應內容探測 | 條文 |
| 豁免 | 只有三個：`GET /api/v1/health`、`/api/v1/health/live`、`/api/v1/health/ready`（`routers/health.py` 不經 protected router），讓 Railway healthcheck 能用。其餘一律檢查，含未來所有業務端點 | 條文（2026-09-22 ABow 指定豁免清單只有這三個） |
| 未設定 `API_KEY` | 環境變數缺少或為空時，後端啟動即失敗（fail closed），不得退化成「不檢查」；**不設任何旁路旗標**，程式碼裡不存在「不檢查」的分支。本機開發由 `.env.example` 附一個開發用值（`API_KEY=dev-local-only-not-a-secret`），本機一樣走完整檢查路徑；前端 `.env.example` 對應 `VITE_API_KEY` 同值 | 條文（2026-09-21 ABow 確認 fail closed、無旁路旗標） |
| 前端 | 建置期環境變數 `VITE_API_KEY`，所有對 `/api/v1` 的請求帶 `X-API-Key` | 條文 |
| 金鑰存放 | GitHub Secrets（`VITE_API_KEY`，給 `deploy-frontend.yml` 建置用）與 Railway Variables（`API_KEY`），不進版控；`.env.example` 只列名稱 | README 與 deployment-setup 補步驟 |
| 安全邊界（必須明寫） | 金鑰嵌在前端 build 產物裡，任何人打開 devtools 都看得到。它擋的是隨機掃描與爬蟲，不是針對性攻擊 | 條文加註 |
| 移除時機 | Phase 3 導入 JWT（REQ-AUTH-001 起）後整套移除：dependency、環境變數、前端標頭、相關 TC | 條文加註；Phase 3 的驗收條件加「REQ-AUTH-000 已移除」 |
| 測試條件（已進 `docs/test_conditions_v1_1.yaml`） | `TC-SEC-AUTH-000a`：無 `X-API-Key` → 401；`TC-SEC-AUTH-000b`：錯誤金鑰 → 401 且回應 body 與 000a 完全相同；`TC-SEC-AUTH-000c`：正確金鑰 → 200；`TC-SEC-AUTH-000d`：三個 health 端點無金鑰 → 非 401；`TC-SEC-AUTH-000e`：`API_KEY` 未設定 → 應用啟動失敗。script `tests/api/test_api_key_gate.py` | req 回追 REQ-AUTH-000 |
| **新增缺口：驗證用受保護端點** | SRS 在 Phase 1～2 沒有任何非 health 端點，閘門無法用 curl／前端驗證「正確金鑰回 200」。本輪新增 `GET /api/v1/auth/me` → `200 {"user_id": 1}`（`routers/auth.py`，值取 `settings.default_user_id`，對應 REQ-AUTH-001「所有請求視為 user_id=1」）。Phase 3 導入 JWT 後改回 token 內的 user_id，不刪端點 | **需要 ABow 決定**：保留（建議，Phase 3 沿用）、改名，或第一個業務端點上線後刪除；SRS 4.x 認證模組補這條 API |
| **新增缺口：OpenAPI 文件不在閘門內** | `/openapi.json`、`/docs`、`/redoc` 在 `/api/v1` 之外，不受金鑰檢查。理由：`npm run gen:api`（openapi-typescript 7 的 CLI 不支援自訂標頭）要能直接讀 `/openapi.json`；文件內容由 public repo 的程式碼產生，沒有機密。OpenAPI 以 `securitySchemes.ApiKeyAuth`（`APIKeyHeader`）宣告，受保護操作帶 `security`，health 沒有；`X-API-Key` 不會變成每個操作的參數（`schema.d.ts` 不受污染） | 條文加註豁免範圍；若 ABow 要把文件端點也關掉，`gen:api` 要改成 `curl -H X-API-Key ... \| openapi-typescript`，先問 |
| **新增缺口：401 回應格式** | `401`，body 固定 `{"detail": "unauthorized"}`，`Content-Type: application/json`；不帶 `WWW-Authenticate`（沒有瀏覽器原生驗證流程要觸發） | 條文；日後 API 錯誤格式統一時一起定 |
| **新增缺口：CORS 預檢不經閘門** | 瀏覽器預檢 `OPTIONS` 不帶 `X-API-Key`，由 `CORSMiddleware` 在路由前回應，不會被 401（`tests/api/test_cors.py::test_preflight_for_health_does_not_require_api_key`）。金鑰的傳遞方式（自訂標頭）與 CORS 的關係見第 7 節 | 條文加註 |

### 6. 健康檢查端點（REQ-NFR-008，2026-09-21 ABow 決定；**已實作**於 Phase 0b 收尾，測試條件 2026-09-22 進 `docs/test_conditions_v1_1.yaml`）

**為什麼是規格缺口**：健康檢查現在是部署的守門員（Railway healthcheck 指向它，決定新版本是否切流量），是有行為、可測試的需求，不該只活在程式碼裡。SRS 目前沒有任何條文定義 health 端點。決策理由見 `docs/adr/0006`。

| 項目 | 目前實作 | 待 SRS 補述 |
|---|---|---|
| 編號／階段／優先 | `REQ-NFR-008`，Phase 0，P0 | 第五章 5.2 新增此列 |
| `GET /api/v1/health` | 固定 `200 {"status":"ok"}`，不查依賴（維持既有行為，Phase 0 驗收「Railway /health 回 200」指向它） | 條文 |
| `GET /api/v1/health/live` | liveness：固定 `200 {"status":"ok"}`，不查任何依賴。DB 斷線時不得回非 200（容器重啟解決不了 DB 問題） | 條文 |
| `GET /api/v1/health/ready` | readiness：連一次 DB 並讀 `alembic_version`。DB 可連且 `version_num` 等於程式碼 head → `200 {"status":"ok","checks":{"db":"ok","migration":{"ok":true,"db_revision":"<rev>","code_head":"<rev>"}}}`；否則 `503 {"status":"degraded","checks":{"db":"ok"|"error","migration":{"ok":false,"db_revision":<rev 或 null>,"code_head":"<rev>"}}}`。`alembic_version` 表不存在（migration 從未跑）視為 `db:"ok"`、`db_revision:null` | 條文與回應格式 |
| 不洩漏 | readiness 回應不得含連線字串、主機、帳號、例外文字；細節只寫伺服器 log | 條文（呼應 REQ-NFR-004） |
| 逾時 | DB 連線逾時 5 秒（engine `connect_timeout=5`），readiness 最慢約 5 秒回 503，不得無限等 | 條文 |
| 部署綁定 | Railway Healthcheck Path 指向 `/api/v1/health/ready`；migration 沒跑或跑失敗的部署不得切流量 | 條文；架構描述第 9 節 Phase 0 驗收「Railway /health 回 200」改為「/health/ready 回 200」 |
| 測試條件（已實作於 `tests/api/test_health.py`，已進 `docs/test_conditions_v1_1.yaml`） | `TC-FUNC-HEALTH-001` live 在 DB 不可達時仍 200；`002` ready 在 DB 到 head 時 200 且 `db_revision == code_head`；`003` revision 不符 → 503 degraded、`migration.ok=false`；`004` DB 不可達 → 503、`checks.db=error`、回應不含連線細節；`005` `/health` 維持 `{"status":"ok"}` | req 回追 REQ-NFR-008 |
| 與 REQ-AUTH-000 的關係 | 三個端點是金鑰閘門的**唯一**豁免（`TC-SEC-AUTH-000d`） | 條文加註 |

### 7. CORS 來源白名單（REQ-NFR-009，2026-09-22 ABow 決定規格；**已實作**，分支 `phase-1-auth-cors`）

**為什麼是規格缺口**：前端在 GitHub Pages（`https://abowchen2025.github.io`）、後端在 Railway，是跨來源；REQ-AUTH-000 用自訂標頭 `X-API-Key`，瀏覽器對每個跨來源請求都會先送 `OPTIONS` 預檢。SRS 第五章沒有任何 CORS 條文。編號 `REQ-NFR-009` 是本檔暫定，供 `docs/test_conditions_v1_1.yaml` 的 `req` 欄回追，待 ABow 帶回 SRS 時確認或改號。

**實作位置**：`backend/app/config.py`（`cors_allowed_origins` 解析與驗證）、`backend/app/main.py`（`CORSMiddleware`）、`backend/tests/api/test_cors.py`。

| 項目 | 目前實作 | 待 SRS 補述 |
|---|---|---|
| 編號／階段／優先 | `REQ-NFR-009`，Phase 1，P0 | 第五章 5.2 新增此列 |
| 來源清單 | 環境變數 `CORS_ALLOWED_ORIGINS`，逗號分隔，`config.py` 解析成 list。每一項必須是 `scheme://host[:port]`：含 `*`、帶路徑（含結尾 `/`）、缺 scheme、非 http/https 都在**啟動時**拒絕（ValidationError），不靜靜失效。未設定 → 空清單，不允許任何跨來源 | 條文 |
| 值 | 本機 `.env.example`：`http://localhost:5173,http://127.0.0.1:5173`；Railway：`https://abowchen2025.github.io`（只有 scheme + host，Origin 標頭不帶路徑） | README／deployment-setup |
| 禁止 | `allow_origins=["*"]`；`allow_methods=["*"]`、`allow_headers=["*"]` | 條文 |
| 憑證 | `allow_credentials=False`（用標頭不是 cookie） | 條文 |
| 方法 | `GET, POST, PUT, DELETE`（SRS API 實際用到的；預檢 `OPTIONS` 由中介層處理） | 條文；新增 PATCH 端點時要一起加 |
| 標頭 | `X-API-Key`（必含，否則預檢擋掉正式請求）、`Content-Type` | 條文 |
| 預檢結果 | 白名單來源 → `200`，`Access-Control-Allow-Origin` 等於該來源；非白名單 → `400 Disallowed CORS origin`，不含 `Allow-Origin`（Starlette 仍附靜態的 `Allow-Methods`／`Allow-Headers`，瀏覽器只看 `Allow-Origin`） | 條文與回應格式 |
| 測試條件（已進 `docs/test_conditions_v1_1.yaml`） | `TC-SEC-CORS-001` 白名單預檢帶 `X-API-Key` 通過；`002` 非白名單預檢被拒；`003` 正式請求只對白名單來源回 `Allow-Origin` | req 回追 REQ-NFR-009 |
| **新增缺口：前端建置期變數** | `VITE_API_BASE_URL`（只到 host[:port]，不含 `/api/v1`）、`VITE_API_KEY`；`frontend/src/api/client.ts` 是後端呼叫唯一入口（帶 base URL 與 `X-API-Key`，非 2xx 丟 `ApiError`）。Pages 由 GitHub Secrets 同名注入，`deploy-frontend.yml` 缺任一個就讓 build 失敗 | 架構描述 6.x 或 SRS 第五章補「前端設定」；README 已列 |
| **新增缺口：設定頁後端連線狀態** | `frontend/src/components/ApiStatus.tsx` 在設定頁打 `GET /auth/me` 顯示連線結果（正常／401／連不上），是 base URL、金鑰與 CORS 三件事的可見驗證 | SRS 4.x 設定頁畫面補一個「後端連線」區塊，或 ABow 決定 Phase 1 業務畫面進來後移除 |

小節 1～4 對應 2026-09-20 回覆的第 1～4 點；小節 5～6 為 2026-09-21 新增；小節 7 為 2026-09-22 新增。第 5～7 節標「已實作」但**不刪任何一列**，等新版 SRS 回來再一起清（2026-09-22 ABow 指示）。
