/**
 * 讀取週規則唯一真相 backend/tests/fixtures/week_cases.json（REQ-NFR-003）。
 *
 * 只給 Node 環境用（Vitest 與 scripts/week-dump.ts），用到 node:fs；瀏覽器程式碼不得 import 本檔。
 * （檔名不用 .node.ts 後綴：tsx 會把 .node 當成原生模組副檔名而找不到模組。）
 * 前端不複製 fixture，直接以相對路徑讀後端那一份，路徑寫死在 CLAUDE.md 測試佈局：
 * frontend/src/lib/ → ../../../backend/tests/fixtures/week_cases.json
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface WeekCase {
  date: string;
  iso_year: number;
  iso_week: number;
  belongs_month: string;
  week_start: string;
  week_end: string;
  week_index_in_month: number;
  weeks_in_month: number;
  tc: string[];
  note?: string;
}

export const WEEK_CASES_PATH = resolve(
  fileURLToPath(new URL("../../../backend/tests/fixtures/week_cases.json", import.meta.url)),
);

export function loadWeekCases(): { path: string; sha256: string; cases: WeekCase[] } {
  const raw = readFileSync(WEEK_CASES_PATH);
  const parsed = JSON.parse(raw.toString("utf-8")) as { cases: WeekCase[] };
  if (!Array.isArray(parsed.cases) || parsed.cases.length < 12) {
    throw new Error(`week_cases.json 至少需 12 筆案例，讀到 ${parsed.cases?.length ?? 0}`);
  }
  return {
    path: WEEK_CASES_PATH,
    sha256: createHash("sha256").update(raw).digest("hex"),
    cases: parsed.cases,
  };
}
