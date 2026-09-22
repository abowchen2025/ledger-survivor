/**
 * API client 單元測試：所有請求都要經過 apiFetch 帶 base URL 與 X-API-Key（REQ-AUTH-000）。
 * fetch 以 vi.stubGlobal 取代，不真的連網。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { API_KEY_HEADER, ApiError, apiFetch, getApiConfig } from "./client";

const config = { baseUrl: "http://127.0.0.1:8765", apiKey: "test-key" };

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

describe("getApiConfig", () => {
  it("讀 VITE_API_BASE_URL 與 VITE_API_KEY，去掉 base URL 結尾斜線", () => {
    expect(getApiConfig({ VITE_API_BASE_URL: "https://api.example/", VITE_API_KEY: "k" })).toEqual({
      baseUrl: "https://api.example",
      apiKey: "k",
    });
  });

  it("缺 base URL 或金鑰就丟錯，不會默默送出沒金鑰的請求", () => {
    expect(() => getApiConfig({ VITE_API_BASE_URL: "", VITE_API_KEY: "k" })).toThrow(/VITE_API_BASE_URL/);
    expect(() => getApiConfig({ VITE_API_BASE_URL: "http://x", VITE_API_KEY: "  " })).toThrow(/VITE_API_KEY/);
  });

  it("預設從 import.meta.env 讀", () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://127.0.0.1:8765");
    vi.stubEnv("VITE_API_KEY", "dev-local-only-not-a-secret");
    expect(getApiConfig()).toEqual({ baseUrl: "http://127.0.0.1:8765", apiKey: "dev-local-only-not-a-secret" });
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

  it("沒有 config 且環境變數缺少時丟錯，不會呼叫 fetch", async () => {
    const fetchMock = stubFetch(200, {});
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_API_KEY", "");
    await expect(apiFetch("/api/v1/auth/me")).rejects.toThrow(/VITE_API_BASE_URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
