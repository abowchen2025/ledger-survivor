/**
 * 信用卡繳款月偏移推算（REQ-CARD-002），供新增卡片表單即時預覽。
 *
 * 與後端 backend/app/services/cards.py::infer_due_month_offset 逐字對應，
 * 兩端共用 backend/tests/fixtures/card_due_offset_cases.json 作為唯一真相（同 week_cases 的做法）。
 * 送出時仍以後端回傳的 due_month_offset 為準；這裡只是讓使用者在按送出前看到結果。
 */

export type DueMonthOffset = 0 | 1;

/** 繳款日 ≤ 結帳日 → 次月（1）；繳款日 > 結帳日 → 同月（0）。 */
export function inferDueMonthOffset(statementDay: number, dueDay: number): DueMonthOffset {
  return dueDay <= statementDay ? 1 : 0;
}

/** 表單預覽文案（SRS 4.2 操作流程）。 */
export function describeDueMonthOffset(offset: DueMonthOffset): string {
  return offset === 1 ? "這張卡繳款月將自動落在消費月的次月" : "這張卡繳款月將自動落在消費月的同月";
}

/** 結帳日／繳款日的合法範圍 1～31（SRS 4.2 欄位規格表）。 */
export function isValidDayOfMonth(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}
