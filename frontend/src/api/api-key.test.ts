/**
 * API 金鑰來源與存放（REQ-AUTH-000，docs/adr/0007）：localStorage 優先、dev 預設值只在 DEV、production 沒有金鑰。
 */
import { describe, expect, it } from "vitest";

import {
  API_KEY_STORAGE_KEY,
  type KeyStorage,
  clearApiKey,
  devDefaultApiKey,
  readStoredApiKey,
  resolveApiKey,
  saveApiKey,
} from "./api-key";

function memoryStorage(initial: Record<string, string> = {}): KeyStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function throwingStorage(): KeyStorage {
  const boom = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

const DEV = { DEV: true, VITE_DEV_API_KEY: "dev-local-only-not-a-secret" };
const PROD = { DEV: false, VITE_DEV_API_KEY: "dev-local-only-not-a-secret" };

describe("saveApiKey / readStoredApiKey / clearApiKey", () => {
  it("存入時 trim，讀出同一把", () => {
    const s = memoryStorage();
    expect(saveApiKey("  abc123  ", s)).toBe(true);
    expect(s.data.get(API_KEY_STORAGE_KEY)).toBe("abc123");
    expect(readStoredApiKey(s)).toBe("abc123");
  });

  it("存空字串等同清除", () => {
    const s = memoryStorage({ [API_KEY_STORAGE_KEY]: "old" });
    saveApiKey("   ", s);
    expect(readStoredApiKey(s)).toBe("");
    expect(s.data.has(API_KEY_STORAGE_KEY)).toBe(false);
  });

  it("clearApiKey 移除", () => {
    const s = memoryStorage({ [API_KEY_STORAGE_KEY]: "old" });
    expect(clearApiKey(s)).toBe(true);
    expect(readStoredApiKey(s)).toBe("");
  });

  it("storage 不可用（null 或丟例外）時不會炸，讀到空、寫入回 false", () => {
    expect(readStoredApiKey(null)).toBe("");
    expect(saveApiKey("k", null)).toBe(false);
    expect(clearApiKey(null)).toBe(false);
    expect(readStoredApiKey(throwingStorage())).toBe("");
    expect(saveApiKey("k", throwingStorage())).toBe(false);
    expect(clearApiKey(throwingStorage())).toBe(false);
  });
});

describe("devDefaultApiKey", () => {
  it("dev build 讀 VITE_DEV_API_KEY", () => {
    expect(devDefaultApiKey(DEV)).toBe("dev-local-only-not-a-secret");
  });

  it("production build 一律空字串，即使建置環境有設", () => {
    expect(devDefaultApiKey(PROD)).toBe("");
  });

  it("dev 沒設就是空字串", () => {
    expect(devDefaultApiKey({ DEV: true, VITE_DEV_API_KEY: undefined })).toBe("");
  });
});

describe("resolveApiKey", () => {
  it("localStorage 優先於 dev 預設值", () => {
    const s = memoryStorage({ [API_KEY_STORAGE_KEY]: "from-storage" });
    expect(resolveApiKey(s, DEV)).toEqual({ key: "from-storage", source: "stored" });
  });

  it("沒有存過 → dev 用預設值", () => {
    expect(resolveApiKey(memoryStorage(), DEV)).toEqual({ key: "dev-local-only-not-a-secret", source: "dev-default" });
  });

  it("沒有存過 → production 沒有金鑰", () => {
    expect(resolveApiKey(memoryStorage(), PROD)).toEqual({ key: "", source: "none" });
  });

  it("production 有存過就用存的", () => {
    const s = memoryStorage({ [API_KEY_STORAGE_KEY]: "user-typed" });
    expect(resolveApiKey(s, PROD)).toEqual({ key: "user-typed", source: "stored" });
  });
});
