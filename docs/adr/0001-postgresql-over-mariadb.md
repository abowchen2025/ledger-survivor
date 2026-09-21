# ADR-0001：選用 PostgreSQL 16 而非 MariaDB

- 狀態：已採納
- 日期：2026-09-16
- 來源：架構描述 v2.2 第 2.3 節

## 背景

後端部署在 Railway，資料庫需要可靠的日期／ISO 週運算、半結構化資料（成就、獎勵設定）與日後加入 AI 功能的空間。候選為 PostgreSQL 與 MariaDB。

## 決策

採用 PostgreSQL 16。本機以 `docker compose up -d db` 啟動，不以 SQLite 替代；連線字串為 `postgresql+psycopg://`。

## 理由

1. Railway 對 PostgreSQL 有零設定原生模板與備份；MariaDB 需走社群模板自理。
2. 日期與 ISO 週函式完整，與本系統「週歸屬」核心規則相合。
3. JSONB 適合存成就與獎勵設定。
4. pgvector 讓 Phase 5 加入 AI 功能時不必另接向量資料庫。

## 代價

團隊對 PostgreSQL 的熟悉度較低，是唯一明確的成本。

## 影響

- Alembic migration 與 SQLAlchemy 型別以 PostgreSQL 方言為準（`NUMERIC`、`DATE`、`TIMESTAMPTZ`）。
- 測試與 CI 必須連真實 PostgreSQL，不允許以 SQLite 跑測試。
