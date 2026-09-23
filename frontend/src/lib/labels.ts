/** 顯示用標籤：支付方式（程式值 → 中文），與 SRS 4.5 欄位規格表的列舉順序一致。 */
import type { PaymentMethod } from "@/api/expenses";

export const PAYMENT_METHODS: readonly { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "現金" },
  { value: "credit_card", label: "信用卡" },
  { value: "mobile_pay", label: "行動支付" },
  { value: "transfer", label: "轉帳" },
];

export function paymentMethodLabel(value: PaymentMethod): string {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value;
}

/**
 * 信用卡欄位的顯示規則（docs/spec-gaps.md 8.5）：
 * credit_card 必填、mobile_pay 選填（有填＝綁卡）、cash／transfer 不得帶卡。
 */
export function cardFieldMode(method: PaymentMethod): "required" | "optional" | "hidden" {
  if (method === "credit_card") return "required";
  if (method === "mobile_pay") return "optional";
  return "hidden";
}
