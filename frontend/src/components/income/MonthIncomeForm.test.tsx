// @vitest-environment jsdom
/** 月薪與儲蓄目標表單（SRS 4.1；spec-gaps 8.4 三種狀態：有值／沿用／未設定）。 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import type { MonthIncome, MonthIncomeUpdate } from "@/api/income";

import { MonthIncomeForm, UNSET_SALARY_MESSAGE } from "./MonthIncomeForm";

function setup(data: MonthIncome) {
  const onSave = vi.fn<(p: MonthIncomeUpdate) => Promise<void>>().mockResolvedValue(undefined);
  const utils = render(<MonthIncomeForm data={data} onSave={onSave} />);
  return { ...utils, onSave, user: userEvent.setup(), salary: () => screen.getByLabelText("月薪"), savings: () => screen.getByLabelText("儲蓄目標") };
}

describe("MonthIncomeForm 三種狀態", () => {
  it("有值：欄位帶入該月金額，沒有沿用／未設定提示", () => {
    const { salary, savings } = setup({ month: "2026-09", salary: 52000, savings_target: 5000, inherited_from: null });
    expect(salary()).toHaveValue("52000");
    expect(savings()).toHaveValue("5000");
    expect(screen.queryByTestId("inherited-hint")).not.toBeInTheDocument();
    expect(screen.queryByTestId("unset-hint")).not.toBeInTheDocument();
  });

  it("沿用：顯示「沿用 2026-08 的金額」，欄位帶入該值可覆寫，儲存才 PUT", async () => {
    const { user, onSave, salary } = setup({ month: "2026-09", salary: 50000, savings_target: 0, inherited_from: "2026-08" });
    expect(screen.getByTestId("inherited-hint")).toHaveTextContent("沿用 2026-08 的金額");
    expect(salary()).toHaveValue("50000");
    expect(onSave).not.toHaveBeenCalled();
    await user.clear(salary());
    await user.type(salary(), "55,000");
    await user.click(screen.getByTestId("save-income"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual({ salary: 55000, savings_target: 0 });
    expect(Object.keys(onSave.mock.calls[0][0]).sort()).toEqual(["salary", "savings_target"]);
  });

  it("未設定：欄位空白並提示「尚未設定本月月薪」；空白送出顯示 SRS 文案不呼叫 onSave", async () => {
    const { user, onSave, salary, savings } = setup({ month: "2026-09", salary: null, savings_target: null, inherited_from: null });
    expect(screen.getByTestId("unset-hint")).toHaveTextContent(UNSET_SALARY_MESSAGE);
    expect(salary()).toHaveValue("");
    expect(savings()).toHaveValue("");
    await user.click(screen.getByTestId("save-income"));
    expect(screen.getByText("月薪不可為負數")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("MonthIncomeForm 錯誤處理", () => {
  it("後端 error.fields 顯示在欄位下方、不清空輸入；按鈕放開", async () => {
    const { user, onSave, salary } = setup({ month: "2026-09", salary: null, savings_target: null, inherited_from: null });
    onSave.mockRejectedValueOnce(new ApiError(400, { error: { code: "VALIDATION_ERROR", message: "資料格式有誤", fields: { savings_target: "儲蓄目標不可為負數" } } }));
    await user.type(salary(), "40000");
    await user.click(screen.getByTestId("save-income"));
    await waitFor(() => expect(screen.getByText("儲蓄目標不可為負數")).toBeInTheDocument());
    expect(salary()).toHaveValue("40000");
    expect(screen.getByTestId("save-income")).not.toBeDisabled();
  });

  it("網路錯誤 → 表單頂部整體訊息，輸入保留", async () => {
    const { user, onSave, salary } = setup({ month: "2026-09", salary: 1, savings_target: 0, inherited_from: null });
    onSave.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.type(salary(), "0");
    await user.click(screen.getByTestId("save-income"));
    await waitFor(() => expect(screen.getByTestId("form-error")).toHaveTextContent("連線失敗，請稍後再試"));
    expect(salary()).toHaveValue("10");
  });
});
