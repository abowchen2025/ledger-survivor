/**
 * 信用卡新增／編輯表單（SRS 4.2 欄位規格表與操作流程）。
 *
 * - 結帳日／繳款日一改就即時預覽 due_month_offset（lib/card-due-offset.ts，與後端同一份 fixture 驗證），
 *   使用者可切成手動覆寫；送出時以後端回傳值為準。
 * - 期初卡債（opening_*）只在新增時顯示，編輯既有卡片鎖定（後端 PUT 不收這些欄位）。
 * - 後端 error.fields 顯示在對應欄位下方，不清空已輸入內容。
 */
import { type FormEvent, useId, useState } from "react";

import type { Card, CardCreate, CardUpdate } from "@/api/cards";
import { describeApiError, ERROR_CODES } from "@/api/errors";
import { FieldError } from "@/components/FieldError";
import { FieldSelect } from "@/components/FieldSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type DueMonthOffset, describeDueMonthOffset, inferDueMonthOffset, isValidDayOfMonth } from "@/lib/card-due-offset";
import { parseAmountInput } from "@/lib/money";

export type CardFormPayload = CardCreate & CardUpdate;

export interface CardFormProps {
  mode: "create" | "edit";
  initial?: Card;
  /** 成功要 resolve；失敗丟出原始錯誤 */
  onSubmit: (payload: CardFormPayload) => Promise<void>;
  onCancel?: () => void;
}

interface Values {
  name: string;
  bank: string;
  last4: string;
  statementDay: string;
  dueDay: string;
  /** "auto" 依推算；"0"／"1" 手動覆寫 */
  offsetMode: "auto" | "0" | "1";
  color: string;
  openingBilledUnpaid: string;
  openingUnbilled: string;
  openingAsOf: string;
}

// SRS 4.2 欄位規格表「檢核失敗文案」
const MSG = {
  name: "請輸入卡片名稱",
  bank: "請輸入發卡銀行",
  last4: "請輸入卡號末四碼（4位數字）",
  statement_day: "結帳日須介於1-31",
  due_day: "繳款日須介於1-31",
  color: "顏色格式錯誤",
  opening: "金額不可為負數",
} as const;

function initialValues(card?: Card): Values {
  if (!card) {
    return { name: "", bank: "", last4: "", statementDay: "", dueDay: "", offsetMode: "auto", color: "", openingBilledUnpaid: "", openingUnbilled: "", openingAsOf: "" };
  }
  const inferred = inferDueMonthOffset(card.statement_day, card.due_day);
  return {
    name: card.name,
    bank: card.bank,
    last4: card.last4,
    statementDay: String(card.statement_day),
    dueDay: String(card.due_day),
    // 存的值與推算一致就當「自動」，不一致就是之前手動覆寫過
    offsetMode: card.due_month_offset === inferred ? "auto" : (String(card.due_month_offset) as "0" | "1"),
    color: card.color ?? "",
    openingBilledUnpaid: "",
    openingUnbilled: "",
    openingAsOf: "",
  };
}

/** 期初金額：空白視為 0（SRS 預設 0），否則須為 ≥0 的金額 */
function parseOpening(raw: string): { ok: true; value: number } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: 0 };
  if (raw.trim() === "0") return { ok: true, value: 0 };
  const parsed = parseAmountInput(raw);
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false };
}

