/**
 * 額外收入（SRS 4.1；REQ-INCOME-003；spec-gaps 8.3）：設定頁目前選的月份的清單，新增／編輯／刪除。
 * 每筆歸屬選定月份，month 不是表單欄位。payload 由 lib/income-payload.ts 組裝。
 */
import { type FormEvent, useId, useState } from "react";

import { describeApiError, splitFieldErrors } from "@/api/errors";
import type { ExtraIncome, ExtraIncomeCreate, ExtraIncomeUpdate } from "@/api/income";
import { FieldError } from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ExtraIncomeFormValues, type ParsedExtraIncome, extraIncomeCreatePayload, extraIncomeUpdatePayload, parseExtraIncomeForm } from "@/lib/income-payload";
import { formatAmount } from "@/lib/money";

export interface ExtraIncomeSectionProps {
  month: string;
  items: ExtraIncome[];
  onCreate: (payload: ExtraIncomeCreate) => Promise<void>;
  onUpdate: (id: number, payload: ExtraIncomeUpdate) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  confirm?: (message: string) => boolean;
}

const FIELDS = ["name", "amount"] as const;

interface RowFormProps {
  month: string;
  initial?: ExtraIncome;
  submitLabel: string;
  onSubmit: (fields: ParsedExtraIncome) => Promise<void>;
  onCancel?: () => void;
}

function RowForm({ month, initial, submitLabel, onSubmit, onCancel }: RowFormProps) {
  const uid = useId();
  const [values, setValues] = useState<ExtraIncomeFormValues>({ name: initial?.name ?? "", amount: initial ? String(initial.amount) : "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof ExtraIncomeFormValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const parsed = parseExtraIncomeForm(values, month);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await onSubmit(parsed.fields);
      if (!initial) setValues({ name: "", amount: "" });
    } catch (err) {
      const split = splitFieldErrors(describeApiError(err), FIELDS);
      setFieldErrors(split.fieldErrors);
      setFormError(split.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-2" onSubmit={submit} noValidate aria-busy={submitting} data-testid="extra-income-form">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-name`} className="text-xs text-muted-foreground">
            名稱
          </Label>
          <Input id={`${uid}-name`} maxLength={50} placeholder="例：年終獎金" className="h-10" value={values.name} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(fieldErrors.name)} />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <Label htmlFor={`${uid}-amount`} className="text-xs text-muted-foreground">
            金額
          </Label>
          <Input id={`${uid}-amount`} inputMode="decimal" placeholder="0" className="h-10" value={values.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={Boolean(fieldErrors.amount)} />
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
      <FieldError message={fieldErrors.name} />
      <FieldError message={fieldErrors.amount} />
    </form>
  );
}

export function ExtraIncomeSection({ month, items, onCreate, onUpdate, onDelete, confirm }: ExtraIncomeSectionProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const ask = confirm ?? ((message: string) => window.confirm(message));

  const remove = async (item: ExtraIncome) => {
    if (!ask(`刪除額外收入「${item.name}」${formatAmount(item.amount)}？`)) return;
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

  const total = items.reduce((sum, i) => sum + i.amount, 0);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="extra-income-title">
      <header className="flex items-baseline justify-between">
        <h4 id="extra-income-title" className="text-sm font-medium">
          額外收入（{Number(month.slice(5, 7))} 月）
        </h4>
        {items.length > 0 && <span className="text-xs text-muted-foreground">合計 {formatAmount(total)}</span>}
      </header>
      {items.length === 0 && <p className="text-xs text-muted-foreground">本月沒有額外收入</p>}
      <ul className="flex flex-col divide-y rounded-lg border empty:hidden">
        {items.map((item) =>
          editingId === item.id ? (
            <li key={item.id} className="p-2">
              <RowForm
                month={month}
                initial={item}
                submitLabel="儲存"
                onSubmit={async (fields) => {
                  await onUpdate(item.id, extraIncomeUpdatePayload(fields));
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={item.id} className="flex items-center gap-2 p-2 text-sm" data-testid="extra-income-row">
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="tabular-nums">{formatAmount(item.amount)}</span>
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
          ),
        )}
      </ul>
      <RowForm month={month} submitLabel="新增" onSubmit={(fields) => onCreate(extraIncomeCreatePayload(fields))} />
    </section>
  );
}
