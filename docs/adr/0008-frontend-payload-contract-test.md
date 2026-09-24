# ADR-0008：前端實際產生的 payload 以後端 Pydantic schema 驗證（契約測試），payload 逐欄位組裝

- 狀態：已採納
- 日期：2026-09-24
- 來源：2026-09-24 Pages 新增信用卡 400（`fields.is_active: 不允許的欄位`）；ADR-0005 的做法延伸；`schemas/common.py::RequestModel` 的 `extra="forbid"`

## 背景

PR #5 合併後在 Pages 新增信用卡失敗。前端 `CardForm` 把整包表單狀態展開送出，多帶了 `CardCreate` 沒有的 `is_active`；後端 `RequestModel` 的 `extra="forbid"` 正確地回 400。三道防線都沒抓到：

- TypeScript 展開物件字面值時不做多餘屬性檢查，`{ ...base, opening_* }` 通得過 `CardCreate & CardUpdate` 的交集型別。
- 前端元件測試以 mock 注入 `onSubmit`，只看得到「前端組出的物件」，看不到後端 schema。
- 上一輪的煙測用手寫 payload 打後端，驗的不是前端真正送出的東西。

連帶問題：錯誤欄位 `is_active` 在畫面上沒有輸入框，表單把它靜默吞掉，使用者只看到什麼都沒發生；畫面顯示的預設顏色 `#FF8800` 是 placeholder，實際送 `null`。

`extra="forbid"` 不放寬：它抓到的正是前端送錯資料；改成靜默忽略，下一次錯的欄位就不會被發現。要修的是前端，並補一道「前端實際 payload × 後端真正 schema」的測試。

## 決策

1. **payload 只在純函式模組組裝**：`frontend/src/lib/card-payload.ts`、`frontend/src/lib/expense-payload.ts`。`parseXxxForm(values)` 做前端檢核（文案同 SRS）並轉成 API 型別；`cardCreatePayload`／`cardUpdatePayload`／`cardUpdateFromCard`／`expenseCreatePayload`／`expenseUpdatePayload` 逐欄位對應 `schema.d.ts` 的 Create／Update 型別回傳物件字面值，不展開狀態物件。這些模組不 import React、不碰 `import.meta.env`，可在 Node 直接執行。
2. **表單的 `onSubmit` 依 mode 分型別**：`CardForm`／`QuickEntryForm` 的 props 是 discriminated union，`mode="create"` 只會拿到 `CardCreate`／`ExpenseCreate`，`mode="edit"` 只會拿到 `CardUpdate`／`ExpenseUpdate`；`CardCreate & CardUpdate` 這種「兩邊都不接受」的交集型別不再存在。
3. **契約測試**（比照 ADR-0005）：前端 `npm run payload:dump`（`frontend/scripts/payload-dump.ts`）只能呼叫上述組裝函式，對代表性表單狀態（輸入框裡的字串）產生 payload，每筆帶 `schema`（後端 Pydantic 類別名）與 `scenario`；後端 `tests/integration/test_frontend_payload_contract.py` 以 subprocess 取得輸出，逐筆 `model_validate`，任一筆被拒即失敗並列出 case id、pydantic 錯誤與 payload。另兩個測試檢查情境涵蓋面（卡片新增／編輯／停用／啟用、花費新增現金／信用卡／行動支付／轉帳／退款／編輯）與「新增卡片不得含 `is_active`」。標記 `p0`、`integration`，缺 Node 直接失敗不 skip。CI 的 `consistency` job（`pytest tests/integration`）自動涵蓋；`deploy-backend.yml` 部署前的完整 pytest 也跑。
4. **錯誤處理**：送出狀態一律在 `finally` 重設；`api/errors.ts::splitFieldErrors` 把 `error.fields` 分成畫面上有輸入框的（放欄位下方）與沒有的（併進表單頂部整體訊息，格式 `資料格式有誤（欄位名：訊息；…）`），不靜默吞掉。
5. **顏色**：畫面顯示什麼就送什麼。新增預設值就是 `#FF8800` 的實際值；按「清除」後顯示「未設定」並送 `null`；沒有 placeholder。
6. 新增業務表單（收入設定、分期…）時：payload 組裝函式進 `lib/`、`payload-dump.ts` 加 case、後端測試的 `SCHEMAS` 與 `REQUIRED_SCENARIOS` 登記。

## 為什麼不是其他做法

- **放寬 `extra="forbid"` 為 `ignore`**：把契約錯誤變成靜默資料遺失；下一次多送的若是打錯字的正確欄位名（例如 `colour`），後端就會默默存 null。
- **只靠 TypeScript 型別**：展開物件不檢查多餘屬性，是這次漏掉的直接原因；即使改成逐欄位字面值，型別也只反映 `schema.d.ts` 產生當下的 OpenAPI，不是後端執行時的行為（Pydantic 的 pattern、ge、Literal 都在型別之外）。
- **前端測試打真後端**：需要 DB 與伺服器，且驗的是整條路徑而非形狀；Pydantic `model_validate` 直接讀 schema，秒級、無環境依賴（除了 Node）。
- **以 OpenAPI JSON Schema 在前端驗**：多一套 JSON Schema 驗證器與 OpenAPI 抽取流程，且 `extra_forbidden` 對應 `additionalProperties: false` 是否被 FastAPI 輸出並不保證。

## 驗證（2026-09-24 本機）

- 正常：`3 passed`（15 筆 case）。
- 突變（`cardCreatePayload` 加回 `is_active: true`）：`2 failed, 1 passed`，逐筆列出 `card_create_* → CardCreate: is_active: extra_forbidden (Extra inputs are not permitted)` 與完整 payload；還原後回到 `3 passed`。

## 影響

- 後端測試環境需要 Node.js 22 與 `frontend/node_modules`（與 ADR-0005 相同）。
- 表單元件不再自行拼 payload；`components/` 內出現 `{ ...values, ... }` 直接當 payload 送出即為違規。