export function CardForm({ mode, initial, onSubmit, onCancel }: CardFormProps) {
  const uid = useId();
  const [values, setValues] = useState<Values>(() => initialValues(initial));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const statementDay = Number(values.statementDay);
  const dueDay = Number(values.dueDay);
  const daysValid = isValidDayOfMonth(statementDay) && isValidDayOfMonth(dueDay);
  const inferred: DueMonthOffset | null = daysValid ? inferDueMonthOffset(statementDay, dueDay) : null;
  const effectiveOffset: DueMonthOffset | null = values.offsetMode === "auto" ? inferred : (Number(values.offsetMode) as DueMonthOffset);

  const set = <K extends keyof Values>(key: K, value: Values[K], errorKey?: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    const k = errorKey ?? key;
    setFieldErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const validate = (): CardFormPayload | null => {
    const errors: Record<string, string> = {};
    const name = values.name.trim();
    const bank = values.bank.trim();
    if (!name || name.length > 20) errors.name = MSG.name;
    if (!bank || bank.length > 20) errors.bank = MSG.bank;
    if (!/^\d{4}$/.test(values.last4)) errors.last4 = MSG.last4;
    if (!isValidDayOfMonth(statementDay)) errors.statement_day = MSG.statement_day;
    if (!isValidDayOfMonth(dueDay)) errors.due_day = MSG.due_day;
    const color = values.color.trim();
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) errors.color = MSG.color;
    const billed = parseOpening(values.openingBilledUnpaid);
    const unbilled = parseOpening(values.openingUnbilled);
    if (!billed.ok) errors.opening_billed_unpaid = MSG.opening;
    if (!unbilled.ok) errors.opening_unbilled = MSG.opening;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !billed.ok || !unbilled.ok) return null;

    const base: CardUpdate = {
      name,
      bank,
      last4: values.last4,
      statement_day: statementDay,
      due_day: dueDay,
      // auto：不送，讓後端依 REQ-CARD-002 推算（PUT 時來源欄位有變會重算）；覆寫：送明確值
      due_month_offset: values.offsetMode === "auto" ? null : (Number(values.offsetMode) as 0 | 1),
      color: color || null,
      is_active: initial?.is_active ?? true,
    };
    if (mode === "edit") return base as CardFormPayload;
    return {
      ...base,
      opening_billed_unpaid: billed.value,
      opening_unbilled: unbilled.value,
      opening_as_of: values.openingAsOf || null,
    };
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const payload = validate();
    if (!payload) return;
    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      const info = describeApiError(err);
      setFieldErrors(info.fields);
      setFormError(Object.keys(info.fields).length === 0 || info.code !== ERROR_CODES.VALIDATION_ERROR ? info.message : null);
    } finally {
      setSubmitting(false);
    }
  };

  const id = (name: string) => `${uid}-${name}`;

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate aria-busy={submitting} data-testid="card-form">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={id("name")}>卡名</Label>
          <Input id={id("name")} maxLength={20} className="h-11" value={values.name} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(fieldErrors.name)} />
          <FieldError message={fieldErrors.name} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={id("bank")}>銀行</Label>
          <Input id={id("bank")} maxLength={20} className="h-11" value={values.bank} onChange={(e) => set("bank", e.target.value)} aria-invalid={Boolean(fieldErrors.bank)} />
          <FieldError message={fieldErrors.bank} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={id("last4")}>末四碼</Label>
          <Input id={id("last4")} inputMode="numeric" maxLength={4} pattern="[0-9]*" className="h-11" value={values.last4} onChange={(e) => set("last4", e.target.value.replace(/\D/g, "").slice(0, 4))} aria-invalid={Boolean(fieldErrors.last4)} />
          <FieldError message={fieldErrors.last4} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={id("statement")}>結帳日</Label>
          <Input id={id("statement")} inputMode="numeric" className="h-11" value={values.statementDay} onChange={(e) => set("statementDay", e.target.value.replace(/\D/g, "").slice(0, 2), "statement_day")} aria-invalid={Boolean(fieldErrors.statement_day)} />
          <FieldError message={fieldErrors.statement_day} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={id("due")}>繳款日</Label>
          <Input id={id("due")} inputMode="numeric" className="h-11" value={values.dueDay} onChange={(e) => set("dueDay", e.target.value.replace(/\D/g, "").slice(0, 2), "due_day")} aria-invalid={Boolean(fieldErrors.due_day)} />
          <FieldError message={fieldErrors.due_day} />
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm" data-testid="due-offset-preview">
        {inferred === null ? (
          <span className="text-muted-foreground">填好結帳日與繳款日後，這裡會顯示繳款月的推算結果</span>
        ) : (
          <div className="flex flex-col gap-2">
            <span>
              {describeDueMonthOffset(effectiveOffset ?? inferred)}
              {values.offsetMode !== "auto" && <span className="text-muted-foreground">（手動覆寫；系統推算為{inferred === 1 ? "次月" : "同月"}）</span>}
            </span>
            <Label htmlFor={id("offset")} className="text-muted-foreground">
              繳款月偏移
            </Label>
            <FieldSelect id={id("offset")} className="h-9 text-sm" value={values.offsetMode} onChange={(e) => set("offsetMode", e.target.value as Values["offsetMode"], "due_month_offset")}>
              <option value="auto">自動推算（{inferred === 1 ? "次月" : "同月"}）</option>
              <option value="0">手動：同月（偏移 0）</option>
              <option value="1">手動：次月（偏移 1）</option>
            </FieldSelect>
            <FieldError message={fieldErrors.due_month_offset} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={id("color")}>卡面顏色（選填，#RRGGBB）</Label>
        <div className="flex items-center gap-2">
          <input type="color" aria-label="選色" className="size-11 shrink-0 rounded-md border" value={/^#[0-9A-Fa-f]{6}$/.test(values.color) ? values.color : "#888888"} onChange={(e) => set("color", e.target.value.toUpperCase())} />
          <Input id={id("color")} placeholder="#FF8800" maxLength={7} className="h-11" value={values.color} onChange={(e) => set("color", e.target.value)} aria-invalid={Boolean(fieldErrors.color)} />
          {values.color && (
            <Button type="button" variant="ghost" size="sm" onClick={() => set("color", "")}>
              清除
            </Button>
          )}
        </div>
        <FieldError message={fieldErrors.color} />
      </div>

      {mode === "create" && (
        <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">期初未付卡債（選填，只在新增時可填；只影響現金流，不影響週花費）</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={id("billed")}>已出帳未繳</Label>
              <Input id={id("billed")} inputMode="decimal" placeholder="0" className="h-11" value={values.openingBilledUnpaid} onChange={(e) => set("openingBilledUnpaid", e.target.value, "opening_billed_unpaid")} aria-invalid={Boolean(fieldErrors.opening_billed_unpaid)} />
              <FieldError message={fieldErrors.opening_billed_unpaid} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={id("unbilled")}>未出帳</Label>
              <Input id={id("unbilled")} inputMode="decimal" placeholder="0" className="h-11" value={values.openingUnbilled} onChange={(e) => set("openingUnbilled", e.target.value, "opening_unbilled")} aria-invalid={Boolean(fieldErrors.opening_unbilled)} />
              <FieldError message={fieldErrors.opening_unbilled} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={id("asof")}>期初基準日</Label>
            <Input id={id("asof")} type="date" className="h-11" value={values.openingAsOf} onChange={(e) => set("openingAsOf", e.target.value, "opening_as_of")} aria-invalid={Boolean(fieldErrors.opening_as_of)} />
            <FieldError message={fieldErrors.opening_as_of} />
          </div>
        </fieldset>
      )}

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={submitting} data-testid="submit">
          {submitting ? "送出中…" : mode === "create" ? "新增卡片" : "儲存"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" className="h-11" onClick={onCancel} disabled={submitting}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
