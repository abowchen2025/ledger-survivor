#!/usr/bin/env bash
# `railway up` 加重試，只針對「上傳階段的網路錯誤」（2026-09-23 Deploy backend #9 的失敗型態）。
#
# 為什麼不是無條件重試：建置失敗、Dockerfile 驗證失敗、pre-deploy migration 失敗重試也不會好，
# 只會把真正的錯誤藏在三份重複的 log 裡。判斷方式：
#   1. railway up 上傳成功後會先印「  Deployment: https://railway.com/...」，之後才串流建置 log。
#      只要 log 裡出現 Deployment:，代表上傳已被 Railway 接受，之後的失敗都是建置／部署問題 → 不重試。
#   2. 沒有 Deployment: 且 log 命中 CLI 的網路錯誤字樣（reqwest：error sending request、operation timed out、
#      connection reset／refused、dns error、tls…）→ 重試，最多 3 次，間隔 10、30 秒。
#   3. 其他情況（判斷不了）→ 不重試，直接以原 exit code 失敗。
# 每次嘗試的輸出都完整保留在 job log（各自一個 ::group::），並存到 $RUNNER_TEMP/railway-up-attempt-N.log。
#
# 已知副作用：若第一次其實上傳成功、只是回應在 CLI 印出 Deployment: 之前就逾時，重試會產生第二筆
# 相同程式碼的部署。無害（同一個 commit），但 Railway 的 Deployments 頁會多一筆。
#
# 需要的環境變數：RAILWAY_TOKEN（secret）、RAILWAY_SERVICE（服務名稱，預設 backend）。
set -uo pipefail

SERVICE="${RAILWAY_SERVICE:-backend}"
MAX_ATTEMPTS=3
DELAYS=(10 30)
TMP="${RUNNER_TEMP:-/tmp}"
NETWORK_PATTERN='error sending request|operation timed out|timed out|connection reset|connection refused|connection closed|dns error|failed to lookup address|tls handshake|handshake failure|temporary failure in name resolution|network unreachable|unexpected eof|broken pipe'

rc=1
for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
  log="$TMP/railway-up-attempt-$attempt.log"
  echo "::group::railway up --service $SERVICE --ci (attempt $attempt/$MAX_ATTEMPTS)"
  railway up --service "$SERVICE" --ci 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  echo "::endgroup::"

  if [[ $rc -eq 0 ]]; then
    echo "railway up succeeded on attempt $attempt"
    exit 0
  fi

  if grep -q "Deployment:" "$log"; then
    echo "::error::railway up failed after the upload was accepted (exit $rc): build/deploy error, not retrying. See attempt $attempt output above."
    exit "$rc"
  fi

  if ! grep -qiE "$NETWORK_PATTERN" "$log"; then
    echo "::error::railway up failed (exit $rc) with an error this script cannot classify as network-related; not retrying. See attempt $attempt output above."
    exit "$rc"
  fi

  if (( attempt < MAX_ATTEMPTS )); then
    delay=${DELAYS[$((attempt - 1))]}
    echo "::warning::railway up attempt $attempt hit a network error before the upload was accepted (exit $rc); retrying in ${delay}s"
    sleep "$delay"
  fi
done

echo "::error::railway up failed $MAX_ATTEMPTS times with network errors (last exit $rc). Attempt logs: $TMP/railway-up-attempt-*.log (also printed above)."
exit "$rc"
