/**
 * 月曆頁格線（SRS 4.5「月曆頁每日花費合計格」、4.6「以週為列，跨月週標『這週算 X 月』」）。
 *
 * - 列＝ISO 週（週一～週日），全部由 lib/week.ts 產生，這裡不另寫日期運算。
 * - 顯示日曆月 M 時，所有「含 M 任一天」的週都要出現，包括跨月週：2026-09 的第一列是 8/31～9/6、
 *   最後一列是 9/28～10/4（9/28～10/4 依週四規則歸 10 月，所以 belongsMonth 是 2026-10）。
 *   同一個跨月週因此會在兩個日曆月的格線都出現（SRS 4.6 條件呈現邏輯、附錄 Q17）。
 * - 每日合計與週合計只計 counts_toward_target=true 的花費（排除「獎勵」分類，REQ-EXPENSE-003），
 *   與週花費 E 的定義一致；退款（負數）照常計入；當天若有獎勵花費另外標記。
 */
import type { Expense } from "@/api/expenses";
import { type IsoDate, type Month, formatMonth, parseMonth, weekBelongsToMonth, weekEnd, weekOf, weekRange, weekStart } from "@/lib/week";

export interface CalendarRow {
  isoYear: number;
  isoWeek: number;
  /** 週一 */
  start: IsoDate;
  /** 週日 */
  end: IsoDate;
  /** 依 REQ-WEEK-001 歸屬的月份（分數算在哪個月） */
  belongsMonth: Month;
  /** 週一與週日落在不同日曆月 → 顯示「這週算 X 月」 */
  straddlesMonths: boolean;
  /** 七個日曆日，週一～週日 */
  days: IsoDate[];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 含該日曆月任一天的所有 ISO 週，依時間排序。 */
export function calendarGrid(month: Month): CalendarRow[] {
  const [year, mon] = parseMonth(month);
  const first: IsoDate = `${year}-${pad(mon)}-01`;
  const last: IsoDate = `${year}-${pad(mon)}-${pad(daysInMonth(year, mon))}`;
  const rows: CalendarRow[] = [];
  let cursor = weekOf(first);
  // 每次取「上一列週日的隔天」所屬的週，直到該週的週一已超過月底
  for (;;) {
    const start = weekStart(cursor.isoYear, cursor.isoWeek);
    if (start > last) break;
    const end = weekEnd(cursor.isoYear, cursor.isoWeek);
    rows.push({
      isoYear: cursor.isoYear,
      isoWeek: cursor.isoWeek,
      start,
      end,
      belongsMonth: weekBelongsToMonth(cursor.isoYear, cursor.isoWeek),
      straddlesMonths: start.slice(0, 7) !== end.slice(0, 7),
      days: weekRange(cursor.isoYear, cursor.isoWeek),
    });
    cursor = weekOf(nextDay(end));
  }
  return rows;
}

function nextDay(d: IsoDate): IsoDate {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd) + 86_400_000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 格線的第一天與最後一天（GET /expenses 的查詢範圍） */
export function gridRange(rows: CalendarRow[]): { start: IsoDate; end: IsoDate } {
  return { start: rows[0].start, end: rows[rows.length - 1].end };
}

/** 'YYYY-MM' 往前／往後 n 個月 */
export function shiftMonth(month: Month, delta: number): Month {
  const [year, mon] = parseMonth(month);
  const total = year * 12 + (mon - 1) + delta;
  return formatMonth(Math.floor(total / 12), (total % 12) + 1);
}

export interface DayTotal {
  /** 只計 counts_toward_target=true（排除獎勵），退款照常計入 */
  total: number;
  /** 當天有獎勵分類的花費（格子加小記號） */
  hasReward: boolean;
  count: number;
}

/** 每日合計。rewardCategoryIds：counts_toward_target=false 的二級分類 id。 */
export function dailyTotals(expenses: Expense[], rewardCategoryIds: ReadonlySet<number>): Map<IsoDate, DayTotal> {
  const out = new Map<IsoDate, DayTotal>();
  for (const e of expenses) {
    const cur = out.get(e.date) ?? { total: 0, hasReward: false, count: 0 };
    if (rewardCategoryIds.has(e.category_id)) cur.hasReward = true;
    else cur.total += e.amount;
    cur.count += 1;
    out.set(e.date, cur);
  }
  return out;
}

/** 該列（週）合計：七天的每日合計相加（同樣排除獎勵） */
export function weekTotal(row: CalendarRow, totals: ReadonlyMap<IsoDate, DayTotal>): number {
  return row.days.reduce((sum, d) => sum + (totals.get(d)?.total ?? 0), 0);
}
