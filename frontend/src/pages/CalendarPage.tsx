/**
 * 月曆頁（/calendar；SRS 4.5「月曆頁每日花費合計格」、4.6「以週為列、跨月週標籤」）。
 *
 * - 格線由 lib/calendar-grid.ts（week.ts 週歸屬規則）產生：週一～週日一列，含該日曆月任一天的週全部出現。
 * - 跨月週在該列顯示「這週算 X 月」；不屬於本日曆月的日期淡化但仍顯示金額，讓整週完整。
 * - 每格顯示當日合計（排除「獎勵」分類，與週花費 E 一致，退款照常計入）；當天有獎勵花費加小記號。
 * - 每列最右邊顯示該週合計（同樣排除獎勵）。不顯示週上限或剩餘額度（Phase 2）。
 * - 點某一天展開明細，沿用首頁的 WeekExpenseList（可編輯、刪除）。
 * - 資料：GET /expenses?start_date=&end_date=，範圍是格線第一天到最後一天；編輯／刪除後就地更新本頁狀態
 *   （首頁的本週清單在回首頁時會重新載入）。
 */
import { useEffect, useMemo, useState } from "react";

import { useAuthFailureRedirect } from "@/api/auth-guard";
import { describeApiError } from "@/api/errors";
import { type Expense, type ExpenseUpdate, deleteExpense, listExpenses, updateExpense } from "@/api/expenses";
import { WeekExpenseList } from "@/components/expenses/WeekExpenseList";
import { PageTitle } from "@/components/layout/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type CalendarRow, calendarGrid, dailyTotals, gridRange, shiftMonth, weekTotal } from "@/lib/calendar-grid";
import { formatDayLabel, formatMonthLabel } from "@/lib/dates";
import { formatYearMonthLabel } from "@/lib/game-month";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { type IsoDate, todayTaipei } from "@/lib/week";
import { useCardStore } from "@/store/card-store";
import { categoryOptions, rewardCategoryIds, useCategoryStore } from "@/store/category-store";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export default function CalendarPage() {
  const redirectOnAuthFailure = useAuthFailureRedirect();
  const today = useMemo(() => todayTaipei(), []);
  const [month, setMonth] = useState(today.slice(0, 7));
  const rows = useMemo(() => calendarGrid(month), [month]);
  const range = useMemo(() => gridRange(rows), [rows]);

  const categoryStore = useCategoryStore();
  const cardStore = useCardStore();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedDay, setSelectedDay] = useState<IsoDate | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setExpenses(null);
    Promise.all([categoryStore.load(), cardStore.load(), listExpenses(range.start, range.end)])
      .then(([, , list]) => {
        if (!cancelled) setExpenses(list);
      })
      .catch((err: unknown) => {
        if (cancelled || redirectOnAuthFailure(err)) return;
        setLoadError(describeApiError(err).message);
      });
    return () => {
      cancelled = true;
    };
    // store 的 action 參考穩定；只在範圍或手動重載時重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, reloadToken]);

  const categories = useMemo(() => categoryOptions(categoryStore.groups, categoryStore.categories), [categoryStore.groups, categoryStore.categories]);
  const rewardIds = useMemo(() => rewardCategoryIds(categoryStore.groups, categoryStore.categories), [categoryStore.groups, categoryStore.categories]);
  const totals = useMemo(() => dailyTotals(expenses ?? [], rewardIds), [expenses, rewardIds]);

  const guard = async <T,>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      redirectOnAuthFailure(err);
      throw err;
    }
  };

  const onUpdate = async (id: number, payload: ExpenseUpdate) => {
    const updated = await guard(() => updateExpense(id, payload));
    // 改到格線範圍外的日期就從本頁消失
    setExpenses((list) => (list ?? []).filter((e) => e.id !== id).concat(updated.date >= range.start && updated.date <= range.end ? [updated] : []));
  };
  const onDelete = async (id: number) => {
    await guard(() => deleteExpense(id));
    setExpenses((list) => (list ?? []).filter((e) => e.id !== id));
  };
  const reloadReferences = () => {
    categoryStore.load().catch(() => undefined);
    cardStore.load().catch(() => undefined);
  };

  const dayExpenses = selectedDay ? (expenses ?? []).filter((e) => e.date === selectedDay) : [];
  const monthTotal = rows.reduce((sum, row) => sum + row.days.filter((d) => d.slice(0, 7) === month).reduce((s, d) => s + (totals.get(d)?.total ?? 0), 0), 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon-sm" aria-label="上一月" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ‹
          </Button>
          <PageTitle>{formatYearMonthLabel(month)}</PageTitle>
          <Button type="button" variant="outline" size="icon-sm" aria-label="下一月" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            ›
          </Button>
          {month !== today.slice(0, 7) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
              回本月
            </Button>
          )}
        </div>
        <span className="text-sm text-muted-foreground" data-testid="month-total">
          {formatMonthLabel(month)}日曆日合計 <span className="text-base font-semibold text-foreground tabular-nums">{formatAmount(monthTotal)}</span>
        </span>
      </header>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{loadError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setReloadToken((n) => n + 1)}>
            重試
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm" aria-busy={expenses === null}>
        <table className="w-full table-fixed border-collapse text-xs" data-testid="calendar-grid">
          <thead>
            <tr className="text-muted-foreground">
              {WEEKDAYS.map((w) => (
                <th key={w} scope="col" className="py-1.5 font-normal">
                  {w}
                </th>
              ))}
              <th scope="col" className="w-16 py-1.5 font-normal">
                週合計
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <CalendarWeekRow key={row.start} row={row} month={month} today={today} totals={totals} loading={expenses === null} selectedDay={selectedDay} onSelect={(d) => setSelectedDay((cur) => (cur === d ? null : d))} />
            ))}
          </tbody>
        </table>
      </div>

      {selectedDay && expenses !== null && (
        <section className="flex flex-col gap-2" aria-label={`${formatDayLabel(selectedDay)} 明細`} data-testid="day-detail">
          <header className="flex items-center justify-between px-1">
            <h2 className="text-sm font-medium">{formatDayLabel(selectedDay)} 明細</h2>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
              收合
            </Button>
          </header>
          {dayExpenses.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">這天沒有花費</p>
          ) : (
            <WeekExpenseList expenses={dayExpenses} categories={categories} cards={cardStore.cards} onUpdate={onUpdate} onDelete={onDelete} onInactiveReference={reloadReferences} />
          )}
        </section>
      )}
    </div>
  );
}

