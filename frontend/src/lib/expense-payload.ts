/**
 * 快速記帳表單 → API payload 的唯一組裝點（SRS 4.5）。
 *
 * 與 lib/card-payload.ts 同一套做法：payload 逐欄位依 schema.d.ts 的 ExpenseCreate／ExpenseUpdate 組裝，
 * 不展開狀態物件；不 import React、不碰 import.meta.env，讓 scripts/payload-dump.ts 能在 Node 執行，
 * 由後端 tests/integration/test_frontend_payload_contract.py 用真正的 Pydantic schema 驗證。
 */
import type { ExpenseCreate, ExpenseUpdate, PaymentMethod } from "@/api/expenses";
import { cardFieldMode } from "@/lib/labels";
import { parseAmountInput } from "@/lib/money";

/** 表單裡的原始輸入 */
export interface ExpenseFormValues {
  date: string;
  amountInput: string;
  /** 退款：金額送負數（iOS 數字鍵盤沒有負號鍵，用切換取代） */
  refund: boolean;
  item: string;
  categoryId: number | null;
  paymentMethod: PaymentMethod;
  cardId: number | null;
  note: string;
}

// SRS 4.5 欄位規格表「檢核失敗文案」（與後端 schemas/expense.py EXPENSE_FIELD_MESSAGES 同一句）
export const EXPENSE_MESSAGES = {
  date: "請選擇日期",
  item: "請輸入品項",
  category: "請選擇分類",
  card: "請選擇信用卡",
  note: "備註最多100字",
} as const;

/** 檢核通過後、已轉成 API 型別的欄位值（Create 與 Update 欄位集合相同，只差 date 在 Create 可省略） */
export interface ParsedExpenseFields {
  date: string;
  amount: number;
  item: string;
  category_id: number;
  payment_method: PaymentMethod;
  card_id: number | null;
  note: string | null;
}

export type ExpenseFormParseResult = { ok: true; fields: ParsedExpenseFields } | { ok: false; errors: Record<string, string> };

/** 前端檢核（文案同 SRS）。錯誤的鍵是後端 error.fields 的欄位名。 */
export function parseExpenseForm(values: ExpenseFormValues): ExpenseFormParseResult {
  const errors: Record<string, string> = {};
  const cardMode = cardFieldMode(values.paymentMethod);
  const amount = parseAmountInput(values.amountInput, values.refund);
  const item = values.item.trim();
  const note = values.note.trim();

  if (!amount.ok) errors.amount = amount.message;
  if (!item || item.length > 50) errors.item = EXPENSE_MESSAGES.item;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.date = EXPENSE_MESSAGES.date;
  if (values.categoryId === null) errors.category_id = EXPENSE_MESSAGES.category;
  if (cardMode === "required" && values.cardId === null) errors.card_id = EXPENSE_MESSAGES.card;
  if (note.length > 100) errors.note = EXPENSE_MESSAGES.note;

  if (Object.keys(errors).length > 0 || !amount.ok || values.categoryId === null) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      date: values.date,
      amount: amount.value,
      item,
      category_id: values.categoryId,
      payment_method: values.paymentMethod,
      // 現金／轉帳不得帶卡（spec-gaps 8.5）：即使狀態裡殘留 cardId 也送 null
      card_id: cardMode === "hidden" ? null : values.cardId,
      note: note || null,
    },
  };
}

/** POST /expenses 的 body：逐欄位對應 ExpenseCreate。date 一律送（表單有日期欄，不靠伺服器預設今天）。 */
export function expenseCreatePayload(fields: ParsedExpenseFields): ExpenseCreate {
  return {
    date: fields.date,
    amount: fields.amount,
    item: fields.item,
    category_id: fields.category_id,
    payment_method: fields.payment_method,
    card_id: fields.card_id,
    note: fields.note,
  };
}

/** PUT /expenses/{id} 的 body：逐欄位對應 ExpenseUpdate（整筆取代，date 必填）。 */
export function expenseUpdatePayload(fields: ParsedExpenseFields): ExpenseUpdate {
  return {
    date: fields.date,
    amount: fields.amount,
    item: fields.item,
    category_id: fields.category_id,
    payment_method: fields.payment_method,
    card_id: fields.card_id,
    note: fields.note,
  };
}
