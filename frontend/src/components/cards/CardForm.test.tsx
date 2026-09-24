// @vitest-environment jsdom
/**
 * 信用卡表單（SRS 4.2）：due_month_offset 即時預覽與後端同一份 fixture（lib/card-due-offset.test.ts 驗一致性，
 * 這裡驗表單真的把推算結果顯示出來並在送出時正確處理覆寫）。
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Card, CardCreate, CardUpdate } from "@/api/cards";
import { ApiError } from "@/api/client";

import { CardForm } from "./CardForm";

const existingCard: Card = {
  id: 7, name: "舊卡", bank: "B行", last4: "9999", statement_day: 27, due_day: 11, due_month_offset: 1,
  opening_billed_unpaid: 0, opening_unbilled: 14530, opening_as_of: "2026-09-24", color: null, is_active: false,
};

function setup() {
  const onSubmit = vi.fn<(p: CardCreate) => Promise<void>>().mockResolvedValue(undefined);
  render(<CardForm mode="create" onSubmit={onSubmit} />);
  const user = userEvent.setup();
  const fill = async (statement: string, due: string) => {
    await user.clear(screen.getByLabelText("結帳日"));
    await user.type(screen.getByLabelText("結帳日"), statement);
    await user.clear(screen.getByLabelText("繳款日"));
    await user.type(screen.getByLabelText("繳款日"), due);
  };
  const fillBasics = async () => {
    await user.type(screen.getByLabelText("卡名"), "主卡");
    await user.type(screen.getByLabelText("銀行"), "台新");
    await user.type(screen.getByLabelText("末四碼"), "1234");
  };
  return { user, onSubmit, fill, fillBasics, preview: () => screen.getByTestId("due-offset-preview") };
}

describe("CardForm 繳款月偏移即時預覽", () => {
  it("結帳 27／繳款 15 → 次月；結帳 1／繳款 20 → 同月；結帳 31／繳款 5 → 次月", async () => {
    const { fill, preview } = setup();
    expect(preview()).toHaveTextContent("填好結帳日與繳款日後");
    await fill("27", "15");
    expect(preview()).toHaveTextContent("這張卡繳款月將自動落在消費月的次月");
    await fill("1", "20");
    expect(preview()).toHaveTextContent("這張卡繳款月將自動落在消費月的同月");
    await fill("31", "5");
    expect(preview()).toHaveTextContent("次月");
  });

  it("自動模式送出時不帶 due_month_offset（交給後端推算）；手動覆寫則送明確值", async () => {
    const { user, onSubmit, fill, fillBasics } = setup();
    await fillBasics();
    await fill("1", "20");
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "主卡",
      bank: "台新",
      last4: "1234",
      statement_day: 1,
      due_day: 20,
      due_month_offset: null,
      opening_billed_unpaid: 0,
      opening_unbilled: 0,
    });

    await user.selectOptions(screen.getByLabelText("繳款月偏移"), "1");
    expect(screen.getByTestId("due-offset-preview")).toHaveTextContent("手動覆寫");
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0].due_month_offset).toBe(1);
  });
});

describe("CardForm payload 形狀（2026-09-24 Pages 新增卡片 400 的回歸）", () => {
  it("新增：payload 欄位集合就是 CardCreate，沒有 is_active；顏色送出值與畫面預設 #FF8800 一致", async () => {
    const { user, onSubmit, fill, fillBasics } = setup();
    expect(screen.getByLabelText("卡面顏色（選填，#RRGGBB）")).toHaveValue("#FF8800");
    await fillBasics();
    await fill("27", "11");
    await user.type(screen.getByLabelText("未出帳"), "14530");
    await user.type(screen.getByLabelText("期初基準日"), "2026-09-24");
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).not.toHaveProperty("is_active");
    expect(Object.keys(payload).sort()).toEqual(
      ["bank", "color", "due_day", "due_month_offset", "last4", "name", "opening_as_of", "opening_billed_unpaid", "opening_unbilled", "statement_day"],
    );
    expect(payload).toEqual({
      name: "主卡", bank: "台新", last4: "1234", statement_day: 27, due_day: 11, due_month_offset: null,
      color: "#FF8800", opening_billed_unpaid: 0, opening_unbilled: 14530, opening_as_of: "2026-09-24",
    });
  });

  it("顏色按「清除」→ 畫面顯示「未設定」、送出 null；再輸入就送輸入的值", async () => {
    const { user, onSubmit, fill, fillBasics } = setup();
    await fillBasics();
    await fill("1", "20");
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(screen.getByTestId("color-unset")).toBeInTheDocument();
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].color).toBeNull();

    await user.type(screen.getByLabelText("卡面顏色（選填，#RRGGBB）"), "#123abc");
    expect(screen.queryByTestId("color-unset")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0].color).toBe("#123abc");
  });

  it("編輯：payload 欄位集合就是 CardUpdate，沒有 opening_*，is_active 沿用該卡目前狀態", async () => {
    const onSubmit = vi.fn<(p: CardUpdate) => Promise<void>>().mockResolvedValue(undefined);
    render(<CardForm mode="edit" initial={existingCard} onSubmit={onSubmit} />);
    const user = userEvent.setup();
    expect(screen.queryByLabelText("未出帳")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(["bank", "color", "due_day", "due_month_offset", "is_active", "last4", "name", "statement_day"]);
    // 27／11 推算為次月（1），與存的值一致 → 自動模式 → 不覆寫
    expect(payload).toEqual({ name: "舊卡", bank: "B行", last4: "9999", statement_day: 27, due_day: 11, due_month_offset: null, color: null, is_active: false });
  });
});

describe("CardForm 檢核與錯誤", () => {
  it("前端檢核用 SRS 文案：末四碼、結帳日、繳款日", async () => {
    const { user, onSubmit, fill } = setup();
    await user.type(screen.getByLabelText("末四碼"), "12");
    await fill("0", "32");
    await user.click(screen.getByTestId("submit"));
    expect(screen.getByText("請輸入卡片名稱")).toBeInTheDocument();
    expect(screen.getByText("請輸入發卡銀行")).toBeInTheDocument();
    expect(screen.getByText("請輸入卡號末四碼（4位數字）")).toBeInTheDocument();
    expect(screen.getByText("結帳日須介於1-31")).toBeInTheDocument();
    expect(screen.getByText("繳款日須介於1-31")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("error.fields 沒有對應輸入框的欄位（is_active）→ 表單頂部顯示整體錯誤含欄位名，按鈕從「送出中」放開", async () => {
    const { user, onSubmit, fill, fillBasics } = setup();
    onSubmit.mockRejectedValueOnce(new ApiError(400, { error: { code: "VALIDATION_ERROR", message: "資料格式有誤", fields: { is_active: "不允許的欄位" } } }));
    await fillBasics();
    await fill("27", "11");
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(screen.getByTestId("form-error")).toHaveTextContent("資料格式有誤（is_active：不允許的欄位）"));
    expect(screen.getByTestId("submit")).not.toBeDisabled();
    expect(screen.getByTestId("submit")).toHaveTextContent("新增卡片");
    expect(screen.getByLabelText("卡名")).toHaveValue("主卡");
  });

  it("網路錯誤 → 整體錯誤「連線失敗，請稍後再試」，按鈕放開", async () => {
    const { user, onSubmit, fill, fillBasics } = setup();
    onSubmit.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await fillBasics();
    await fill("27", "11");
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(screen.getByTestId("form-error")).toHaveTextContent("連線失敗，請稍後再試"));
    expect(screen.getByTestId("submit")).not.toBeDisabled();
  });

  it("後端 error.fields 顯示在欄位下方，輸入不清空", async () => {
    const { user, onSubmit, fill, fillBasics } = setup();
    onSubmit.mockRejectedValueOnce(new ApiError(400, { error: { code: "VALIDATION_ERROR", message: "資料格式有誤", fields: { color: "顏色格式錯誤" } } }));
    await fillBasics();
    await fill("27", "15");
    await user.click(screen.getByTestId("submit"));
    await waitFor(() => expect(screen.getByText("顏色格式錯誤")).toBeInTheDocument());
    expect(screen.getByLabelText("卡名")).toHaveValue("主卡");
  });
});
