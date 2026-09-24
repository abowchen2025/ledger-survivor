/** lib/income-payload.ts：欄位集合就是 schema.d.ts 的 Update／Create 型別；文案同 SRS 4.1。後端 Pydantic 驗證在契約測試。 */
import { describe, expect, it } from "vitest";

import {
  extraIncomeCreatePayload,
  extraIncomeUpdatePayload,
  monthIncomePayload,
  parseExtraIncomeForm,
  parseMonthIncomeForm,
  parseRecurringExpenseForm,
  recurringExpenseCreatePayload,
  recurringExpenseUpdatePayload,
} from "./income-payload";

describe("月薪與儲蓄目標", () => {
  it("正常：千分位、小數；儲蓄目標空白視為 0", () => {
    const parsed = parseMonthIncomeForm({ salary: "52,000.5", savingsTarget: "" });
    expect(parsed).toEqual({ ok: true, fields: { salary: 52000.5, savings_target: 0 } });
    if (!parsed.ok) return;
    const payload = monthIncomePayload(parsed.fields);
    expect(Object.keys(payload).sort()).toEqual(["salary", "savings_target"]);
    expect(payload).toEqual({ salary: 52000.5, savings_target: 0 });
  });

  it("月薪 0 與儲蓄 0 都合法（≥0）", () => {
    expect(parseMonthIncomeForm({ salary: "0", savingsTarget: "0.00" })).toEqual({ ok: true, fields: { salary: 0, savings_target: 0 } });
  });

  it("月薪空白、負數、儲蓄負數 → SRS 文案，鍵是後端欄位名", () => {
    expect(parseMonthIncomeForm({ salary: "", savingsTarget: "-1" })).toEqual({
      ok: false,
      errors: { salary: "月薪不可為負數", savings_target: "儲蓄目標不可為負數" },
    });
    expect(parseMonthIncomeForm({ salary: "-500", savingsTarget: "100" })).toEqual({ ok: false, errors: { salary: "月薪不可為負數" } });
  });
});

describe("額外收入", () => {
  it("欄位集合就是 ExtraIncomeCreate／ExtraIncomeUpdate；month 來自設定頁選的月份", () => {
    const parsed = parseExtraIncomeForm({ name: " 年終 ", amount: "30,000" }, "2026-12");
    expect(parsed).toEqual({ ok: true, fields: { month: "2026-12", name: "年終", amount: 30000 } });
    if (!parsed.ok) return;
    const create = extraIncomeCreatePayload(parsed.fields);
    const update = extraIncomeUpdatePayload(parsed.fields);
    expect(Object.keys(create).sort()).toEqual(["amount", "month", "name"]);
    expect(update).toEqual(create);
  });

  it("名稱空白、金額 0 或負 → SRS 文案", () => {
    expect(parseExtraIncomeForm({ name: "", amount: "0" }, "2026-09")).toEqual({ ok: false, errors: { name: "請輸入收入名稱", amount: "金額須大於0" } });
    expect(parseExtraIncomeForm({ name: "獎金", amount: "-5" }, "2026-09")).toEqual({ ok: false, errors: { amount: "金額須大於0" } });
  });
});

describe("固定支出", () => {
  it("欄位集合就是 RecurringExpenseCreate／Update；結束月空白送 null", () => {
    const parsed = parseRecurringExpenseForm({ name: "房租", amount: "18000", startMonth: "2026-01", endMonth: "" });
    expect(parsed).toEqual({ ok: true, fields: { name: "房租", amount: 18000, start_month: "2026-01", end_month: null } });
    if (!parsed.ok) return;
    const create = recurringExpenseCreatePayload(parsed.fields);
    expect(Object.keys(create).sort()).toEqual(["amount", "end_month", "name", "start_month"]);
    expect(recurringExpenseUpdatePayload(parsed.fields)).toEqual(create);
  });

  it("結束月早於起始月 → 「結束月不可早於起始月」；結束月等於起始月合法", () => {
    expect(parseRecurringExpenseForm({ name: "保險", amount: "2000", startMonth: "2026-09", endMonth: "2026-08" })).toEqual({
      ok: false,
      errors: { end_month: "結束月不可早於起始月" },
    });
    expect(parseRecurringExpenseForm({ name: "保險", amount: "2000", startMonth: "2026-09", endMonth: "2026-09" }).ok).toBe(true);
  });

  it("起始月格式錯、名稱超過 50 字、金額 0", () => {
    expect(parseRecurringExpenseForm({ name: "x".repeat(51), amount: "0", startMonth: "2026/09", endMonth: "" })).toEqual({
      ok: false,
      errors: { name: "請輸入支出名稱", amount: "金額須大於0", start_month: "請選擇起始月份" },
    });
  });
});
