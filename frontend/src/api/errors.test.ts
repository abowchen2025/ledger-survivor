import { describe, expect, it } from "vitest";

import { ApiError, ApiKeyMissingError } from "./client";
import { CARD_IN_USE_MESSAGE, MONTH_SETTLED_MESSAGE, NETWORK_ERROR_MESSAGE, describeApiError, splitFieldErrors } from "./errors";

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

describe("splitFieldErrors", () => {
  const validation = (fields: Record<string, string>) => describeApiError(new ApiError(400, { error: { code: "VALIDATION_ERROR", message: "資料格式有誤", fields } }));

  it("全部欄位都有輸入框 → 放欄位下方，沒有整體訊息", () => {
    expect(splitFieldErrors(validation({ name: "請輸入卡片名稱" }), ["name", "bank"])).toEqual({ fieldErrors: { name: "請輸入卡片名稱" }, formError: null });
  });

  it("沒有對應輸入框的欄位 → 併進整體訊息，列出欄位名與訊息；有輸入框的照舊放欄位下方", () => {
    expect(splitFieldErrors(validation({ is_active: "不允許的欄位", name: "請輸入卡片名稱" }), ["name"])).toEqual({
      fieldErrors: { name: "請輸入卡片名稱" },
      formError: "資料格式有誤（is_active：不允許的欄位）",
    });
    expect(splitFieldErrors(validation({ a: "x", b: "y" }), []).formError).toBe("資料格式有誤（a：x；b：y）");
  });

  it("非 VALIDATION_ERROR 一律顯示整體訊息（欄位文案若有仍放欄位下方）", () => {
    const inactive = describeApiError(new ApiError(400, { error: { code: "INACTIVE_REFERENCE", message: "所選的分類或信用卡已停用", fields: { category_id: "請選擇分類" } } }));
    expect(splitFieldErrors(inactive, ["category_id"])).toEqual({ fieldErrors: { category_id: "請選擇分類" }, formError: "所選的分類或信用卡已停用" });
    expect(splitFieldErrors(describeApiError(new TypeError("Failed to fetch")), ["name"])).toEqual({ fieldErrors: {}, formError: NETWORK_ERROR_MESSAGE });
  });
});
