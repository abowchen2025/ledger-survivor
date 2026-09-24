# 記帳生存遊戲（Ledger Survivor）SRS+FS v1.6.1

**日期**：2026-09-22
**依據**：《記帳生存遊戲系統架構描述 v2.2》＋ Step 1 問題清單確認結果（Q1～Q21）＋ sa-core v1.9 規格書結構標準＋《測試條件 v1.0》追溯鏈修正＋ Phase 0 開發回收（repo `docs/spec-gaps.md`，40 項，2026-09-20／09-21 ABow 決定）
**性質**：spec-first 起家，Phase 0 已完成開發；本文件依 sa-core 5 節標準，SRS 與 FS 合一，不另出分冊
**取代**：本文件（v1.6.1）取代 v1.6，差異見第八章版本記錄。v1.6：本文件取代《記帳生存遊戲 SRS+FS v1.5》——v1.6 回收 repo `docs/spec-gaps.md`（2026-09-23 版）第5～8節，處理 v1.3 回收時漏掉的後續演進：REQ-AUTH-000 改寫（前端金鑰改為使用者輸入存 localStorage，原「建置期環境變數／GitHub Secrets」作廢）、新增 REQ-NFR-009（CORS）與 REQ-NFR-010（統一錯誤格式）、REQ-EXPENSE-005／REQ-SETTLE-003／REQ-INCOME-002 等多條既有 REQ 補上實作細節、四章開頭權限段落 403→404、需求追溯矩陣改以 repo 的 `test_conditions_v1_1.yaml`（78條）為準重算。**本文件為此規劃對話的最後一版**，定稿後 SRS 隨 repo 交接給開發端的規劃者維護

---

## 0. 文件治理欄位（Formal Acceptance Rule）

| 項目 | 內容 |
|---|---|
| 文件版本 | v1.6.1（正式版；開發端維護的第一版）|
| 審閱者 | ABow_Chen（決策者，已逐節確認）|
| 待確認事項清單 | 見第六章；另見附錄「需求追溯矩陣」的缺口清單；另見附錄「回收矛盾清單」（v1.3～v1.6 累計 4 項全數結案，待 ABow 確認 0 項）|
| 最後確認日期 | 2026-09-24 |
| 可進入下一階段 | Yes |

> **v1.6 修正說明**：v1.3 回收 `spec-gaps.md` 時只看到 2026-09-21 的第1～6節；之後 repo 又新增第7節（CORS）、第8節（Phase 1核心API決定），且 REQ-AUTH-000 本身在 2026-09-23 被改寫（前端金鑰機制），這些落差本版一次回收：
>
> **一、修正（與實作相反的既有條文）**：REQ-AUTH-000 整段依 spec-gaps 第5節最新版改寫——前端金鑰改為使用者於設定頁輸入、存 `localStorage`，不再是建置期環境變數／GitHub Secrets；補上 `/auth/me` 端點、401回應格式、CORS預檢不經閘門三項細節；四章開頭「否則回403」改為「否則回404」（8.2，ABow明確指示的修正，非既有規則的擅自變動）
>
> **二、回收（新增或補述既有 REQ）**：新增 **REQ-NFR-009**（CORS，沿用 repo YAML 既有編號）、**REQ-NFR-010**（統一錯誤格式）；REQ-INCOME-002（月薪讀取推算邏輯）、REQ-EXPENSE-005（已結算月份改依週歸屬而非日曆月）、REQ-SETTLE-003（取消結算收斂為單一寫法：刪除）、REQ-CARD-002（due_month_offset覆寫保留規則）、REQ-CARD-005／REQ-CATEGORY-007（停用參照後端檢查）、REQ-WEEK-005（伺服器端日期時區）補上實作細節；4.1/4.2/4.5/4.7 API表與欄位規格表補齊 8.1、8.3～8.10 各項
>
> **三、需求追溯矩陣**：改以 repo `test_conditions_v1_1.yaml`（78條，53個唯一REQ）為準，加計本文件既有的 CATEGORY-004/009/010/011 補充 YAML（8條），重算兩個缺口清單
>
> **四、順帶修正 v1.5 內部不一致**：4.7「狀態呈現」與「操作流程」仍寫舊版單層90-110%檢查，改為與 REQ-CATEGORY-004 的兩層檢查一致
>
> 除第一類「修正」項目外，**其餘既有業務規則內容不動**
>
> **v1.4 修正說明**：①1.5 Phase 1 驗收改為有條件寫法，並把 REQ-AUTH-000 明定為「進入兩週真實記帳期」的前置門檻；②REQ-CATEGORY-002 句尾加交互參照至 REQ-CATEGORY-009（純指引，002 決策內容不變）；③新增 **REQ-CATEGORY-010**：`excluded` 僅保留給獎勵類，一般分類（內建或自訂）不可設為 `excluded`，並同步補上 4.7 欄位規格表、API 例外條件、驗收條件；④新增《測試條件 v1.4 補充》2 條負向 TC；⑤追溯矩陣更新至 91 個 REQ。其餘既有業務規則內容不動。
>
> **v1.3 修正說明**：回收 Phase 0 開發期間記錄於 `docs/spec-gaps.md` 的 40 項規格缺口（原文件自述 41 項，經逐列核對第 6 節「健康檢查三端點」實際為 8 項而非 9 項，合計 40 項，已於本文件附錄註明此落差）。其中 19 項（第1、2節唯一約束與 CHECK 格式、第4節14項欄位型別）為資料庫層級的補述，直接補進第三章資料表定義，不新增 REQ 編號；其餘 21 項對應到 4 個新增或修改的正式需求：**REQ-AUTH-000**（新增，二、2.1，第5節10項）、**REQ-NFR-008**（新增，五、5.2，第6節8項）、**REQ-CATEGORY-004**（第3節3項中的2項，依使用者明確指示改寫為可驗證的兩層基準總和檢查，見下）與 **REQ-CATEGORY-009**（新增，第3節1項，necessity 排除值）。除 REQ-CATEGORY-004 依指示改寫外，**其餘既有業務規則內容不動**。

---

## 一、系統概覽

### 1.1 一句話定位

以「週」為關卡、以「月」為賽季的個人記帳網頁：每週在花費上限內存活就得分，月底依成績換取獎勵，把省錢變成可以打的遊戲。

### 1.2 命名與使用情境

| 項目 | 內容 |
|---|---|
| 中文名 | 記帳生存遊戲 |
| 英文代號 | Ledger Survivor |
| Repo | `ledger-survivor`（private）|
| 使用情境 | 單人使用，手機優先（每日 1～3 筆記帳，PWA），週末／月底在電腦上看報表結算 |

### 1.3 核心價值主張

1. **週為單位**，回饋週期短到足以修正行為
2. **遊戲化計分**，把「省下來」變成可累積的成就
3. **獎勵金來自真實省下的錢**，不憑空產生預算

### 1.4 技術架構總覽

| 層 | 選擇 |
|---|---|
| 前端 | React 18 + TypeScript + Vite，Zustand 狀態管理，Tailwind CSS + shadcn/ui，Recharts 圖表，vite-plugin-pwa |
| 後端 | Python 3.12 + FastAPI，SQLAlchemy 2.x + Alembic |
| 資料庫 | PostgreSQL 16（Railway 原生模板），本機以 Docker Compose 啟同引擎 |
| 部署 | 前端 GitHub Pages，後端 Railway Hobby，CI/CD 用 GitHub Actions |
| 營運成本 | 約 US$6～12／月（NT$200～400） |

```
手機 / 電腦瀏覽器
      │  HTTPS
      ▼
GitHub Pages（React PWA）
      │  REST /api/v1（JSON，JWT Phase 3 起）
      ▼
Railway ── FastAPI ──► PostgreSQL
```

### 1.5 分階段計畫

| 階段 | 目標 | 驗收 |
|---|---|---|
| Phase 0 骨架 | 空專案上線 | 空頁面在 Pages 可開；`/health` 回 200；`week_rule` 測試全過 |
| Phase 1 核心記帳 | 能每天記帳 | 用手機連續記帳一週不卡手（REQ-AUTH-000 完成前，於本機環境以假資料進行）；**REQ-AUTH-000 完成並部署後，才可進入 Phase 1 結束後的兩週真實記帳期** |
| Phase 2 分期與現金流 | 可支配與現金流正確 | 數字與手算一致；9/23 分期首期落 10 月的案例通過 |
| Phase 3 遊戲化與分析 | 有分數、有獎勵、有洞察 | 跑完第一個完整月的月結 |
| Phase 4 維運 | 可長期使用 | 一個月無需手動介入 |
| Phase 5 選配 | 智慧化（自然語言記帳、月結分析）| — |

---

## 二、RBAC 權限設計

### 2.1 現況（Phase 0～2）

> **為什麼多這一條（REQ-AUTH-000）**：REQ-AUTH-001～004 的使用者身份驗證排在 Phase 3。但後端從 Phase 1 起就部署在 Railway 的公開網址上，這段期間沒有任何存取控制，而使用者會用真實財務資料連續記帳。repo 改為 public（架構描述 10.1）不改變這件事，只是讓網址更容易被找到。原規格漏掉了這段「無使用者驗證、但已公開部署」的空窗期，此為 Phase 0 開發期間發現的規格缺口，2026-09-21 ABow 決定補上。

- **REQ-AUTH-000**（臨時措施，Phase 1 實作，P0，Phase 3 導入 JWT 後移除；v1.6 依 2026-09-23 ABow 決定改寫前端金鑰機制，原「建置期 `VITE_API_KEY`／GitHub Secrets」作廢，決策見 repo `docs/adr/0007`）Phase 1 起，`/api/v1` 下所有路由須先過一層臨時的 API 金鑰閘門，作為使用者身份驗證上線前的連線層級存取控制：
  - 後端讀環境變數 `API_KEY`；以 FastAPI dependency 檢查請求標頭 `X-API-Key`，掛在 router 層級（不逐個端點掛，新增端點不會漏檢查），套用到 `/api/v1` 下所有路由；比對用常數時間比較，避免時序攻擊
  - 標頭缺少或不符一律回 `401`，body 固定 `{"detail": "unauthorized"}`，`Content-Type: application/json`，不帶 `WWW-Authenticate`（沒有瀏覽器原生驗證流程要觸發）；不得透露「缺少」與「不符」的差異，避免被用回應內容探測；此格式不套用 REQ-NFR-010 的統一錯誤格式，body 刻意不帶資訊，前端只看狀態碼
  - 豁免只有三個：`GET /api/v1/health`、`/health/live`、`/health/ready`，讓 Railway healthcheck 能用；其餘一律檢查，含未來所有業務端點
  - `API_KEY` 環境變數缺少或為空時，後端啟動即失敗（fail closed），不得退化成「不檢查」；程式碼裡不存在任何旁路旗標。本機開發由 `.env.example` 附開發用值（`API_KEY=dev-local-only-not-a-secret`），本機一樣走完整檢查路徑
  - **前端**（v1.6 改寫）：金鑰由使用者在設定頁輸入一次，存瀏覽器 `localStorage`（鍵 `ledger-survivor.api-key`），所有對 `/api/v1` 的請求帶 `X-API-Key`；本機開發 build 可用 `VITE_DEV_API_KEY` 作預設值，但 `localStorage` 優先，production build 一律忽略該變數；沒有金鑰時不送請求，導向設定頁
  - **設定頁畫面**（v1.6 新增）：「API 金鑰」區塊——輸入、儲存、清除，顯示金鑰目前來源（已儲存／開發預設／尚未設定）；「後端連線」區塊——呼叫 `GET /api/v1/auth/me` 顯示連線結果（正常／尚未設定金鑰／401／連不上），存完金鑰立刻重查；兩區塊 Phase 3 導入 JWT 後移除
  - **`GET /api/v1/auth/me`**（v1.6 新增，驗證用受保護端點）：正確金鑰 → `200 {"user_id": 1}`（固定值，對應 REQ-AUTH-001「所有請求視為 user_id=1」）；Phase 3 改為回傳 JWT 內的實際 `user_id`，端點不刪
  - **金鑰存放**（v1.6 改寫）：只有兩處——Railway Variables（`API_KEY`）與使用者瀏覽器的 `localStorage`；不進版控、不進前端 build 產物、**沒有** GitHub Secret；`.env.example` 只放開發用值
  - **安全邊界（須明寫，v1.6 改寫）**：金鑰不在前端 build 產物裡，repo 與 Pages 公開也拿不到；它擋的是隨機掃描、爬蟲，以及「照 repo 找到 Pages 再讀 bundle」這種方式，不擋針對性攻擊（裝置被拿走、同源 XSS 讀 `localStorage`）；代價是每個裝置第一次使用要手動輸入一次金鑰
  - CORS 預檢（瀏覽器 `OPTIONS`）不帶 `X-API-Key`，由 CORS 中介層在路由前回應，不受此閘門檢查（見 REQ-NFR-009）
  - **在 REQ-AUTH-000 實作完成之前，部署到 Railway 的環境只能放測試資料，不得輸入任何真實花費**；Phase 1 開發期間的「連續記帳一週」驗收（見 1.5）用本機環境與假資料進行
