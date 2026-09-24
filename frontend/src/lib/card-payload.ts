/**
 * 信用卡表單 → API payload 的唯一組裝點（SRS 4.2）。
 *
 * 為什麼獨立成純函式：2026-09-24 在 Pages 上新增卡片失敗，原因是表單把整包狀態展開送出，
 * 多帶了 CardCreate 沒有的 is_active，後端 RequestModel 的 extra=forbid 正確地拒絕（400）。
 * TypeScript 展開物件時不檢查多餘屬性、mock 測試也看不到後端 schema，所以這裡改成：
 * - payload 逐欄位、明確地依 schema.d.ts 的 CardCreate／CardUpdate 型別組裝，不展開狀態物件；
 * - 這個模組不 import React、不碰 import.meta.env，讓 scripts/payload-dump.ts 能在 Node 直接執行，
 *   由後端 tests/integration/test_frontend_payload_contract.py 用真正的 Pydantic schema 驗證輸出。
 *
 * 表單元件（components/cards/CardForm.tsx）只負責畫面與狀態，送出時一律經由這裡。
 */
import type { Card, CardCreate, CardUpdate } from "@/api/cards";
import { type DueMonthOffset, isValidDayOfMonth } from "@/lib/card-due-offset";
import { parseAmountInput } from "@/lib/money";

/** 表單裡的原始輸入（全部字串，對應輸入框） */
export interface CardFormValues {
  name: string;
  bank: string;
  last4: string;
  statementDay: string;
  dueDay: string;
  /** "auto" 依後端推算（不送 due_month_offset）；"0"／"1" 手動覆寫 */
  offsetMode: "auto" | "0" | "1";
  /** 畫面顯示的顏色，空字串代表未設定（送 null）。有值就送同一個值，不做預設替換。 */
  color: string;
  openingBilledUnpaid: string;
  openingUnbilled: string;
  openingAsOf: string;
}

/** 新增時的預設值：顏色預設就是實際會送出的 #FF8800（畫面顯示什麼就送什麼） */
export const DEFAULT_CARD_COLOR = "#FF8800";

export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

// SRS 4.2 欄位規格表「檢核失敗文案」（與後端 schemas/card.py CARD_FIELD_MESSAGES 同一句）
export const CARD_MESSAGES = {
  name: "請輸入卡片名稱",
  bank: "請輸入發卡銀行",
  last4: "請輸入卡號末四碼（4位數字）",
  statement_day: "結帳日須介於1-31",
  due_day: "繳款日須介於1-31",
  color: "顏色格式錯誤",
  opening: "金額不可為負數",
} as const;

/** 檢核通過後、已轉成 API 型別的欄位值 */
export interface ParsedCardFields {
  name: string;
  bank: string;
  last4: string;
  statement_day: number;
  due_day: number;
  due_month_offset: DueMonthOffset | null;
  color: string | null;
  opening_billed_unpaid: number;
  opening_unbilled: number;
  opening_as_of: string | null;
}

export type CardFormParseResult = { ok: true; fields: ParsedCardFields } | { ok: false; errors: Record<string, string> };

/** 期初金額：空白視為 0（SRS 預設 0），否則須為 ≥0 的金額 */
function parseOpening(raw: string): { ok: true; value: number } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0") return { ok: true, value: 0 };
  const parsed = parseAmountInput(trimmed);
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false };
}

/** 前端檢核（文案同 SRS）。錯誤的鍵是後端 error.fields 的欄位名，畫面直接對應到輸入框。 */
export function parseCardForm(values: CardFormValues): CardFormParseResult {
  const errors: Record<string, string> = {};
  const name = values.name.trim();
  const bank = values.bank.trim();
  const statementDay = Number(values.statementDay);
  const dueDay = Number(values.dueDay);
  const color = values.color.trim();

  if (!name || name.length > 20) errors.name = CARD_MESSAGES.name;
  if (!bank || bank.length > 20) errors.bank = CARD_MESSAGES.bank;
  if (!/^\d{4}$/.test(values.last4)) errors.last4 = CARD_MESSAGES.last4;
  if (!isValidDayOfMonth(statementDay)) errors.statement_day = CARD_MESSAGES.statement_day;
  if (!isValidDayOfMonth(dueDay)) errors.due_day = CARD_MESSAGES.due_day;
  if (color && !HEX_COLOR_RE.test(color)) errors.color = CARD_MESSAGES.color;
  const billed = parseOpening(values.openingBilledUnpaid);
  const unbilled = parseOpening(values.openingUnbilled);
  if (!billed.ok) errors.opening_billed_unpaid = CARD_MESSAGES.opening;
  if (!unbilled.ok) errors.opening_unbilled = CARD_MESSAGES.opening;

  if (Object.keys(errors).length > 0 || !billed.ok || !unbilled.ok) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      name,
      bank,
      last4: values.last4,
      statement_day: statementDay,
      due_day: dueDay,
      due_month_offset: values.offsetMode === "auto" ? null : (Number(values.offsetMode) as DueMonthOffset),
      color: color || null,
      opening_billed_unpaid: billed.value,
      opening_unbilled: unbilled.value,
      opening_as_of: values.openingAsOf || null,
    },
  };
}

/**
 * POST /cards 的 body：逐欄位對應 CardCreate。
 * 沒有 is_active（新卡一律啟用，後端 schema 不收）；due_month_offset 為 null 時由後端依 REQ-CARD-002 推算。
 */
export function cardCreatePayload(fields: ParsedCardFields): CardCreate {
  return {
    name: fields.name,
    bank: fields.bank,
    last4: fields.last4,
    statement_day: fields.statement_day,
    due_day: fields.due_day,
    due_month_offset: fields.due_month_offset,
    color: fields.color,
    opening_billed_unpaid: fields.opening_billed_unpaid,
    opening_unbilled: fields.opening_unbilled,
    opening_as_of: fields.opening_as_of,
  };
}

/**
 * PUT /cards/{id} 的 body（編輯）：逐欄位對應 CardUpdate。
 * 不含 opening_*（建立後鎖定，後端 extra=forbid）；is_active 沿用該卡目前狀態（編輯不改啟用狀態）。
 */
export function cardUpdatePayload(fields: ParsedCardFields, isActive: boolean): CardUpdate {
  return {
    name: fields.name,
    bank: fields.bank,
    last4: fields.last4,
    statement_day: fields.statement_day,
    due_day: fields.due_day,
    due_month_offset: fields.due_month_offset,
    color: fields.color,
    is_active: isActive,
  };
}

/**
 * PUT /cards/{id} 的 body（停用／啟用等只改單一欄位的操作）：從既有卡片逐欄位組出 CardUpdate。
 * due_month_offset 送既有值（明確覆寫），避免後端因來源欄位「沒變」而重算出不同結果。
 */
export function cardUpdateFromCard(card: Card, overrides: Partial<Pick<CardUpdate, "is_active" | "color">> = {}): CardUpdate {
  return {
    name: card.name,
    bank: card.bank,
    last4: card.last4,
    statement_day: card.statement_day,
    due_day: card.due_day,
    due_month_offset: card.due_month_offset === 1 ? 1 : 0,
    color: overrides.color === undefined ? card.color : overrides.color,
    is_active: overrides.is_active === undefined ? card.is_active : overrides.is_active,
  };
}
