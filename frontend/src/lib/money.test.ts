import { describe, expect, it } from "vitest";

import { AMOUNT_FORMAT_MESSAGE, AMOUNT_REQUIRED_MESSAGE, AMOUNT_ZERO_MESSAGE, formatAmount, parseAmountInput, splitAmount } from "./money";

describe("parseAmountInput", () => {
  it("正常金額，含小數與千分位", () => {
    expect(parseAmountInput("120")).toEqual({ ok: true, value: 120 });
    expect(parseAmountInput(" 1,250.5 ")).toEqual({ ok: true, value: 1250.5 });
    expect(parseAmountInput("0.01")).toEqual({ ok: true, value: 0.01 });
  });

  it("退款切換 → 送出負值（使用者不需要輸入負號）", () => {
    expect(parseAmountInput("500", true)).toEqual({ ok: true, value: -500 });
  });

  it("空白 → 請輸入金額；0 → SRS 文案「金額不可為0」", () => {
    expect(parseAmountInput("")).toEqual({ ok: false, message: AMOUNT_REQUIRED_MESSAGE });
    expect(parseAmountInput("   ")).toEqual({ ok: false, message: AMOUNT_REQUIRED_MESSAGE });
    expect(parseAmountInput("0")).toEqual({ ok: false, message: AMOUNT_ZERO_MESSAGE });
    expect(parseAmountInput("0.00", true)).toEqual({ ok: false, message: AMOUNT_ZERO_MESSAGE });
  });

  it("負號、文字、三位小數 → 格式錯誤", () => {
    expect(parseAmountInput("-5")).toEqual({ ok: false, message: AMOUNT_FORMAT_MESSAGE });
    expect(parseAmountInput("abc")).toEqual({ ok: false, message: AMOUNT_FORMAT_MESSAGE });
    expect(parseAmountInput("1.234")).toEqual({ ok: false, message: AMOUNT_FORMAT_MESSAGE });
  });
});

describe("formatAmount / splitAmount", () => {
  it("負數用 U+2212 顯示，千分位", () => {
    expect(formatAmount(1250.5)).toBe("1,250.5");
    expect(formatAmount(-500)).toBe("−500");
  });

  it("splitAmount 把後端金額拆回表單狀態", () => {
    expect(splitAmount(-500)).toEqual({ input: "500", refund: true });
    expect(splitAmount(1250.5)).toEqual({ input: "1250.5", refund: false });
  });
});