- **REQ-AUTH-001** 所有 API 請求視為固定 `user_id=1`，不需身份驗證；前端無登入頁、無 Token 概念（REQ-AUTH-000 的 API 金鑰閘門是連線層級的存取控制，判斷「這個呼叫端有沒有金鑰」，不等同於此處判斷「這是哪個使用者」的身份驗證，兩者不衝突、可並存）；`user_id` 一律由認證 dependency 注入所有 service 查詢，不是請求參數，Phase 3 換成 JWT 內的值時 routers／services 不用改

### 2.2 預留設計（Phase 3 起）

- **REQ-AUTH-002** `/auth/login` 提供 JWT 登入機制，驗證通過後核發 token
- **REQ-AUTH-003** 所有需驗證端點須檢查 JWT 內 `user_id` 與請求操作對象一致，不一致回 403
- **REQ-AUTH-004** `/auth/refresh` 提供 token 更新機制
- 種子帳號（`user_id=1`）於 Phase 3 對應到使用者真正註冊／登入的帳號，不遷移歷史資料
- REQ-AUTH-000 於 Phase 3 導入 JWT（REQ-AUTH-002 起）後整套移除：dependency、環境變數、前端標頭、設定頁的「API 金鑰」與「後端連線」兩區塊、相關 TC；Phase 3 的驗收條件須新增一項「REQ-AUTH-000 已移除」

### 2.3 角色定義

單一角色：擁有者（Owner），即認證通過對應 `user_id` 的使用者。系統不存在管理者／一般使用者分級；未來若走「自架供人註冊」路線（10.1），角色仍是「自己的資料自己看」，屬水平隔離而非垂直分級。

---

## 三、資料庫設計

> 標示「**新增，Q_**」者為 Step 1 問題清單（Q1～Q7）確認後新增的欄位或約束；標示「**新增，Phase 0 實作決定**」者為 Phase 0 開發期間發現並記錄於 `docs/spec-gaps.md` 的補述，本輪（v1.3）回收。實際定義以 `backend/alembic/versions/0001_initial_schema.py` 為準。
>
> **全域規則**：列舉欄位一律以字串＋CHECK 實作，不用 PostgreSQL 原生 ENUM（ADR-0003）；所有金額欄位型別統一 `NUMERIC(12,2)`（分期每期金額除不盡時用到）；所有 `month` 類欄位型別統一 `VARCHAR(7)` 並套用 `CHECK (col ~ '^[0-9]{4}-(0[1-9]｜1[0-2])$')`（即 `YYYY-MM` 格式，月份限 01～12），下表以「同上」表示套用此規則。

**users**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| id | integer | PK；Phase 0 須 seed `id=1` 佔位帳號（Q4）|
| email | VARCHAR(255) | Phase 0～2 為佔位值，Phase 3 才真正使用 |
| password_hash | VARCHAR(255) | 同上 |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**monthly_incomes**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| month | VARCHAR(7) | CHECK 同上（`YYYY-MM`）|
| salary | NUMERIC(12,2) | — |
| savings_target | NUMERIC(12,2) | — |
| note | TEXT | 選填 |
| （表層約束）| — | `unique(user_id, month)` **（新增，Q7）** |

**extra_incomes**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| month | VARCHAR(7) | CHECK 同上 |
| amount | NUMERIC(12,2) | — |
| name | VARCHAR(50) | — |

**recurring_expenses**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| name | VARCHAR(50) | — |
| amount | NUMERIC(12,2) | — |
| start_month | VARCHAR(7) | CHECK 同上 |
| end_month | VARCHAR(7) | 可為 NULL；若填須 ≥ `start_month`；CHECK 同上 |

**credit_cards**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| name | VARCHAR(20) | — |
| bank | VARCHAR(20) | — |
| last4 | VARCHAR(4) | CHECK `^[0-9]{4}$`（只存末四碼，四位數字）**（新增，Phase 0 實作決定）** |
| statement_day | SMALLINT | CHECK 1～31 |
| due_day | SMALLINT | CHECK 1～31 |
| due_month_offset | SMALLINT | CHECK IN (0,1)；系統推算，可覆寫 |
| opening_billed_unpaid | NUMERIC(12,2) | 見 4.4 |
| opening_unbilled | NUMERIC(12,2) | 見 4.4 |
| opening_as_of | DATE | — |
| color | VARCHAR(7) | CHECK `color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'`（`#RRGGBB` 十六進位，可為 NULL）**（新增，Phase 0 實作決定）** |
| is_active | boolean | 預設 true；已被 `expenses` 或 `installments` 引用時刪除須改為停用（Q5）|

**installments**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| card_id | integer | FK |
| name | VARCHAR(50) | — |
| purchase_date | DATE | — |
| total_amount | NUMERIC(12,2) | — |
| monthly_amount | NUMERIC(12,2) | 系統計算，可覆寫 |
| total_periods | INTEGER | CHECK ≥2 **（新增，Phase 0 實作決定，此約束 SRS 先前未明寫）** |
| paid_periods | INTEGER | — |
| first_month | VARCHAR(7) | CHECK 同上；系統推算，可覆寫 |
| first_month_override_reason | VARCHAR(100) | 覆寫時必填 |
| is_settled | boolean | 預設 false，提前清償 |
| is_cancelled | boolean | 預設 false；CHECK `NOT (is_settled AND is_cancelled)` **（新增，Q6）** |

**category_groups**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| code | VARCHAR(20) | — |
| name | VARCHAR(10) | — |
| necessity | VARCHAR(10) | NOT NULL；CHECK IN ('necessary','flexible','want','excluded')；見 REQ-CATEGORY-009；`excluded` 僅限獎勵類，見 REQ-CATEGORY-010；獎勵類反向鎖定不可改離 `excluded`，見 REQ-CATEGORY-011（皆於 API 層檢核）|
| counts_toward_target | boolean | — |
| benchmark_min_pct | NUMERIC(5,2) | CHECK `min ≤ max`；`necessity='excluded'`（即獎勵類）時可為 NULL |
| benchmark_max_pct | NUMERIC(5,2) | 同上 |
| sort_order | INTEGER | — |
| is_system | boolean | 內建 7 類為 true，不可刪除 |
| is_active | boolean | — |
| （表層約束）| — | `unique(user_id, code)`，約束名 `uq_category_groups_user_code` **（新增，Phase 0 實作決定）** |

**categories**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| group_id | integer | FK |
| name | VARCHAR(20) | — |
| sort_order | INTEGER | — |
| is_system | boolean | — |
| is_active | boolean | 預設 true **（新增，Q2）**；已被 `expenses` 引用者刪除須改為停用 |
| （表層約束）| — | `unique(user_id, group_id, name)`，約束名 `uq_categories_user_group_name`；同組下二級分類名稱不可重複 **（新增，Phase 0 實作決定）** |

**expenses**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| date | DATE | — |
| amount | NUMERIC(12,2) | CHECK ≠ 0 |
| item | VARCHAR(50) | — |
| category_id | integer | FK |
| payment_method | VARCHAR(20) | CHECK IN ('cash','credit_card','mobile_pay','transfer') **（新增，Phase 0 實作決定，允許值清單 SRS 先前未列）** |
| card_id | integer | FK，nullable |
| note | TEXT | 選填 |
| （表層約束）| — | 所屬月份已結算（見 `reward_ledger`）時不可新增或修改（Q1）|

**weekly_targets**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| iso_year | SMALLINT | — |
| iso_week | SMALLINT | — |
| amount | NUMERIC(12,2) | — |
| reason | VARCHAR(100) | — |
| locked_at | TIMESTAMPTZ | — |
| （表層約束）| — | `unique(user_id, iso_year, iso_week)` **（新增，Q7）** |

**reward_ledger**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| month | VARCHAR(7) | CHECK 同上 |
| grade | VARCHAR(10) | CHECK IN ('S','A','B','C','DEAD')（陣亡＝`DEAD`）**（新增，Phase 0 實作決定，允許值清單 SRS 先前未列）** |
| reward_amount | NUMERIC(12,2) | — |
| consume_pool_delta | NUMERIC(12,2) | — |
| invest_pool_delta | NUMERIC(12,2) | — |
| note | TEXT | 選填 |
| （表層約束）| — | `unique(user_id, month)` **（新增，Q1）** |

**achievements**

| 欄位 | 型別 | 約束／備註 |
|---|---|---|
| user_id | integer | FK |
| code | VARCHAR(50) | — |
| unlocked_at | TIMESTAMPTZ | DEFAULT now() |
| （表層約束）| — | `unique(user_id, code)` **（新增，Q3）** |

**不落庫**：週分數、月等級、HP、分類佔比、每月現金流、消費池餘額——全部即時計算。

---

## 四、功能模組索引

> 每個模組固定四部分：畫面／API／權限／業務規則。權限部分因現況單純（單人、無驗證），除特別註明外一律「現況：無驗證，固定操作 `user_id=1`（由認證 dependency 注入，見 REQ-AUTH-001）；預留設計：Phase 3 起驗證 JWT 內 `user_id` 與操作對象一致，否則回 **404**（不是403——回403等於告訴對方「這筆資料存在」；由 id 存取他人資源一律404，POST/PUT body 引用他人的分類／卡片視同「沒選」回400，同樣不透露存在；v1.6 修正，2026-09-23 ABow 明確指示，見 `docs/spec-gaps.md` 8.2）」，以下各模組不重複列出此段，僅在有差異時特別註明。
>
> **v1.2 說明**：以下各模組的「業務規則」採《SRS v1.0》原始逐條敘述並標上 REQ 編號，一個 REQ 對應一條；「驗收條件」維持 v1.1 原文，僅在每條前補上其對應的 REQ 編號（少數驗收條件同時驗證兩個 REQ，標記為 `REQ-A／REQ-B`）。

### 4.1 收入與可支配金額

**對應畫面**：設定頁「收入設定」區塊；首頁「剩餘額度大字」為本模組計算結果的呈現，輸入介面不在首頁。

**版面結構**：設定頁收入設定卡片內含月薪輸入、額外收入清單（可新增多筆）、固定支出清單（可新增/編輯，含起訖月）、儲蓄目標輸入。

**欄位規格表**

| 欄位名稱 | 對應 API 欄位 | 型別 | 必填 | 檢核規則 | 檢核失敗文案 |
|---|---|---|---|---|---|
| 月薪 | `salary` | number | 是 | ≥0，最多兩位小數 | 「月薪不可為負數」|
| 儲蓄目標 | `savings_target` | number | 否（預設0）| ≥0 | 「儲蓄目標不可為負數」|
| 額外收入-月份 | `extra_incomes[].month` | string(YYYY-MM) | 是 | 合法月份格式 | 「月份格式須為YYYY-MM」|
| 額外收入-名稱 | `extra_incomes[].name` | string | 是 | 1～50字 | 「請輸入收入名稱」|
| 額外收入-金額 | `extra_incomes[].amount` | number | 是 | >0 | 「金額須大於0」|
| 固定支出-名稱 | `recurring_expenses[].name` | string | 是 | 1～50字 | 「請輸入支出名稱」|
| 固定支出-金額 | `recurring_expenses[].amount` | number | 是 | >0 | 「金額須大於0」|
| 固定支出-起始月 | `recurring_expenses[].start_month` | string(YYYY-MM) | 是 | 合法月份格式 | 「請選擇起始月份」|
| 固定支出-結束月 | `recurring_expenses[].end_month` | string(YYYY-MM)｜null | 否 | 若填須≥起始月 | 「結束月不可早於起始月」|

**狀態呈現**：載入中顯示骨架畫面；任何月份都沒有月薪紀錄時，`GET /months/{yyyy-mm}/income` 回應 `salary`／`savings_target` 為 **null**（不是0，不是404），`inherited_from` 為 null，前端欄位空白並提示「尚未設定本月月薪」；有紀錄或推算得到上月金額時欄位帶入對應值；API 失敗時卡片內顯示紅字錯誤訊息且不清空已輸入內容；儲存成功顯示浮動提示 2 秒後消失。

**條件呈現邏輯**：新增月份月薪時若上月有紀錄，自動帶入上月金額（可覆寫）；固定支出清單中結束月已過的項目以灰階／刪除線呈現但不隱藏。

