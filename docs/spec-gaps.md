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
| 未設定 `API_KEY` | 環境變數缺少或為空時，後端啟動即失敗（fail closed），不得退化成「不檢查」；**不設任何旁路旗標**，程式碼裡不存在「不檢查」的分支。本機開發由 `.env.example` 附一個開發用值（`API_KEY=dev-local-only-not-a-secret`），本機一樣走完整檢查路徑；前端 `.env.example` 的 `VITE_DEV_API_KEY` 同值（只在 dev build 生效） | 條文（2026-09-21 ABow 確認 fail closed、無旁路旗標） |
| 前端 | 金鑰由使用者在設定頁輸入一次、存瀏覽器 `localStorage`（鍵 `ledger-survivor.api-key`），`src/api/client.ts` 從 `src/api/api-key.ts` 取值後所有對 `/api/v1` 的請求帶 `X-API-Key`。本機 dev build 可用 `VITE_DEV_API_KEY` 作預設值，`localStorage` 優先；production build 一律忽略該變數。沒有金鑰時不送請求、丟 `ApiKeyMissingError`，其他頁面遇到它或 401 導向設定頁（`src/api/auth-guard.ts`）。決策見 `docs/adr/0007` | 條文（2026-09-23 ABow 決定改為使用者輸入；原「建置期 `VITE_API_KEY`」作廢） |
| 金鑰存放 | 只有兩處：Railway Variables（`API_KEY`）與使用者瀏覽器的 `localStorage`。不進版控、不進 build 產物、**沒有** GitHub Secret（`deploy-frontend.yml` 建完後 grep `dist/`，出現金鑰或 `VITE_DEV_API_KEY` 就失敗）。`.env.example` 只放開發用值 | README 與 deployment-setup 已補步驟 |
| 安全邊界（必須明寫） | 金鑰不在產物裡；repo 與 Pages 公開也拿不到。它擋隨機掃描、爬蟲與「照 repo 找到 Pages 再讀 bundle」的人，不擋針對性攻擊（裝置被拿走、同源 XSS 讀 `localStorage`）。代價：每個裝置第一次要輸入一次 | 條文加註 |
| 移除時機 | Phase 3 導入 JWT（REQ-AUTH-001 起）後整套移除：dependency、環境變數、前端標頭、相關 TC | 條文加註；Phase 3 的驗收條件加「REQ-AUTH-000 已移除」 |
| 測試條件（已進 `docs/test_conditions_v1_1.yaml`） | `TC-SEC-AUTH-000a`：無 `X-API-Key` → 401；`TC-SEC-AUTH-000b`：錯誤金鑰 → 401 且回應 body 與 000a 完全相同；`TC-SEC-AUTH-000c`：正確金鑰 → 200；`TC-SEC-AUTH-000d`：三個 health 端點無金鑰 → 非 401；`TC-SEC-AUTH-000e`：`API_KEY` 未設定 → 應用啟動失敗。script `tests/api/test_api_key_gate.py` | req 回追 REQ-AUTH-000 |
| **新增缺口：驗證用受保護端點**（2026-09-23 ABow 決定：**保留**） | SRS 在 Phase 1～2 沒有任何非 health 端點，閘門無法用 curl／前端驗證「正確金鑰回 200」。新增 `GET /api/v1/auth/me` → `200 {"user_id": 1}`（`routers/auth.py`，值取 `settings.default_user_id`，對應 REQ-AUTH-001「所有請求視為 user_id=1」）。**Phase 3 改為回傳 JWT 內的 `user_id`**，端點不刪 | SRS 4.x 認證模組補這條 API，標註 Phase 3 行為 |
| **新增缺口：OpenAPI 文件依 `DEBUG` 開關**（2026-09-23 ABow 決定） | `/openapi.json`、`/docs`、`/redoc` 在 `/api/v1` 之外，不受金鑰檢查，改由 `DEBUG` 控制：`DEBUG=false`（Railway）三個端點不存在（404）；`DEBUG=true`（本機，`.env.example` 預設）全開，`npm run gen:api` 讀本機 `127.0.0.1:8765` 不受影響。理由不是保密（repo 公開，schema 推得出來），是不在公開網址放互動式介面。OpenAPI 以 `securitySchemes.ApiKeyAuth` 宣告，受保護操作帶 `security`，health 沒有；`X-API-Key` 不會變成每個操作的參數。測試 `TC-SEC-DOCS-001`（`tests/api/test_api_key_gate.py::test_openapi_docs_closed_when_debug_false`） | 第五章 5.2 加一列；`DEBUG` 同時控制 traceback（REQ-NFR-004）與文件端點，條文要寫清楚 |
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
| **新增缺口：前端建置期變數** | 只有 `VITE_API_BASE_URL`（只到 host[:port]，不含 `/api/v1`），Pages 由同名 GitHub Secret 注入，缺了 build 失敗。`VITE_DEV_API_KEY` 只是本機 dev 預設值，production build 忽略。`frontend/src/api/client.ts` 是後端呼叫唯一入口（帶 base URL 與 `X-API-Key`，非 2xx 丟 `ApiError`）。金鑰本身見第 5 節與 `docs/adr/0007` | 架構描述 6.x 或 SRS 第五章補「前端設定」；README 已列 |
| **新增缺口：設定頁金鑰欄位與後端連線狀態** | `frontend/src/components/ApiKeyForm.tsx`：金鑰輸入、儲存到 `localStorage`、清除、顯示目前來源（已儲存／開發預設／尚未設定），從其他頁被導過來時顯示原因；`ApiStatus.tsx` 打 `GET /auth/me` 顯示連線結果（正常／尚未設定金鑰／401／連不上），存完金鑰立刻重查 | SRS 4.x 設定頁畫面補「API 金鑰」與「後端連線」兩個區塊（Phase 3 移除金鑰區塊） |

