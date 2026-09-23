/** 花費 API（SRS 4.5）。型別全部來自 schema.d.ts，不手寫。 */
import { apiFetch, resolvePath, withQuery } from "./client";
import type { components } from "./schema";

export type Expense = components["schemas"]["ExpenseOut"];
export type ExpenseCreate = components["schemas"]["ExpenseCreate"];
export type ExpenseUpdate = components["schemas"]["ExpenseUpdate"];
export type PaymentMethod = Expense["payment_method"];

/** GET /expenses?start_date&end_date（兩端皆含） */
export function listExpenses(startDate: string, endDate: string): Promise<Expense[]> {
  return apiFetch<Expense[]>(withQuery("/api/v1/expenses", { start_date: startDate, end_date: endDate }));
}

export function createExpense(payload: ExpenseCreate): Promise<Expense> {
  return apiFetch<Expense>("/api/v1/expenses", { method: "POST", json: payload });
}

export function updateExpense(id: number, payload: ExpenseUpdate): Promise<Expense> {
  return apiFetch<Expense>(resolvePath("/api/v1/expenses/{expense_id}", { expense_id: id }), { method: "PUT", json: payload });
}

export function deleteExpense(id: number): Promise<void> {
  return apiFetch<void>(resolvePath("/api/v1/expenses/{expense_id}", { expense_id: id }), { method: "DELETE" });
}
