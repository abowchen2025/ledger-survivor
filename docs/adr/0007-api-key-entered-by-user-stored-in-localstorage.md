# ADR-0007：REQ-AUTH-000 的金鑰由使用者輸入、存瀏覽器 localStorage，不在建置期嵌入

- 狀態：已採納（2026-09-23，ABow 決定）
- 關聯：`docs/spec-gaps.md` 第 5 節（REQ-AUTH-000）、第 7 節（REQ-NFR-009）；PR #3
- 有效期：Phase 3 導入 JWT（REQ-AUTH-001 起）後整套移除

## 背景

Phase 1～2 沒有正式認證，後端以臨時 API 金鑰閘門（REQ-AUTH-000）擋掉隨機掃描。前端要能帶 `X-API-Key`，金鑰必須存在瀏覽器某處。PR #3 第一版把金鑰做成建置期變數 `VITE_API_KEY`，由 GitHub Secret 注入 Pages 的 build。

問題：repo 與 Pages 都是 public。任何人可以照著 repo 找到 Pages 網址、打開 bundle、`grep X-API-Key`，直接拿到金鑰。這道閘門只擋得住「不看程式碼」的掃描器，而 build 產物本身就把金鑰公開了。

## 決策

1. **金鑰不進版控、不進 build 產物。** 只存在兩處：Railway Variables 的 `API_KEY`，與使用者瀏覽器的 `localStorage`（鍵 `ledger-survivor.api-key`）。
2. **設定頁提供金鑰欄位**（`frontend/src/components/ApiKeyForm.tsx`），輸入一次即存；可清除。設定頁的「後端連線」區塊立刻用新金鑰重新打 `GET /auth/me` 驗證。
3. **`frontend/src/api/client.ts` 從 `api-key.ts` 取金鑰**，優先順序：`localStorage` → 開發預設值 → 沒有。沒有時丟 `ApiKeyMissingError`，不送出請求。
4. **開發預設值 `VITE_DEV_API_KEY` 只在 dev build 生效**（`import.meta.env.DEV`），production build 一律忽略，即使建置環境設了也不會進產物。`deploy-frontend.yml` 建完後再 grep 一次 `dist/`，出現金鑰或變數名就失敗。
5. **其他頁面呼叫 API 遇到金鑰缺少或 401 時導向設定頁**（`frontend/src/api/auth-guard.ts` 的 `useAuthFailureRedirect`），設定頁依導向原因顯示提示。
6. 移除 `VITE_API_KEY` 與 `deploy-frontend.yml` 的對應 Secret 注入；`VITE_API_BASE_URL` 保留為建置期變數（網址不是機密）。

## 取捨

| | 建置期嵌入（第一版） | 使用者輸入 + localStorage（採納） |
|---|---|---|
| 金鑰曝光面 | public bundle，任何人可讀 | 只有 Railway Variables 與使用者自己的瀏覽器 |
| 擋得住什麼 | 只擋不看程式碼的隨機掃描 | 擋隨機掃描與「照 repo 找到 Pages 再讀 bundle」的人；不擋針對性攻擊（例如裝置被拿走） |
| 使用成本 | 零 | 每個裝置第一次要輸入一次；清站台資料後要再輸入 |
| CI/CD | 多一個 Secret，兩邊要同步 | 少一個 Secret；Railway 改金鑰後使用者要重新輸入 |
| 單人專案適用性 | — | 可接受：只有一個使用者、兩三個裝置 |

`localStorage` 對同源 JavaScript 可讀，XSS 可以偷走金鑰；但本專案前端沒有第三方腳本、沒有使用者產生的 HTML，且金鑰能做的事與 Phase 1～2 的資料價值相稱。這個風險在 Phase 3 由短效 JWT 與 refresh token 取代時一起解掉。

## 後果

- 部署後第一次開 Pages，設定頁會顯示「尚未設定」，輸入 Railway 上的 `API_KEY` 後才能用。
- 換金鑰的流程：Railway Variables 改值並 Deploy → 每個裝置在設定頁重新輸入。
- `frontend/.env.example` 的 `VITE_DEV_API_KEY` 與後端 `.env.example` 的 `API_KEY` 保持同值，本機 `npm run dev` 不用手動輸入。
- Phase 3 移除清單：`api-key.ts`、`ApiKeyForm.tsx`、`auth-guard.ts` 的金鑰分支、`client.ts` 的 `X-API-Key`、後端 `security.py` 與 `protected.py` 的 dependency、`API_KEY` 環境變數、TC-SEC-AUTH-000a～e。