**操作流程**：進入設定頁 → `GET /months/{yyyy-mm}/income` 載入本月月薪（若無紀錄則為推算值，`inherited_from` 標示來源月）與固定支出／額外收入 → 修改或新增 → 前端檢核 → `PUT /months/{yyyy-mm}/income` → 成功後首頁剩餘額度即時反映（前端重新拉取 `/weeks/{yyyy}-W{ww}`）。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/months/{yyyy-mm}` | GET | — | 月總覽：可支配、週數、各週上限、分數、等級 | 200／400 | 月份格式非 YYYY-MM |
| `/months/{yyyy-mm}/income` | GET | — | `{month, salary, savings_target, inherited_from}`；無紀錄時 `salary`／`savings_target` 為 null，`inherited_from` 填推算來源月；有紀錄時 `inherited_from` 為 null。**讀取時推算、不寫入**（v1.6 補述，REQ-INCOME-002） | 200／400 | 月份格式非 YYYY-MM |
| `/months/{yyyy-mm}/income` | PUT | `{salary, savings_target}` | 更新後月收入設定，`inherited_from` 恆為 null（僅 PUT 才寫入落庫）| 200／400 | 金額為負數 |
| `/extra-incomes` | GET | `?month=YYYY-MM`（可省略＝全部）| 額外收入清單 | 200 | — |
| `/extra-incomes` | POST | `{month, amount, name}` | 新建額外收入 | 201/400 | 金額≤0；月份格式錯誤 |
| `/extra-incomes/{id}` | PUT | `{month, amount, name}` | 更新後額外收入 | 200/400/404 | 同上 |
| `/extra-incomes/{id}` | DELETE | — | 空 | 204/404 | — |
| `/recurring-expenses` | GET/POST/PUT/DELETE | 依動作；GET 帶 `?month=` 時只回該月生效者（`start_month≤month≤end_month` 或 `end_month` 為 null）| 固定支出清單／單筆 | 200/201/204/400/404 | `end_month` 早於 `start_month`；金額為負 |

**業務規則**

- **REQ-INCOME-001** 使用者可設定每月月薪；同一使用者同一月僅能有一筆月薪紀錄（`unique(user_id, month)`，寫入以 upsert 處理）
- **REQ-INCOME-002**（v1.6 補述讀取邏輯，決策內容不變）新增尚無紀錄月份的月薪時，系統預設沿用上一有紀錄月份的金額；此推算**只在讀取時計算、不寫入資料庫**，往前找最近一個有紀錄的月份（不限上個月）；任何月份都沒有紀錄時，回應為 null 而非0或404；只有 PUT 才會真正落庫
- **REQ-INCOME-003** 使用者可新增多筆額外收入（獎金、年終等），每筆歸屬特定月份
- **REQ-INCOME-004** 使用者可設定固定支出項目（房租、保險、訂閱等），可設定生效起訖月份；系統依起訖月自動判定是否計入當月可支配金額
- **REQ-INCOME-005** 使用者可設定儲蓄目標，預設為 0，每月固定於可支配金額計算中先行扣除
- **REQ-INCOME-006** 系統須即時計算月可支配金額（不落庫）：月可支配 = 月薪 + 額外收入 − 固定支出 − 分期月付 − 儲蓄目標。`salary` 為 `null` 時（`GET /months/{yyyy-mm}/income` 依 REQ-INCOME-002 往前沿用後仍無任何月份有紀錄），月可支配與該月所有週的週上限預設（REQ-INCOME-007）皆為 `null`，**不是 0**；週上限為 `null` 的週不計分、不影響連勝，首頁與月曆以「請先設定月薪」取代剩餘額度與 HP。理由：當成 0 會讓每一週都「超支」、分數全部為負，等於懲罰使用者還沒完成設定；而沒有上限的週，計分本身沒有意義。`null` 只會在「從未設定過任何月份的月薪」時出現，有任何一個月的紀錄就會依 REQ-INCOME-002 往前沿用（Phase 2 實作；2026-09-24 ABow 決定，結案回收矛盾清單第 4 項）
- **REQ-INCOME-007** 系統須依當月週數，將月可支配金額平均分配為各週預設上限：週上限預設 = 月可支配 ÷ 該月週數
- **REQ-INCOME-008** 修改某月月薪或固定支出後，不得回溯改變已鎖定週份（見 4.6）的週上限

**驗收條件**

- [ ] **REQ-INCOME-001** 同一月份重複設定月薪，第二次為更新而非新增一筆
- [ ] **REQ-INCOME-002** 新增月份未設定月薪時，自動帶入上月金額，使用者可覆寫
- [ ] **REQ-INCOME-006** 月可支配金額計算結果與手算一致
- [ ] **REQ-INCOME-008** 修改本月月薪後，已鎖定週的週上限不變

---

### 4.2 信用卡主檔

**對應畫面**：設定頁「信用卡管理」區塊；「分期與現金流」頁頂部卡片標籤（供篩選）。

**版面結構**：卡片列表顯示卡名、銀行、末四碼、卡面顏色，點擊進編輯表單。

**欄位規格表**

| 欄位名稱 | 對應 API 欄位 | 型別 | 必填 | 檢核規則 | 檢核失敗文案 |
|---|---|---|---|---|---|
| 卡名 | `name` | string | 是 | 1～20字 | 「請輸入卡片名稱」|
| 銀行 | `bank` | string | 是 | 1～20字 | 「請輸入發卡銀行」|
| 末四碼 | `last4` | string | 是 | 恰好4位數字 | 「請輸入卡號末四碼（4位數字）」|
| 結帳日 | `statement_day` | integer | 是 | 1～31 | 「結帳日須介於1-31」|
| 繳款日 | `due_day` | integer | 是 | 1～31 | 「繳款日須介於1-31」|
| 繳款月偏移 | `due_month_offset` | integer(0/1) | 否（系統推算）| 0或1 | 「繳款月偏移須為0或1」|
| 卡面顏色 | `color` | string(hex) | 否 | 合法色碼 | 「顏色格式錯誤」|
| 已出帳未繳 | `opening_billed_unpaid` | number | 否（預設0，僅新建時可填，建立後鎖定）| ≥0 | 「金額不可為負數」|
| 未出帳 | `opening_unbilled` | number | 否（預設0，僅新建時可填，建立後鎖定）| ≥0 | 「金額不可為負數」|
| 期初日期 | `opening_as_of` | date | 否 | 合法日期 | 「期初日期格式有誤」|
| 啟用狀態 | `is_active` | boolean | 否（PUT 用於停用／啟用）| 須為布林值 | 「啟用狀態須為布林值」|

**狀態呈現**：尚未新增卡片時顯示「尚未新增信用卡，點此新增」；停用卡片以灰階呈現，仍可查看但不可選作新花費／分期的支付卡片。

**條件呈現邏輯**：已被 `expenses` 或 `installments` 引用過的卡片，編輯表單「刪除」按鈕改為「停用」；期初卡債欄位僅於新增卡片流程顯示，編輯既有卡片時鎖定不可再改。

**操作流程**：填寫表單 → 系統依結帳日/繳款日即時試算 `due_month_offset` 並顯示預覽（如「這張卡繳款月將自動落在消費月的次月」）→ 送出 → 可覆寫推算值。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/cards` | GET | — | 卡片清單（含停用，前端依 `is_active` 決定灰階與能否選用）| 200 | — |
| `/cards` | POST | 卡片欄位 | 新建卡片（含推算 `due_month_offset`）| 201/400 | 末四碼非4位數字；結帳日/繳款日超出1-31 |
| `/cards/{id}` | PUT | 卡片欄位（整筆取代，不含 `opening_*`）| 更新後卡片 | 200/400/404 | 卡片不存在；帶 `opening_billed_unpaid`／`opening_unbilled`／`opening_as_of`（400 VALIDATION_ERROR，「不允許的欄位」，建立後鎖定）|
| `/cards/{id}` | DELETE | — | 空 | 204/403 | 卡片已被 `expenses` 或 `installments` 引用（回403，`code=CARD_IN_USE`，訊息提示改用停用；語意上409較精確但沿用403不改）|

**業務規則**

- **REQ-CARD-001** 使用者可建立信用卡主檔：卡名、銀行、末四碼、結帳日、繳款日、卡面顏色。系統不得儲存完整卡號
- **REQ-CARD-002** 系統須依結帳日與繳款日自動推算繳款月偏移 `due_month_offset`：繳款日 ≤ 結帳日 → 次月（偏移1）；繳款日 > 結帳日 → 同月（偏移0）；使用者可手動覆寫。PUT 時覆寫值的保留規則（v1.6 補述）：有給 `due_month_offset` → 依給值覆寫；沒給且結帳日／繳款日有變 → 依新值重新推算；沒給且來源欄位沒變 → 維持原值
- **REQ-CARD-003** 新建卡片時可填寫「已出帳未繳」「未出帳」兩筆期初未付卡債金額（皆可為0），僅影響現金時鐘相關計算，不影響週花費、計分、分類分析
- **REQ-CARD-004** 已被 `expenses` 或 `installments` 引用過的卡片不可刪除，僅可停用；未曾被引用過的卡片可直接刪除
- **REQ-CARD-005** 卡片停用後，既有未結清分期仍須持續計入現金流計算；停用僅影響「新增分期/花費時能否選用此卡」
- **REQ-CARD-006** 結帳日設定為31日但當月不足31天時，系統須視為該月最後一日處理

**驗收條件**

- [ ] **REQ-CARD-002** 繳款日≤結帳日時 `due_month_offset` 自動推算為1（次月），可手動覆寫
- [ ] **REQ-CARD-004** 卡片已被 `expenses` 或 `installments` 引用時，刪除操作回403並提示改用停用
- [ ] **REQ-CARD-005** 停用中的卡片不會出現在新增花費／分期的卡片選單中
- [ ] **REQ-CARD-006** 結帳日設31但當月無31日時，正確視為該月最後一天

---

### 4.3 分期

**對應畫面**：「分期與現金流」頁上半區塊（分期清單）；新增分期以獨立表單（Modal 或子頁）呈現。

**版面結構**：依卡片分組，顯示品項、剩餘期數、剩餘金額、預計結束月。

**欄位規格表**

| 欄位名稱 | 對應 API 欄位 | 型別 | 必填 | 檢核規則 | 檢核失敗文案 |
|---|---|---|---|---|---|
| 品項 | `name` | string | 是 | 1～50字 | 「請輸入分期品項」|
| 所屬卡片 | `card_id` | integer | 是 | 須為啟用中的卡片 | 「請選擇信用卡」|
| 消費日 | `purchase_date` | date | 是 | 合法日期，不可晚於今天 | 「消費日不可晚於今天」|
| 總金額 | `total_amount` | number | 是 | >0 | 「總金額須大於0」|
| 總期數 | `total_periods` | integer | 是 | ≥2 | 「總期數至少2期」|
| 每期金額 | `monthly_amount` | number | 否（系統計算）| 若手動覆寫須>0 | 「每期金額須大於0」|
| 首期繳款月 | `first_month` | string(YYYY-MM) | 否（系統推算）| 合法月份格式 | — |
| 首期覆寫原因 | `first_month_override_reason` | string | 條件必填（覆寫首期月時）| 1～100字 | 「覆寫首期月須填寫原因」|

**狀態呈現**：某卡片無分期時顯示「這張卡目前沒有進行中的分期」；分期列表以標籤區分「進行中／已清償／已取消」三種狀態。

**條件呈現邏輯**：新增分期時即時顯示推算出的首期繳款月與每期金額預覽；消費當週的首頁週檢視須顯示一列「本週新增分期承諾」資訊列，不可與一般花費列混排。

