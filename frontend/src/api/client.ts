/**
 * 後端呼叫的唯一入口：所有對 /api/v1 的請求都經過 apiFetch，統一帶入
 * - base URL（VITE_API_BASE_URL，只到 host[:port]，建置期變數）
 * - X-API-Key 標頭（REQ-AUTH-000 臨時金鑰；值來自 api-key.ts：使用者在設定頁輸入、存 localStorage，
 *   不進版控與 build 產物；Phase 3 換 JWT 時只改這裡與 api-key.ts）
 *
 * 路徑型別來自 openapi-typescript 產生的 schema.d.ts（npm run gen:api），寫錯路徑會在編譯期被抓到。
 * 不要在頁面或 store 直接呼叫 fetch。
 */
import { type ApiKeySource, type KeyEnv, type KeyStorage, resolveApiKey } from "./api-key";
import type { paths } from "./schema";

export const API_KEY_HEADER = "X-API-Key";

/** schema.d.ts 裡的所有路徑，例如 "/api/v1/auth/me"（已含 /api/v1 前綴）。 */
export type ApiPath = keyof paths;

export interface ApiConfig {
  /** 不含結尾斜線 */
  baseUrl: string;
  apiKey: string;
  apiKeySource: ApiKeySource;
}

/** 測試注入用。正式程式碼不傳，直接讀 import.meta.env 的單一欄位（不要傳整個 import.meta.env，見 api-key.ts 說明）。 */
export interface BaseUrlEnv {
  VITE_API_BASE_URL: string;
}

/** 尚未設定金鑰（localStorage 沒有、也沒有開發預設值）。頁面接到這個要導向設定頁。 */
export class ApiKeyMissingError extends Error {
  constructor() {
    super("尚未設定 API 金鑰：到「設定」頁輸入");
    this.name = "ApiKeyMissingError";
  }
}

/** 讀建置期的 base URL；缺少就立刻丟錯，不要讓請求默默打到錯的位址。 */
export function getApiBaseUrl(env?: BaseUrlEnv): string {
  const raw = env ? env.VITE_API_BASE_URL : import.meta.env.VITE_API_BASE_URL;
  const baseUrl = (raw ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("VITE_API_BASE_URL 未設定：見 frontend/.env.example");
  return baseUrl;
}

export interface ApiConfigOptions {
  /** 測試注入；預設讀 import.meta.env */
  env?: BaseUrlEnv & KeyEnv;
  /** 測試注入；預設瀏覽器 localStorage */
  storage?: KeyStorage | null;
}

export function getApiConfig(options: ApiConfigOptions = {}): ApiConfig {
  const baseUrl = getApiBaseUrl(options.env);
  const { key, source } = options.storage === undefined ? resolveApiKey(undefined, options.env) : resolveApiKey(options.storage, options.env);
  if (!key) throw new ApiKeyMissingError();
  return { baseUrl, apiKey: key, apiKeySource: source };
}

/** 非 2xx 回應。status 與後端 body（多半是 {"detail": ...}）一起帶出來給呼叫端判斷。 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** 金鑰缺少或被後端拒絕（401）：兩者都該把使用者帶去設定頁重新輸入。 */
export function isAuthFailure(err: unknown): boolean {
  return err instanceof ApiKeyMissingError || (err instanceof ApiError && err.status === 401);
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** 有給就以 JSON 送出並設 Content-Type */
  json?: unknown;
  /** 測試或特殊情境用；預設由 getApiConfig() 取得 */
  config?: ApiConfig;
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * 呼叫後端。成功回傳解析後的 JSON；非 2xx 丟 ApiError；沒有金鑰丟 ApiKeyMissingError（不會送出請求）；
 * 網路錯誤（含 CORS 預檢被擋）原樣丟出（TypeError）。
 * 呼叫端用 schema.d.ts 的 components["schemas"] 指定回傳型別（見 auth.ts 的用法）。
 */
export async function apiFetch<T>(path: ApiPath, init: ApiRequestInit = {}): Promise<T> {
  const { json, config, headers: extraHeaders, ...rest } = init;
  const { baseUrl, apiKey } = config ?? getApiConfig();

  const headers = new Headers(extraHeaders);
  headers.set(API_KEY_HEADER, apiKey);
  headers.set("Accept", "application/json");
  if (json !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });

  const body = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
