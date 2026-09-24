/**
 * 本週花費清單（SRS 4.5 版面結構）：依日期分組，每筆顯示品項、金額、分類、支付方式；
 * 點「編輯」在原位展開 QuickEntryForm（edit 模式），「刪除」先確認。
 * 「獎勵」分類（counts_toward_target=false）以虛線框標示並註記「不計入週花費」（REQ-EXPENSE-003）。
 */
import { useState } from "react";

import type { Card } from "@/api/cards";
import { describeApiError } from "@/api/errors";
import type { Expense, ExpenseUpdate } from "@/api/expenses";
import { QuickEntryForm } from "@/components/expenses/QuickEntryForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDayLabel } from "@/lib/dates";
import { paymentMethodLabel } from "@/lib/labels";
import { formatAmount, splitAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { cardLabel } from "@/store/card-store";
import type { CategoryOption } from "@/store/category-store";

export interface WeekExpenseListProps {
  expenses: Expense[];
  categories: CategoryOption[];
  cards: Card[];
  onUpdate: (id: number, payload: ExpenseUpdate) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onInactiveReference?: () => void;
  /** 測試注入；預設 window.confirm */
  confirm?: (message: string) => boolean;
}

export const EMPTY_WEEK_MESSAGE = "本週還沒有記帳，開始記第一筆吧";

function groupByDate(expenses: Expense[]): { date: string; items: Expense[] }[] {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = groups.get(e.date) ?? [];
    list.push(e);
    groups.set(e.date, list);
  }
  // 最近的日期排最上面，方便看剛記的那筆
  return [...groups.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([date, items]) => ({ date, items }));
}

export function WeekExpenseList({ expenses, categories, cards, onUpdate, onDelete, onInactiveReference, confirm }: WeekExpenseListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const ask = confirm ?? ((message: string) => window.confirm(message));

  if (expenses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground" data-testid="empty-week">
        {EMPTY_WEEK_MESSAGE}
      </p>
    );
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const remove = async (expense: Expense) => {
    if (!ask(`刪除「${expense.item}」${formatAmount(expense.amount)} 這筆花費？`)) return;
    setDeletingId(expense.id);
    setRowError(null);
    try {
      await onDelete(expense.id);
    } catch (err) {
      setRowError({ id: expense.id, message: describeApiError(err).message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {groupByDate(expenses).map(({ date, items }) => {
        const dayTotal = items.reduce((sum, e) => sum + (categoryById.get(e.category_id)?.isReward ? 0 : e.amount), 0);
        return (
          <section key={date} aria-label={formatDayLabel(date)}>
            <header className="flex items-baseline justify-between px-1 pb-1 text-sm text-muted-foreground">
              <span>{formatDayLabel(date)}</span>
              <span>合計 {formatAmount(dayTotal)}</span>
            </header>
            <ul className="divide-y rounded-lg border">
              {items.map((e) => {
                const category = categoryById.get(e.category_id);
                const isReward = category?.isReward ?? false;
                const card = e.card_id !== null ? cardById.get(e.card_id) : undefined;
                if (editingId === e.id) {
                  const { input, refund } = splitAmount(e.amount);
                  return (
                    <li key={e.id} className="p-3">
                      <QuickEntryForm
                        mode="edit"
                        initial={{
                          date: e.date,
                          amountInput: input,
                          refund,
                          item: e.item,
                          categoryId: e.category_id,
                          paymentMethod: e.payment_method,
                          cardId: e.card_id,
                          note: e.note ?? "",
                        }}
                        categories={categories}
                        cards={cards}
                        onSubmit={async (payload) => {
                          await onUpdate(e.id, payload);
                          setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                        onInactiveReference={onInactiveReference}
                      />
                    </li>
                  );
                }
                return (
                  <li key={e.id} className={cn("flex items-center gap-3 p-3", isReward && "bg-muted/40")} data-testid="expense-row">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{e.item}</span>
                        {isReward && (
                          <Badge variant="outline" className="shrink-0 border-dashed">
                            不計入週花費
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                        <span>{category ? `${category.groupName}｜${category.name}` : `分類 #${e.category_id}`}</span>
                        <span>{paymentMethodLabel(e.payment_method)}</span>
                        {card && <span>{cardLabel(card)}</span>}
                        {e.note && <span className="w-full truncate">{e.note}</span>}
                      </div>
                      {rowError?.id === e.id && (
                        <p role="alert" className="mt-1 text-xs text-destructive">
                          {rowError.message}
                        </p>
                      )}
                    </div>
                    <span className={cn("shrink-0 text-base font-semibold tabular-nums", e.amount < 0 && "text-destructive", isReward && "text-muted-foreground line-through decoration-dotted")}>
                      {formatAmount(e.amount)}
                    </span>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button type="button" variant="ghost" size="xs" onClick={() => setEditingId(e.id)} aria-label={`編輯 ${e.item}`}>
                        編輯
                      </Button>
                      <Button type="button" variant="ghost" size="xs" className="text-destructive" disabled={deletingId === e.id} onClick={() => void remove(e)} aria-label={`刪除 ${e.item}`}>
                        {deletingId === e.id ? "刪除中" : "刪除"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
