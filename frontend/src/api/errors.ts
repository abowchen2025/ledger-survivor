/**
 * 後端錯誤的解讀（docs/spec-gaps.md 8.1）。
 *
 * 業務錯誤（400／403／404／409）body 是 {"error": {"code", "message", "fields"}}；
 * fields 的文字逐字來自 SRS 檢核失敗文案，直接顯示在對應欄位下方。
 * 401 是 {"detail": "unauthorized"}，由 auth-guard 導向設定頁，不在這裡處理。
 * 網路錯誤（fetch 的 TypeError，含 CORS 預檢被擋）顯示固定文案。
 */
import { ApiError, ApiKeyMissingError } from "./client";
import type { components } from "./schema";

export type ErrorBody = components["schemas"]["ErrorBody"];

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CARD_IN_USE: "CARD_IN_USE",
  MONTH_SETTLED: "MONTH_SETTLED",
  INACTIVE_REFERENCE: "INACTIVE_REFERENCE",
  DUPLICATE_NAME: "DUPLICATE_NAME",
} as const;

export const NETWORK_ERROR_MESSAGE = "連線失敗，請稍後再試";
export const MONTH_SETTLED_MESSAGE = "這個月份已結算，需先取消結算才能修改";
export const CARD_IN_USE_MESSAGE = "這張卡已有花費或分期紀錄，無法刪除，請改用停用";

export interface ApiErrorInfo {
  /** 網路錯誤時為 0 */
  status: number;
  /** 後端的 error.code；非統一格式（401、5xx、網路錯誤）時為 null */
  code: string | null;
  /** 可直接顯示的整體訊息 */
  message: string;
  /** 欄位 → 文案；沒有就是空物件 */
  fields: Record<string, string>;
  /** fetch 失敗、後端沒回應 */
  network: boolean;
}

function isErrorBody(body: unknown): body is { error: ErrorBody } {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const e = (body as { error: unknown }).error;
  return typeof e === "object" && e !== null && typeof (e as ErrorBody).code === "string";
}

/** 把任何 catch 到的東西轉成畫面能用的資訊。呼叫端應先用 useAuthFailureRedirect 處理 401／缺金鑰。 */
export function describeApiError(err: unknown): ApiErrorInfo {
  if (err instanceof ApiKeyMissingError) {
    return { status: 0, code: null, message: err.message, fields: {}, network: false };
  }
  if (err instanceof ApiError) {
    if (isErrorBody(err.body)) {
      const { code, message, fields } = err.body.error;
      return {
        status: err.status,
        code,
        message: overrideMessage(code, message),
        fields: fields ?? {},
        network: false,
      };
    }
    if (err.status === 401) return { status: 401, code: null, message: "金鑰不符（401）", fields: {}, network: false };
    return { status: err.status, code: null, message: `伺服器錯誤（HTTP ${err.status}）`, fields: {}, network: false };
  }
  if (err instanceof TypeError) {
    return { status: 0, code: null, message: NETWORK_ERROR_MESSAGE, fields: {}, network: true };
  }
  return { status: 0, code: null, message: err instanceof Error ? err.message : String(err), fields: {}, network: false };
}

/** 幾個 code 用固定的前端文案（ABow 2026-09-23 指定），其餘沿用後端 message。 */
function overrideMessage(code: string, backendMessage: string): string {
  switch (code) {
    case ERROR_CODES.MONTH_SETTLED:
      return MONTH_SETTLED_MESSAGE;
    case ERROR_CODES.CARD_IN_USE:
      return CARD_IN_USE_MESSAGE;
    default:
      return backendMessage;
  }
}

export interface SplitFieldErrors {
  /** 畫面上有輸入框的欄位 → 文案（放到欄位下方） */
  fieldErrors: Record<string, string>;
  /** 表單頂部的整體訊息；null 代表所有錯誤都已放到欄位下方 */
  formError: string | null;
}

/**
 * 把 error.fields 分成「畫面上有對應輸入框」與「沒有」兩組（2026-09-24 ABow 第 2.3 節）。
 *
 * - 有對應輸入框的照舊顯示在欄位下方。
 * - 沒有對應輸入框的（例如前端送了後端 schema 沒有的欄位、或後端新增了前端還沒有的欄位）
 *   併進表單頂部的整體訊息，逐一列出「欄位名：訊息」。不可以靜默吞掉：看不到錯誤的表單等於卡死。
 * - 非 VALIDATION_ERROR（409、403、網路錯誤…）一律顯示整體訊息，欄位文案（若有）照樣放到欄位下方。
 */
export function splitFieldErrors(info: ApiErrorInfo, knownFields: Iterable<string>): SplitFieldErrors {
  const known = new Set(knownFields);
  const fieldErrors: Record<string, string> = {};
  const unmapped: string[] = [];
  for (const [field, message] of Object.entries(info.fields)) {
    if (known.has(field)) fieldErrors[field] = message;
    else unmapped.push(`${field}：${message}`);
  }
  if (info.code !== ERROR_CODES.VALIDATION_ERROR || Object.keys(info.fields).length === 0) {
    return { fieldErrors, formError: unmapped.length > 0 ? `${info.message}（${unmapped.join("；")}）` : info.message };
  }
  return { fieldErrors, formError: unmapped.length > 0 ? `${info.message}（${unmapped.join("；")}）` : null };
}
