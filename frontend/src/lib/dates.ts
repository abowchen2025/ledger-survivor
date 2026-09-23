/**
 * 日期顯示工具。日期一律是 "YYYY-MM-DD" 字串（lib/week.ts 的 IsoDate），
 * 這裡只做格式化，內部用 UTC 運算，不碰瀏覽器本地時區。
 */
import { type IsoDate, type IsoWeek, weekEnd, weekOf, weekStart, weekBelongsToMonth, todayTaipei } from "./week";

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];

function parts(d: IsoDate): { year: number; month: number; day: number; weekday: number } {
  const [y, m, dd] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  return { year: y, month: m, day: dd, weekday: dt.getUTCDay() };
}

/** 例：9/23（三） */
export function formatDayLabel(d: IsoDate): string {
  const p = parts(d);
  return `${p.month}/${p.day}（${WEEKDAY_ZH[p.weekday]}）`;
}

/** 例：9/21 – 9/27 */
export function formatRangeLabel(start: IsoDate, end: IsoDate): string {
  const s = parts(start);
  const e = parts(end);
  return `${s.month}/${s.day} – ${e.month}/${e.day}`;
}

export interface CurrentWeek extends IsoWeek {
  start: IsoDate;
  end: IsoDate;
  /** 依 REQ-WEEK-001 歸屬的月份 'YYYY-MM' */
  belongsMonth: string;
  /** 週一與週日落在不同日曆月（月曆頁與清單標題要標「這週算 X 月」） */
  straddlesMonths: boolean;
}

/** 「本週」：依 Asia/Taipei 的今天所屬 ISO 週，週一到週日；不是「今天往前七天」。 */
export function currentWeek(today: IsoDate = todayTaipei()): CurrentWeek {
  const { isoYear, isoWeek } = weekOf(today);
  const start = weekStart(isoYear, isoWeek);
  const end = weekEnd(isoYear, isoWeek);
  return {
    isoYear,
    isoWeek,
    start,
    end,
    belongsMonth: weekBelongsToMonth(isoYear, isoWeek),
    straddlesMonths: start.slice(0, 7) !== end.slice(0, 7),
  };
}

/** 'YYYY-MM' → 例：10 月 */
export function formatMonthLabel(month: string): string {
  return `${Number(month.slice(5, 7))} 月`;
}

/** 從 today 往前 n 天的日期（含 today 在內共 n+1 天的區間起點）。 */
export function daysBefore(d: IsoDate, n: number): IsoDate {
  const p = parts(d);
  const ms = Date.UTC(p.year, p.month - 1, p.day) - n * 86_400_000;
  const dt = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
