/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 建置期環境變數（frontend/.env.example 有說明；Pages 由 GitHub Secrets 注入）
interface ImportMetaEnv {
  /** 後端位址，只到 host[:port]，例如 http://127.0.0.1:8765 */
  readonly VITE_API_BASE_URL: string;
  /** REQ-AUTH-000 臨時 API 金鑰，送在 X-API-Key 標頭 */
  readonly VITE_API_KEY: string;
}