**操作流程**：選卡片 → 填寫品項/消費日/總金額/總期數 → 系統即時試算首期繳款月與每期金額 → 如需覆寫則填原因 → 送出 → 消費當週首頁顯示提示列。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/installments` | GET | — | 分期清單（含已清償/已取消）| 200 | — |
| `/installments` | POST | 分期欄位 | 新建分期（含推算 `first_month`）| 201/400 | 總期數<2；消費日晚於今天；卡片不存在或已停用 |
| `/installments/{id}` | PUT | 分期欄位 | 更新後分期 | 200/400/404 | 覆寫 `first_month` 但未填原因 |
| `/installments/{id}/settle` | POST | — | 標記 `is_settled=true` | 200/409 | 已標記 `is_cancelled` 時不可再清償 |
| `/installments/{id}/cancel` | POST | — | 標記 `is_cancelled=true`（新增端點，對應 Q6）| 200/409 | 已標記 `is_settled` 時不可再取消 |

**業務規則**

- **REQ-INSTALL-001** 使用者可為特定信用卡新增分期記錄：品項、消費日、總金額、總期數
- **REQ-INSTALL-002** 系統須依消費日與所屬卡片規則自動推算首期繳款月：帳單月 = 消費日所在月（消費日≤結帳日）或次月（消費日>結帳日）；繳款月 = 帳單月 + `due_month_offset`
- **REQ-INSTALL-003** 使用者可手動覆寫推算出的首期繳款月，覆寫時須填寫原因
- **REQ-INSTALL-004** 系統須依總金額與總期數自動計算每期金額，使用者可手動覆寫以處理尾差
- **REQ-INSTALL-005** 分期本身不建立 `expenses` 紀錄，不重複計入日常花費；分期月付僅計入月可支配金額的扣項
- **REQ-INSTALL-006** 消費當週的週檢視須顯示一列「本週新增分期承諾」資訊，此列不計入週花費、不參與計分
- **REQ-INSTALL-007** 使用者可對分期執行提前清償（`is_settled=true`），清償後不再計入未來月份的分期月付與現金流預估
- **REQ-INSTALL-008** 使用者可將分期標記為取消（`is_cancelled=true`，與 `is_settled` 互斥），取消後不再計入未來分期月付與現金流預估，但保留歷史紀錄
- **REQ-INSTALL-009** 月可支配公式中的「分期月付」定義為：該月所有分期期款（依現金時鐘，即繳款月）總和，非「本月進行中分期的期款總和」

**驗收條件**

- [ ] **REQ-INSTALL-002** 消費日=結帳日當天（邊界）、結帳日後一天、跨年三種情境的首期繳款月推算正確
- [ ] **REQ-INSTALL-003** 覆寫首期月未填原因時，送出遭拒
- [ ] **REQ-INSTALL-005** 分期不會在 `expenses` 表產生對應紀錄
- [ ] **REQ-INSTALL-007／REQ-INSTALL-008** 已標記 `is_settled` 或 `is_cancelled` 的分期，不再計入未來現金流預估
- [ ] **REQ-INSTALL-006** 消費當週首頁正確顯示「本週新增分期承諾」列，且不計入週花費

---

### 4.4 現金流

**對應畫面**：「分期與現金流」頁下半區塊。

**版面結構**：本月應繳彙總表（依卡片分組，已出帳/未出帳）；未來 6 個月現金流預估表格（月份為列，固定支出/各卡應繳/儲蓄目標/收入/缺口為欄）；缺口月份醒目標示。

**顯示欄位對照**（本區塊純顯示，無輸入欄位）

| 顯示欄位 | 對應 API 欄位 | 型別 |
|---|---|---|
| 本月固定支出 | `fixed_expenses_total` | number |
| 各卡應繳（已出帳） | `cards[].billed_amount` | number |
| 各卡應繳（未出帳） | `cards[].unbilled_amount` | number |
| 儲蓄目標 | `savings_target` | number |
| 本月收入 | `monthly_income` | number |
| 現金流缺口 | `gap` | number（可為負）|

**狀態呈現**：`gap < 0` 的月份整列標紅底並顯示「現金流缺口 NT$X」；尚無任何分期與固定支出時顯示「目前僅有月收入，尚無現金流負擔」。

**條件呈現邏輯**：期初未付卡債在對應繳款月顯示於已出帳／未出帳欄位，進入穩態後（對應月份已過）不再產生影響。

**操作流程**：進頁載入當月現金流明細與未來 6 個月預估；可切換月份查看歷史（不可編輯）。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/cashflow/{yyyy-mm}` | GET | — | 該月現金流出明細 | 200/400 | 月份格式錯誤 |
| `/cashflow/forecast` | GET | `?months=6`（選填）| 未來 N 個月現金流預估陣列 | 200 | — |

**業務規則**

- **REQ-CASHFLOW-001** 系統須提供指定月份的現金流出明細：固定支出、各卡應繳（區分已出帳/未出帳，並拆列各分期期款）、儲蓄目標，並與該月收入比較呈現缺口
- **REQ-CASHFLOW-002** 系統須提供未來N個月（預設6）的現金流預估，計算基礎為固定支出+各卡應繳+儲蓄目標vs月收入
- **REQ-CASHFLOW-003** 現金流計算以月初（每月1日）作為月收入入帳時點，不追蹤實際入帳日
- **REQ-CASHFLOW-004** 期初未付卡債（已出帳未繳、未出帳）須分別落入對應的繳款月現金流計算；進入穩態後（對應繳款月已過）欄位保留但不再產生現金流影響
- **REQ-CASHFLOW-005** 現金流缺口（該月支出大於收入）須有明確標示
- 現金流計算不看卡片 `is_active`，只看分期是否已清償／取消（見 REQ-CARD-005）

**驗收條件**

- [ ] **REQ-CASHFLOW-005** 現金流缺口月份（`gap<0`）正確標示
- [ ] **REQ-CASHFLOW-004** 期初未付卡債進入穩態後（對應繳款月已過）不再影響現金流計算
- [ ] **REQ-CARD-005** 卡片停用不影響其未結清分期的現金流計算

---

### 4.5 花費記錄

**對應畫面**：首頁「快速記帳」表單與「本週逐日花費」清單；月曆頁每日花費合計格。

**版面結構**：首頁最上方常駐快速記帳表單（非彈窗），下方本週逐日花費清單依日期分組，每筆顯示品項、金額、分類色塊、支付方式。月曆頁每格顯示當日花費合計，點擊展開明細（沿用首頁清單元件）。

**欄位規格表**

| 欄位名稱 | 對應 API 欄位 | 型別 | 必填 | 檢核規則 | 檢核失敗文案 |
|---|---|---|---|---|---|
| 日期 | `date` | date | 是（預設今天）| 合法日期 | 「請選擇日期」|
| 金額 | `amount` | number | 是 | ≠0，支援負數 | 「金額不可為0」|
| 品項 | `item` | string | 是 | 1～50字 | 「請輸入品項」|
| 支付方式 | `payment_method` | enum（現金/信用卡/行動支付/轉帳；程式值 `cash`／`credit_card`／`mobile_pay`／`transfer`）| 是 | 須為列舉值之一 | 「請選擇支付方式」|
| 信用卡 | `card_id` | integer | 依支付方式而定（v1.6 補述三段規則）| `payment_method=credit_card` → 必填；`=mobile_pay` → 選填（有填代表綁卡）；`=cash`／`transfer` → 必須為 null | 必填未填：「請選擇信用卡」；不可填卻有值：「此支付方式不可指定信用卡」|
| 分類 | `category_id` | integer | 是 | 須為啟用中的二級分類；編輯既有花費時若此欄位未變更，允許沿用已停用的值 | 「請選擇分類」（未啟用時：`INACTIVE_REFERENCE`，同一句文案）|
| 備註 | `note` | string | 否 | 0～100字 | 「備註最多100字」|

**狀態呈現**：本週無花費時清單顯示「本週還沒有記帳，開始記第一筆吧」；送出後按鈕顯示載入動畫避免重複送出；成功後即時插入對應日期分組並同步更新 HP 條；檢核失敗於對應欄位下方顯示紅字，不清空已輸入內容。

**條件呈現邏輯**：分類為「獎勵」的花費在清單中以特殊樣式標示並註記「不計入週花費」；快速記帳表單預設帶入上一筆的分類與支付方式。

**操作流程**：填寫表單 → 前端檢核 → `POST /expenses` → 清單即時更新、HP 條同步重算 → 可點擊編輯或滑動刪除。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/expenses` | GET | `?start_date&end_date`（兩端皆含，皆可省略）| 花費列表 | 200/400 | 日期區間格式錯誤；`start_date>end_date`（400，「結束日不可早於起始日」）|
| `/expenses` | POST | 花費欄位（`date` 省略時預設 Asia/Taipei 今天）| 新建花費 | 201/400/409 | 金額為0；支付方式與 `card_id` 不符規則；`category_id`／`card_id` 未啟用（400 `INACTIVE_REFERENCE`）；所屬月份已結算（409 `MONTH_SETTLED`，訊息帶月份，例：「2026-10 已結算，請先取消結算」）|
| `/expenses/{id}` | PUT | 花費欄位（整筆取代，`date` 必填，不適用「省略即今天」）| 更新後花費 | 200/400/404/409 | 同上；**新日期與舊日期所屬月份皆檢查**，任一已結算即409（從已結算月移出、或移入已結算月，都會改變該月結果）|
| `/expenses/{id}` | DELETE | — | 空 | 204/404/409 | 所屬月份（依原日期）已結算（409 `MONTH_SETTLED`）|

**業務規則**

- **REQ-EXPENSE-001** 使用者可新增花費紀錄：日期（預設今天）、金額（不可為零，支援負數表示退款）、品項（自由文字，提供最近輸入快速選項）、分類、支付方式（現金/信用卡/行動支付/轉帳）、信用卡（支付方式為信用卡或綁卡行動支付時必填）、備註（選填）
- **REQ-EXPENSE-002** 使用者可編輯與刪除已存在的花費紀錄
- **REQ-EXPENSE-003** 花費分類為「獎勵」時，該筆花費不計入週花費計算
- **REQ-EXPENSE-004** 信用卡消費以消費日計入週花費（行為時鐘），不以結帳日或繳款日計算
- **REQ-EXPENSE-005**（v1.6 補述「已結算月份」定義，決策內容不變）系統允許補登任何過去日期的花費，補登後該筆花費所屬週的分數須即時重算；但已結算月份（該月在 `reward_ledger` 有紀錄）不允許新增或修改該月內的花費，須先取消結算。**「該筆花費所屬的月份」依 REQ-WEEK-001 的週歸屬規則判定，不是日曆月**——花費所屬週的週四落在哪個月，就看那個月是否已結算（例：2026-09-29 屬 2026-W40，週四為10/1，看10月是否結算，不是9月）；理由：結算是行為時鐘的概念，一週不切割，用日曆月判定會讓已結算月被隔壁月份的補登偷改。編輯時**新舊日期所屬的月份都要檢查**，任一已結算即拒絕
- **REQ-EXPENSE-006** 系統須提供「本月信用卡待繳」視圖，依結帳日彙總實際現金流（現金時鐘），與週花費計算（行為時鐘）相互獨立、不互相覆蓋
- （v1.6 補述，呼應 REQ-CARD-005／REQ-CATEGORY-007）新增花費時 `category_id`／`card_id` 須為啟用中，後端也擋（`INACTIVE_REFERENCE`），不只前端選單擋；編輯既有花費時，若該欄位未改變，允許沿用已停用的值，避免停用一張舊卡後無法再編輯過去用那張卡的花費備註

**驗收條件**

- [ ] **REQ-EXPENSE-003** 「獎勵」分類花費不計入週花費
- [ ] **REQ-EXPENSE-004** 信用卡消費以消費日（非結帳日／繳款日）計入週花費
- [ ] **REQ-EXPENSE-002／REQ-EXPENSE-005** 所屬月份已結算時，新增／編輯／刪除花費回409
- [ ] **REQ-EXPENSE-005** 補登過去日期花費後，所屬週分數即時重算
- [ ] **REQ-EXPENSE-001** 金額為0時無法送出

---

### 4.6 週上限與時間規則

**對應畫面**：無獨立輸入畫面。首頁「剩餘額度大字」與 HP 條（見 4.8）為本模組計算結果的呈現；月曆頁以週為列的日曆格式，跨月週依附錄 Q17 決議顯示小標籤「這週算 X 月」。

**週上限覆寫表單欄位規格表**

| 欄位名稱 | 對應 API 欄位 | 型別 | 必填 | 檢核規則 | 檢核失敗文案 |
|---|---|---|---|---|---|
| 覆寫金額 | `amount` | number | 是 | >0 | 「週上限須大於0」|
| 覆寫原因 | `reason` | string | 是 | 1～100字 | 「請填寫覆寫原因」|

**狀態呈現**：已鎖定週的覆寫按鈕 disabled，顯示「本週已結束，上限已鎖定」；進行中週按鈕可用。

**條件呈現邏輯**：月曆頁跨月週的日期在兩個月曆月份都出現，歸屬月份以小標籤標示，避免使用者誤解分數算在哪個月。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/weeks/{yyyy}-W{ww}` | GET | — | 週詳情：上限、花費、餘額、分數、HP | 200/400 | 週格式錯誤 |
| `/weeks/{yyyy}-W{ww}/target` | PUT | `{amount, reason}` | 更新後週上限 | 200/400/409 | 該週已鎖定（`locked_at` 已設定）|

**業務規則**

- **REQ-WEEK-001** 一週以週一為起始，完整歸屬於「該週週四所在月份」，不切割、不按比例分攤
- **REQ-WEEK-002** 系統須依 REQ-WEEK-001 規則自動計算每月週數（4或5週）
- **REQ-WEEK-003** 使用者可逐週覆寫週上限，須填寫原因；月報須顯示本月調整次數
- **REQ-WEEK-004** 週結束後，該週上限即鎖定（寫入 `locked_at`），不可再回頭修改
- **REQ-WEEK-005**（v1.6 補述，決策內容不變）所有日期以 `Asia/Taipei` 時區的本地日曆日儲存為 `DATE` 型別，不使用 timestamp；`date` 欄位若請求省略，伺服器端同樣以 Asia/Taipei 的當地今天為預設值，不可用 UTC（深夜記帳時兩者可能是不同日期）

**驗收條件**

- [ ] **REQ-WEEK-001** 2026/9/28～10/4（週四10/1）正確歸屬10月第1週
- [ ] **REQ-WEEK-002** 每月週數（4或5）自動算出且與人工判斷一致
- [ ] **REQ-WEEK-004** 週結束後週上限鎖定，覆寫按鈕 disabled
- [ ] **REQ-WEEK-001** 跨月週在兩個月曆月份都出現，並標示歸屬月份

