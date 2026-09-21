# ADR-0006：雲端 migration 由 Railway pre-deploy step 執行；健康檢查拆成 liveness／readiness

- 狀態：已採納（2026-09-21 ABow 決定）
- 日期：2026-09-21
- 來源：架構描述 v2.2 第 9 節（Phase 0 驗收「Railway `/health` 回 200」）、REQ-NFR-006；新增 REQ-NFR-008（`docs/spec-gaps.md` 第 6 節）

## 背景

Railway 首次部署後 `/api/v1/health` 回 200，但資料庫沒有任何表：migration 從未執行。本機的 `alembic upgrade head` 一直是手動跑的，「部署流程會自動跑 migration」這件事從未被驗證過（教訓：凡是本機靠手動指令完成的步驟，都要問一次「雲端由誰執行」）。

原本的設計是 `backend/railway.json` 的 `startCommand: "alembic upgrade head && uvicorn ..."`。它沒有生效，原因不是寫錯：Railway 的 **Config as Code 已棄用**，服務頁顯示「Config as Code is deprecated. Existing config files keep working until 2026-12-01. Starting 2026-08-28, services that have never used Config as Code cannot opt in.」本服務 2026-09-21 建立、從未用過 config-as-code，所以 `railway.json` 永遠不會被讀取。

## 決策 1：migration 在 Railway 的 pre-deploy step 執行，設定在 Railway UI

三個方案的比較：

| | 1. 併進容器啟動指令 | **2. pre-deploy step（採用）** | 3. GitHub Actions 對 Railway DB 執行 |
|---|---|---|---|
| 執行次數 | 每個容器啟動、每個 replica、每次重啟都跑 | 每次部署跑一次，在同一份映像的獨立一次性容器 | 每次 deploy job 跑一次 |
| 失敗時 | 新容器起不來、healthcheck 失敗，舊版繼續服務 | 部署直接失敗，新容器不啟動，舊版繼續服務 | job 失敗，映像不部署 |
| 多 replica | 多個 alembic 同時跑，沒有鎖，可能互撞 | 無此問題 | 無此問題 |
| 需要的東西 | 啟動指令（本服務只能在 UI 設） | UI 的 Pre-deploy Command | Railway DB 開 TCP proxy 對公網、DB 連線字串複製到 GitHub Secrets、runner 裝 uv |
| 額外風險 | 無 | 舊版程式短暫跑在新 schema 上（見紀律） | DB 憑證多一份在 GitHub、DB 對公網開口、migration 與映像部署分兩處靠 workflow 順序保證 |

選 2 的理由：migration 應該只跑一次而不是每個 replica 重啟都跑；失敗時不該讓舊版下線。不選 1：它就是「應該有效卻沒生效」的那個，而且開 replica 後會互撞。不選 3：為了跑 migration 把資料庫開到公網並多放一份憑證，增加攻擊面，不值得。

**紀律**：pre-deploy 在舊版仍在服務時執行，所以每一版 migration 必須與前一版程式相容（expand／contract）：只加不減；改欄位分兩版，先加新欄位、下一版才刪舊欄位；不得在單一版本內 rename。Phase 1～2 的 migration 都是加表加欄位，符合。

**設定位置**：Railway UI → `backend` 服務 → Settings → Deploy → Pre-deploy Command `alembic upgrade head`；`backend/railway.json` 已刪除，Dockerfile 的 `CMD` 只起 uvicorn，是唯一的啟動來源。

## 決策 2：健康檢查拆成三個端點，Railway healthcheck 指向 readiness

| 端點 | 行為 | 用途 |
|---|---|---|
| `GET /api/v1/health` | 固定 200 `{"status":"ok"}` | 維持現狀，既有測試與文件指向它 |
| `GET /api/v1/health/live` | 固定 200 `{"status":"ok"}`，不查任何依賴 | liveness |
| `GET /api/v1/health/ready` | 連 DB + 比對 `alembic_version` == 程式碼 head；任一不符回 503 `{"status":"degraded","checks":{...}}` | readiness；**Railway Healthcheck Path 指向這裡** |

拆開的理由：DB 短暫斷線時 liveness 不該讓容器被判定為死而重啟，重啟解決不了 DB 的問題，只會讓服務更不穩；readiness 則要在「服務活著但 migration 沒跑」時讓部署直接失敗，而不是靜靜上線。readiness 的回應不含連線字串、主機或例外文字（REQ-NFR-004 的精神），細節寫 log。

## 風險：部署設定無法版控

因為 config-as-code 對本服務不可用，**啟動指令、pre-deploy command、healthcheck path、網域 target port 都只存在於 Railway UI**，git 裡沒有這些設定。已知的緩解：

- `docs/deployment-setup.md` 開頭維護「Railway UI 必要設定清單」，每一項寫明位置與值，服務重建時照著還原；改任何一項都要同步改該清單。
- `Dockerfile` cache mount 的 id 綁 Railway service id，服務重建時也要改。
- 若 Railway 日後提供新的設定即程式碼機制，再評估搬回檔案；在那之前**不要把設定寫回 `railway.json`**，它不會被讀。

## 影響

- `backend/app/services/health.py`、`routers/health.py`、`schemas/health.py`；測試 `tests/api/test_health.py`（TC-FUNC-HEALTH-001～005）。
- `backend/app/database.py` 的 engine 加 `connect_timeout=5`：DB 連不上時 readiness 5 秒內回 503，不會卡到 Railway healthcheck 逾時（Windows 上實測沒有它會等 2 分鐘）。
- `deploy-backend.yml` 不變，仍由 `railway up` 推映像；migration 由 Railway 在切流量前執行。
