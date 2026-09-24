/**
 * 固定支出（SRS 4.1；REQ-INCOME-004）：列出全部，新增／編輯／刪除。
 * 條件呈現：結束月早於目前選的月份（「結束月已過」）→ 灰階＋刪除線但不隱藏；起始月晚於選的月份 → 標「X 起」。
 * 新增／編輯時檢核結束月不可早於起始月（lib/income-payload.ts，文案同 SRS）。
 */
import { type FormEvent, useId, useState } from "react";

import { describeApiError, splitFieldErrors } from "@/api/errors";
import type { RecurringExpense, RecurringExpenseCreate, RecurringExpenseUpdate } from "@/api/income";
import { FieldError } from "@/components/FieldError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ParsedRecurringExpense, type RecurringExpenseFormValues, parseRecurringExpenseForm, recurringExpenseCreatePayload, recurringExpenseUpdatePayload } from "@/lib/income-payload";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface RecurringExpenseSectionProps {
  /** 設定頁目前選的月份：決定哪些項目算「結束月已過」 */
  selectedMonth: string;
  items: RecurringExpense[];
  onCreate: (payload: RecurringExpenseCreate) => Promise<void>;
  onUpdate: (id: number, payload: RecurringExpenseUpdate) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  confirm?: (message: string) => boolean;
}

const FIELDS = ["name", "amount", "start_month", "end_month"] as const;

/** 結束月早於選定月份 → 已過期 */
export function isExpired(item: RecurringExpense, selectedMonth: string): boolean {
  return item.end_month !== null && item.end_month < selectedMonth;
}

/** 起始月晚於選定月份 → 尚未開始 */
export function isUpcoming(item: RecurringExpense, selectedMonth: string): boolean {
  return item.start_month > selectedMonth;
}

interface RowFormProps {
  initial?: RecurringExpense;
  defaultStartMonth: string;
  submitLabel: string;
  onSubmit: (fields: ParsedRecurringExpense) => Promise<void>;
  onCancel?: () => void;
}

