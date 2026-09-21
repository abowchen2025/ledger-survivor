/**
 * 週歸屬規則前端測試（REQ-WEEK-001、REQ-WEEK-002、REQ-WEEK-005）。
 *
 * 所有日期資料一律來自 backend/tests/fixtures/week_cases.json（同一份檔案，不複製），
 * 測試名稱與後端 tests/unit/test_week_rule.py 一一對應，方便交叉比對。
 */
import { describe, expect, it } from "vitest";

import {
  TAIPEI,
  formatMonth,
  todayTaipei,
  weekBelongsToMonth,
  weekEnd,
  weekIndexInMonth,
  weekOf,
  weekRange,
  weekStart,
  weekThursday,
  weeksInMonth,
  weeksOfMonth,
} from "./week";
import { WEEK_CASES_PATH, loadWeekCases, type WeekCase } from "./week-fixture";

const { cases: weekCases } = loadWeekCases();

function casesFor(tcId: string): WeekCase[] {
  const selected = weekCases.filter((c) => c.tc.includes(tcId));
  expect(selected, `week_cases.json 沒有標記 ${tcId} 的案例`).not.toHaveLength(0);
  return selected;
}

function calendarMonthOf(date: string): string {
  return date.slice(0, 7);
}

/** 整週七天都必須得到同一個 ISO 週與同一個歸屬月份。 */
function assertWholeWeek(c: WeekCase): void {
  for (const day of weekRange(c.iso_year, c.iso_week)) {
    expect(weekOf(day), `${day} 的 ISO 週錯誤`).toEqual({ isoYear: c.iso_year, isoWeek: c.iso_week });
    expect(weekBelongsToMonth(c.iso_year, c.iso_week), `${day} 所屬週應歸 ${c.belongs_month}`).toBe(
      c.belongs_month,
    );
  }
}

function assertCase(c: WeekCase): void {
  const { isoYear, isoWeek } = weekOf(c.date);
  expect({ isoYear, isoWeek }, JSON.stringify(c)).toEqual({ isoYear: c.iso_year, isoWeek: c.iso_week });
  expect(weekBelongsToMonth(isoYear, isoWeek), JSON.stringify(c)).toBe(c.belongs_month);
  expect(weekStart(isoYear, isoWeek), JSON.stringify(c)).toBe(c.week_start);
  expect(weekEnd(isoYear, isoWeek), JSON.stringify(c)).toBe(c.week_end);
  expect(weekIndexInMonth(isoYear, isoWeek), JSON.stringify(c)).toBe(c.week_index_in_month);
  expect(weeksInMonth(c.belongs_month), JSON.stringify(c)).toBe(c.weeks_in_month);
}

