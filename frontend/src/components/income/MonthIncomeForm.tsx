/**
 * 月薪與儲蓄目標（SRS 4.1；REQ-INCOME-001、002、005）。
 *
 * 三種狀態（spec-gaps 8.4）：
 * - 該月有紀錄：inherited_from 為 null，欄位帶入該月的值；
 * - 沿用：inherited_from 有值 → 顯示「沿用 2026-08 的金額」，欄位帶入該值可覆寫，儲存才 PUT 寫入本月；
 * - 尚未設定：salary 為 null → 欄位空白並提示「尚未設定本月月薪」。
 * payload 由 lib/income-payload.ts 組裝；錯誤處理同 CardForm（finally 重設、無對應輸入框的欄位併進頂部）。
 */
import { type FormEvent, useEffect, useId, useState } from "react";

import { describeApiError, splitFieldErrors } from "@/api/errors";
import type { MonthIncome, MonthIncomeUpdate } from "@/api/income";
import { FieldError } from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type MonthIncomeFormValues, monthIncomePayload, parseMonthIncomeForm } from "@/lib/income-payload";

export interface MonthIncomeFormProps {
  data: MonthIncome;
  /** 成功要 resolve（外層顯示浮動提示並更新資料）；失敗丟出原始錯誤 */
  onSave: (payload: MonthIncomeUpdate) => Promise<void>;
}

export const UNSET_SALARY_MESSAGE = "尚未設定本月月薪";

const FIELDS = ["salary", "savings_target"] as const;

function valuesFrom(data: MonthIncome): MonthIncomeFormValues {
  return {
    salary: data.salary === null ? "" : String(data.salary),
    savingsTarget: data.savings_target === null ? "" : String(data.savings_target),
  };
}

export function MonthIncomeForm({ data, onSave }: MonthIncomeFormProps) {
  const uid = useId();
  const [values, setValues] = useState<MonthIncomeFormValues>(() => valuesFrom(data));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 切換月份或儲存成功後外層換了 data：重新帶入（使用者輸入中的內容以新月份為準）
  useEffect(() => {
    setValues(valuesFrom(data));
    setFieldErrors({});
    setFormError(null);
  }, [data]);

  const set = (key: keyof MonthIncomeFormValues, value: string, errorKey: string) => {
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
    const parsed = parseMonthIncomeForm(values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await onSave(monthIncomePayload(parsed.fields));
    } catch (err) {
      const split = splitFieldErrors(describeApiError(err), FIELDS);
      setFieldErrors(split.fieldErrors);
      setFormError(split.formError);
    } finally {
      setSubmitting(false);
    }
  };

  const unset = data.salary === null;

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate aria-busy={submitting} data-testid="month-income-form">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}

      {data.inherited_from && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground" data-testid="inherited-hint">
          沿用 {data.inherited_from} 的金額，尚未寫入本月；修改後按「儲存」才會存成本月的設定
        </p>
      )}
      {unset && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground" data-testid="unset-hint">
          {UNSET_SALARY_MESSAGE}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-salary`}>月薪</Label>
          <Input id={`${uid}-salary`} inputMode="decimal" placeholder="0" className="h-11" value={values.salary} onChange={(e) => set("salary", e.target.value, "salary")} aria-invalid={Boolean(fieldErrors.salary)} />
          <FieldError message={fieldErrors.salary} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${uid}-savings`}>儲蓄目標</Label>
          <Input id={`${uid}-savings`} inputMode="decimal" placeholder="0" className="h-11" value={values.savingsTarget} onChange={(e) => set("savingsTarget", e.target.value, "savings_target")} aria-invalid={Boolean(fieldErrors.savings_target)} />
          <FieldError message={fieldErrors.savings_target} />
        </div>
      </div>

      <Button type="submit" className="h-11" disabled={submitting} data-testid="save-income">
        {submitting ? "儲存中…" : "儲存"}
      </Button>
    </form>
  );
}
