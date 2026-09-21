import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import App from "@/App";
import "@/index.css";

// vite-plugin-pwa：registerType 為 autoUpdate，新版 service worker 就緒後自動接手。
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
