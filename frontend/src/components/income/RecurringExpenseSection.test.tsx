// @vitest-environment jsdom
/** 固定支出（SRS 4.1 條件呈現：結束月已過灰階＋刪除線但不隱藏；新增檢核結束月不可早於起始月）。 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RecurringExpense, RecurringExpenseCreate, RecurringExpenseUpdate } from "@/api/income";

import { RecurringExpenseSection, isExpired, isUpcoming } from "./RecurringExpenseSection";

const items: RecurringExpense[] = [
  { id: 1, name: "房租", amount: 18000, start_month: "2026-01", end_month: null },
  { id: 2, name: "舊保險", amount: 2000, start_month: "2025-01", end_month: "2026-06" },
  { id: 3, name: "健身房", amount: 1500, start_month: "2026-11", end_month: "2027-10" },
];

function setup(selectedMonth = "2026-09") {
  const onCreate = vi.fn<(p: RecurringExpenseCreate) => Promise<void>>().mockResolvedValue(undefined);
  const onUpdate = vi.fn<(id: number, p: RecurringExpenseUpdate) => Promise<void>>().mockResolvedValue(undefined);
  const onDelete = vi.fn<(id: number) => Promise<void>>().mockResolvedValue(undefined);
  render(<RecurringExpenseSection selectedMonth={selectedMonth} items={items} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} confirm={() => true} />);
  return { user: userEvent.setup(), onCreate, onUpdate, onDelete };
}

const row = (name: string) => screen.getByText(name).closest("li")!;

describe("isExpired／isUpcoming", () => {
  it("相對於選定月份", () => {
    expect(isExpired(items[1], "2026-09")).toBe(true);
    expect(isExpired(items[1], "2026-06")).toBe(false);
    expect(isExpired(items[0], "2030-01")).toBe(false);
    expect(isUpcoming(items[2], "2026-09")).toBe(true);
    expect(isUpcoming(items[2], "2026-11")).toBe(false);
  });
});

describe("RecurringExpenseSection 呈現", () => {
  it("結束月已過的以灰階＋刪除線呈現但不隱藏；尚未開始的標「11 月起」；生效合計只算目前生效者", () => {
    setup("2026-09");
    expect(screen.getAllByTestId("recurring-expense-row")).toHaveLength(3);
    expect(row("舊保險")).toHaveAttribute("data-expired", "true");
    expect(within(row("舊保險")).getByText("已結束")).toBeInTheDocument();
    expect(row("房租")).not.toHaveAttribute("data-expired");
    expect(within(row("健身房")).getByText("11 月起")).toBeInTheDocument();
    expect(screen.getByText("9 月生效合計 18,000")).toBeInTheDocument();
  });
});

describe("RecurringExpenseSection 新增", () => {
  it("結束月早於起始月 → 「結束月不可早於起始月」，不呼叫 onCreate；修正後送出 payload 欄位集合是 RecurringExpenseCreate", async () => {
    const { user, onCreate } = setup("2026-09");
    await user.click(screen.getByRole("button", { name: "新增固定支出" }));
    await user.type(screen.getByLabelText("名稱"), "Netflix");
    await user.type(screen.getByLabelText("每月金額"), "390");
    // 起始月預設為選定月份
    expect(screen.getByLabelText("起始月")).toHaveValue("2026-09");
    // jsdom 對 type="month" 的鍵盤輸入很慢也不穩，直接觸發 change
    fireEvent.change(screen.getByLabelText("結束月（選填）"), { target: { value: "2026-08" } });
    await user.click(screen.getByRole("button", { name: "新增" }));
    expect(screen.getByText("結束月不可早於起始月")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("結束月（選填）"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "新增" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toEqual({ name: "Netflix", amount: 390, start_month: "2026-09", end_month: null });
    expect(Object.keys(onCreate.mock.calls[0][0]).sort()).toEqual(["amount", "end_month", "name", "start_month"]);
  }, 15000);

  it("編輯：帶入既有值，送出 RecurringExpenseUpdate", async () => {
    const { user, onUpdate } = setup("2026-09");
    await user.click(within(row("房租")).getByRole("button", { name: "編輯 房租" }));
    const amount = screen.getByLabelText("每月金額");
    expect(amount).toHaveValue("18000");
    await user.clear(amount);
    await user.type(amount, "19000");
    await user.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(1, { name: "房租", amount: 19000, start_month: "2026-01", end_month: null }));
  });
});