---

### 4.7 消費分類體系

**對應畫面**：設定頁「分類管理」區塊；花費記錄表單的分類選擇欄位（見4.5）。

**版面結構**：一級分類以標籤列呈現（內建7類 + Phase 3 自訂），點擊展開該一級分類下的二級分類清單。自訂一級分類新增入口 Phase 3 才顯示。

**欄位規格表（自訂一級分類，Phase 3）**

| 欄位名稱 | 對應 API 欄位 | 型別 | 必填 | 檢核規則 | 檢核失敗文案 |
|---|---|---|---|---|---|
| 名稱 | `name` | string | 是 | 1～10字；不可為「其他」「雜項」「Misc」等 | 「請換一個更具體的分類名稱」|
| necessity | `necessity` | enum（必要/彈性/想要）| 是 | 須為列舉值之一；不提供「排除」選項（REQ-CATEGORY-010）| 「請選擇必要性」|
| 佔比基準下限 | `benchmark_min_pct` | number | 是 | 0～100 | 「請輸入合理的佔比範圍」|
| 佔比基準上限 | `benchmark_max_pct` | number | 是 | ≥下限，≤100 | 「上限須大於下限」|
| 搬移二級分類 | `move_categories[]` | array | 是 | 至少1項 | 「請至少搬移一個既有子分類過來」|

**欄位規格表（二級分類）**

| 欄位名稱 | 對應 API 欄位 | 型別 | 必填 | 檢核規則 | 檢核失敗文案 |
|---|---|---|---|---|---|
| 名稱 | `name` | string | 是 | 1～10字 | 「請輸入分類名稱」|
| 所屬一級分類 | `group_id` | integer | 是 | 須為啟用中的一級分類 | 「請選擇所屬一級分類」|

**狀態呈現**：已達自訂上限（2個）時新增按鈕 disabled 並顯示「已達自訂上限（2/2）」；基準總和硬性檢查（min合計≤100≤max合計）不通過時擋下儲存並顯示錯誤；硬性檢查通過但中點合計落在90～110%外時顯示警示，仍允許儲存（見 REQ-CATEGORY-004，v1.6 修正此處與 REQ-CATEGORY-004 不一致的舊敘述）。

**條件呈現邏輯**：內建 7 類無刪除按鈕，僅可編輯名稱/necessity/基準或（自訂類）停用；二級分類刪除時若已被 `expenses` 引用，系統改為停用並提示「此分類已有花費紀錄，將改為停用」。

**操作流程（新增自訂一級分類，Phase 3）**：填寫名稱/necessity/基準區間 → 選擇至少一個既有二級分類搬移過來 → 送出 → 系統檢查上限與命名黑名單 → 通過後依 REQ-CATEGORY-004 執行兩層基準總和檢查：硬性檢查不通過則拒絕儲存；硬性通過但軟性提示範圍外則寫入成功並顯示警示（v1.6 修正此處與 REQ-CATEGORY-004 不一致的舊敘述）。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/category-groups` | GET | — | 一級分類清單（含停用）| 200 | — |
| `/category-groups` | POST | 自訂分類欄位 | 新建一級分類 | 201/400/409 | 已達2個上限；名稱為黑名單詞；未搬移任何二級分類；`necessity=excluded`（400，REQ-CATEGORY-010）|
| `/category-groups/{id}` | PUT | 名稱/necessity/基準（整筆取代）| 更新後分類 | 200/400/404 | 將非獎勵類的 `necessity` 改為 `excluded`（400，REQ-CATEGORY-010）；將獎勵類的 `necessity` 改為 `excluded` 以外的值（400，REQ-CATEGORY-011）|
| `/category-groups/{id}` | DELETE | — | 不提供（v1.6 補述）| 404 | 內建類不可刪；自訂類 Phase 3 也只能停用，本端點不存在 |
| `/categories` | GET | — | 二級分類清單（含停用）| 200 | — |
| `/categories` | POST/PUT | 依動作（整筆取代）| 新建／更新後分類 | 201/200/400/404 | `group_id` 未啟用（400 `INACTIVE_REFERENCE`）|
| `/categories/{id}` | DELETE | — | 已被 `expenses` 引用：回傳 `is_active=false` 的資料；從未被引用：無 body | **200**／**204**（v1.6 明確拆分兩種結果，決策內容不變）| — |

**業務規則**（見架構描述第6節業界調查、兩層7類分類定義、`necessity`／`benchmark_pct`屬性）

- **REQ-CATEGORY-001** 系統初版須 seed 7 個內建一級分類（食/衣/住/行/育/樂/獎勵）與對應二級分類
- **REQ-CATEGORY-002** 內建一級分類不可刪除，可修改顯示名稱、`necessity`、`benchmark_pct`（`necessity` 完整值域見 REQ-CATEGORY-009，可設定範圍見 REQ-CATEGORY-010／011；獎勵類的 `necessity` 修改權例外鎖定，見 REQ-CATEGORY-011）
- **REQ-CATEGORY-003** 使用者可新增自訂一級分類，上限2個（共9類上限）；新增時須指定 `necessity`、`benchmark_pct` 區間，並須從既有分類搬移至少一個二級分類過來
- **REQ-CATEGORY-004**（v1.3 改寫；原「總和落在90～110%」未定義計算基準，屬規格漏洞，2026-09-21 ABow 決定補完整，見附錄「回收矛盾清單」）新增或修改一級分類後，系統須對所有 `counts_toward_target=true` 的一級分類執行兩層基準總和檢查，`necessity='excluded'`（獎勵類，見 REQ-CATEGORY-009）不參與此計算：
  - **硬性檢查（擋下）**：`benchmark_min_pct` 總和 ≤ 100 ≤ `benchmark_max_pct` 總和，即各分類區間須能共同涵蓋出一組真實的100%分配；不通過則拒絕儲存（400）
  - **軟性提示（只警告，不擋）**：各分類 `(benchmark_min_pct + benchmark_max_pct) / 2` 之中點總和落在90%～110%外時，回應含警示訊息，但仍允許儲存
  - Phase 3 實作
- **REQ-CATEGORY-005** 自訂一級分類只能停用不能刪除，歷史資料保留
- **REQ-CATEGORY-006** 使用者嘗試將自訂分類命名為「其他」「雜項」「Misc」等類似字樣時，系統須給出提示
- **REQ-CATEGORY-007** 二級分類完全自由，使用者可增刪改、調整順序；已被 `expenses` 引用過的二級分類刪除時須改為停用，不可真刪除，從未被引用過的可真刪除
- **REQ-CATEGORY-008** 分析功能一律使用當月實際存在且啟用的分類結構計算，不追溯套用現在的分類結構；若對比月份中某分類當時已停用，顯示為「已停用」而非消失或報錯
- **REQ-CATEGORY-009**（v1.3 新增，Phase 0 開發期間發現規格缺口，2026-09-21 ABow 決定）`necessity` 允許值為必要（`necessary`）／彈性（`flexible`）／想要（`want`）／排除（`excluded`）四種；「獎勵」一級分類（`counts_toward_target=false`）使用 `excluded`，不使用 NULL；`necessity='excluded'` 時 `benchmark_min_pct`／`benchmark_max_pct` 兩欄允許為 NULL
- **REQ-CATEGORY-010**（v1.4 新增，2026-09-22 ABow 決定）`necessity='excluded'` 僅保留給「獎勵」一級分類；使用者新增自訂一級分類或修改任何非獎勵類的一級分類時，不得將 `necessity` 設為 `excluded`，後端回 400；前端 necessity 選單不提供此選項。理由：一般分類設為 `excluded` 會脫離 REQ-CATEGORY-004 的基準總和計算，等於繞過該檢查
- **REQ-CATEGORY-011**（v1.5 新增，2026-09-22 ABow 決定，結案附錄「回收矛盾清單」第3項）獎勵一級分類（`code='REWARD'`）的 `necessity` 鎖定為 `excluded`，不可被修改為其他值；使用者修改獎勵一級分類時，若送出的 `necessity` 不是 `excluded`，後端回 400，前端該分類的 necessity 欄位鎖定不可編輯。與 REQ-CATEGORY-010 形成雙向鎖定：`excluded` 與獎勵類互為充要對應，不會出現「獎勵類的 necessity 不是 excluded」或「非獎勵類的 necessity 是 excluded」這兩種不一致組合

**驗收條件**

- [ ] **REQ-CATEGORY-002** 內建7類無法被刪除，僅能編輯名稱／necessity／基準
- [ ] **REQ-CATEGORY-003** 已達2個自訂一級分類上限時，新增按鈕 disabled
- [ ] **REQ-CATEGORY-003** 新增自訂一級分類未搬移任何二級分類時，送出遭拒
- [ ] **REQ-CATEGORY-007** 二級分類已被 `expenses` 引用時，刪除操作改為停用而非硬刪除
- [ ] **REQ-CATEGORY-006** 自訂分類命名為「其他」「雜項」「Misc」時出現提示
- [ ] **REQ-CATEGORY-004** 硬性檢查：min總和≤100≤max總和不成立時，拒絕儲存（400）
- [ ] **REQ-CATEGORY-004** 軟性提示：中點總和落在90～110%外、但硬性檢查成立時，仍允許儲存但回應含警示
- [ ] **REQ-CATEGORY-004** `necessity='excluded'` 的分類（獎勵類）不參與基準總和計算
- [ ] **REQ-CATEGORY-009** 獎勵分類的 `necessity` 儲存為字串 `excluded` 而非 NULL，`benchmark_min_pct`／`max_pct` 允許為 NULL
- [ ] **REQ-CATEGORY-010** 新增自訂一級分類或修改非獎勵類時送出 `necessity=excluded`，回 400 且資料未變更
- [ ] **REQ-CATEGORY-011** 修改獎勵一級分類、送出非 `excluded` 的 `necessity` 時，回 400 且資料未變更

---

### 4.8 週計分

**對應畫面**：無獨立輸入畫面。首頁 HP 條為核心視覺化元件；月結頁以列表呈現各週得分細項。

**HP 條視覺判定條件（依 REQ-UI-001 標準，明確定義，供人工或 Codex + Astra High 審查）**

- HP% = R ÷ T × 100%（可能為負，視覺上以「陣亡」樣式統一呈現負值，不設下限）
- HP% ≥ 20%：綠色系正常樣式
- 0% ≤ HP% < 20%：黃／紅警示色，須明顯區別於正常樣式
- HP% = 0%：顯示「瀕死」文字標籤
- HP% < 0%（R<0超支）：顯示「陣亡」文字標籤，記帳功能仍可正常使用（不鎖定）

**月結頁呈現**：各週得分以列表或長條圖呈現，含存活分／餘額率分／豐收加分／連勝加乘／超支扣分細項拆解。

**狀態呈現**：未來週 HP 條不顯示或顯示「尚未開始」灰階樣式；載入中顯示骨架動畫。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/weeks/{yyyy}-W{ww}` | GET | — | 含分數細項拆解（見4.6）| 200 | — |

**業務規則**

- **REQ-SCORE-001** 週分數由 API 即時計算，不落庫；規則版本獨立編號，規則變更不需回溯改資料
- **REQ-SCORE-002** 週花費 E 定義為扣除「獎勵」分類後的當週花費總和；R = T − E；r = R ÷ T
- **REQ-SCORE-003** R≥0 判定為存活，得存活分+10
- **REQ-SCORE-004** 餘額率分：r 每10%得2分，最高封頂+10
- **REQ-SCORE-005** 豐收加分：r≥30%得+5；r≥50%得+10（兩者取高者，不疊加）
- **REQ-SCORE-006** 連勝加乘：連續存活第2週起每週+3，最高累計+9；連勝以「結算當下」的週結果為準，不因後續補登花費而追溯重算已定案週次的連勝狀態
- **REQ-SCORE-007** 超支判定 R<0；基礎扣−5，超支率每10%再扣−2，單週最低−15分；超支發生時連勝歸零
- **REQ-SCORE-008** 週分數上下界為−15至+39

**驗收條件**

- [ ] **REQ-SCORE-003** R≥0時正確得存活分+10
- [ ] **REQ-SCORE-005** r達30%與50%門檻的豐收加分取高者不疊加
- [ ] **REQ-SCORE-006** 連續存活週的連勝加乘正確累計，最高+9
- [ ] **REQ-SCORE-007** 超支週連勝正確歸零
- [ ] **REQ-SCORE-008** 週分數上下界（−15至+39）不被突破
- [ ] **REQ-UI-001** HP%<0時顯示「陣亡」但記帳功能仍可用

---

### 4.9 月結

**對應畫面**：「月結」頁。

**版面結構**：頂部本月等級稱號與平均週分大字，中段各週得分圖表，下段獎勵金與分流結果，底部「執行月結」或「取消結算」按鈕。

**狀態呈現**：未結算顯示「執行月結」按鈕；已結算顯示結算結果，按鈕變更為「取消結算」；月份尚未結束時按鈕 disabled 並顯示「本月尚未結束，無法結算」；陣亡等級時獎勵金區塊顯示「獎勵池已凍結一個月」，金額為0。

