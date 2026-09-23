import { describe, expect, it } from "vitest";

import { ApiError, ApiKeyMissingError } from "./client";
import { CARD_IN_USE_MESSAGE, MONTH_SETTLED_MESSAGE, NETWORK_ERROR_MESSAGE, describeApiError } from "./errors";

describe("describeApiError", () => {
  it("統一格式：code、message、fields 原樣帶出（fields 給欄位下方顯示）", () => {
    const err = new ApiError(400, {
      error: { code: "VALIDATION_ERROR", message: "資料格式有誤", fields: { amount: "金額不可為0", item: "請輸入品項" } },
    });
    expect(describeApiError(err)).toEqual({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "資料格式有誤",
      fields: { amount: "金額不可為0", item: "請輸入品項" },
      network: false,
    });
  });

  it("fields 為 null 時給空物件", () => {
    const err = new ApiError(404, { error: { code: "NOT_FOUND", message: "找不到資料", fields: null } });
    expect(describeApiError(err).fields).toEqual({});
  });

  it("MONTH_SETTLED 與 CARD_IN_USE 用前端固定文案", () => {
    const settled = new ApiError(409, { error: { code: "MONTH_SETTLED", message: "2026-10 已結算，請先取消結算", fields: null } });
    expect(describeApiError(settled).message).toBe(MONTH_SETTLED_MESSAGE);
    const inUse = new ApiError(403, { error: { code: "CARD_IN_USE", message: "…", fields: null } });
    expect(describeApiError(inUse)).toMatchObject({ code: "CARD_IN_USE", message: CARD_IN_USE_MESSAGE });
  });

  it("INACTIVE_REFERENCE 沿用後端訊息與 fields", () => {
    const err = new ApiError(400, { error: { code: "INACTIVE_REFERENCE", message: "所選的分類或信用卡已停用", fields: { card_id: "請選擇信用卡" } } });
    expect(describeApiError(err)).toMatchObject({ code: "INACTIVE_REFERENCE", message: "所選的分類或信用卡已停用", fields: { card_id: "請選擇信用卡" } });
  });

  it("網路錯誤（fetch 的 TypeError）→ 連線失敗文案、network=true", () => {
    expect(describeApiError(new TypeError("Failed to fetch"))).toEqual({
      status: 0,
      code: null,
      message: NETWORK_ERROR_MESSAGE,
      fields: {},
      network: true,
    });
  });

  it("401 與缺金鑰不是統一格式，仍給可顯示的訊息", () => {
    expect(describeApiError(new ApiError(401, { detail: "unauthorized" }))).toMatchObject({ status: 401, code: null });
    expect(describeApiError(new ApiKeyMissingError()).message).toMatch(/金鑰/);
  });
});
