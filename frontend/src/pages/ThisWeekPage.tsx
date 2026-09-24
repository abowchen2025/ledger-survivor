/**
 * 首頁（/）：最上方常駐快速記帳表單 + 本週花費清單（SRS 4.5 版面結構）。
 * 本週範圍以 lib/dates.ts::currentWeek()（week.ts 週歸屬規則）計算，跨月週標示「這週算 X 月」。
 * 金鑰問題（缺少／401）導向設定頁；其他錯誤顯示在頁面上，不清空表單。
 */
import { useEffect, useMemo, useState } from "react";

import { useAuthFailureRedirect } from "@/api/auth-guard";
import { describeApiError } from "@/api/errors";
import type { ExpenseCreate, ExpenseUpdate } from "@/api/expenses";
import { QuickEntryForm } from "@/components/expenses/QuickEntryForm";
import { WeekExpenseList } from "@/components/expenses/WeekExpenseList";
import { PageTitle } from "@/components/layout/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { currentWeek, formatMonthLabel, formatRangeLabel } from "@/lib/dates";
import { formatAmount } from "@/lib/money";
import { todayTaipei } from "@/lib/week";
import { activeCards, useCardStore } from "@/store/card-store";
import { categoryOptions, useCategoryStore } from "@/store/category-store";
import { useExpenseStore } from "@/store/expense-store";

export default function ThisWeekPage() {
  const redirectOnAuthFailure = useAuthFailureRedirect();
  const week = useMemo(() => currentWeek(todayTaipei()), []);

  const categoryStore = useCategoryStore();
  const cardStore = useCardStore();
  const expenseStore = useExpenseStore();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    Promise.all([
      categoryStore.load(),
      cardStore.load(),
      expenseStore.loadWeek(week),
      expenseStore.loadRecentItems().catch(() => undefined), // 品項快選不是必要資料，失敗不擋頁面
    ]).catch((err: unknown) => {
      if (cancelled || redirectOnAuthFailure(err)) return;
      setLoadError(describeApiError(err).message);
    });
    return () => {
      cancelled = true;
    };
    // store 的 action 參考穩定；只在 week 或手動重載時重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, reloadToken]);

  const categories = useMemo(() => categoryOptions(categoryStore.groups, categoryStore.categories), [categoryStore.groups, categoryStore.categories]);
  const cards = cardStore.cards;
  const expenses = expenseStore.expenses;

  /** 週花費（行為時鐘）：不含「獎勵」分類（REQ-EXPENSE-003）。分數／HP 是 Phase 2，這裡只顯示合計。 */
  const weekTotal = useMemo(() => {
    const rewardIds = new Set(categories.filter((c) => c.isReward).map((c) => c.id));
    return expenses.reduce((sum, e) => (rewardIds.has(e.category_id) ? sum : sum + e.amount), 0);
  }, [expenses, categories]);

  /** 金鑰問題導向設定頁；其他錯誤丟回表單／清單自己顯示 */
  const guard = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (err) {
      if (redirectOnAuthFailure(err)) return;
      throw err;
    }
  };

  const reloadReferences = () => {
    categoryStore.load().catch(() => undefined);
    cardStore.load().catch(() => undefined);
  };

  const onCreate = (payload: ExpenseCreate) => guard(() => expenseStore.create(payload));
  const onUpdate = (id: number, payload: ExpenseUpdate) => guard(() => expenseStore.update(id, payload));
  const onDelete = (id: number) => guard(() => expenseStore.remove(id));

  const ready = categoryStore.loaded && cardStore.loaded;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <section aria-labelledby="quick-entry-title" className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 id="quick-entry-title" className="sr-only">
          快速記帳
        </h2>
        {ready ? (
          <QuickEntryForm
            mode="create"
            initial={{
              date: todayTaipei(),
              categoryId: expenseStore.lastUsed.categoryId,
              paymentMethod: expenseStore.lastUsed.paymentMethod,
              cardId: expenseStore.lastUsed.cardId,
            }}
            categories={categories}
            cards={activeCards(cards)}
            recentItems={expenseStore.recentItems}
            onSubmit={onCreate}
            onInactiveReference={reloadReferences}
          />
        ) : (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="載入中">
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
            <div className="h-11 animate-pulse rounded-lg bg-muted" />
          </div>
        )}
      </section>

      <section aria-labelledby="week-list-title" className="flex flex-col gap-3">
        <header className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <PageTitle>本週</PageTitle>
            <span className="text-sm text-muted-foreground">{formatRangeLabel(week.start, week.end)}</span>
            {week.straddlesMonths && <Badge variant="outline">這週算 {formatMonthLabel(week.belongsMonth)}</Badge>}
          </div>
          <span id="week-list-title" className="text-sm text-muted-foreground">
            本週花費 <span className="text-base font-semibold text-foreground tabular-nums">{formatAmount(weekTotal)}</span>
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

        {expenseStore.loading && !expenseStore.loaded ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="載入中">
            <div className="h-14 animate-pulse rounded-lg bg-muted" />
            <div className="h-14 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : (
          <WeekExpenseList expenses={expenses} categories={categories} cards={cards} onUpdate={onUpdate} onDelete={onDelete} onInactiveReference={reloadReferences} />
        )}
      </section>
    </div>
  );
}
