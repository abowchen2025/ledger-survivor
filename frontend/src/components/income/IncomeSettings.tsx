/**
 * 設定頁「收入設定」（SRS 4.1）：月份選擇器 + 月薪／儲蓄目標 + 額外收入（該月）+ 固定支出（全部）。
 *
 * - 月份預設為今天所屬的**遊戲月**（week.ts 週歸屬規則；spec-gaps 9.1），與日曆月不同時顯示「本週算 X 月」。
 * - 不顯示剩餘額度或可支配金額（Phase 2）。
 * - 狀態：載入中骨架；API 失敗卡片內紅字且不清空輸入；儲存成功浮動提示 2 秒。
 * - 金鑰問題（缺少／401）導向設定頁——這裡就是設定頁，等於什麼都不做。
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthFailureRedirect } from "@/api/auth-guard";
import { describeApiError } from "@/api/errors";
import {
  type ExtraIncome,
  type ExtraIncomeCreate,
  type ExtraIncomeUpdate,
  type MonthIncome,
  type MonthIncomeUpdate,
  type RecurringExpense,
  type RecurringExpenseCreate,
  type RecurringExpenseUpdate,
  createExtraIncome,
  createRecurringExpense,
  deleteExtraIncome,
  deleteRecurringExpense,
  getMonthIncome,
  listExtraIncomes,
  listRecurringExpenses,
  putMonthIncome,
  updateExtraIncome,
  updateRecurringExpense,
} from "@/api/income";
import { ExtraIncomeSection } from "@/components/income/ExtraIncomeSection";
import { MonthIncomeForm } from "@/components/income/MonthIncomeForm";
import { RecurringExpenseSection } from "@/components/income/RecurringExpenseSection";
import { Toast, useTransientMessage } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { shiftMonth } from "@/lib/calendar-grid";
import { formatMonthLabel } from "@/lib/dates";
import { formatYearMonthLabel, gameMonthOf } from "@/lib/game-month";

interface Loaded {
  month: string;
  income: MonthIncome;
  extras: ExtraIncome[];
  recurring: RecurringExpense[];
}

export function IncomeSettings() {
  const redirectOnAuthFailure = useAuthFailureRedirect();
  const today = useMemo(() => gameMonthOf(), []);
  const [month, setMonth] = useState(today.gameMonth);
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [toast, showToast] = useTransientMessage();

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([getMonthIncome(month), listExtraIncomes(month), listRecurringExpenses()])
      .then(([income, extras, recurring]) => {
        if (!cancelled) setData({ month, income, extras, recurring });
      })
      .catch((err: unknown) => {
        if (cancelled || redirectOnAuthFailure(err)) return;
        setLoadError(describeApiError(err).message);
      });
    return () => {
      cancelled = true;
    };
  }, [month, reloadToken, redirectOnAuthFailure]);

  /** 金鑰問題先導向（這裡就是設定頁，等於不動）；錯誤一律丟回表單自己顯示，不清空輸入 */
  const guard = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T> => {
      try {
        return await run();
      } catch (err) {
        redirectOnAuthFailure(err);
        throw err;
      }
    },
    [redirectOnAuthFailure],
  );

  const patch = (fn: (d: Loaded) => Loaded) => setData((d) => (d ? fn(d) : d));

  const saveIncome = async (payload: MonthIncomeUpdate) => {
    const income = await guard(() => putMonthIncome(month, payload));
    patch((d) => ({ ...d, income }));
    showToast("已儲存本月月薪與儲蓄目標");
  };

  const createExtra = async (payload: ExtraIncomeCreate) => {
    const created = await guard(() => createExtraIncome(payload));
    patch((d) => ({ ...d, extras: [...d.extras, created] }));
    showToast("已新增額外收入");
  };
  const updateExtra = async (id: number, payload: ExtraIncomeUpdate) => {
    const updated = await guard(() => updateExtraIncome(id, payload));
    // 改到別的月份就從本月清單消失
    patch((d) => ({ ...d, extras: updated.month === d.month ? d.extras.map((x) => (x.id === id ? updated : x)) : d.extras.filter((x) => x.id !== id) }));
    showToast("已更新額外收入");
  };
  const removeExtra = async (id: number) => {
    await guard(() => deleteExtraIncome(id));
    patch((d) => ({ ...d, extras: d.extras.filter((x) => x.id !== id) }));
    showToast("已刪除額外收入");
  };

  const createRecurring = async (payload: RecurringExpenseCreate) => {
    const created = await guard(() => createRecurringExpense(payload));
    patch((d) => ({ ...d, recurring: [...d.recurring, created] }));
    showToast("已新增固定支出");
  };
  const updateRecurring = async (id: number, payload: RecurringExpenseUpdate) => {
    const updated = await guard(() => updateRecurringExpense(id, payload));
    patch((d) => ({ ...d, recurring: d.recurring.map((x) => (x.id === id ? updated : x)) }));
    showToast("已更新固定支出");
  };
  const removeRecurring = async (id: number) => {
    await guard(() => deleteRecurringExpense(id));
    patch((d) => ({ ...d, recurring: d.recurring.filter((x) => x.id !== id) }));
    showToast("已刪除固定支出");
  };

  const ready = data !== null && data.month === month;

  return (
    <section className="mt-6 rounded-lg border p-4 text-sm" aria-labelledby="income-settings-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="income-settings-title" className="font-semibold">
          收入設定
        </h3>
        <div className="flex items-center gap-1" role="group" aria-label="月份選擇">
          <Button type="button" variant="outline" size="icon-sm" aria-label="上一月" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
            ‹
          </Button>
          <span className="min-w-28 text-center font-medium tabular-nums" data-testid="income-month">
            {formatYearMonthLabel(month)}
          </span>
          <Button type="button" variant="outline" size="icon-sm" aria-label="下一月" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
            ›
          </Button>
          {month !== today.gameMonth && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setMonth(today.gameMonth)}>
              回本月
            </Button>
          )}
        </div>
      </div>
      {today.differs && (
        <p className="mt-1 text-right text-xs text-muted-foreground" data-testid="game-month-hint">
          本週算 {formatMonthLabel(today.gameMonth)}（今天是 {formatMonthLabel(today.calendarMonth)}，但這一週的週四在 {formatMonthLabel(today.gameMonth)}）
        </p>
      )}

      {loadError && (
        <div role="alert" className="mt-3 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive">
          <span>{loadError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setReloadToken((n) => n + 1)}>
            重試
          </Button>
        </div>
      )}

      {!ready && !loadError ? (
        <div className="mt-3 flex flex-col gap-3" aria-busy="true" aria-label="載入中" data-testid="income-skeleton">
          <div className="h-11 animate-pulse rounded-lg bg-muted" />
          <div className="h-11 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : (
        ready && (
          <div className="mt-3 flex flex-col gap-5">
            <MonthIncomeForm data={data.income} onSave={saveIncome} />
            <ExtraIncomeSection month={month} items={data.extras} onCreate={createExtra} onUpdate={updateExtra} onDelete={removeExtra} />
            <RecurringExpenseSection selectedMonth={month} items={data.recurring} onCreate={createRecurring} onUpdate={updateRecurring} onDelete={removeRecurring} />
          </div>
        )
      )}
      <Toast message={toast} />
    </section>
  );
}