function RowForm({ initial, defaultStartMonth, submitLabel, onSubmit, onCancel }: RowFormProps) {
  const uid = useId();
  const blank = (): RecurringExpenseFormValues => ({ name: "", amount: "", startMonth: defaultStartMonth, endMonth: "" });
  const [values, setValues] = useState<RecurringExpenseFormValues>(() =>
    initial ? { name: initial.name, amount: String(initial.amount), startMonth: initial.start_month, endMonth: initial.end_month ?? "" } : blank(),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof RecurringExpenseFormValues, value: string, errorKey: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => {
      if (!(errorKey in e)) return e;
      const next = { ...e };
      delete next[errorKey];
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const parsed = parseRecurringExpenseForm(values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await onSubmit(parsed.fields);
      if (!initial) setValues(blank());
    } catch (err) {
      const split = splitFieldErrors(describeApiError(err), FIELDS);
      setFieldErrors(split.fieldErrors);
      setFormError(split.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={submit} noValidate aria-busy={submitting} data-testid="recurring-expense-form">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-name`} className="text-xs text-muted-foreground">
            名稱
          </Label>
          <Input id={`${uid}-name`} maxLength={50} placeholder="例：房租" className="h-10" value={values.name} onChange={(e) => set("name", e.target.value, "name")} aria-invalid={Boolean(fieldErrors.name)} />
          <FieldError message={fieldErrors.name} />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <Label htmlFor={`${uid}-amount`} className="text-xs text-muted-foreground">
            每月金額
          </Label>
          <Input id={`${uid}-amount`} inputMode="decimal" placeholder="0" className="h-10" value={values.amount} onChange={(e) => set("amount", e.target.value, "amount")} aria-invalid={Boolean(fieldErrors.amount)} />
          <FieldError message={fieldErrors.amount} />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-start`} className="text-xs text-muted-foreground">
            起始月
          </Label>
          <Input id={`${uid}-start`} type="month" className="h-10" value={values.startMonth} onChange={(e) => set("startMonth", e.target.value, "start_month")} aria-invalid={Boolean(fieldErrors.start_month)} />
          <FieldError message={fieldErrors.start_month} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-end`} className="text-xs text-muted-foreground">
            結束月（選填）
          </Label>
          <Input id={`${uid}-end`} type="month" className="h-10" value={values.endMonth} onChange={(e) => set("endMonth", e.target.value, "end_month")} aria-invalid={Boolean(fieldErrors.end_month)} />
          <FieldError message={fieldErrors.end_month} />
        </div>
        <div className="flex gap-1">
          <Button type="submit" size="sm" className="h-10" disabled={submitting}>
            {submitting ? "…" : submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" size="sm" variant="outline" className="h-10" onClick={onCancel} disabled={submitting}>
              取消
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function rangeLabel(item: RecurringExpense): string {
  return item.end_month ? `${item.start_month} ～ ${item.end_month}` : `${item.start_month} 起`;
}

export function RecurringExpenseSection({ selectedMonth, items, onCreate, onUpdate, onDelete, confirm }: RecurringExpenseSectionProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const ask = confirm ?? ((message: string) => window.confirm(message));

  const remove = async (item: RecurringExpense) => {
    if (!ask(`刪除固定支出「${item.name}」？`)) return;
    setBusyId(item.id);
    setRowError(null);
    try {
      await onDelete(item.id);
    } catch (err) {
      setRowError({ id: item.id, message: describeApiError(err).message });
    } finally {
      setBusyId(null);
    }
  };

  const sorted = [...items].sort((a, b) => Number(isExpired(a, selectedMonth)) - Number(isExpired(b, selectedMonth)) || a.start_month.localeCompare(b.start_month) || a.id - b.id);
  const activeTotal = items.filter((i) => !isExpired(i, selectedMonth) && !isUpcoming(i, selectedMonth)).reduce((sum, i) => sum + i.amount, 0);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="recurring-title">
      <header className="flex items-baseline justify-between">
        <h4 id="recurring-title" className="text-sm font-medium">
          固定支出
        </h4>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {Number(selectedMonth.slice(5, 7))} 月生效合計 {formatAmount(activeTotal)}
          </span>
        )}
      </header>
      {items.length === 0 && !adding && <p className="text-xs text-muted-foreground">尚未設定固定支出（房租、保險、訂閱…）</p>}
      <ul className="flex flex-col divide-y rounded-lg border empty:hidden">
        {sorted.map((item) => {
          const expired = isExpired(item, selectedMonth);
          const upcoming = isUpcoming(item, selectedMonth);
          if (editingId === item.id) {
            return (
              <li key={item.id} className="p-2">
                <RowForm
                  initial={item}
                  defaultStartMonth={selectedMonth}
                  submitLabel="儲存"
                  onSubmit={async (fields) => {
                    await onUpdate(item.id, recurringExpenseUpdatePayload(fields));
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            );
          }
          return (
            <li key={item.id} className={cn("flex flex-wrap items-center gap-2 p-2 text-sm", expired && "opacity-60 grayscale")} data-testid="recurring-expense-row" data-expired={expired || undefined}>
              <div className="min-w-0 flex-1">
                <div className={cn("truncate", expired && "line-through")}>{item.name}</div>
                <div className="text-xs text-muted-foreground">
                  {rangeLabel(item)}
                  {expired && <Badge variant="secondary" className="ml-1">已結束</Badge>}
                  {upcoming && <Badge variant="outline" className="ml-1">{Number(item.start_month.slice(5, 7))} 月起</Badge>}
                </div>
              </div>
              <span className={cn("tabular-nums", expired && "line-through")}>{formatAmount(item.amount)}</span>
              <Button type="button" variant="ghost" size="xs" onClick={() => setEditingId(item.id)} aria-label={`編輯 ${item.name}`}>
                編輯
              </Button>
              <Button type="button" variant="ghost" size="xs" className="text-destructive" disabled={busyId === item.id} onClick={() => void remove(item)} aria-label={`刪除 ${item.name}`}>
                刪除
              </Button>
              {rowError?.id === item.id && (
                <p role="alert" className="w-full text-xs text-destructive">
                  {rowError.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="rounded-lg border p-2">
          <RowForm
            defaultStartMonth={selectedMonth}
            submitLabel="新增"
            onSubmit={async (fields) => {
              await onCreate(recurringExpenseCreatePayload(fields));
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
          新增固定支出
        </Button>
      )}
    </section>
  );
}
