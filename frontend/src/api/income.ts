/** 收入設定 API（SRS 4.1；spec-gaps 8.3、8.4）。型別全部來自 schema.d.ts，不手寫。 */
import { apiFetch, resolvePath, withQuery } from "./client";
import type { components } from "./schema";

export type MonthIncome = components["schemas"]["MonthIncomeOut"];
export type MonthIncomeUpdate = components["schemas"]["MonthIncomeUpdate"];
export type ExtraIncome = components["schemas"]["ExtraIncomeOut"];
export type ExtraIncomeCreate = components["schemas"]["ExtraIncomeCreate"];
export type ExtraIncomeUpdate = components["schemas"]["ExtraIncomeUpdate"];
export type RecurringExpense = components["schemas"]["RecurringExpenseOut"];
export type RecurringExpenseCreate = components["schemas"]["RecurringExpenseCreate"];
export type RecurringExpenseUpdate = components["schemas"]["RecurringExpenseUpdate"];

// --- 月薪與儲蓄目標 ---------------------------------------------------------------------

/** 該月無紀錄時後端回上一有紀錄月份的值並填 inherited_from；完全沒有紀錄時 salary／savings_target 為 null。 */
export function getMonthIncome(month: string): Promise<MonthIncome> {
  return apiFetch<MonthIncome>(resolvePath("/api/v1/months/{month}/income", { month }));
}

export function putMonthIncome(month: string, payload: MonthIncomeUpdate): Promise<MonthIncome> {
  return apiFetch<MonthIncome>(resolvePath("/api/v1/months/{month}/income", { month }), { method: "PUT", json: payload });
}

// --- 額外收入 ----------------------------------------------------------------------------

export function listExtraIncomes(month?: string): Promise<ExtraIncome[]> {
  return apiFetch<ExtraIncome[]>(withQuery("/api/v1/extra-incomes", { month }));
}

export function createExtraIncome(payload: ExtraIncomeCreate): Promise<ExtraIncome> {
  return apiFetch<ExtraIncome>("/api/v1/extra-incomes", { method: "POST", json: payload });
}

export function updateExtraIncome(id: number, payload: ExtraIncomeUpdate): Promise<ExtraIncome> {
  return apiFetch<ExtraIncome>(resolvePath("/api/v1/extra-incomes/{row_id}", { row_id: id }), { method: "PUT", json: payload });
}

export function deleteExtraIncome(id: number): Promise<void> {
  return apiFetch<void>(resolvePath("/api/v1/extra-incomes/{row_id}", { row_id: id }), { method: "DELETE" });
}

// --- 固定支出 ----------------------------------------------------------------------------

/** 不帶 month：全部（設定頁要列出全部，結束月已過的灰階呈現但不隱藏）。 */
export function listRecurringExpenses(month?: string): Promise<RecurringExpense[]> {
  return apiFetch<RecurringExpense[]>(withQuery("/api/v1/recurring-expenses", { month }));
}

export function createRecurringExpense(payload: RecurringExpenseCreate): Promise<RecurringExpense> {
  return apiFetch<RecurringExpense>("/api/v1/recurring-expenses", { method: "POST", json: payload });
}

export function updateRecurringExpense(id: number, payload: RecurringExpenseUpdate): Promise<RecurringExpense> {
  return apiFetch<RecurringExpense>(resolvePath("/api/v1/recurring-expenses/{row_id}", { row_id: id }), { method: "PUT", json: payload });
}

export function deleteRecurringExpense(id: number): Promise<void> {
  return apiFetch<void>(resolvePath("/api/v1/recurring-expenses/{row_id}", { row_id: id }), { method: "DELETE" });
}
