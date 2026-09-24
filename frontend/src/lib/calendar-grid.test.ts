/**
 * 月曆格線（SRS 4.5／4.6；ABow 2026-09-24 第 2.3 節）。
 * 跨月與跨年案例一律取自 backend/tests/fixtures/week_cases.json（週歸屬規則的唯一真相），不另寫一份日期。
 */
import { describe, expect, it } from "vitest";

import type { Expense } from "@/api/expenses";

import { calendarGrid, dailyTotals, gridRange, shiftMonth, weekTotal } from "./calendar-grid";
import { loadWeekCases } from "./week-fixture";

const { cases } = loadWeekCases();

describe("calendarGrid：每一列是 week.ts 的 ISO 週，含該日曆月任一天的週都要出現", () => {
  it("2026-09：第一列 8/31～9/6（歸 9 月）、最後一列 9/28～10/4（歸 10 月，跨月標籤）", () => {
    const rows = calendarGrid("2026-09");
    expect(rows[0]).toMatchObject({ start: "2026-08-31", end: "2026-09-06", belongsMonth: "2026-09", straddlesMonths: true });
    expect(rows[rows.length - 1]).toMatchObject({ start: "2026-09-28", end: "2026-10-04", belongsMonth: "2026-10", straddlesMonths: true });
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.days).toHaveLength(7);
      expect(row.days[0]).toBe(row.start);
      expect(row.days[6]).toBe(row.end);
    }
    expect(gridRange(rows)).toEqual({ start: "2026-08-31", end: "2026-10-04" });
  });

  it("fixture 每筆案例：其日曆月的格線含該週，start／end／belongs_month 與 fixture 一致", () => {
    for (const c of cases) {
      const rows = calendarGrid(c.date.slice(0, 7));
      const row = rows.find((r) => r.start === c.week_start);
      expect(row, `${c.date} 的週 ${c.week_start} 不在 ${c.date.slice(0, 7)} 的格線`).toBeDefined();
      expect(row!.end).toBe(c.week_end);
      expect(row!.belongsMonth).toBe(c.belongs_month);
      expect(row!.days).toContain(c.date);
    }
  });

  it("跨月週在兩個日曆月的格線都出現，且歸屬月份相同（含跨年：2026-12 與 2027-01 都有 12/28～1/3）", () => {
    const straddling = cases.filter((c) => c.week_start.slice(0, 7) !== c.week_end.slice(0, 7));
    expect(straddling.length).toBeGreaterThan(0);
    for (const c of straddling) {
      const inStartMonth = calendarGrid(c.week_start.slice(0, 7)).find((r) => r.start === c.week_start);
      const inEndMonth = calendarGrid(c.week_end.slice(0, 7)).find((r) => r.start === c.week_start);
      expect(inStartMonth, `${c.week_start} 不在 ${c.week_start.slice(0, 7)}`).toBeDefined();
      expect(inEndMonth, `${c.week_start} 不在 ${c.week_end.slice(0, 7)}`).toBeDefined();
      expect(inStartMonth!.straddlesMonths).toBe(true);
      expect(inStartMonth!.belongsMonth).toBe(c.belongs_month);
      expect(inEndMonth!.belongsMonth).toBe(c.belongs_month);
    }
    // 跨年：ISO 2026-W53 歸 2026-12
    expect(calendarGrid("2026-12").at(-1)).toMatchObject({ start: "2026-12-28", end: "2027-01-03", belongsMonth: "2026-12" });
    expect(calendarGrid("2027-01")[0]).toMatchObject({ start: "2026-12-28", end: "2027-01-03", belongsMonth: "2026-12" });
  });

  it("不跨月的週不標籤；同一格線內列不重複且連續", () => {
    for (const month of ["2026-09", "2026-10", "2027-02", "2028-02"]) {
      const rows = calendarGrid(month);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].start > rows[i - 1].end).toBe(true);
      }
      for (const row of rows) {
        if (row.start.slice(0, 7) === row.end.slice(0, 7)) expect(row.straddlesMonths).toBe(false);
      }
    }
  });
});

describe("shiftMonth", () => {
  it("跨年前後", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-09", -9)).toBe("2025-12");
  });
});

describe("dailyTotals／weekTotal：排除獎勵分類、退款照常計入、獎勵另外標記", () => {
  const expense = (id: number, date: string, amount: number, category_id: number): Expense => ({
    id, date, amount, item: `e${id}`, category_id, payment_method: "cash", card_id: null, note: null,
  });
  const REWARD = new Set([99]);
  const expenses = [
    expense(1, "2026-09-28", 120, 1),
    expense(2, "2026-09-28", -20, 1), // 退款
    expense(3, "2026-09-28", 500, 99), // 獎勵：不計入，但標記
    expense(4, "2026-10-01", 80, 2),
    expense(5, "2026-10-04", 999, 99), // 只有獎勵：合計 0、有標記
  ];

  it("每日合計", () => {
    const totals = dailyTotals(expenses, REWARD);
    expect(totals.get("2026-09-28")).toEqual({ total: 100, hasReward: true, count: 3 });
    expect(totals.get("2026-10-01")).toEqual({ total: 80, hasReward: false, count: 1 });
    expect(totals.get("2026-10-04")).toEqual({ total: 0, hasReward: true, count: 1 });
    expect(totals.get("2026-09-29")).toBeUndefined();
  });

  it("週合計＝七天合計相加（9/28～10/4 這一列，跨月）", () => {
    const row = calendarGrid("2026-09").at(-1)!;
    expect(weekTotal(row, dailyTotals(expenses, REWARD))).toBe(180);
  });
});
