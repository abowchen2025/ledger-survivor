/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 建置期環境變數（frontend/.env.example 有說明；Pages 只注入 VITE_API_BASE_URL）
interface ImportMetaEnv {
  /** 後端位址，只到 host[:port]，例如 http://127.0.0.1:8765 */
  readonly VITE_API_BASE_URL: string;
  /**
   * 本機開發用的 API 金鑰預設值，只在 dev build（import.meta.env.DEV）生效，production 一律忽略。
   * 正式金鑰由使用者在設定頁輸入、存 localStorage（docs/adr/0007）。
   */
  readonly VITE_DEV_API_KEY?: string;
}