**條件呈現邏輯**：取消結算為二次確認動作（彈窗：「取消結算後可補登本月花費，但需重新結算才能拿到新的獎勵結果，確定要取消嗎？」），避免誤觸。

**操作流程**：月份結束後進頁 → 系統檢查是否已結算 → 點擊「執行月結」→ `POST /months/{yyyy-mm}/settle` → 顯示結算結果 → 如需補登遺漏花費，先點「取消結算」→ 確認彈窗 → `DELETE /months/{yyyy-mm}/settle` → 補登 → 重新執行月結。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/months/{yyyy-mm}/settle` | POST | — | 結算結果（等級/獎勵金/分流）| 201/400/409 | 該月已結算過（409）；該月尚未結束（400）|
| `/months/{yyyy-mm}/settle` | DELETE | — | 空（新增端點，對應 Q1／取消結算）| 204/404 | 該月尚未結算過 |
| `/months/{yyyy-mm}` | GET | — | 月總覽含等級與各週分數 | 200 | 見4.1 |

**業務規則**

- **REQ-SETTLE-001** 平均週分 = 月總分 ÷ 該月週數；等級：S(≥28)/A(≥20)/B(≥12)/C(≥0)/陣亡(<0 或任一週超支率≥50%)
- **REQ-SETTLE-002** 執行月結時，系統須將月等級、獎勵金等結果寫入 `reward_ledger`；同一使用者同一月僅能有一筆結算紀錄（`unique(user_id, month)`）；該月一旦結算，不得再補登該月內的花費，須先取消結算才能補登
- **REQ-SETTLE-003** 取消結算後補登花費，須重新執行月結才能產生新的 `reward_ledger` 紀錄；取消結算須刪除該月的 `reward_ledger` 紀錄（因 `unique(user_id, month)` 約束，無法以旗標標記失效後重新結算）

**驗收條件**

- [ ] **REQ-SETTLE-002** 同一月份重複執行月結時回409
- [ ] **REQ-SETTLE-002** 該月已結算時，補登該月花費回409
- [ ] **REQ-SETTLE-003** 取消結算後可重新補登花費，並可重新執行月結
- [ ] **REQ-SETTLE-001／REQ-REWARD-005** 陣亡等級時獎勵金為0且獎勵池凍結一個月

---

### 4.10 獎勵機制與獎勵池

**對應畫面**：月結頁獎勵金顯示；設定頁分流比例設定；（可選）獨立「獎勵池」檢視區塊。

**欄位規格表**

| 欄位名稱 | 對應 API 欄位 | 型別 | 必填 | 檢核規則 | 檢核失敗文案 |
|---|---|---|---|---|---|
| 消費池分流比例 | `consume_pool_ratio` | number(0-100) | 是 | 與投資池比例相加須=100 | 「消費池與投資池比例總和須為100%」|

**狀態呈現**：獎勵池檢視顯示消費池即時餘額、投資池累計金額、Boss獎勵解鎖進度（連續幾個月A級以上）。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/rewards` | GET | — | 獎勵池狀態（消費池餘額即時計算／投資池累計／Boss獎勵進度）與歷史 | 200 | — |

**業務規則**

- **REQ-REWARD-001** 獎勵金 = 月正餘額合計（所有存活週R加總，超支週不抵扣）× 等級對應比例（S:30%/A:20%/B:10%/C:0%/陣亡:0%）
- **REQ-REWARD-002** 獎勵金依預設50/50（可調整）比例分流至消費池與投資池，分流比例可由使用者設定
- **REQ-REWARD-003** 消費池餘額須即時計算（不落庫）：歷史所有月份 `consume_pool_delta` 加總 − 歷史所有「獎勵」分類花費金額加總
- **REQ-REWARD-004** 投資池僅記錄金額累加，不與 `expenses` 連動扣減
- **REQ-REWARD-005** 陣亡等級時，獎勵池凍結一個月（該月不產生新的獎勵金分流）
- **REQ-REWARD-006** 連續3個月達A級以上者，解鎖「Boss獎勵」，當月可額外動用月正餘額的10%，此金額預設全數分流至消費池

**驗收條件**

- [ ] **REQ-REWARD-003** 消費池餘額＝歷史分流加總－歷史「獎勵」分類花費加總，計算結果正確
- [ ] **REQ-REWARD-004** 投資池金額只增不因花費扣減
- [ ] **REQ-REWARD-006** 連續3個月A級以上時Boss獎勵正確解鎖

---

### 4.11 成就

**對應畫面**：設定頁或獨立成就區塊列出5個成就；新解鎖時於首頁或月結頁顯示一次性通知橫幅（依附錄Q18決議「進App才看到」，不做PWA推播）。

**狀態呈現**：已解鎖顯示彩色圖示+解鎖日期；未解鎖顯示灰階輪廓，僅顯示成就名稱不顯示解鎖條件細節。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/achievements` | GET | — | 成就清單（含解鎖狀態與日期）| 200 | — |

**業務規則**

- **REQ-ACHIEVE-001** 系統初版須支援5個成就：初次存活、四連勝、鐵人月（整月無超支）、分期終結者（任一分期繳完）、現金流大師（單月餘額率≥40%）
- **REQ-ACHIEVE-002** 每個成就同一使用者僅能解鎖一次（`unique(user_id, code)`）

**驗收條件**

- [ ] **REQ-ACHIEVE-002** 每個成就同一使用者僅能解鎖一次，重複觸發不會產生第二筆紀錄
- [ ] **REQ-ACHIEVE-001** 新解鎖成就於下次進入首頁或月結頁時顯示通知橫幅

---

### 4.12 分析頁

**對應畫面**：「分析」頁。

**版面結構**：分類佔比（圓餅圖+排序清單）、與基準對比（標記超標分類）、與自己對比（3個自然月趨勢）、必要性結構（趨勢線）、超支歸因（當月超支週分類拆解）、調整建議（可量化建議清單），六區塊。

**狀態呈現**：未滿3個月資料時，「與自己對比」與趨勢線區塊顯示「需要三個月資料，目前N個月」，其餘區塊（當月佔比、當月超支歸因）正常顯示；本月無花費時整頁顯示「本月還沒有花費紀錄，記帳後才會有分析資料」。

**條件呈現邏輯**：分析文案一律陳述事實與數字對比，不使用道德評價字眼，前端文案模板須避免「太多」「應該」等詞。

**API**

| Endpoint | 方法 | Request | Response | 狀態碼 | 例外觸發條件 |
|---|---|---|---|---|---|
| `/months/{yyyy-mm}/analysis` | GET | — | 分類佔比／基準對比／自己對比／必要性結構／超支歸因／調整建議 | 200 | — |

**業務規則**

- **REQ-ANALYSIS-001** 系統須提供本月各一級分類金額與佔比
- **REQ-ANALYSIS-002** 系統須標記超出 `benchmark_pct` 上限的分類
- **REQ-ANALYSIS-003** 系統須提供各分類本月與前三個自然月平均值的對比，並標出變化最大的三類
- **REQ-ANALYSIS-004** 未滿三個月資料時，「與自己對比」須顯示「需要三個月資料，目前N個月」，不得以單月資料強行產生趨勢
- **REQ-ANALYSIS-005** 系統須提供必要/彈性/想要三者佔比與三個月趨勢線
- **REQ-ANALYSIS-006** 超支週須依分類拆解花費，指出貢獻最多的分類
- **REQ-ANALYSIS-007** 系統須提供調整建議，格式須包含具體金額與分數換算（例如「若某類回到基準，每週可多省NT$X，相當於每週多Y分」），不得產出無法量化的建議
- **REQ-ANALYSIS-008** 分析功能訊息措辭不得含道德評價字眼，須陳述事實與數字對比

**驗收條件**

- [ ] **REQ-ANALYSIS-004** 未滿3個月資料時，「與自己對比」正確顯示「需要三個月資料，目前N個月」
- [ ] **REQ-ANALYSIS-007** 調整建議包含具體金額與分數換算，不出現無法量化的建議
- [ ] **REQ-ANALYSIS-008** 分析文案不含道德評價字眼

---

## 五、非功能需求

### 5.1 UI 視覺可驗證性

- **REQ-UI-001** 具有動態視覺狀態的核心元件（HP 條顏色分級、週上限進度、超支/瀕死/陣亡狀態顯示等）須在 FS 中定義明確、可驗證的判定條件（例如色階對應的數值區間），不得僅以文字模糊描述——因應使用者可能以 Codex（搭配 Astra High 視覺審查能力）人工審視 UI 畫面；具體示範見4.8節HP條定義
- **REQ-UI-002** 每個核心畫面須在 FS 中列出四種狀態（載入中／空資料／錯誤／權限不足）的明確呈現方式，以支援人工或工具進行畫面審查；各模組4.1～4.12已逐一列出

### 5.2 其他非功能需求

| REQ | 項目 | 說明 |
|---|---|---|
| **REQ-NFR-001** | PWA | 可加入手機主畫面，快取靜態資源供離線瀏覽已載入資料，不支援離線寫入 |
| **REQ-NFR-002** | 操作效率 | 記一筆花費的操作路徑須少於三次點擊 |
| **REQ-NFR-003** | 測試一致性 | `week_rule` 前後端須讀同一份測試 fixture（`tests/fixtures/week_cases.json`），任一端不一致不可合併 |
| **REQ-NFR-004** | 除錯資訊安全 | 500錯誤與traceback外洩與否，僅在 `DEBUG=false` 環境驗證；`DEBUG` 同時控制 OpenAPI 文件端點（v1.6 補述，見下方詳細規格）|
| **REQ-NFR-005** | 資料隔離 | 更改請求中的 `user_id` 不得讀寫他人資料，即使初版僅單人使用 |
| **REQ-NFR-006** | 成本控管 | Railway平台須設定用量警示，超過US$10/月時通知 |
| **REQ-NFR-007** | 成本控管 | Railway平台每月費用須登錄為系統自身的固定支出項目 |
| **REQ-NFR-008** | 健康檢查端點 | 見下方詳細規格（Phase 0，P0，已實作於 Phase 0b 收尾）|
| **REQ-NFR-009** | CORS 來源白名單 | 見下方詳細規格（Phase 1，P0，已實作，分支 `phase-1-auth-cors`；編號沿用 repo `docs/spec-gaps.md` 暫定編號）|
| **REQ-NFR-010** | 統一錯誤格式 | 見下方詳細規格（Phase 1，P1，已實作，分支 `phase-1-core-api`）|

**REQ-NFR-008 詳細規格**（v1.3 新增，健康檢查是部署守門員——Railway healthcheck 指向它，決定新版本是否切流量，屬有行為、可測試的需求，原 SRS 未涵蓋）

- `GET /api/v1/health`：固定回 `200 {"status":"ok"}`，不查依賴（維持既有行為，1.5 Phase 0 驗收「Railway /health 回200」指向它）
- `GET /api/v1/health/live`：liveness，固定回 `200 {"status":"ok"}`，不查任何依賴；DB 斷線時不得回非200（容器重啟解決不了 DB 問題）
- `GET /api/v1/health/ready`：readiness，連一次 DB 並讀 `alembic_version`。DB 可連且 `version_num` 等於程式碼 head → `200 {"status":"ok","checks":{"db":"ok","migration":{"ok":true,"db_revision":"<rev>","code_head":"<rev>"}}}`；否則 `503 {"status":"degraded","checks":{"db":"ok"｜"error","migration":{"ok":false,"db_revision":<rev 或 null>,"code_head":""}}}`；`alembic_version` 表不存在（migration 從未跑）視為 `db:"ok"`、`db_revision:null`
- 不洩漏：readiness 回應不得含連線字串、主機、帳號、例外文字；細節只寫伺服器 log（呼應 REQ-NFR-004）
- 逾時：DB 連線逾時5秒（engine `connect_timeout=5`），readiness 最慢約5秒回503，不得無限等
- 部署綁定：Railway Healthcheck Path 指向 `/api/v1/health/ready`；migration 沒跑或跑失敗的部署不得切流量；架構描述第9節 Phase 0 驗收「Railway /health 回200」改為「/health/ready 回200」
- 與 REQ-AUTH-000 的關係：上述三個端點是金鑰閘門的**唯一**豁免

**REQ-NFR-004 詳細規格：OpenAPI 文件依 `DEBUG` 開關**（v1.6 新增，與 REQ-NFR-008 分屬不同端點但共用同一個 `DEBUG` 旗標，故併入 REQ-NFR-004 而非另立新號，與 repo `test_conditions_v1_1.yaml` 的既有編號一致）

- `/openapi.json`、`/docs`、`/redoc` 在 `/api/v1` 之外，不受 REQ-AUTH-000 金鑰閘門檢查，改由 `DEBUG` 控制：`DEBUG=false`（Railway）三個端點皆不存在（404）；`DEBUG=true`（本機，`.env.example` 預設）全開
- 理由不是保密（repo 公開，schema 推得出來），是不在公開網址放互動式文件介面
- OpenAPI 以 `securitySchemes.ApiKeyAuth` 宣告，受保護操作帶 `security`，health 端點沒有；`X-API-Key` 不會變成每個操作的參數

**REQ-NFR-009 詳細規格：CORS 來源白名單**（v1.6 新增，Phase 1，P0，已實作，分支 `phase-1-auth-cors`；背景——前端在 GitHub Pages、後端在 Railway，是跨來源；REQ-AUTH-000 用自訂標頭 `X-API-Key`，瀏覽器對每個跨來源請求都先送 `OPTIONS` 預檢）

- 來源清單：環境變數 `CORS_ALLOWED_ORIGINS`，逗號分隔，解析成清單；每一項必須是 `scheme://host[:port]`——含 `*`、帶路徑（含結尾 `/`）、缺 scheme、非 http/https 都在**啟動時**拒絕（不靜靜失效）；未設定 → 空清單，不允許任何跨來源
- 值：本機 `http://localhost:5173,http://127.0.0.1:5173`；Railway：`https://abowchen2025.github.io`（只有 scheme+host，Origin 標頭不帶路徑）
- 禁止：`allow_origins=["*"]`；`allow_methods=["*"]`；`allow_headers=["*"]`
- 憑證：`allow_credentials=False`（用自訂標頭不是 cookie）
- 方法：`GET, POST, PUT, DELETE`（SRS API 實際用到的；新增端點方法時要一起加白名單）
- 標頭：`X-API-Key`（必含，否則預檢擋掉正式請求）、`Content-Type`
- 預檢結果：白名單來源 → `200`，`Access-Control-Allow-Origin` 等於該來源（不是 `*`）；非白名單來源 → `400 Disallowed CORS origin`，不含 `Allow-Origin`
- 正式請求：只對白名單來源回 `Allow-Origin`（等於各自的 Origin），任何情況不得回 `*`
- 前端建置期變數：`VITE_API_BASE_URL`（只到 host[:port]，不含 `/api/v1`），Pages 由同名 GitHub Secret 注入；與 REQ-AUTH-000 的金鑰無關，這是後端位址設定，可留在建置期

