/** 儲存成功的浮動提示：顯示 2 秒後消失（SRS 4.1 狀態呈現）。設定頁各區塊共用。 */
import { useCallback, useEffect, useRef, useState } from "react";

export const TOAST_MS = 2000;

/** 回傳目前訊息與 show(message)；再次呼叫會重設倒數。 */
export function useTransientMessage(ms = TOAST_MS): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (next: string) => {
      setMessage(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), ms);
    },
    [ms],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return [message, show];
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4" data-testid="toast">
      <span className="rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg">{message}</span>
    </div>
  );
}
