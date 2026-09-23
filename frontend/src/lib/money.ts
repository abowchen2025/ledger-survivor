/**
 * 金額輸入的解析與顯示。
 *
 * 快速記帳的金額欄位是 inputmode="decimal" 的文字輸入（叫出手機數字鍵盤），使用者只輸入正數；
 * 退款用表單上的「退款」切換，送出時取負值（iOS 數字鍵盤沒有負號鍵）。
 * 後端金額是 NUMERIC(12,2)：最多兩位小數、不可為 0。
 */

export const AMOUNT_REQUIRED_MESSAGE = "請輸入金額";
/** SRS 4.5 欄位規格表原文 */
export const AMOUNT_ZERO_MESSAGE = "金額不可為0";
export const AMOUNT_FORMAT_MESSAGE = "金額最多兩位小數";

const AMOUNT_RE = /^\d+(\.\d{0,2})?$/;

export type ParsedAmount = { ok: true; value: number } | { ok: false; message: string };

/**
 * 把使用者輸入的正數字串轉成送出的金額；refund 為 true 時取負值。
 * 允許前後空白與千分位逗號；空字串、0、超過兩位小數各回對應文案。
 */
export function parseAmountInput(raw: string, refund = false): ParsedAmount {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return { ok: false, message: AMOUNT_REQUIRED_MESSAGE };
  if (!AMOUNT_RE.test(cleaned)) return { ok: false, message: AMOUNT_FORMAT_MESSAGE };
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, message: AMOUNT_FORMAT_MESSAGE };
  if (value === 0) return { ok: false, message: AMOUNT_ZERO_MESSAGE };
  return { ok: true, value: refund ? -value : value };
}

const formatter = new Intl.NumberFormat("zh-Hant-TW", { maximumFractionDigits: 2 });

/** 顯示用：負數帶「−」（U+2212）並由呼叫端上色；千分位。 */
export function formatAmount(value: number): string {
  const abs = formatter.format(Math.abs(value));
  return value < 0 ? `−${abs}` : abs;
}

/** 編輯既有花費時把後端金額拆回表單狀態（正數字串 + 退款旗標）。 */
export function splitAmount(value: number): { input: string; refund: boolean } {
  return { input: formatter.format(Math.abs(value)).replace(/,/g, ""), refund: value < 0 };
}
