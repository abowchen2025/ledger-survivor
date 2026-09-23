/**
 * API client 單元測試：所有請求都要經過 apiFetch 帶 base URL 與 X-API-Key（REQ-AUTH-000）。
 * fetch 以 vi.stubGlobal 取代，不真的連網；金鑰用記憶體 storage 注入，不碰 localStorage。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { API_KEY_STORAGE_KEY, type KeyStorage } from "./api-key";
import { API_KEY_HEADER, ApiError, ApiKeyMissingError, apiFetch, getApiBaseUrl, getApiConfig, isAuthFailure } from "./client";

const config = { baseUrl: "http://127.0.0.1:8765", apiKey: "test-key", apiKeySource: "stored" as const };

function memoryStorage(initial: Record<string, string> = {}): KeyStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function stubFetch(status: number, body: unknown, contentType = "application/json") {
  const fetchMock = vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": contentType },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastRequest(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getApiBaseUrl / getApiConfig", () => {
  it("讀 VITE_API_BASE_URL，去掉結尾斜線", () => {
    expect(getApiBaseUrl({ VITE_API_BASE_URL: "https://api.example/" })).toBe("https://api.example");
  });

  it("缺 base URL 就丟錯", () => {
    expect(() => getApiBaseUrl({ VITE_API_BASE_URL: "" })).toThrow(/VITE_API_BASE_URL/);
  });

  it("金鑰：localStorage 優先於 dev 預設值", () => {
    const env = { VITE_API_BASE_URL: "http://x", DEV: true, VITE_DEV_API_KEY: "dev-key" };
    expect(getApiConfig({ env, storage: memoryStorage({ [API_KEY_STORAGE_KEY]: "typed" }) })).toEqual({
      baseUrl: "http://x",
      apiKey: "typed",
      apiKeySource: "stored",
    });
    expect(getApiConfig({ env, storage: memoryStorage() })).toEqual({ baseUrl: "http://x", apiKey: "dev-key", apiKeySource: "dev-default" });
  });

  it("production 沒存過金鑰 → ApiKeyMissingError，不會退回 dev 預設值", () => {
    const env = { VITE_API_BASE_URL: "http://x", DEV: false, VITE_DEV_API_KEY: "dev-key" };
    expect(() => getApiConfig({ env, storage: memoryStorage() })).toThrow(ApiKeyMissingError);
  });

  it("預設從 import.meta.env 讀 base URL", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:8765");
    expect(getApiBaseUrl()).toBe("http://127.0.0.1:8765");
  });
});

describe("apiFetch", () => {
  it("組出 base URL + 路徑，並在每個請求帶 X-API-Key", async () => {
    const fetchMock = stubFetch(200, { user_id: 1 });
    const result = await apiFetch<{ user_id: number }>("/api/v1/auth/me", { config });

    expect(result).toEqual({ user_id: 1 });
    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe("http://127.0.0.1:8765/api/v1/auth/me");
    expect(new Headers(init.headers).get(API_KEY_HEADER)).toBe("test-key");
  });

  it("json 選項以 JSON 送出並設 Content-Type", async () => {
    const fetchMock = stubFetch(200, { ok: true });
    await apiFetch("/api/v1/auth/me", { config, method: "POST", json: { amount: 120 } });

    const { init } = lastRequest(fetchMock);
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"amount":120}');
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("401 丟 ApiError，帶 status 與後端 body（{detail: 'unauthorized'}）", async () => {
    stubFetch(401, { detail: "unauthorized" });
    const err = await apiFetch("/api/v1/auth/me", { config }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).body).toEqual({ detail: "unauthorized" });
  });

  it("204 或空 body 回 undefined", async () => {
    stubFetch(204, undefined);
    await expect(apiFetch("/api/v1/auth/me", { config, method: "DELETE" })).resolves.toBeUndefined();
  });

  it("沒有 config 且 base URL 缺少時丟錯，不會呼叫 fetch", async () => {
    const fetchMock = stubFetch(200, {});
    vi.stubEnv("VITE_API_BASE_URL", "");
    await expect(apiFetch("/api/v1/auth/me")).rejects.toThrow(/VITE_API_BASE_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isAuthFailure", () => {
  it("金鑰缺少與 401 都算，其他不算", () => {
    expect(isAuthFailure(new ApiKeyMissingError())).toBe(true);
    expect(isAuthFailure(new ApiError(401, { detail: "unauthorized" }))).toBe(true);
    expect(isAuthFailure(new ApiError(500, null))).toBe(false);
    expect(isAuthFailure(new TypeError("Failed to fetch"))).toBe(false);
  });
});