describe("week rule (fixture: backend/tests/fixtures/week_cases.json)", () => {
  it("reads the backend fixture file itself, not a copy", () => {
    expect(WEEK_CASES_PATH.replace(/\\/g, "/")).toMatch(/\/backend\/tests\/fixtures\/week_cases\.json$/);
    expect(weekCases.length).toBeGreaterThanOrEqual(12);
  });

  it("test_week_belongs_to_month_thursday_boundary (TC-EDGE-WEEK-001)", () => {
    for (const c of casesFor("TC-EDGE-WEEK-001")) {
      const { isoYear, isoWeek } = weekOf(c.date);
      expect({ isoYear, isoWeek }).toEqual({ isoYear: c.iso_year, isoWeek: c.iso_week });
      const belongs = weekBelongsToMonth(isoYear, isoWeek);
      expect(belongs).toBe(c.belongs_month);
      // 此 TC 的案例必須是跨月週（週一與週日在不同日曆月），且歸屬月份 = 週四所在月份
      expect(calendarMonthOf(c.week_start), "此 TC 的案例須為跨月週").not.toBe(calendarMonthOf(c.week_end));
      expect(calendarMonthOf(weekThursday(isoYear, isoWeek))).toBe(belongs);
      assertCase(c);
      assertWholeWeek(c);
    }
  });

  it("test_week_belongs_to_month_prior_boundary (TC-EDGE-WEEK-002)", () => {
    for (const c of casesFor("TC-EDGE-WEEK-002")) {
      expect(calendarMonthOf(c.date), "此 TC 的案例日期須落在非歸屬月份").not.toBe(c.belongs_month);
      assertCase(c);
      assertWholeWeek(c);
    }
  });

  it("test_month_week_count_4_or_5 (TC-FUNC-WEEK-003)", () => {
    expect(casesFor("TC-FUNC-WEEK-003")).not.toHaveLength(0);
    const expectedByMonth = new Map<string, number>();
    for (const c of weekCases) {
      const prev = expectedByMonth.get(c.belongs_month);
      if (prev === undefined) expectedByMonth.set(c.belongs_month, c.weeks_in_month);
      else expect(prev, `fixture 內 ${c.belongs_month} 的 weeks_in_month 不一致`).toBe(c.weeks_in_month);
    }
    const counts = new Set(expectedByMonth.values());
    expect(counts.has(4) && counts.has(5), "fixture 須同時含 4 週月與 5 週月樣本").toBe(true);

    for (const [month, expected] of expectedByMonth) {
      const actual = weeksInMonth(month);
      expect(actual, `${month} 週數應為 ${expected}，得到 ${actual}`).toBe(expected);
      expect([4, 5]).toContain(actual);
      const weeks = weeksOfMonth(month);
      expect(weeks).toHaveLength(expected);
      weeks.forEach((w, i) => {
        expect(weekBelongsToMonth(w.isoYear, w.isoWeek)).toBe(month);
        expect(weekIndexInMonth(w.isoYear, w.isoWeek)).toBe(i + 1);
      });
    }
  });

  it("test_cross_year_week_iso_year_differs_from_calendar_year", () => {
    const lower = weekCases.filter((c) => Number(c.date.slice(0, 4)) < c.iso_year);
    const higher = weekCases.filter((c) => Number(c.date.slice(0, 4)) > c.iso_year);
    expect(lower, "fixture 缺「日曆年 < ISO 年」案例").not.toHaveLength(0);
    expect(higher, "fixture 缺「日曆年 > ISO 年」案例").not.toHaveLength(0);
    for (const c of [...lower, ...higher]) {
      const { isoYear, isoWeek } = weekOf(c.date);
      expect(isoYear, JSON.stringify(c)).toBe(c.iso_year);
      expect(weekBelongsToMonth(isoYear, isoWeek), JSON.stringify(c)).toBe(c.belongs_month);
      expect(weeksOfMonth(c.belongs_month), JSON.stringify(c)).toContainEqual({ isoYear, isoWeek });
    }
  });

  it("test_all_cases_roundtrip", () => {
    for (const c of weekCases) assertCase(c);
  });

  it("test_today_taipei_returns_date (REQ-WEEK-005)", () => {
    expect(TAIPEI).toBe("Asia/Taipei");
    expect(todayTaipei()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 台北 2026-01-01 00:30 = UTC 2025-12-31 16:30：「今天」必須是台北日曆日
    expect(todayTaipei(new Date("2025-12-31T16:30:00Z"))).toBe("2026-01-01");
    expect(formatMonth(2026, 1)).toBe("2026-01");
  });

  it("rejects invalid dates and months like the backend does", () => {
    expect(() => weekOf("2026-02-30")).toThrow(RangeError);
    expect(() => weekOf("2026/02/03")).toThrow(RangeError);
    expect(() => weeksInMonth("2026-13")).toThrow(RangeError);
    expect(() => weekStart(2027, 53)).toThrow(RangeError); // 2027 只有 52 個 ISO 週
    expect(weekStart(2026, 53)).toBe("2026-12-28"); // 2026 是 ISO 53 週年
  });
});
