/**
 * 遊戲月（依 week.ts 週歸屬規則，今天所屬那一週歸哪個月）vs 日曆月。
 *
 * 收入設定的月份選擇器預設遊戲月而不是日曆月（2026-09-24 ABow 決定，spec-gaps 9.1）：
 * 月薪對應的是週上限的分母，週上限屬於遊戲月；已結算月份也是用遊戲月判定（spec-gaps 8.7），同一原則。
 * 兩者不同時（每月底最多三天，例如 2026-09-28～30 屬 10 月的第 1 週）在選擇器旁提示「本週算 10 月」。
 */
import { type IsoDate, type Month, todayTaipei, weekBelongsToMonth, weekOf } from "@/lib/week";

export interface GameMonthInfo {
  /** 今天所屬週歸屬的月份 */
  gameMonth: Month;
  /** 今天的日曆月 */
  calendarMonth: Month;
  /** 兩者不同 → 顯示小字「本週算 X 月」 */
  differs: boolean;
}

export function gameMonthOf(today: IsoDate = todayTaipei()): GameMonthInfo {
  const { isoYear, isoWeek } = weekOf(today);
  const gameMonth = weekBelongsToMonth(isoYear, isoWeek);
  const calendarMonth = today.slice(0, 7);
  return { gameMonth, calendarMonth, differs: gameMonth !== calendarMonth };
}

/** 'YYYY-MM' → 例：2026 年 9 月 */
export function formatYearMonthLabel(month: Month): string {
  return `${month.slice(0, 4)} 年 ${Number(month.slice(5, 7))} 月`;
}
