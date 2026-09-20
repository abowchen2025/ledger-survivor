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

小節編號對應 2026-09-20 回覆的第 1～4 點。
