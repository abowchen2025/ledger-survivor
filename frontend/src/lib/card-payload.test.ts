/**
 * lib/card-payload.ts：payload 的欄位集合必須就是 schema.d.ts 的 CardCreate／CardUpdate，不多不少。
 * 真正拿後端 Pydantic schema 驗的是 backend/tests/integration/test_frontend_payload_contract.py；
 * 這裡是快的單元層，讓改壞時在 vitest 就看到。
 */
import { describe, expect, it } from "vitest";

import type { Card } from "@/api/cards";

import { type CardFormValues, DEFAULT_CARD_COLOR, cardCreatePayload, cardUpdateFromCard, cardUpdatePayload, parseCardForm } from "./card-payload";

const CREATE_KEYS = ["bank", "color", "due_day", "due_month_offset", "last4", "name", "opening_as_of", "opening_billed_unpaid", "opening_unbilled", "statement_day"];
const UPDATE_KEYS = ["bank", "color", "due_day", "due_month_offset", "is_active", "last4", "name", "statement_day"];

const filled: CardFormValues = {
  name: " 賴點卡 ",
  bank: "聯邦銀行",
  last4: "8209",
  statementDay: "27",
  dueDay: "11",
  offsetMode: "auto",
  color: DEFAULT_CARD_COLOR,
  openingBilledUnpaid: "",
  openingUnbilled: "14,530",
  openingAsOf: "2026-09-24",
};

const card: Card = {
  id: 1, name: "賴點卡", bank: "聯邦銀行", last4: "8209", statement_day: 27, due_day: 11, due_month_offset: 1,
  opening_billed_unpaid: 0, opening_unbilled: 14530, opening_as_of: "2026-09-24", color: "#FF8800", is_active: true,
};

function fieldsOf(values: CardFormValues) {
  const parsed = parseCardForm(values);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.fields;
}

describe("parseCardForm", () => {
  it("修剪空白、數字轉型、期初空白視為 0、千分位可解析", () => {
    expect(fieldsOf(filled)).toEqual({
      name: "賴點卡", bank: "聯邦銀行", last4: "8209", statement_day: 27, due_day: 11, due_month_offset: null,
      color: "#FF8800", opening_billed_unpaid: 0, opening_unbilled: 14530, opening_as_of: "2026-09-24",
    });
  });

  it("手動覆寫偏移送明確值；顏色空白送 null；基準日空白送 null", () => {
    expect(fieldsOf({ ...filled, offsetMode: "0", color: "", openingAsOf: "" })).toMatchObject({ due_month_offset: 0, color: null, opening_as_of: null });
  });

  it("檢核失敗的鍵就是後端 error.fields 的欄位名，文案同 SRS", () => {
    const parsed = parseCardForm({ ...filled, name: "", last4: "12", statementDay: "0", dueDay: "32", color: "red", openingBilledUnpaid: "-5", openingUnbilled: "abc" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual({
      name: "請輸入卡片名稱",
      last4: "請輸入卡號末四碼（4位數字）",
      statement_day: "結帳日須介於1-31",
      due_day: "繳款日須介於1-31",
      color: "顏色格式錯誤",
      opening_billed_unpaid: "金額不可為負數",
      opening_unbilled: "金額不可為負數",
    });
  });
});

describe("cardCreatePayload（POST /cards）", () => {
  it("欄位集合就是 CardCreate：沒有 is_active", () => {
    const payload = cardCreatePayload(fieldsOf(filled));
    expect(Object.keys(payload).sort()).toEqual(CREATE_KEYS);
    expect(payload).not.toHaveProperty("is_active");
  });
});

describe("cardUpdatePayload（PUT /cards/{id}，編輯）", () => {
  it("欄位集合就是 CardUpdate：沒有 opening_*，is_active 沿用傳入值", () => {
    const payload = cardUpdatePayload(fieldsOf(filled), false);
    expect(Object.keys(payload).sort()).toEqual(UPDATE_KEYS);
    expect(payload.is_active).toBe(false);
  });
});

describe("cardUpdateFromCard（PUT /cards/{id}，停用／啟用）", () => {
  it("從既有卡片逐欄位組出 CardUpdate，只翻 is_active；偏移送既有值", () => {
    const payload = cardUpdateFromCard(card, { is_active: false });
    expect(Object.keys(payload).sort()).toEqual(UPDATE_KEYS);
    expect(payload).toEqual({ name: "賴點卡", bank: "聯邦銀行", last4: "8209", statement_day: 27, due_day: 11, due_month_offset: 1, color: "#FF8800", is_active: false });
  });

  it("沒有 overrides 就是原卡的 PUT 形狀（不含 id、opening_*）", () => {
    expect(cardUpdateFromCard({ ...card, due_month_offset: 0, color: null })).toEqual({
      name: "賴點卡", bank: "聯邦銀行", last4: "8209", statement_day: 27, due_day: 11, due_month_offset: 0, color: null, is_active: true,
    });
  });
});
