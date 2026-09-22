import { useEffect, useState } from "react";

import { getMe } from "@/api/auth";
import { ApiError, getApiConfig } from "@/api/client";

type Status =
  | { kind: "loading" }
  | { kind: "ok"; userId: number }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string };

function describe(err: unknown): Status {
  if (err instanceof ApiError) {
    return err.status === 401 ? { kind: "unauthorized" } : { kind: "error", message: `HTTP ${err.status}` };
  }
  // fetch 的網路錯誤（含 CORS 預檢被擋）是 TypeError: Failed to fetch，瀏覽器不告訴頁面原因，細節看 devtools Network
  return { kind: "error", message: err instanceof Error ? err.message : String(err) };
}

/**
 * 後端連線狀態（設定頁）：打受 REQ-AUTH-000 保護的 GET /auth/me，
 * 同時驗證 base URL、X-API-Key 與 CORS 預檢三件事都通。
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  let baseUrl = "（未設定）";
  try {
    baseUrl = getApiConfig().baseUrl;
  } catch {
    // 交給 getMe 丟錯後顯示
  }

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => !cancelled && setStatus({ kind: "ok", userId: me.user_id }))
      .catch((err: unknown) => !cancelled && setStatus(describe(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-6 rounded-lg border p-4 text-sm">
      <h3 className="font-semibold">後端連線</h3>
      <p className="mt-1 break-all text-muted-foreground">{baseUrl}</p>
      <p className="mt-2" data-testid="api-status">
        {status.kind === "loading" && "連線中…"}
        {status.kind === "ok" && `正常（user_id=${status.userId}）`}
        {status.kind === "unauthorized" && "金鑰不符（401）：檢查 VITE_API_KEY 與後端 API_KEY"}
        {status.kind === "error" && `連不上：${status.message}`}
      </p>
    </section>
  );
}
