// @vitest-environment jsdom
/**
 * 快速記帳表單（SRS 4.5；REQ-NFR-002；ABow 2026-09-23 第 4、5 節設計要求）。
 * onSubmit 以 mock 注入，不打後端；後端錯誤用 ApiError 模擬統一格式 body。
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Card } from "@/api/cards";
import { ApiError } from "@/api/client";
import type { ExpenseCreate, ExpenseUpdate } from "@/api/expenses";
import type { CategoryOption } from "@/store/category-store";

import { QuickEntryForm, type QuickEntryFormProps } from "./QuickEntryForm";

const categories: CategoryOption[] = [
  { id: 1, name: "三餐外食", groupId: 1, groupName: "食", isReward: false, isActive: true },
  { id: 2, name: "旅遊", groupId: 6, groupName: "樂", isReward: false, isActive: true },
  { id: 3, name: "停用分類", groupId: 1, groupName: "食", isReward: false, isActive: false },
];

const cards: Card[] = [
  {
    id: 10, name: "A卡", bank: "A行", last4: "1234", statement_day: 27, due_day: 15, due_month_offset: 1,
    opening_billed_unpaid: 0, opening_unbilled: 0, opening_as_of: null, color: null, is_active: true,
  },
  {
    id: 11, name: "舊卡", bank: "B行", last4: "9999", statement_day: 1, due_day: 20, due_month_offset: 0,
    opening_billed_unpaid: 0, opening_unbilled: 0, opening_as_of: null, color: null, is_active: false,
  },
];

type SetupOverrides = Partial<Omit<QuickEntryFormProps, "mode" | "onSubmit">> & { mode?: QuickEntryFormProps["mode"] };

function setup({ mode = "create", ...overrides }: SetupOverrides = {}) {
  // 同一個 mock 接兩種 payload 型別：create 收 ExpenseCreate、edit 收 ExpenseUpdate
  const onSubmit = vi.fn<(p: ExpenseCreate | ExpenseUpdate) => Promise<void>>().mockResolvedValue(undefined);
  const common = {
    initial: { date: "2026-09-23", categoryId: 1, paymentMethod: "cash" as const },
    categories,
    cards: cards.filter((c) => c.is_active),
    ...overrides,
  };
  const utils = render(mode === "create" ? <QuickEntryForm mode="create" onSubmit={onSubmit} {...common} /> : <QuickEntryForm mode="edit" onSubmit={onSubmit} {...common} />);
  const user = userEvent.setup();
  const amount = () => screen.getByLabelText("金額");
  const item = () => screen.getByLabelText("品項");
  const submit = () => screen.getByTestId("submit");
  return { ...utils, user, onSubmit, amount, item, submit };
}

function apiError(status: number, code: string, fields: Record<string, string> | null, message = "資料格式有誤") {
  return new ApiError(status, { error: { code, message, fields } });
}

describe("QuickEntryForm 表單檢核", () => {
  it("金額欄位是 inputmode=decimal 的文字輸入（叫出數字鍵盤）", () => {
    const { amount } = setup();
    expect(amount()).toHaveAttribute("inputmode", "decimal");
    expect(amount()).not.toHaveAttribute("type", "number");
  });

  it("空白送出：金額、品項顯示對應文案，不呼叫 onSubmit", async () => {
    const { user, submit, onSubmit } = setup({ initial: { date: "2026-09-23" } });
    await user.click(submit());
    expect(screen.getByText("請輸入金額")).toBeInTheDocument();
    expect(screen.getByText("請輸入品項")).toBeInTheDocument();
    expect(screen.getByText("請選擇分類")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("金額 0 → SRS 文案「金額不可為0」；修改後錯誤消失", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    await user.type(amount(), "0");
    await user.type(item(), "午餐");
    await user.click(submit());
    expect(screen.getByText("金額不可為0")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(amount(), "120");
    expect(screen.queryByText("金額不可為0")).not.toBeInTheDocument();
  });

  it("停用中的分類不出現在選單（編輯時保留原值除外）", () => {
    setup();
    const select = screen.getByLabelText("分類") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels.some((l) => l?.includes("三餐外食"))).toBe(true);
    expect(labels.some((l) => l?.includes("停用分類"))).toBe(false);
  });
});

describe("QuickEntryForm 送出", () => {
  it("最常見的一筆：只填金額、品項、按送出（分類與支付方式帶入預設）", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    await user.type(amount(), "120");
    await user.type(item(), "午餐");
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      date: "2026-09-23",
      amount: 120,
      item: "午餐",
      category_id: 1,
      payment_method: "cash",
      card_id: null,
      note: null,
    });
  });

  it("退款切換開啟 → 送出負值，使用者不需要輸入負號", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    await user.type(amount(), "500");
    await user.type(item(), "退貨");
    await user.click(screen.getByTestId("refund-switch"));
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].amount).toBe(-500);
  });

  it("成功後清空金額、品項、退款；保留日期、分類、支付方式", async () => {
    const { user, amount, item, submit, onSubmit } = setup({ initial: { date: "2026-09-20", categoryId: 2, paymentMethod: "transfer" } });
    await user.type(amount(), "80");
    await user.type(item(), "咖啡");
    await user.click(screen.getByTestId("refund-switch"));
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(amount()).toHaveValue(""));
    expect(item()).toHaveValue("");
    expect(screen.getByTestId("refund-switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText("日期")).toHaveValue("2026-09-20");
    expect(screen.getByLabelText("分類")).toHaveValue("2");
    expect(screen.getByRole("radio", { name: "轉帳" })).toHaveAttribute("aria-checked", "true");
  });

  it("送出中按鈕停用並顯示「送出中…」，連點只送一次", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => (resolve = r));
    const { user, amount, item, submit, onSubmit } = setup();
    onSubmit.mockReturnValueOnce(pending);
    await user.type(amount(), "120");
    await user.type(item(), "午餐");
    await user.click(submit());
    await user.click(submit());
    await user.click(submit());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveTextContent("送出中…");
    resolve();
    await waitFor(() => expect(submit()).not.toBeDisabled());
  });

  it("點最近品項即填入", async () => {
    const { user, item } = setup({ recentItems: ["午餐", "捷運"] });
    await user.click(within(screen.getByLabelText("最近品項")).getByRole("button", { name: "捷運" }));
    expect(item()).toHaveValue("捷運");
  });
});

describe("QuickEntryForm 支付方式與信用卡欄位", () => {
  it("現金不顯示信用卡；信用卡必填；切回現金清空已選的卡並送 card_id=null", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    expect(screen.queryByLabelText(/信用卡/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "信用卡" }));
    const cardSelect = screen.getByLabelText(/^信用卡/) as HTMLSelectElement;
    // 只列啟用中的卡
    expect(Array.from(cardSelect.options).map((o) => o.textContent)).toEqual(["選擇信用卡", "A卡（1234）"]);

    await user.type(amount(), "300");
    await user.type(item(), "刷卡");
    await user.click(submit());
    expect(screen.getByText("請選擇信用卡")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.selectOptions(cardSelect, "10");
    await user.click(screen.getByRole("radio", { name: "現金" }));
    expect(screen.queryByLabelText(/^信用卡/)).not.toBeInTheDocument();
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ payment_method: "cash", card_id: null });

    // 再切回信用卡：先前的選擇已被清空
    await user.click(screen.getByRole("radio", { name: "信用卡" }));
    expect(screen.getByLabelText(/^信用卡/)).toHaveValue("");
  });

  it("行動支付：信用卡選填，不選也能送出（card_id=null）；選了就是綁卡", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    await user.click(screen.getByRole("radio", { name: "行動支付" }));
    expect(screen.getByLabelText(/信用卡（選填/)).toBeInTheDocument();
    await user.type(amount(), "60");
    await user.type(item(), "飲料");
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ payment_method: "mobile_pay", card_id: null });

    await user.selectOptions(screen.getByLabelText(/信用卡（選填/), "10");
    await user.type(amount(), "60");
    await user.type(item(), "飲料");
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ payment_method: "mobile_pay", card_id: 10 });
  });

  it("編輯模式送出：payload 欄位集合就是 ExpenseUpdate（date 必有）", async () => {
    const { user, submit, onSubmit } = setup({
      mode: "edit",
      cards,
      initial: { date: "2026-09-01", amountInput: "100", item: "舊帳", categoryId: 1, paymentMethod: "credit_card", cardId: 11, note: "備註" },
    });
    await user.click(submit());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(["amount", "card_id", "category_id", "date", "item", "note", "payment_method"]);
    expect(payload).toEqual({ date: "2026-09-01", amount: 100, item: "舊帳", category_id: 1, payment_method: "credit_card", card_id: 11, note: "備註" });
  });

  it("編輯模式保留原本已停用的卡片供沿用", () => {
    setup({
      mode: "edit",
      cards,
      initial: { date: "2026-09-01", amountInput: "100", item: "舊帳", categoryId: 1, paymentMethod: "credit_card", cardId: 11 },
    });
    const cardSelect = screen.getByLabelText(/^信用卡/) as HTMLSelectElement;
    expect(cardSelect).toHaveValue("11");
    expect(Array.from(cardSelect.options).map((o) => o.textContent)).toContain("舊卡（9999）（已停用）");
  });
});

describe("QuickEntryForm 錯誤處理", () => {
  it("後端 error.fields 顯示在對應欄位下方，已輸入內容不清空", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(apiError(400, "VALIDATION_ERROR", { item: "請輸入品項", amount: "金額不可為0" }));
    await user.type(amount(), "120");
    await user.type(item(), "午餐");
    await user.click(submit());
    await waitFor(() => expect(screen.getByText("請輸入品項")).toBeInTheDocument());
    expect(screen.getByText("金額不可為0")).toBeInTheDocument();
    expect(amount()).toHaveValue("120");
    expect(item()).toHaveValue("午餐");
    expect(screen.queryByTestId("form-error")).not.toBeInTheDocument();
  });

  it("MONTH_SETTLED（409）→ 顯示固定文案", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(apiError(409, "MONTH_SETTLED", null, "2026-09 已結算，請先取消結算"));
    await user.type(amount(), "120");
    await user.type(item(), "午餐");
    await user.click(submit());
    await waitFor(() => expect(screen.getByTestId("form-error")).toHaveTextContent("這個月份已結算，需先取消結算才能修改"));
    expect(amount()).toHaveValue("120");
  });

  it("INACTIVE_REFERENCE → 顯示後端訊息、欄位文案，並要求重新載入選單", async () => {
    const onInactiveReference = vi.fn();
    const { user, amount, item, submit, onSubmit } = setup({ onInactiveReference });
    onSubmit.mockRejectedValueOnce(apiError(400, "INACTIVE_REFERENCE", { category_id: "請選擇分類" }, "所選的分類或信用卡已停用"));
    await user.type(amount(), "120");
    await user.type(item(), "午餐");
    await user.click(submit());
    await waitFor(() => expect(screen.getByTestId("form-error")).toHaveTextContent("所選的分類或信用卡已停用"));
    expect(screen.getByText("請選擇分類")).toBeInTheDocument();
    expect(onInactiveReference).toHaveBeenCalledTimes(1);
  });

  it("error.fields 沒有對應輸入框的欄位 → 表單頂部顯示整體錯誤（含欄位名與訊息），按鈕放開，不靜默吞掉", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(apiError(400, "VALIDATION_ERROR", { is_active: "不允許的欄位", item: "請輸入品項" }));
    await user.type(amount(), "120");
    await user.type(item(), "午餐");
    await user.click(submit());
    await waitFor(() => expect(screen.getByTestId("form-error")).toHaveTextContent("資料格式有誤（is_active：不允許的欄位）"));
    // 有輸入框的照舊放欄位下方
    expect(screen.getByText("請輸入品項")).toBeInTheDocument();
    expect(submit()).not.toBeDisabled();
    expect(submit()).toHaveTextContent("記一筆");
    expect(amount()).toHaveValue("120");
  });

  it("送出被後端拒絕後，送出狀態在 finally 重設：按鈕不會卡在「送出中…」", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(apiError(400, "VALIDATION_ERROR", { note: "備註最多100字" }));
    await user.type(amount(), "120");
    await user.type(item(), "午餐");
    await user.click(submit());
    await waitFor(() => expect(submit()).not.toBeDisabled());
    // 備註欄原本收合：收到 note 錯誤時展開讓文案看得到
    expect(screen.getByText("備註最多100字")).toBeInTheDocument();
  });

  it("網路失敗 → 「連線失敗，請稍後再試」，表單內容保留", async () => {
    const { user, amount, item, submit, onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.type(amount(), "120");
    await user.type(item(), "午餐");
    await user.click(submit());
    await waitFor(() => expect(screen.getByTestId("form-error")).toHaveTextContent("連線失敗，請稍後再試"));
    expect(amount()).toHaveValue("120");
    expect(item()).toHaveValue("午餐");
    expect(submit()).not.toBeDisabled();
  });
});