**REQ-NFR-010 詳細規格：統一錯誤格式**（v1.6 新增，Phase 1，P1，已實作，分支 `phase-1-core-api`；背景——SRS 各模組 API 表原本只寫狀態碼，沒有定義錯誤回應本身的格式）

- 格式：業務錯誤（400／403／404／409）一律 `{"error": {"code": "<CODE>", "message": "<人可讀>", "fields": {"<欄位>": "<文案>"} 或 null}}`；`fields` 只在欄位層級錯誤時有值
- `fields` 文案：逐字使用各模組欄位規格表的「檢核失敗文案」，前端直接顯示不另外翻譯；一個欄位一句，不分失敗原因（缺欄位、型別錯、超長、小數位過多都同一句）
- 422→400：FastAPI 預設的 422（`RequestValidationError`）一律改回 400（與各模組 API 表寫的 400 一致）；OpenAPI 移除自動加的 422 宣告與 `HTTPValidationError` schema
- `code` 清單：`VALIDATION_ERROR`（400）、`INACTIVE_REFERENCE`（400，見4.5／4.7停用參照規則）、`CARD_IN_USE`（403，見4.2信用卡刪除）、`NOT_FOUND`（404）、`MONTH_SETTLED`（409，見4.5已結算月份）、`DUPLICATE_NAME`（409，對應資料庫唯一約束；目前只有同一一級分類下二級分類同名會觸發）
- 未知欄位：請求 body 多了 schema 沒有的欄位 → 400 `VALIDATION_ERROR`，`fields` 該欄位為「不允許的欄位」，不靜靜忽略
- 金額型別：請求與回應的金額欄位在 JSON 都是 number（最多兩位小數，超過則400）；後端內部與資料庫是 `NUMERIC(12,2)`
- **例外**：401（REQ-AUTH-000 的金鑰閘門）不套用本格式，維持固定 `{"detail": "unauthorized"}`——body 刻意不帶資訊，前端只看狀態碼

---

## 六、待確認事項清單（Open Issues）

Step 1 的 21 題已全數確認並反映於本文件各模組章節。附錄「回收矛盾清單」累計 4 項，已全數結案（第 4 項於 v1.6.1 結案，見 REQ-INCOME-006）。附錄「需求追溯矩陣」仍以 `test_conditions_v1_1.yaml`（78 條）計算，列出 38 個無 TC 覆蓋的 REQ；`test_conditions_v1_2.yaml` 登記既有測試後實際為 36 個，矩陣於下一個 docs PR 同步（見 `docs/spec-gaps.md` 第 11 節）。

v1.6 為原規格對話的最後一版。自 v1.6.1 起，SRS 由開發端規劃者依 `docs/spec-gaps.md` 在 docs PR 中維護。

---

## 七、Domain Glossary

| 術語（繁中）| 術語（英文／系統欄位）| 定義 |
|---|---|---|
| 行為時鐘 | behavior clock | 以消費日為準的時間軸，驅動週花費、計分、分類分析 |
| 現金時鐘 | cash clock | 以繳款日／結帳日為準的時間軸，驅動分期月付、本月應繳、現金流預估 |
| 週上限 | `weekly_targets.amount`（T）| 該週可花費的金額上限 |
| 週花費 | E | 該週扣除「獎勵」分類後的花費總和 |
| 週餘額 | R | T − E |
| 餘額率 | r | R ÷ T |
| 豐收加分 | bonus_score | r 達30%或50%門檻時的額外加分 |
| 連勝加乘 | streak_bonus | 連續存活週數帶來的額外加分 |
| 消費池 | consume_pool | 獎勵金分流之一，可用於一般消費，透過「獎勵」分類花費扣減 |
| 投資池 | invest_pool | 獎勵金分流之一，僅累加金額不扣減 |
| Boss獎勵 | boss_reward | 連續3個月A級以上解鎖的額外獎勵 |

> 依 sa-core 規則，新術語第一次出現時登錄於本表；不得在後續文件中使用未登錄術語。

---

## 附錄：需求追溯矩陣

v1.6 起改以 repo `docs/test_conditions_v1_1.yaml`（78條，53個唯一REQ，已含 HEALTH／AUTH-000／CORS／DOCS）為主要依據，加計本文件既有《測試條件 v1.3／v1.4／v1.5 補充》（8條，僅 REQ-CATEGORY-004／009／010／011，repo 尚未實作 Phase 3 分類自訂功能，故不在 repo YAML 內）；不再單獨依賴已被取代的《測試條件 v1.0》。合計86條TC，覆蓋56個唯一REQ。本文件共94個REQ（v1.5 的92個 ＋ v1.6 新增 REQ-NFR-009、REQ-NFR-010）。

| REQ 編號 | 所在章節 | 對應 TC 編號 |
|---|---|---|
| REQ-ACHIEVE-001 | 4.11 | TC-FUNC-ACHIEVE-002 |
| REQ-ACHIEVE-002 | 4.11 | TC-NEG-ACHIEVE-001 |
| REQ-ANALYSIS-001 | 4.12 | — |
| REQ-ANALYSIS-002 | 4.12 | — |
| REQ-ANALYSIS-003 | 4.12 | — |
| REQ-ANALYSIS-004 | 4.12 | TC-FUNC-ANALYSIS-001 |
| REQ-ANALYSIS-005 | 4.12 | — |
| REQ-ANALYSIS-006 | 4.12 | — |
| REQ-ANALYSIS-007 | 4.12 | TC-FUNC-ANALYSIS-002 |
| REQ-ANALYSIS-008 | 4.12 | TC-NEG-ANALYSIS-003 |
| REQ-AUTH-000 | 二、2.1 | TC-SEC-AUTH-000a、TC-SEC-AUTH-000b、TC-SEC-AUTH-000c、TC-SEC-AUTH-000d、TC-SEC-AUTH-000e |
| REQ-AUTH-001 | 二、2.1 | — |
| REQ-AUTH-002 | 二、2.2 | — |
| REQ-AUTH-003 | 二、2.2 | — |
| REQ-AUTH-004 | 二、2.2 | — |
| REQ-CARD-001 | 4.2 | — |
| REQ-CARD-002 | 4.2 | TC-EDGE-CARD-001、TC-EDGE-CARD-002、TC-NEG-CARD-003 |
| REQ-CARD-003 | 4.2 | TC-NEG-INSTALL-008 |
| REQ-CARD-004 | 4.2 | TC-FUNC-CARD-004 |
| REQ-CARD-005 | 4.2（另見4.4驗收條件） | TC-FUNC-CASHFLOW-003 |
| REQ-CARD-006 | 4.2 | TC-EDGE-INSTALL-004 |
| REQ-CASHFLOW-001 | 4.4 | — |
| REQ-CASHFLOW-002 | 4.4 | TC-PERF-CASHFLOW-004 |
| REQ-CASHFLOW-003 | 4.4 | — |
| REQ-CASHFLOW-004 | 4.4 | TC-EDGE-CASHFLOW-002 |
| REQ-CASHFLOW-005 | 4.4 | TC-FUNC-CASHFLOW-001 |
| REQ-CATEGORY-001 | 4.7 | — |
| REQ-CATEGORY-002 | 4.7 | TC-FUNC-CATEGORY-001 |
| REQ-CATEGORY-003 | 4.7 | TC-NEG-CATEGORY-002、TC-NEG-CATEGORY-003 |
| REQ-CATEGORY-004 | 4.7 | TC-FUNC-CATEGORY-004、TC-FUNC-CATEGORY-008、TC-NEG-CATEGORY-009、TC-EDGE-CATEGORY-010、TC-FUNC-CATEGORY-011 |
| REQ-CATEGORY-005 | 4.7 | — |
| REQ-CATEGORY-006 | 4.7 | TC-NEG-CATEGORY-006 |
| REQ-CATEGORY-007 | 4.7 | TC-FUNC-CATEGORY-005 |
| REQ-CATEGORY-008 | 4.7 | TC-FUNC-CATEGORY-007 |
| REQ-CATEGORY-009 | 4.7 | TC-FUNC-CATEGORY-012 |
| REQ-CATEGORY-010 | 4.7 | TC-NEG-CATEGORY-013、TC-NEG-CATEGORY-014 |
| REQ-CATEGORY-011 | 4.7 | TC-NEG-CATEGORY-015 |
| REQ-EXPENSE-001 | 4.5 | TC-NEG-EXPENSE-004、TC-FUNC-EXPENSE-005、TC-E2E-001 |
| REQ-EXPENSE-002 | 4.5 | — |
| REQ-EXPENSE-003 | 4.5 | TC-FUNC-EXPENSE-001 |
| REQ-EXPENSE-004 | 4.5 | TC-FUNC-EXPENSE-002 |
| REQ-EXPENSE-005 | 4.5 | TC-NEG-EXPENSE-006 |
| REQ-EXPENSE-006 | 4.5 | — |
| REQ-INCOME-001 | 4.1 | TC-NEG-INCOME-004 |
| REQ-INCOME-002 | 4.1 | TC-FUNC-INCOME-003 |
| REQ-INCOME-003 | 4.1 | — |
| REQ-INCOME-004 | 4.1 | TC-FUNC-INCOME-001 |
| REQ-INCOME-005 | 4.1 | — |
| REQ-INCOME-006 | 4.1 | TC-NEG-INSTALL-007 |
| REQ-INCOME-007 | 4.1 | — |
| REQ-INCOME-008 | 4.1 | TC-NEG-INCOME-002 |
| REQ-INSTALL-001 | 4.3 | — |
| REQ-INSTALL-002 | 4.3 | TC-EDGE-INSTALL-001、TC-EDGE-INSTALL-002、TC-EDGE-INSTALL-003、TC-FUNC-INSTALL-005 |
| REQ-INSTALL-003 | 4.3 | TC-NEG-INSTALL-006 |
| REQ-INSTALL-004 | 4.3 | — |
| REQ-INSTALL-005 | 4.3 | — |
| REQ-INSTALL-006 | 4.3 | — |
| REQ-INSTALL-007 | 4.3 | — |
| REQ-INSTALL-008 | 4.3 | — |
| REQ-INSTALL-009 | 4.3 | — |
| REQ-NFR-001 | 5.2 | — |
| REQ-NFR-002 | 5.2 | — |
| REQ-NFR-003 | 5.2 | TC-SEC-WEEK-004 |
| REQ-NFR-004 | 5.2 | TC-SEC-AUTH-002、TC-SEC-DOCS-001 |
| REQ-NFR-005 | 5.2 | TC-SEC-AUTH-001 |
| REQ-NFR-006 | 5.2 | — |
| REQ-NFR-007 | 5.2 | — |
| REQ-NFR-008 | 5.2 | TC-FUNC-HEALTH-001、TC-FUNC-HEALTH-002、TC-FUNC-HEALTH-003、TC-FUNC-HEALTH-004、TC-FUNC-HEALTH-005 |
| REQ-NFR-009 | 5.2 | TC-SEC-CORS-001、TC-SEC-CORS-002、TC-SEC-CORS-003 |
| REQ-NFR-010 | 5.2 | — |
| REQ-REWARD-001 | 4.10 | TC-FUNC-REWARD-001 |
| REQ-REWARD-002 | 4.10 | — |
| REQ-REWARD-003 | 4.10 | TC-FUNC-REWARD-002 |
| REQ-REWARD-004 | 4.10 | — |
| REQ-REWARD-005 | 4.10（另見4.9驗收條件） | TC-FUNC-REWARD-003 |
| REQ-REWARD-006 | 4.10 | TC-FUNC-REWARD-004 |
| REQ-SCORE-001 | 4.8 | — |
| REQ-SCORE-002 | 4.8 | — |
| REQ-SCORE-003 | 4.8 | TC-FUNC-SCORE-001 |
| REQ-SCORE-004 | 4.8 | — |
| REQ-SCORE-005 | 4.8 | TC-EDGE-SCORE-002 |
| REQ-SCORE-006 | 4.8 | TC-FUNC-SCORE-003、TC-EDGE-SCORE-004 |
| REQ-SCORE-007 | 4.8 | TC-FUNC-SCORE-005 |
| REQ-SCORE-008 | 4.8 | TC-EDGE-SCORE-006 |
| REQ-SETTLE-001 | 4.9 | TC-NEG-SETTLE-002、TC-FUNC-SETTLE-004、TC-FUNC-SETTLE-005 |
| REQ-SETTLE-002 | 4.9 | TC-NEG-SETTLE-001、TC-E2E-002 |
| REQ-SETTLE-003 | 4.9 | TC-FUNC-SETTLE-003 |
| REQ-UI-001 | 4.8、5.1 | TC-UI-WEEK-006、TC-UI-SCORE-007 |
| REQ-UI-002 | 5.1 | — |
| REQ-WEEK-001 | 4.6 | TC-EDGE-WEEK-001、TC-EDGE-WEEK-002 |
| REQ-WEEK-002 | 4.6 | TC-FUNC-WEEK-003 |
| REQ-WEEK-003 | 4.6 | — |
| REQ-WEEK-004 | 4.6 | TC-FUNC-WEEK-005 |
| REQ-WEEK-005 | 4.6 | TC-EDGE-EXPENSE-003 |

