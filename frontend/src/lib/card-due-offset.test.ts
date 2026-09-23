/**
 * 繳款月偏移推算（REQ-CARD-002）：與後端讀同一份 fixture
 * backend/tests/fixtures/card_due_offset_cases.json，任一案例不一致即失敗。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { describeDueMonthOffset, inferDueMonthOffset, isValidDayOfMonth } from "./card-due-offset";

interface Case {
  statement_day: number;
  due_day: number;
  expected: 0 | 1;
  note?: string;
}

const FIXTURE = fileURLToPath(new URL("../../../backend/tests/fixtures/card_due_offset_cases.json", import.meta.url));
const cases = (JSON.parse(readFileSync(FIXTURE, "utf-8")) as { cases: Case[] }).cases;

describe("inferDueMonthOffset", () => {
  it("fixture 至少涵蓋 27/15、1/20、結帳 31", () => {
    const keys = cases.map((c) => `${c.statement_day}/${c.due_day}`);
    expect(keys).toContain("27/15");
    expect(keys).toContain("1/20");
    expect(cases.some((c) => c.statement_day === 31)).toBe(true);
  });

  it.each(cases)("結帳 $statement_day、繳款 $due_day → $expected（$note）", (c) => {
    expect(inferDueMonthOffset(c.statement_day, c.due_day)).toBe(c.expected);
  });
});

describe("describeDueMonthOffset", () => {
  it("1 → 次月、0 → 同月", () => {
    expect(describeDueMonthOffset(1)).toMatch(/次月/);
    expect(describeDueMonthOffset(0)).toMatch(/同月/);
  });
});

describe("isValidDayOfMonth", () => {
  it("1～31 的整數", () => {
    expect(isValidDayOfMonth(1)).toBe(true);
    expect(isValidDayOfMonth(31)).toBe(true);
    expect(isValidDayOfMonth(0)).toBe(false);
    expect(isValidDayOfMonth(32)).toBe(false);
    expect(isValidDayOfMonth(15.5)).toBe(false);
    expect(isValidDayOfMonth(Number.NaN)).toBe(false);
  });
});