### 8. Phase 1 核心 API 決定（2026-09-23 ABow 決定；**已實作**，分支 `phase-1-core-api`）

**為什麼是規格缺口**：SRS 4.1、4.2、4.5、4.7 的 API 表只寫狀態碼與觸發條件，沒有定義錯誤回應的格式、使用者隔離的行為、額外收入的端點、月薪沿用的讀取方式、行動支付綁卡的判定、停用參照的處理、「所屬月份已結算」的判定基準、深夜記帳的時區。以下每一項都是實作前必須定的，由 ABow 決定後照做。

**實作位置**：`backend/app/errors.py`（8.1）、`backend/app/deps.py` 與 `backend/app/services/common.py::get_owned_or_404`（8.2）、`backend/app/routers/income.py`（8.3、8.4）、`backend/app/services/expenses.py`（8.5、8.6、8.9）、`backend/app/services/settlement.py`（8.7）、`backend/app/services/cards.py::delete_card`（8.8）。寫法模式：router 只收參數、呼叫 service、回 schema；業務規則與所有 DB 查詢在 service，函式簽名一律 `(db, user_id, ...)`；錯誤由 service `raise` `ApiError` 子類別，router 不 try／except。

#### 8.1 統一錯誤格式

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| 格式 | 業務錯誤（400／403／404／409）一律 `{"error": {"code": "<CODE>", "message": "<人可讀>", "fields": {"<欄位>": "<文案>"} 或 null}}`。`fields` 只在欄位層級錯誤時有值 | 第五章或各模組 API 表上方加「錯誤回應格式」一節 |
| `fields` 文案 | **逐字**使用 SRS 各模組欄位規格表的「檢核失敗文案」，前端直接顯示不另外翻譯。一個欄位一句，**不分失敗原因**（缺欄位、型別錯、超長、小數位過多都同一句） | 條文加註「文案為 API 回應的一部分」 |
| 422 → 400 | FastAPI 預設的 422（RequestValidationError）改回 400（SRS 的 API 表寫 400）；OpenAPI 因此移除自動加的 422 宣告與 `HTTPValidationError` schema | 條文 |
| `code` 清單 | `VALIDATION_ERROR`（400）、`INACTIVE_REFERENCE`（400，見 8.6）、`CARD_IN_USE`（403，見 8.8）、`NOT_FOUND`（404）、`MONTH_SETTLED`（409，見 8.7）、`DUPLICATE_NAME`（409，對應 DB 唯一約束；目前只有同一一級分類下二級分類同名會觸發） | 條文；`DUPLICATE_NAME` 是 ABow 清單（至少五個）之外實作時加的，需確認 |
| 401 | 維持 `{"detail": "unauthorized"}`，**不**套用本格式：body 刻意不帶資訊，前端只看狀態碼 | 第 5 節「401 回應格式」那列加註「不套用統一格式」 |
| 未知欄位 | 請求 body 多了 schema 沒有的欄位 → 400 `VALIDATION_ERROR`，`fields` 該欄位為「不允許的欄位」，不靜靜忽略（避免打錯欄位名卻以為存了） | 條文 |
| **SRS 沒有文案的欄位**（實作時自訂，需 ABow 帶回 SRS 或改字） | `credit_cards.due_month_offset`「繳款月偏移須為0或1」、`opening_as_of`「期初日期格式有誤」、`is_active`「啟用狀態須為布林值」；`categories.sort_order`「排序須為整數」；`expenses.note`「備註最多100字」、cash／transfer 帶 `card_id`「此支付方式不可指定信用卡」（見 8.5）；`extra_incomes.month` 與所有路徑／查詢參數的月份「月份格式須為 YYYY-MM」；查詢參數日期「日期格式須為 YYYY-MM-DD」、區間顛倒「結束日不可早於起始日」；同名二級分類「同一一級分類下已有相同名稱的分類」；沒有對應文案的其他位置一律「格式有誤」 | 各模組欄位規格表補上這些文案，或提供替代字句 |
| 金額型別 | 請求與回應的金額欄位在 JSON 都是 number（最多兩位小數，超過 → 400）；後端內部與 DB 是 `NUMERIC(12,2)` | 第三章「金額型別統一」那列加註 JSON 表示法 |

