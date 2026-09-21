import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Zustand store 結構示範。Phase 0 只放一個與業務無關的欄位，
 * 之後每個功能模組各自一個 store 檔（例如 expense-store.ts），不要全部塞進這裡。
 *
 * 慣例：
 * - state 與 action 寫在同一個介面，action 以動詞開頭
 * - 元件用 selector 取值：useAppStore((s) => s.ready)，避免整個 store 變動就重繪
 */
export interface AppState {
  /** 應用程式初始化完成（例如分類與設定載入後）才為 true；骨架階段固定 false。 */
  ready: boolean;
  setReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      ready: false,
      setReady: (ready) => set({ ready }, false, "app/setReady"),
    }),
    { name: "app" },
  ),
);
