// @vitest-environment jsdom
/**
 * 信用卡表單（SRS 4.2）：due_month_offset 即時預覽與後端同一份 fixture（lib/card-due-offset.test.ts 驗一致性，
 * 這裡驗表單真的把推算結果顯示出來並在送出時正確處理覆寫）。
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";

import { CardForm, type CardFormPayload } from "./CardForm";

function setup() {
  const onSubmit = vi.fn<(p: CardFormPayload) => Promise<void>>().mockResolvedValue(undefined);
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