#### 8.2 使用者隔離

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| `user_id` 來源 | 所有 service 查詢一律帶 `user_id`，來源是認證 dependency（`deps.CurrentUserId`，目前固定 `settings.default_user_id`=1），**不是**請求參數；Phase 3 換成 JWT 內的值，routers／services 不用改 | 第二章 RBAC「現況」補「以 dependency 注入 user_id」 |
| 存取別人的資源 | GET／PUT／DELETE by id 一律 **404**，不是 403——回 403 等於告訴對方「這筆資料存在」。清單查詢自然不包含別人的資料。POST／PUT 的 body 引用別人的分類／卡片視同「沒選」→ 400 `VALIDATION_ERROR`（同一句文案），不透露存在 | 第四章開頭「權限」段落把「否則回 403」改為「否則回 404」；Phase 3 條文同步 |
| 測試方式 | 直接在 DB 插入 `user_id=2` 的資料，用 user 1 的金鑰呼叫：清單不出現、by id 回 404、資料不變。每個模組各一個測試（`test_other_users_*_are_invisible`） | 測試條件 v1.2 補 SEC 類 TC，req 回追 REQ-AUTH-001 |

#### 8.3 額外收入的 API（SRS 漏了）

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| 端點 | 4.1 有 `extra_incomes[]` 欄位規格但沒有端點。新增 `GET /extra-incomes?month=YYYY-MM`（`month` 可省略＝全部）、`POST /extra-incomes`（201）、`PUT /extra-incomes/{id}`、`DELETE /extra-incomes/{id}`（204）。body `{month, amount, name}` | 4.1 API 表加一列 |

#### 8.4 月薪的讀取與沿用（REQ-INCOME-002）

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| 端點 | 新增 `GET /months/{yyyy-mm}/income` → `{month, salary, savings_target, inherited_from}`；`PUT` 回同一形狀（`inherited_from` 恆為 null） | 4.1 API 表加 GET 列 |
| 沿用 | 該月無紀錄時**讀取時推算、不寫入**：回上一有紀錄月份（往前找最近一個，不限上個月）的 `salary` 與 `savings_target`，`inherited_from` 填那個月份；有紀錄時 `inherited_from` 為 null。只有 PUT 才寫入。理由：GET 不該有副作用；Phase 2 的可支配計算用同一個 `services/income.py::resolve_month_income` | REQ-INCOME-002 補「讀取時推算、寫入時才落庫」 |
| 完全沒有紀錄 | 任何月份都沒紀錄 → `salary`／`savings_target` 為 **null**（不是 0，也不是 404），`inherited_from` null；前端據此顯示「尚未設定本月月薪」 | 4.1 狀態呈現那段對應 |
| 與 TC 的差異 | TC-FUNC-INCOME-003 的 action 寫 `GET /months/{yyyy-mm}`（月總覽，Phase 2）；本輪以 `GET /months/{yyyy-mm}/income` 實作，expected（月薪帶入上月金額）不變 | 測試條件 v1.2 把 action 改為 `/income` 端點 |

