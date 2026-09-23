/**
 * API 金鑰的來源與存放（REQ-AUTH-000；決策見 docs/adr/0007）。
 *
 * 金鑰不進版控、不進 build 產物：由使用者在設定頁輸入一次，存瀏覽器 localStorage。
 * 優先順序：localStorage → 開發預設值（只在 dev build，來自 frontend/.env 的 VITE_DEV_API_KEY）→ 沒有。
 * production build 一律忽略開發預設值，即使建置環境有設。
 *
 * 注意：不要在任何地方把整個 `import.meta.env` 當值傳遞或當預設參數。Vite 會把它換成含所有 VITE_* 的
 * 物件字面值，金鑰就會進產物。這裡只在一個常數裡以 `import.meta.env.DEV ? ... : ""` 引用，
 * production build 時 `DEV` 是字面值 false，minifier 會把整個分支連同金鑰字串一起丟掉；
 * deploy-frontend.yml 用哨兵值建置後 grep dist 再驗一次。
 *
 * localStorage 在私密視窗、封鎖站台資料時可能不存在或丟例外，所有讀寫都包 try/catch，讀不到就當沒有。
 * Phase 3 換 JWT 後整個檔案移除。
 */

export const API_KEY_STORAGE_KEY = "ledger-survivor.api-key";

/** localStorage 的最小介面，測試可注入記憶體版。 */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ApiKeySource = "stored" | "dev-default" | "none";

export interface ResolvedApiKey {
  key: string;
  source: ApiKeySource;
}

/** 測試注入用；正式程式碼不傳，走下方常數。 */
export interface KeyEnv {
  DEV: boolean;
  VITE_DEV_API_KEY?: string;
}

// 唯一引用 VITE_DEV_API_KEY 的地方。production build：DEV 為 false → 常數為 ""，字串不進產物。
const DEV_DEFAULT_API_KEY: string = import.meta.env.DEV ? (import.meta.env.VITE_DEV_API_KEY ?? "") : "";

function browserStorage(): KeyStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readStoredApiKey(storage: KeyStorage | null = browserStorage()): string {
  try {
    return storage?.getItem(API_KEY_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** 存入前 trim；空字串等同清除。回傳是否真的寫進去（storage 不可用時 false）。 */
export function saveApiKey(key: string, storage: KeyStorage | null = browserStorage()): boolean {
  const trimmed = key.trim();
  if (!trimmed) return clearApiKey(storage);
  try {
    storage?.setItem(API_KEY_STORAGE_KEY, trimmed);
    return storage !== null;
  } catch {
    return false;
  }
}

export function clearApiKey(storage: KeyStorage | null = browserStorage()): boolean {
  try {
    storage?.removeItem(API_KEY_STORAGE_KEY);
    return storage !== null;
  } catch {
    return false;
  }
}

/** 開發預設值：只有 dev build 才看得到，production 一律空字串。 */
export function devDefaultApiKey(env?: KeyEnv): string {
  if (env) return env.DEV ? (env.VITE_DEV_API_KEY ?? "").trim() : "";
  return DEV_DEFAULT_API_KEY.trim();
}

export function resolveApiKey(storage: KeyStorage | null = browserStorage(), env?: KeyEnv): ResolvedApiKey {
  const stored = readStoredApiKey(storage);
  if (stored) return { key: stored, source: "stored" };
  const dev = devDefaultApiKey(env);
  if (dev) return { key: dev, source: "dev-default" };
  return { key: "", source: "none" };
}
