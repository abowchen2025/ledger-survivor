/**
 * 把前端 week.ts 對 fixture 全部案例的計算結果輸出成 JSON（stdout），
 * 給後端 tests/integration/test_week_rule_consistency.py（TC-SEC-WEEK-004）
 * 取得後與 Python week_rule 的輸出逐筆比對。
 *
 * 只取每筆案例的 date 當輸入，不讀 fixture 的答案欄位；
 * 輸出鍵名採後端的 snake_case，讓 Python 端可以直接 dict 比對。
 *
 * 執行：npm run week:dump（tsx scripts/week-dump.ts）
 */
import {
  weekBelongsToMonth,
  weekEnd,
  weekIndexInMonth,
  weekOf,
  weekRange,
  weekStart,
  weeksInMonth,
} from "../src/lib/week";
import { loadWeekCases } from "../src/lib/week-fixture";

const { path, sha256, cases } = loadWeekCases();

const rows = cases.map((c) => {
  const { isoYear, isoWeek } = weekOf(c.date);
  const belongs = weekBelongsToMonth(isoYear, isoWeek);
  return {
    date: c.date,
    iso_year: isoYear,
    iso_week: isoWeek,
    belongs_month: belongs,
    week_start: weekStart(isoYear, isoWeek),
    week_end: weekEnd(isoYear, isoWeek),
    week_index_in_month: weekIndexInMonth(isoYear, isoWeek),
    weeks_in_month: weeksInMonth(belongs),
    week_range: weekRange(isoYear, isoWeek),
  };
});

process.stdout.write(JSON.stringify({ fixture: path, sha256, cases: rows }) + "\n");