#### 8.5 花費的信用卡規則（REQ-EXPENSE-001）

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| 判定 | SRS 說「信用卡或綁卡行動支付時必填」，但沒有欄位能判斷行動支付有沒有綁卡。決定：`credit_card` → `card_id` 必填（400「請選擇信用卡」）；`mobile_pay` → 選填，有填就代表綁卡；`cash`、`transfer` → `card_id` 必須為 null，有值回 400（「此支付方式不可指定信用卡」） | 4.5 欄位規格表 `card_id` 檢核規則改寫為上述三段 |
| `payment_method` 允許值 | `cash`／`credit_card`／`mobile_pay`／`transfer`（與第 4 節 CHECK 一致），OpenAPI 以 enum 宣告 | 4.5 欄位規格表列出程式值 |

#### 8.6 停用中的參照（REQ-CARD-005、REQ-CATEGORY-007）

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| 新增 | 新增花費時 `category_id` 與 `card_id` 必須是啟用中的，否則 400 `INACTIVE_REFERENCE`（`fields` 用該欄位的 SRS 文案）。新增二級分類時 `group_id` 同理 | REQ-CARD-005、REQ-CATEGORY-007 加註後端也擋，不只前端選單 |
| 編輯 | 編輯既有花費（或二級分類）時，若該欄位**沒有改變**，允許沿用已停用的值；改成另一個停用值仍 400。否則使用者停用一張舊卡後，就無法修改過去任何一筆用那張卡的花費的備註 | 條文 |

#### 8.7 已結算月份的判定（REQ-EXPENSE-005，最重要）

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| 所屬月份 | 依**週歸屬規則**（`week_rule.week_belongs_to_month`）判定，不依日曆月。2026-09-29 屬 2026-W40，週四 10/1，歸 10 月，所以看 10 月有沒有結算，不是 9 月。理由：結算是行為時鐘的概念，一週永遠不切割；用日曆月判定，已結算的 9 月可能被 9/29 的補登偷偷改掉，而那筆其實屬於 10 月的關卡。實作在 `services/settlement.py::game_month_of`，不另寫一套 | REQ-EXPENSE-005「已結算月份」改為「該筆花費依 REQ-WEEK-001 所屬的月份」 |
| 「已結算」定義 | 該月在 `reward_ledger` 有紀錄。月結功能 Phase 3 才做，這個檢查現在就有；測試直接在 DB 插入 `reward_ledger` 列。**取消結算＝刪除該列**。這是 schema 逼出來的唯一解：`reward_ledger` 有 `unique(user_id, month)`，若用旗標標記失效，重新結算時會撞約束。REQ-SETTLE-003 寫「刪除或標記舊紀錄失效」二擇一，因 unique 約束只能刪除（2026-09-23 ABow 確認；其原文「有紀錄且未取消」暗示有旗標，為誤寫） | REQ-SETTLE-003 收斂成單一寫法：「取消結算須刪除該月 `reward_ledger` 紀錄」 |
| PUT 改日期 | 舊日期與新日期所屬的月份**都要檢查**，任一已結算就 409——從已結算月份移出，和移入已結算月份，都會改變該月的結果。DELETE 檢查原日期 | REQ-EXPENSE-005 加註 |
| 回應 | 409 `MONTH_SETTLED`，message 帶月份並提示「請先取消結算」，例：`2026-10 已結算，請先取消結算` | 4.5 API 表 409 那格補文案 |
| 測試覆蓋 | `tests/api/test_expenses.py`：日曆月與遊戲月不同的補登（`test_settlement_uses_game_month_not_calendar_month`）、PUT 移入（`test_put_moving_into_settled_month_returns_409`）、PUT 移出／同月改備註／DELETE（`test_put_moving_out_of_settled_month_returns_409`）、未結算月份正常寫入（`test_unsettled_month_allows_create_update_delete`）、TC-NEG-EXPENSE-006 | 測試條件 v1.2 補這四條 EDGE TC |

