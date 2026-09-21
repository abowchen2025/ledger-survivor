# ADR-0005：前後端 week_rule 一致性以「比對兩端輸出」驗證，不以「各自對答案」驗證

- 狀態：已採納
- 日期：2026-09-21
- 來源：SRS+FS v1.2 REQ-NFR-003；測試條件 TC-SEC-WEEK-004；ADR-0002

## 背景

週歸屬規則在後端（`backend/app/services/week_rule.py`，Python）與前端（`frontend/src/lib/week.ts`，TypeScript）各有一份實作。REQ-NFR-003 要求兩端讀同一份 fixture，任一端不一致不可合併。

「兩邊各自跟 fixture 的答案欄位比對」只證明兩邊都會對答案，不證明實作等價：fixture 沒覆蓋到的欄位或案例，兩邊可以同時對答案卻互相不同。TC-SEC-WEEK-004 的 `expected` 寫的是「兩端輸出結果逐筆比對」，必須真的拿到兩端的輸出。

## 決策

1. 前端提供 `npm run week:dump`（`frontend/scripts/week-dump.ts`，以 tsx 直接執行 TypeScript）：讀 fixture 每筆案例的 `date` 作輸入，用 `week.ts` 算出全部欄位（含 `week_range` 七天），以後端的 snake_case 鍵名輸出 JSON 到 stdout，並附上實際讀到的 fixture 絕對路徑與 sha256。
2. 後端 `backend/tests/integration/test_week_rule_consistency.py::test_frontend_backend_same_fixture` 用 subprocess 呼叫上述指令，再用 Python `week_rule` 對同一批輸入計算，逐筆逐欄位比對兩端輸出。這個測試不讀 fixture 的答案欄位。
3. 同一個測試同時驗證前端讀的是後端那一份檔案：`realpath` 相同且 sha256 相同。前端不得複製 fixture。
4. 測試標記 `p0` 與 `integration`。缺 Node.js 或 `frontend/node_modules` 時直接失敗並說明原因，不 skip。
5. CI 的 `consistency` job 同時安裝 Node 與 uv 後執行 `pytest tests/integration`；`backend` job 以 `-m "not integration"` 排除它。`deploy-backend.yml` 部署前跑完整 pytest（含此測試）。

## 為什麼不是其他做法

- **node 執行編譯後的 week.js**：需要多一道 build 步驟與產物管理；tsx 直接執行 `.ts` 更簡單，且與 vitest 用同一份原始碼。
- **HTTP 端點讓前端呼叫後端比對**：把純函式測試綁到伺服器與網路，且方向相反（應該是後端測試取得前端輸出）。
- **fixture 放共用目錄由兩端各自複製**：違反 REQ-NFR-003「同一份」的字面要求，也會出現兩份不同步。

## 驗證（2026-09-21 本機）

- 正常：`1 passed`。
- 突變一（`THURSDAY` 改 5）：前端 dump 拋出例外，測試失敗並印出 stderr。
- 突變二（`weekEnd` 少一天）：測試失敗並逐筆列出 `week_end: frontend='2026-10-03' backend='2026-10-04'`。

## 影響

- 後端測試環境需要 Node.js 22 與 `frontend/node_modules`（本機先 `npm ci`）。
- 前端 `week.ts` 新增公開函式時，`week-dump.ts` 與後端測試的 `COMPARED_FIELDS` 要同步加欄位。
