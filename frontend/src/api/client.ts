/**
 * 後端呼叫的唯一入口：所有對 /api/v1 的請求都經過 apiFetch，統一帶入
 * - base URL（VITE_API_BASE_URL，只到 host[:port]）
 * - X-API-Key 標頭（VITE_API_KEY，REQ-AUTH-000 臨時金鑰；Phase 3 換 JWT 時只改這裡）
 *
 * 路徑型別來自 openapi-typescript 產生的 schema.d.ts（npm run gen:api），寫錯路徑會在編譯期被抓到。
 * 不要在頁面或 store 直接呼叫 fetch。
 */
import type { paths } from "./schema";

export const API_KEY_HEADER = "X-API-Key";

/** schema.d.ts 裡的所有路徑，例如 "/api/v1/auth/me"（已含 /api/v1 前綴）。 */
export type ApiPath = keyof paths;

export interface ApiConfig {
  /** 不含結尾斜線 */
  baseUrl: string;
  apiKey: string;
}

/** 讀建置期變數；缺少就立刻丟錯，不要讓請求默默打到錯的位址或不帶金鑰後 401。 */
export function getApiConfig(env: Pick<ImportMetaEnv, "VITE_API_BASE_URL" | "VITE_API_KEY"> = import.meta.env): ApiConfig {
  const baseUrl = (env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (env.VITE_API_KEY ?? "").trim();
  if (!baseUrl) throw new Error("VITE_API_BASE_URL 未設定：見 frontend/.env.example");
  if (!apiKey) throw new Error("VITE_API_KEY 未設定：見 frontend/.env.example");
  return { baseUrl, apiKey };
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

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** 有給就以 JSON 送出並設 Content-Type */
  json?: unknown;
  /** 測試或特殊情境用；預設讀 import.meta.env */
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
 * 呼叫後端。成功回傳解析後的 JSON；非 2xx 丟 ApiError；網路錯誤原樣丟出（TypeError）。
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
