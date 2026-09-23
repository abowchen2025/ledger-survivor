/**
 * vitest 共用設定：載入 jest-dom 的 matcher（toBeInTheDocument、toBeDisabled…）。
 * 元件測試檔在檔頭以 `// @vitest-environment jsdom` 切換環境；純函式測試維持 node。
 */
import "@testing-library/jest-dom/vitest";
