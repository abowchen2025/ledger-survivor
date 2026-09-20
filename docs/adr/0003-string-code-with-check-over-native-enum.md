# ADR-0003：列舉欄位用字串 + CHECK，不用 PostgreSQL 原生 ENUM

- 狀態：已採納
- 日期：2026-09-20
- 適用欄位：`category_groups.necessity`、`expenses.payment_method`、`reward_ledger.grade`，以及日後所有列舉型欄位

## 背景

SRS+FS 第三章對 `necessity` 等欄位只寫「enum」，沒有指定資料庫型別。PostgreSQL 有原生 `CREATE TYPE ... AS ENUM`，也可以用 `VARCHAR` 加 `CHECK (col IN (...))` 達到同樣的資料完整性。

## 決策

一律用 `VARCHAR(n)` + 具名 `CHECK` 約束（例：`ck_category_groups_necessity`）。允許值定義在 model 模組常數（`NECESSITY_VALUES` 等），migration 與 model 的 CHECK 表達式須同名同內容。

## 理由

1. 原生 ENUM 增加值要 `ALTER TYPE ... ADD VALUE`，且在 PostgreSQL 中**無法刪除值**、無法在交易內新增後立即使用；字串 + CHECK 只要改一條約束（drop + add），可正常放進交易。
2. 本專案列舉值可預期會變（本輪就把 `necessity` 從 3 值擴成 4 值），維護成本是主要考量。
3. SQLAlchemy 的 `Enum` 型別對 PostgreSQL 原生 ENUM 的 autogenerate 支援不完整，容易產生漏掉 `CREATE TYPE` 的 migration。
4. 應用層以 Pydantic `Literal` 校驗，DB 層 CHECK 只是最後防線，不需要 ENUM 帶來的型別安全。

## 代價

- 儲存空間略大（字串 vs 4 bytes），本專案資料量下可忽略。
- 值的清單存在兩處（model 常數與 migration），靠測試比對 metadata 與資料庫實際約束來防漂移。

## 影響

- 新增列舉欄位時依此模式，並更新 `docs/spec-gaps.md` 讓 SRS 補上允許值清單。
