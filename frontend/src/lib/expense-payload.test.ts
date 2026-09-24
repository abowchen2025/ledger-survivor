/**
 * lib/expense-payload.ts：payload 的欄位集合必須就是 schema.d.ts 的 ExpenseCreate／ExpenseUpdate。
 * 真正拿後端 Pydantic schema 驗的是 backend/tests/integration/test_frontend_payload_contract.py。
 */
import { describe, expect, it } from "vitest";

import { type ExpenseFormValues, expenseCreatePayload, expenseUpdatePayload, parseExpenseForm } from "./expense-payload";

const KEYS = ["amount", "card_id", "category_id", "date", "item", "note", "payment_method"];

const base: ExpenseFormValues = {
  date: "2026-09-24",
  amountInput: "120",
  refund: false,
  item: " 午餐 ",
  categoryId: 1,
  paymentMethod: "cash",
  cardId: null,
  note: "",
};

function fieldsOf(values: ExpenseFormValues) {
  const parsed = parseExpenseForm(values);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.fields;
}

describe("parseExpenseForm", () => {
  it("修剪品項、備註空白送 null、金額轉數字", () => {
    expect(fieldsOf(base)).toEqual({ date: "2026-09-24", amount: 120, item: "午餐", category_id: 1, payment_method: "cash", card_id: null, note: null });
  });

  it("退款送負數；千分位與小數可解析", () => {
    expect(fieldsOf({ ...base, amountInput: "1,299.5", refund: true }).amount).toBe(-1299.5);
  });

  it("現金／轉帳即使狀態殘留 cardId 也送 null；信用卡與行動支付保留所選卡片", () => {
    expect(fieldsOf({ ...base, paymentMethod: "cash", cardId: 7 }).card_id).toBeNull();
    expect(fieldsOf({ ...base, paymentMethod: "transfer", cardId: 7 }).card_id).toBeNull();
    expect(fieldsOf({ ...base, paymentMethod: "credit_card", cardId: 7 }).card_id).toBe(7);
    expect(fieldsOf({ ...base, paymentMethod: "mobile_pay", cardId: 7 }).card_id).toBe(7);
    expect(fieldsOf({ ...base, paymentMethod: "mobile_pay", cardId: null }).card_id).toBeNull();
  });

  it("檢核失敗的鍵就是後端 error.fields 的欄位名，文案同 SRS；信用卡未選卡才報 card_id", () => {
    const parsed = parseExpenseForm({ ...base, amountInput: "0", item: "", date: "2026/09/24", categoryId: null, paymentMethod: "credit_card", note: "x".repeat(101) });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors).toEqual({
      amount: "金額不可為0",
      item: "請輸入品項",
      date: "請選擇日期",
      category_id: "請選擇分類",
      card_id: "請選擇信用卡",
      note: "備註最多100字",
    });
  });
});

describe("expenseCreatePayload／expenseUpdatePayload", () => {
  it("欄位集合就是 ExpenseCreate／ExpenseUpdate（兩者相同，date 一律有值）", () => {
    const fields = fieldsOf({ ...base, paymentMethod: "credit_card", cardId: 3, note: "特價" });
    const create = expenseCreatePayload(fields);
    const update = expenseUpdatePayload(fields);
    expect(Object.keys(create).sort()).toEqual(KEYS);
    expect(Object.keys(update).sort()).toEqual(KEYS);
    expect(create).toEqual({ date: "2026-09-24", amount: 120, item: "午餐", category_id: 1, payment_method: "credit_card", card_id: 3, note: "特價" });
    expect(update).toEqual(create);
  });
});
