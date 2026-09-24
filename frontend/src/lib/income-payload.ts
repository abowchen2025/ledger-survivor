/**
 * 收入設定表單 → API payload 的唯一組裝點（SRS 4.1）。做法同 lib/card-payload.ts（ADR-0008）：
 * parseXxxForm() 做前端檢核（文案同 SRS 欄位規格表）並轉型，xxxPayload() 逐欄位依 schema.d.ts 的
 * Update／Create 型別回傳物件字面值。不 import React、不碰 import.meta.env，scripts/payload-dump.ts 可直接執行。
 */
import type { ExtraIncomeCreate, ExtraIncomeUpdate, MonthIncomeUpdate, RecurringExpenseCreate, RecurringExpenseUpdate } from "@/api/income";
import { parseAmountInput } from "@/lib/money";

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// SRS 4.1 欄位規格表「檢核失敗文案」（與後端 schemas/income.py 同一句）
export const INCOME_MESSAGES = {
  salary: "月薪不可為負數",
  savings_target: "儲蓄目標不可為負數",
  extra_name: "請輸入收入名稱",
  extra_amount: "金額須大於0",
  recurring_name: "請輸入支出名稱",
  recurring_amount: "金額須大於0",
  start_month: "請選擇起始月份",
  end_month: "結束月不可早於起始月",
} as const;

type Parse<F> = { ok: true; fields: F } | { ok: false; errors: Record<string, string> };

/** 「≥0 的金額」：空白視為 0（儲蓄目標預設 0）；月薪空白視為未填 */
function parseNonNegative(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  // parseAmountInput 把 0 當錯誤（花費不可為 0），這裡 0 是合法值："0"、"0.00" 都算 0
  if (/^0+(\.0{1,2})?$/.test(trimmed)) return 0;
  const parsed = parseAmountInput(trimmed);
  return parsed.ok && parsed.value > 0 ? parsed.value : null;
}

/** 「>0 的金額」 */
function parsePositive(raw: string): number | null {
  const parsed = parseAmountInput(raw.trim());
  return parsed.ok && parsed.value > 0 ? parsed.value : null;
}

// --- 月薪與儲蓄目標（PUT /months/{m}/income） ----------------------------------------------

export interface MonthIncomeFormValues {
  salary: string;
  savingsTarget: string;
}

export interface ParsedMonthIncome {
  salary: number;
  savings_target: number;
}

export function parseMonthIncomeForm(values: MonthIncomeFormValues): Parse<ParsedMonthIncome> {
  const errors: Record<string, string> = {};
  const salary = values.salary.trim() === "" ? null : parseNonNegative(values.salary);
  const savings = values.savingsTarget.trim() === "" ? 0 : parseNonNegative(values.savingsTarget);
  if (salary === null) errors.salary = INCOME_MESSAGES.salary;
  if (savings === null) errors.savings_target = INCOME_MESSAGES.savings_target;
  if (salary === null || savings === null) return { ok: false, errors };
  return { ok: true, fields: { salary, savings_target: savings } };
}

export function monthIncomePayload(fields: ParsedMonthIncome): MonthIncomeUpdate {
  return {
    salary: fields.salary,
    savings_target: fields.savings_target,
  };
}

// --- 額外收入（POST／PUT /extra-incomes） -------------------------------------------------

export interface ExtraIncomeFormValues {
  name: string;
  amount: string;
}

export interface ParsedExtraIncome {
  month: string;
  name: string;
  amount: number;
}

/** month 是設定頁目前選的月份（不是表單欄位），每筆額外收入歸屬該月（REQ-INCOME-003） */
export function parseExtraIncomeForm(values: ExtraIncomeFormValues, month: string): Parse<ParsedExtraIncome> {
  const errors: Record<string, string> = {};
  const name = values.name.trim();
  const amount = parsePositive(values.amount);
  if (!name || name.length > 50) errors.name = INCOME_MESSAGES.extra_name;
  if (amount === null) errors.amount = INCOME_MESSAGES.extra_amount;
  if (!MONTH_RE.test(month)) errors.month = "月份格式須為 YYYY-MM";
  if (Object.keys(errors).length > 0 || amount === null) return { ok: false, errors };
  return { ok: true, fields: { month, name, amount } };
}

export function extraIncomeCreatePayload(fields: ParsedExtraIncome): ExtraIncomeCreate {
  return { month: fields.month, amount: fields.amount, name: fields.name };
}

/** PUT 整筆取代，欄位同新增 */
export function extraIncomeUpdatePayload(fields: ParsedExtraIncome): ExtraIncomeUpdate {
  return { month: fields.month, amount: fields.amount, name: fields.name };
}

// --- 固定支出（POST／PUT /recurring-expenses） ---------------------------------------------

export interface RecurringExpenseFormValues {
  name: string;
  amount: string;
  startMonth: string;
  /** 空字串代表沒有結束月（null） */
  endMonth: string;
}

export interface ParsedRecurringExpense {
  name: string;
  amount: number;
  start_month: string;
  end_month: string | null;
}

export function parseRecurringExpenseForm(values: RecurringExpenseFormValues): Parse<ParsedRecurringExpense> {
  const errors: Record<string, string> = {};
  const name = values.name.trim();
  const amount = parsePositive(values.amount);
  const start = values.startMonth.trim();
  const end = values.endMonth.trim();
  if (!name || name.length > 50) errors.name = INCOME_MESSAGES.recurring_name;
  if (amount === null) errors.amount = INCOME_MESSAGES.recurring_amount;
  if (!MONTH_RE.test(start)) errors.start_month = INCOME_MESSAGES.start_month;
  // 結束月：格式錯或早於起始月都用同一句（SRS 一個欄位一句）
  if (end && (!MONTH_RE.test(end) || (MONTH_RE.test(start) && end < start))) errors.end_month = INCOME_MESSAGES.end_month;
  if (Object.keys(errors).length > 0 || amount === null) return { ok: false, errors };
  return { ok: true, fields: { name, amount, start_month: start, end_month: end || null } };
}

export function recurringExpenseCreatePayload(fields: ParsedRecurringExpense): RecurringExpenseCreate {
  return {
    name: fields.name,
    amount: fields.amount,
    start_month: fields.start_month,
    end_month: fields.end_month,
  };
}

/** PUT 整筆取代，欄位同新增 */
export function recurringExpenseUpdatePayload(fields: ParsedRecurringExpense): RecurringExpenseUpdate {
  return {
    name: fields.name,
    amount: fields.amount,
    start_month: fields.start_month,
    end_month: fields.end_month,
  };
}
