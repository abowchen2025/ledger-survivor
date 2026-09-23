/**
 * 金鑰失敗時導向設定頁（REQ-AUTH-000）。
 *
 * 用法（頁面或 store 的 catch 裡）：
 *   const redirectOnAuthFailure = useAuthFailureRedirect();
 *   getMe().catch((err) => { if (!redirectOnAuthFailure(err)) setError(err); });
 *
 * 設定頁自己不用這個（它就是目的地）。Phase 3 換 JWT 後改成導向登入頁。
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { isAuthFailure } from "./client";

export const SETTINGS_PATH = "/settings";

export interface AuthRedirectState {
  reason: "api-key-missing" | "api-key-rejected";
}

export function authRedirectState(err: unknown): AuthRedirectState {
  return { reason: err instanceof Error && err.name === "ApiKeyMissingError" ? "api-key-missing" : "api-key-rejected" };
}

/** 回傳一個函式：是金鑰問題就導向設定頁並回 true，否則回 false 讓呼叫端自己處理。 */
export function useAuthFailureRedirect(): (err: unknown) => boolean {
  const navigate = useNavigate();
  return useCallback(
    (err: unknown) => {
      if (!isAuthFailure(err)) return false;
      navigate(SETTINGS_PATH, { replace: true, state: authRedirectState(err) });
      return true;
    },
    [navigate],
  );
}
