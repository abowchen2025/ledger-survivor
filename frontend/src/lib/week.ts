/**
 * 週歸屬規則（REQ-WEEK-001、REQ-WEEK-002、REQ-WEEK-005）。
 *
 * 與後端 backend/app/services/week_rule.py 逐函式對應，兩端共用
 * backend/tests/fixtures/week_cases.json 作為唯一真相（REQ-NFR-003）。
 *
 * - 週一為一週之始（ISO 8601 週）。
 * - 一週完整歸屬於「該週週四所在的月份」，不切割、不按比例分攤。
 * - 每月週數 = 該月內週四的個數（必為 4 或 5）。
 *
 * 日期一律用 "YYYY-MM-DD" 字串（IsoDate），內部以 UTC 午夜的毫秒數運算，
 * 完全不碰瀏覽器本地時區，避免 Date 物件在不同時區下日期位移。
 * 「今天」以 Asia/Taipei 的本地日曆日為準（todayTaipei）。
 */

/** "YYYY-MM-DD" */
export type IsoDate = string;
/** "YYYY-MM" */
export type Month = string;

export interface IsoWeek {
  isoYear: number;
  isoWeek: number;
}

export const TAIPEI = "Asia/Taipei";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// ISO 週內的星期序：週一=1 … 週四=4 … 週日=7
const MONDAY = 1;
const THURSDAY = 4;
const SUNDAY = 7;

const DAY_MS = 86_400_000;

// ---------- 內部：IsoDate <-> UTC 毫秒 ----------

function toMs(d: IsoDate): number {
  const m = DATE_RE.exec(d);
  if (!m) throw new RangeError(`date must be 'YYYY-MM-DD', got ${JSON.stringify(d)}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(year, month - 1, day);
  // 擋掉 2026-02-30 這類會被 Date.UTC 自動進位的無效日期
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`invalid calendar date: ${d}`);
  }
  return ms;
}

function fromMs(ms: number): IsoDate {
  const dt = new Date(ms);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1, 2)}-${pad(dt.getUTCDate(), 2)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/** ISO 星期序 1（週一）～7（週日）。 */
function isoWeekdayOf(ms: number): number {
  return ((new Date(ms).getUTCDay() + 6) % 7) + 1;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ---------- 公開 API（名稱對應後端 week_rule.py） ----------

/** REQ-WEEK-005：以 Asia/Taipei 的本地日曆日作為「今天」。 */
export function todayTaipei(now: Date = new Date()): IsoDate {
  // en-CA 的日期格式就是 YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 把 'YYYY-MM' 解析為 [year, month]，格式錯誤丟 RangeError。 */
export function parseMonth(month: Month): [number, number] {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`month must be 'YYYY-MM', got ${JSON.stringify(month)}`);
  return [Number(m[1]), Number(m[2])];
}

export function formatMonth(year: number, month: number): Month {
  return `${pad(year, 4)}-${pad(month, 2)}`;
}

/** 回傳日期所屬的 ISO 週 { isoYear, isoWeek }。 */
export function weekOf(d: IsoDate): IsoWeek {
  const ms = toMs(d);
  // 該週的週四決定 ISO 年；週序 = 週四是該年第幾天 ÷ 7（無條件進位）
  const thursdayMs = ms + (THURSDAY - isoWeekdayOf(ms)) * DAY_MS;
  const isoYear = new Date(thursdayMs).getUTCFullYear();
  const jan1Ms = Date.UTC(isoYear, 0, 1);
  const dayOfYear = Math.round((thursdayMs - jan1Ms) / DAY_MS) + 1;
  return { isoYear, isoWeek: Math.ceil(dayOfYear / 7) };
}

/** 對應 Python 的 date.fromisocalendar(year, week, weekday)，週序超出範圍丟 RangeError。 */
function fromIsoCalendar(isoYear: number, isoWeek: number, weekday: number): number {
  if (!Number.isInteger(isoWeek) || isoWeek < 1 || isoWeek > 53) {
    throw new RangeError(`Invalid week: ${isoWeek}`);
  }
  if (!Number.isInteger(weekday) || weekday < MONDAY || weekday > SUNDAY) {
    throw new RangeError(`Invalid weekday: ${weekday} (range is [1, 7])`);
  }
  // ISO 年的第 1 週一定包含 1 月 4 日
  const jan4Ms = Date.UTC(isoYear, 0, 4);
  const week1MondayMs = jan4Ms - (isoWeekdayOf(jan4Ms) - MONDAY) * DAY_MS;
  const ms = week1MondayMs + (isoWeek - 1) * 7 * DAY_MS + (weekday - MONDAY) * DAY_MS;
  // 第 53 週只有 ISO 53 週年才存在（Python 同樣會丟 ValueError）
  if (isoWeek === 53 && weekOf(fromMs(ms)).isoYear !== isoYear) {
    throw new RangeError(`Invalid week: ${isoWeek} (ISO year ${isoYear} has 52 weeks)`);
  }
  return ms;
}

/** 該 ISO 週的週一。 */
export function weekStart(isoYear: number, isoWeek: number): IsoDate {
  return fromMs(fromIsoCalendar(isoYear, isoWeek, MONDAY));
}

/** 該 ISO 週的週日。 */
export function weekEnd(isoYear: number, isoWeek: number): IsoDate {
  return fromMs(fromIsoCalendar(isoYear, isoWeek, SUNDAY));
}

/** 該 ISO 週的週四，決定整週歸屬月份。 */
export function weekThursday(isoYear: number, isoWeek: number): IsoDate {
  return fromMs(fromIsoCalendar(isoYear, isoWeek, THURSDAY));
}

/** REQ-WEEK-001：一週歸屬於週四所在的月份，回傳 'YYYY-MM'。 */
export function weekBelongsToMonth(isoYear: number, isoWeek: number): Month {
  const thu = new Date(fromIsoCalendar(isoYear, isoWeek, THURSDAY));
  return formatMonth(thu.getUTCFullYear(), thu.getUTCMonth() + 1);
}

/**
 * 該月（'YYYY-MM'）依 REQ-WEEK-001 擁有的所有週，依時間排序。
 * 做法：列出該月每個週四，各自對應一個 ISO 週。
 */
export function weeksOfMonth(month: Month): IsoWeek[] {
  const [year, mon] = parseMonth(month);
  const weeks: IsoWeek[] = [];
  const total = daysInMonth(year, mon);
  for (let day = 1; day <= total; day++) {
    const ms = Date.UTC(year, mon - 1, day);
    if (isoWeekdayOf(ms) === THURSDAY) weeks.push(weekOf(fromMs(ms)));
  }
  return weeks;
}

/** REQ-WEEK-002：每月週數（4 或 5）。 */
export function weeksInMonth(month: Month): number {
  return weeksOfMonth(month).length;
}

/** 該週是其歸屬月份的第幾週（從 1 起算）。 */
export function weekIndexInMonth(isoYear: number, isoWeek: number): number {
  const month = weekBelongsToMonth(isoYear, isoWeek);
  const idx = weeksOfMonth(month).findIndex((w) => w.isoYear === isoYear && w.isoWeek === isoWeek);
  if (idx < 0) throw new RangeError(`week ${isoYear}-W${isoWeek} not found in ${month}`);
  return idx + 1;
}

/** 該週的七個日曆日（週一～週日）。 */
export function weekRange(isoYear: number, isoWeek: number): IsoDate[] {
  const start = fromIsoCalendar(isoYear, isoWeek, MONDAY);
  return Array.from({ length: 7 }, (_, i) => fromMs(start + i * DAY_MS));
}