interface CalendarWeekRowProps {
  row: CalendarRow;
  month: string;
  today: IsoDate;
  totals: ReturnType<typeof dailyTotals>;
  loading: boolean;
  selectedDay: IsoDate | null;
  onSelect: (d: IsoDate) => void;
}

function CalendarWeekRow({ row, month, today, totals, loading, selectedDay, onSelect }: CalendarWeekRowProps) {
  return (
    <>
      {row.straddlesMonths && (
        <tr>
          <td colSpan={8} className="px-2 pt-2 text-left">
            <Badge variant="outline" data-testid="straddle-label">
              這週算 {formatMonthLabel(row.belongsMonth)}
            </Badge>
          </td>
        </tr>
      )}
      <tr data-testid="calendar-row" data-week-start={row.start}>
        {row.days.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const t = totals.get(d);
          return (
            <td key={d} className="p-0.5 align-top">
              <button
                type="button"
                className={cn(
                  "flex h-16 w-full flex-col items-start rounded-md border p-1 text-left hover:bg-muted/60",
                  !inMonth && "opacity-45",
                  d === today && "border-primary",
                  selectedDay === d && "bg-muted",
                )}
                aria-pressed={selectedDay === d}
                aria-label={`${formatDayLabel(d)}${t ? `，合計 ${formatAmount(t.total)}` : ""}`}
                data-testid="calendar-day"
                data-date={d}
                data-in-month={inMonth || undefined}
                onClick={() => onSelect(d)}
              >
                <span className={cn("text-[11px] leading-none", d === today && "font-semibold text-primary")}>{Number(d.slice(8, 10))}</span>
                {loading ? (
                  <span className="mt-auto h-3 w-8 animate-pulse rounded bg-muted" />
                ) : (
                  t && (
                    <span className="mt-auto flex w-full items-baseline justify-between gap-0.5">
                      <span className={cn("truncate tabular-nums", t.total < 0 && "text-destructive")}>{formatAmount(t.total)}</span>
                      {t.hasReward && (
                        <span className="text-[10px] leading-none text-amber-600" title="當天有獎勵花費（不計入）" data-testid="reward-mark">
                          ★
                        </span>
                      )}
                    </span>
                  )
                )}
              </button>
            </td>
          );
        })}
        <td className="p-0.5 text-right align-middle tabular-nums" data-testid="week-total">
          {loading ? <span className="inline-block h-3 w-10 animate-pulse rounded bg-muted" /> : formatAmount(weekTotal(row, totals))}
        </td>
      </tr>
    </>
  );
}