### 缺口 (a)：YAML／補充YAML 有引用、但本文件找不到對應規則的 REQ

無。repo `test_conditions_v1_1.yaml` 的53個REQ與三份補充YAML的3個REQ，全數在本文件找到對應。

### 缺口 (b)：本文件有規則、但目前所有 TC 來源（repo YAML＋三份補充YAML）都沒有覆蓋的 REQ

共 38 個，只列出，是否補測由 ABow 或開發端規劃者決定：

- **AUTH（4）**：001、002、003、004
- **INCOME（3）**：003、005、007
- **CARD（1）**：REQ-CARD-001
- **INSTALL（7）**：001、004、005、006、007、008、009
- **CASHFLOW（2）**：001、003
- **EXPENSE（2）**：002、006
- **WEEK（1）**：REQ-WEEK-003
- **CATEGORY（2）**：001、005
- **SCORE（3）**：001、002、004
- **REWARD（2）**：002、004
- **ANALYSIS（5）**：001、002、003、005、006
- **UI（1）**：REQ-UI-002
- **NFR（4，含v1.6新增的REQ-NFR-010）**：001、002、006、007、010
- （SETTLE、ACHIEVE 兩模組全數已被覆蓋，無缺口）

> 這38項比v1.5的37項多1個（REQ-NFR-010，本輪新增，repo尚未把8.1既有測試登記req欄）；其餘37項與v1.5完全相同。REQ-NFR-009 雖是v1.6新增REQ，但repo YAML已有對應TC（TC-SEC-CORS-001～003），不在此缺口清單。REQ-AUTH-000、REQ-CATEGORY-009/010/011 同樣有TC覆蓋，不在此清單——這點與v1.5的處理方式不同：v1.5時repo YAML還沒有AUTH-000的TC，本輪repo YAML已補上，故AUTH-000從「另外註記」轉為「正式列入矩陣」。

### 驗證結果

repo YAML與三份補充YAML合計引用的56個REQ，全數在本文件找到**唯一**對應的業務規則條文（一個REQ對應一條業務規則）。業務規則章節維持v1.2起的原則——一個REQ一條，不存在合併或拆分歧義；v1.6新增／改寫的REQ-AUTH-000、REQ-NFR-009、REQ-NFR-010、REQ-INCOME-002、REQ-EXPENSE-005、REQ-SETTLE-003、REQ-CARD-002等，同樣各自對應唯一一條業務規則陳述。

驗收條件章節維持v1.5既有的3處「一條驗收條件同時標記兩個REQ」（4.3 is_settled／is_cancelled、4.5 EXPENSE-002／005、4.9 SETTLE-001／REWARD-005），這些不影響TC端的唯一對應關係，說明同v1.5。

`docs/spec-gaps.md`（2026-09-23版）本身在小節1～8的彙整上未再發現類似v1.3時「41→40」的計數落差。

---

## 附錄：回收矛盾清單

### v1.3 回收項目（2 項，已於 v1.4 結案）

1. **REQ-CATEGORY-002 的「必要／彈性／想要」讀起來像封閉三值** — 結案：002 句尾加交互參照至 REQ-CATEGORY-009（值域）與 REQ-CATEGORY-010（可設定範圍），002 決策內容不變。
2. **1.5 Phase 1 驗收沒說用本機假資料還是 Railway 真實資料** — 結案：1.5 改為有條件寫法，並將 REQ-AUTH-000 明定為進入兩週真實記帳期的前置門檻。

### v1.4 回收項目（1 項，已於 v1.5 結案）

3. **獎勵類的 `necessity` 可否改離 `excluded`？** — 結案：新增 REQ-CATEGORY-011，獎勵一級分類的 `necessity` 鎖定為 `excluded`，不可修改為其他值；與 REQ-CATEGORY-010 形成雙向鎖定，並在 REQ-CATEGORY-002 補上交互參照。

### v1.6 新發現（1 項，已於 v1.6.1 結案）

4. **月薪為 `null` 時，REQ-INCOME-006／007 的公式怎麼算？**
   8.4 決定：任何月份都沒有月薪紀錄時，`GET /months/{yyyy-mm}/income` 回應 `salary`／`savings_target` 為 `null`，不是0。但 REQ-INCOME-006「月可支配 = 月薪 + 額外收入 − 固定支出 − 分期月付 − 儲蓄目標」的公式假設 `salary` 是數字；REQ-INCOME-007「週上限預設 = 月可支配 ÷ 該月週數」接在後面，若月可支配因 `salary=null` 而無法計算，週上限也跟著沒有定義。`spec-gaps.md` 8.4 只定義了 `/income` 端點本身的讀取行為，沒有交代這個 null 怎麼流進 Phase 2 的可支配金額計算——這不是文字對不齊，是兩條既有 REQ 之間真的缺一個銜接規則。**結案（v1.6.1，2026-09-24 ABow 決定）**：`salary` 為 `null` 時，月可支配與該月所有週的週上限預設皆為 `null`，不是 0；週上限為 `null` 的週不計分、不影響連勝；首頁與月曆以「請先設定月薪」取代剩餘額度與 HP。理由：當成 0 會讓每一週都「超支」、分數全部為負，等於懲罰使用者還沒完成設定；而沒有上限的週，計分本身沒有意義。`null` 只會在「從未設定過任何月份的月薪」時出現，有任何一個月的紀錄就會依 REQ-INCOME-002 往前沿用。已寫入 REQ-INCOME-006，Phase 2 實作。

4 項全數結案，無待確認項。

---

## 八、版本記錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-09-16 | 依 sa-core v1.9 規格書結構標準，將原《記帳生存遊戲 SRS v1.0》（純需求條文）重構為 SRS+FS 合一文件；新增資料庫設計、RBAC、畫面／API／權限三部分、Domain Glossary；取代原 v1.0 |
| v1.1 | 2026-09-16 | 依 sophia-sa D5 品質標準，第四章 12 個模組各補上「驗收條件」（輕量 checklist），修正 SRS+FS 缺少可測試驗收標準的缺口；業務規則與其餘章節內容不變 |
| v1.2 | 2026-09-16 | 修正 REQ 編號追溯鏈斷裂問題：第二章、第四章、第五章補回《SRS v1.0》原始 REQ 編號（業務規則改採 v1.0 原始逐條敘述，決策內容零變動）；新增附錄「需求追溯矩陣」，含缺口清單與驗證結果；取代原 v1.1 |
| v1.3 | 2026-09-21 | 回收 Phase 0 開發期間記錄於 `docs/spec-gaps.md` 的 40 項規格缺口：第三章 12 張資料表全數補上真實型別與 CHECK 約束（原「—」欄位、唯一約束、格式限制）；新增 REQ-AUTH-000（二、2.1，臨時 API 金鑰閘門，Phase 3 移除）；新增 REQ-NFR-008（五、5.2，健康檢查三端點）；REQ-CATEGORY-004 依 ABow 明確指示改寫為兩層可驗證規則（硬性擋下＋軟性提示），新增 REQ-CATEGORY-009（necessity 排除值）；需求追溯矩陣更新至90個REQ；新增《測試條件 v1.3 補充》YAML（5條，僅涵蓋 REQ-CATEGORY-004／009）；新增附錄「v1.3 回收矛盾清單」（2項待確認）。除 REQ-CATEGORY-004 外，其餘既有業務規則內容不動；取代原 v1.2 |
| v1.4 | 2026-09-22 | 處理 v1.3 回收矛盾清單 2 項：1.5 Phase 1 驗收改為有條件寫法並將 REQ-AUTH-000 定為兩週真實記帳期的前置門檻；REQ-CATEGORY-002 加交互參照。依 ABow 決定新增 REQ-CATEGORY-010（`excluded` 不開放給一般分類），同步更新 4.7 欄位規格表、API 例外、驗收條件、第三章 necessity 欄位備註；新增《測試條件 v1.4 補充》2 條；追溯矩陣更新至 91 個 REQ；矛盾清單新增 1 項待確認（獎勵類 necessity 鎖定）。其餘既有業務規則內容不動；取代原 v1.3 |
| v1.5 | 2026-09-22 | 結案回收矛盾清單第3項：新增 REQ-CATEGORY-011，獎勵一級分類 `necessity` 鎖定為 `excluded`、不可修改為其他值，與 REQ-CATEGORY-010 形成雙向鎖定；同步更新 4.7 業務規則、API 例外、驗收條件、REQ-CATEGORY-002 交互參照、第三章 necessity 欄位備註；新增《測試條件 v1.5 補充》1 條；追溯矩陣更新至 92 個 REQ；回收矛盾清單 3 項全數結案，無待確認項。其餘既有業務規則內容不動；取代原 v1.4 |
| v1.6 | 2026-09-24 | 回收 `docs/spec-gaps.md`（2026-09-23版）第5～8節。**修正**：REQ-AUTH-000 前端金鑰機制改寫（使用者輸入存localStorage，原建置期環境變數／GitHub Secrets作廢），補`/auth/me`端點、401格式、CORS預檢說明；四章開頭「否則回403」改「回404」（8.2，ABow明確指示）。**回收**：新增REQ-NFR-009（CORS）、REQ-NFR-010（統一錯誤格式）；REQ-INCOME-002、REQ-EXPENSE-005、REQ-SETTLE-003、REQ-CARD-002、REQ-WEEK-005補實作細節；4.1/4.2/4.5/4.7 API表與欄位規格表補齊8.3～8.10各項。**矩陣**：改以repo`test_conditions_v1_1.yaml`（78條）＋既有三份補充YAML為準重算，86條TC覆蓋56個REQ，94個REQ總數，38個缺口。**順帶修正**v1.5內部不一致：4.7狀態呈現／操作流程與REQ-CATEGORY-004的兩層檢查對齊。回收矛盾清單新增1項待確認（月薪null時可支配金額公式）。除第一類「修正」外，其餘既有業務規則內容不動；取代原v1.5。**本版為此規劃對話最後一版**，後續由開發端規劃者依repo的`docs/spec-gaps.md`維護 |
| v1.6.1 | 2026-09-24 | 開發端首次維護（repo PR，分支 `docs-srs-v1-6`）。勘誤 REQ-SETTLE-003（v1.6 宣稱已收斂但原文未改，改為「刪除該月 `reward_ledger` 紀錄」）；結案回收矛盾清單第 4 項（月薪 `null` 時可支配與週上限為 `null`、不計分，寫入 REQ-INCOME-006）；治理欄位待確認項同步為 0；同步第六章與開頭「取代」段的治理文字。業務規則除上述兩處外不動；取代原 v1.6 |
