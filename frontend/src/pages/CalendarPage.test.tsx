// @vitest-environment jsdom
/**
 * 月曆頁（SRS 4.5／4.6；ABow 2026-09-24 第 2.3 節）：跨月週標籤、非本月日期淡化但顯示金額、
 * 每日與每週合計排除獎勵、獎勵小記號、點日期展開明細。格線本身的正確性在 lib/calendar-grid.test.ts（讀 week_cases.json）。
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import * as cardsApi from "@/api/cards";
import * as categoriesApi from "@/api/categories";
import type { Expense } from "@/api/expenses";
import * as expensesApi from "@/api/expenses";
import { useCardStore } from "@/store/card-store";
import { useCategoryStore } from "@/store/category-store";

import CalendarPage from "./CalendarPage";

vi.mock("@/api/expenses", () => ({ listExpenses: vi.fn(), updateExpense: vi.fn(), deleteExpense: vi.fn(), createExpense: vi.fn() }));
vi.mock("@/api/categories", () => ({ listCategoryGroups: vi.fn(), listCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(), deleteCategory: vi.fn() }));
vi.mock("@/api/cards", () => ({ listCards: vi.fn(), createCard: vi.fn(), updateCard: vi.fn(), deleteCard: vi.fn() }));
// 今天固定在 2026-09-24（9 月），月曆預設顯示 2026-09
vi.mock("@/lib/week", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/week")>();
  return { ...mod, todayTaipei: () => "2026-09-24" };
});

const expense = (id: number, date: string, amount: number, category_id: number): Expense => ({
  id, date, amount, item: `項目${id}`, category_id, payment_method: "cash", card_id: null, note: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  useCategoryStore.setState({ groups: [], categories: [], loaded: false, loading: false });
  useCardStore.setState({ cards: [], loaded: false, loading: false });
  vi.mocked(categoriesApi.listCategoryGroups).mockResolvedValue([
    { id: 1, code: "FOOD", name: "食", necessity: "必要", counts_toward_target: true, benchmark_min_pct: null, benchmark_max_pct: null, sort_order: 1, is_system: true, is_active: true },
    { id: 7, code: "REWARD", name: "獎勵", necessity: "想要", counts_toward_target: false, benchmark_min_pct: null, benchmark_max_pct: null, sort_order: 7, is_system: true, is_active: true },
  ]);
  vi.mocked(categoriesApi.listCategories).mockResolvedValue([
    { id: 11, group_id: 1, name: "三餐外食", is_system: true, sort_order: 1, is_active: true },
    { id: 71, group_id: 7, name: "犒賞自己", is_system: true, sort_order: 1, is_active: true },
  ]);
  vi.mocked(cardsApi.listCards).mockResolvedValue([]);
  vi.mocked(expensesApi.listExpenses).mockResolvedValue([
    expense(1, "2026-08-31", 300, 11), // 8 月日期，在 9 月格線第一列
    expense(2, "2026-09-28", 120, 11),
    expense(3, "2026-09-28", -20, 11), // 退款
    expense(4, "2026-09-28", 999, 71), // 獎勵：不計入，加記號
    expense(5, "2026-10-01", 80, 11), // 10 月日期，在 9 月格線最後一列
  ]);
});

function setup() {
  const utils = render(
    <MemoryRouter>
      <CalendarPage />
    </MemoryRouter>,
  );
  return { ...utils, user: userEvent.setup() };
}

const dayCell = (date: string) => screen.getByTestId("calendar-grid").querySelector<HTMLButtonElement>(`[data-date="${date}"]`)!;

describe("CalendarPage", () => {
  it("查詢範圍是格線第一天到最後一天（2026-09 → 8/31～10/4）", async () => {
    setup();
    await waitFor(() => expect(expensesApi.listExpenses).toHaveBeenCalledWith("2026-08-31", "2026-10-04"));
  });

  it("以週為列：第一列 8/31 起、最後一列 9/28 起；兩列跨月週各有「這週算 X 月」標籤", async () => {
    setup();
    await waitFor(() => expect(screen.getAllByTestId("calendar-row")).toHaveLength(5));
    const rows = screen.getAllByTestId("calendar-row");
    expect(rows[0]).toHaveAttribute("data-week-start", "2026-08-31");
    expect(rows[4]).toHaveAttribute("data-week-start", "2026-09-28");
    const labels = screen.getAllByTestId("straddle-label").map((el) => el.textContent);
    expect(labels).toEqual(["這週算 9 月", "這週算 10 月"]);
  });

  it("非本月日期淡化但仍顯示金額；每日合計排除獎勵、退款照常計入；獎勵加小記號", async () => {
    setup();
    await waitFor(() => expect(dayCell("2026-09-28")).toHaveTextContent("100"));
    // 8/31（8 月）：淡化、但有 300
    expect(dayCell("2026-08-31")).not.toHaveAttribute("data-in-month");
    expect(dayCell("2026-08-31")).toHaveTextContent("300");
    expect(dayCell("2026-09-28")).toHaveAttribute("data-in-month", "true");
    // 9/28：120 − 20 = 100，獎勵 999 不計入但有記號
    expect(within(dayCell("2026-09-28")).getByTestId("reward-mark")).toBeInTheDocument();
    expect(within(dayCell("2026-10-01")).queryByTestId("reward-mark")).not.toBeInTheDocument();
    // 週合計：最後一列 9/28～10/4 = 100 + 80
    const totals = screen.getAllByTestId("week-total").map((el) => el.textContent?.trim());
    expect(totals[4]).toBe("180");
    expect(totals[0]).toBe("300");
    // 9 月日曆日合計：只算 9/1～9/30 的日期 → 100
    expect(screen.getByTestId("month-total")).toHaveTextContent("100");
  });

  it("點某一天展開明細（沿用清單元件，可編輯／刪除）；再點收合", async () => {
    vi.mocked(expensesApi.deleteExpense).mockResolvedValue(undefined);
    const { user } = setup();
    await waitFor(() => expect(dayCell("2026-09-28")).toHaveTextContent("100"));
    await user.click(dayCell("2026-09-28"));
    const detail = screen.getByTestId("day-detail");
    expect(within(detail).getAllByTestId("expense-row")).toHaveLength(3);
    expect(within(detail).getByText("不計入週花費")).toBeInTheDocument();
    // 刪除退款那筆 → 格子合計變 120
    window.confirm = () => true;
    await user.click(within(detail).getByRole("button", { name: "刪除 項目3" }));
    await waitFor(() => expect(dayCell("2026-09-28")).toHaveTextContent("120"));
    expect(expensesApi.deleteExpense).toHaveBeenCalledWith(3);
    await user.click(dayCell("2026-09-28"));
    expect(screen.queryByTestId("day-detail")).not.toBeInTheDocument();
  });

  it("上一月／下一月切換並重新查詢", async () => {
    const { user } = setup();
    await waitFor(() => expect(expensesApi.listExpenses).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "下一月" }));
    await waitFor(() => expect(expensesApi.listExpenses).toHaveBeenLastCalledWith("2026-09-28", "2026-11-01"));
    expect(screen.getByText("2026 年 10 月")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "回本月" }));
    await waitFor(() => expect(screen.getByText("2026 年 9 月")).toBeInTheDocument());
  });
});
