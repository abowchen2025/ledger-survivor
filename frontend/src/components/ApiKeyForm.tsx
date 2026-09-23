import { type FormEvent, useState } from "react";

import { type ApiKeySource, clearApiKey, resolveApiKey, saveApiKey } from "@/api/api-key";

interface Props {
  /** 存檔或清除後呼叫，讓連線狀態重新檢查 */
  onChange: () => void;
  /** 從其他頁面被導過來的原因（見 api/auth-guard.ts） */
  reason?: "api-key-missing" | "api-key-rejected";
}

const SOURCE_LABEL: Record<ApiKeySource, string> = {
  stored: "已儲存在這個瀏覽器",
  "dev-default": "使用開發預設值（frontend/.env 的 VITE_DEV_API_KEY，只在本機 dev 有效）",
  none: "尚未設定",
};

/**
 * API 金鑰輸入（REQ-AUTH-000，docs/adr/0007）：使用者輸入一次、存 localStorage，不進版控與 build 產物。
 * 換裝置要重新輸入一次。
 */
export function ApiKeyForm({ onChange, reason }: Props) {
  const [source, setSource] = useState<ApiKeySource>(() => resolveApiKey().source);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => {
    setSource(resolveApiKey().source);
    onChange();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const ok = saveApiKey(draft);
    setNotice(ok ? "已儲存，重新檢查連線…" : "這個瀏覽器無法存放資料（私密視窗或已封鎖站台資料），金鑰只在本次頁面有效");
    setDraft("");
    refresh();
  };

  const clear = () => {
    clearApiKey();
    setNotice("已清除");
    refresh();
  };

  return (
    <section className="mt-6 rounded-lg border p-4 text-sm">
      <h3 className="font-semibold">API 金鑰</h3>
      {reason === "api-key-missing" && <p className="mt-1 text-destructive">尚未設定金鑰，輸入後才能使用其他頁面。</p>}
      {reason === "api-key-rejected" && <p className="mt-1 text-destructive">後端拒絕了目前的金鑰（401），請重新輸入。</p>}
      <p className="mt-1 text-muted-foreground" data-testid="api-key-source">
        {SOURCE_LABEL[source]}
      </p>
      <form className="mt-3 flex flex-col gap-2" onSubmit={submit}>
        <label className="flex flex-col gap-1">
          <span>金鑰（與 Railway 的 API_KEY 相同）</span>
          <input
            type="password"
            autoComplete="off"
            className="rounded-md border bg-background px-3 py-2"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={source === "none" ? "貼上金鑰" : "輸入新金鑰以取代"}
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" disabled={!draft.trim()}>
            儲存
          </button>
          {source === "stored" && (
            <button type="button" className="rounded-md border px-3 py-2" onClick={clear}>
              清除
            </button>
          )}
        </div>
      </form>
      {notice && <p className="mt-2 text-muted-foreground">{notice}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        金鑰只存在這個瀏覽器的 localStorage 與 Railway Variables，不進版控、不在前端產物裡。換裝置要再輸入一次。
      </p>
    </section>
  );
}