#### 8.8 信用卡刪除回 403

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| 狀態碼 | SRS 與 TC-FUNC-CARD-004 都寫 403，照做不改；`code` 用 `CARD_IN_USE`，message 提示改用停用（`此卡片已有花費或分期紀錄，無法刪除，請改用停用`）。語意上 409 較精確，但不值得為此改規格與測試名稱；前端認證判斷只看 401，不會誤判 | 4.2 API 表 403 那格加註「非權限問題，code=CARD_IN_USE」 |
| 引用判定 | `expenses.card_id` 或 `installments.card_id` 任一有引用即不可刪 | — |

#### 8.9 深夜記帳（TC-EDGE-EXPENSE-003）

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| `date` 預設 | `date` 由前端送；未提供時伺服器以 **Asia/Taipei 的今天**為預設（`week_rule.today_taipei()`），不可用 UTC。測試凍結在台北 23:30（UTC 15:30，同日）與台北隔日 00:30（UTC 前一日 16:30，UTC 會錯一天）兩個瞬間驗證 | REQ-WEEK-005 加註「伺服器端預設日期同樣以 Asia/Taipei 計」 |
| PUT | PUT 是整筆取代，`date` 必填（「預設今天」只適用新增） | 4.5 API 表 PUT 列加註 |

#### 8.10 實作時順帶決定的小項（需 ABow 確認）

| 項目 | 規格（已實作） | 待 SRS 補述 |
|---|---|---|
| `DELETE /category-groups/{id}` | 不提供（內建類不可刪；自訂類 Phase 3 也只能停用）。TC-FUNC-CATEGORY-001 以「請求被拒（目前 404，Phase 3 加 PUT 後為 405）且資料不變」驗 | 4.7 API 表加註「無 DELETE」 |
| `DELETE /categories/{id}` 兩種結果 | 已被 `expenses` 引用 → **200** 並回傳 `is_active=false` 的資料（SRS 與 TC-FUNC-CATEGORY-005 寫 200）；從未被引用 → **204** 無 body | 4.7 API 表狀態碼寫成 200／204 |
| PUT 語意 | 所有 PUT 都是整筆取代（缺的選填欄位回到預設／null），不是 PATCH。信用卡 PUT 不含 `opening_*`（建立後鎖定，送了 → 400「不允許的欄位」）；可用 PUT 的 `is_active` 停用／啟用卡片與二級分類 | 各模組 API 表 PUT 列加註 |
| `due_month_offset` 覆寫的保留規則（TC-NEG-CARD-003） | PUT 有給 → 覆寫；沒給且結帳日／繳款日有變 → 依新值重新推算；沒給且來源沒變 → 維持原值 | REQ-CARD-002 加註 |
| 清單皆含停用項目 | `GET /cards`、`/categories`、`/category-groups` 都回含停用的資料，前端依 `is_active` 決定灰階與能否選用（SRS 4.2「卡片清單（含停用）」推廣到分類） | 4.7 API 表加註 |
| `GET /recurring-expenses?month=` | 帶 `month` 時只回該月生效者（`start_month ≤ month ≤ end_month` 或 `end_month` 為 null），供 Phase 2 可支配計算與設定頁灰階呈現共用 | 4.1 API 表 GET 列加註 |
| `GET /expenses` 區間 | `start_date`／`end_date` 兩端皆含、皆可省略；`start_date > end_date` → 400 | 4.5 API 表 GET 列加註 |

小節 1～4 對應 2026-09-20 回覆的第 1～4 點；小節 5～6 為 2026-09-21 新增；小節 7 為 2026-09-22 新增；小節 8 為 2026-09-23 新增（Phase 1 核心 API）。第 5～7 節標「已實作」但**不刪任何一列**，等新版 SRS 回來再一起清（2026-09-22 ABow 指示）。
