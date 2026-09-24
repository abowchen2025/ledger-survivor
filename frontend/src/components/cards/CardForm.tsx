/**
 * 信用卡新增／編輯表單（SRS 4.2 欄位規格表與操作流程）。
 *
 * - 結帳日／繳款日一改就即時預覽 due_month_offset（lib/card-due-offset.ts，與後端同一份 fixture 驗證），
 *   使用者可切成手動覆寫；送出時以後端回傳值為準。
 * - 期初卡債（opening_*）只在新增時顯示，編輯既有卡片鎖定（後端 PUT 不收這些欄位）。
 * - payload 不在這裡拼：一律交給 lib/card-payload.ts 逐欄位依 CardCreate／CardUpdate 組裝
 *   （新增不送 is_active；編輯沿用該卡目前的 is_active）。onSubmit 的型別依 mode 分開，拿不到另一邊的形狀。
 * - 顏色：畫面顯示什麼就送什麼。新增預設顯示並送出 #FF8800；按「清除」後顯示「未設定」並送 null。
 * - 錯誤處理：送出狀態一律在 finally 重設；後端 error.fields 有對應輸入框的顯示在欄位下方，
 *   沒有對應輸入框的（例如送錯欄位）併進表單頂部的整體錯誤，含欄位名與訊息，不靜默吞掉。
 */
import { type FormEvent, useId, useState } from "react";

import type { Card, CardCreate, CardUpdate } from "@/api/cards";
import { describeApiError, splitFieldErrors } from "@/api/errors";
import { FieldError } from "@/components/FieldError";
import { FieldSelect } from "@/components/FieldSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type DueMonthOffset, describeDueMonthOffset, inferDueMonthOffset, isValidDayOfMonth } from "@/lib/card-due-offset";
import { type CardFormValues, DEFAULT_CARD_COLOR, HEX_COLOR_RE, cardCreatePayload, cardUpdatePayload, parseCardForm } from "@/lib/card-payload";

interface CardFormBaseProps {
  onCancel?: () => void;
}

/** onSubmit 依 mode 收不同型別：新增只會拿到 CardCreate，編輯只會拿到 CardUpdate。成功要 resolve；失敗丟出原始錯誤。 */
export type CardFormProps = CardFormBaseProps &
  ({ mode: "create"; initial?: undefined; onSubmit: (payload: CardCreate) => Promise<void> } | { mode: "edit"; initial: Card; onSubmit: (payload: CardUpdate) => Promise<void> });

// 畫面上有輸入框、能把後端 error.fields 顯示在欄位下方的欄位（其餘併進整體錯誤）
const EDIT_FIELDS = ["name", "bank", "last4", "statement_day", "due_day", "due_month_offset", "color"] as const;
const CREATE_FIELDS = [...EDIT_FIELDS, "opening_billed_unpaid", "opening_unbilled", "opening_as_of"] as const;

function initialValues(card?: Card): CardFormValues {
  if (!card) {
    return {
      name: "",
      bank: "",
      last4: "",
      statementDay: "",
      dueDay: "",
      offsetMode: "auto",
      color: DEFAULT_CARD_COLOR,
      openingBilledUnpaid: "",
      openingUnbilled: "",
      openingAsOf: "",
    };
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

export function CardForm(props: CardFormProps) {
  const { mode, initial, onCancel } = props;
  const uid = useId();
  const [values, setValues] = useState<CardFormValues>(() => initialValues(initial));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const statementDay = Number(values.statementDay);
  const dueDay = Number(values.dueDay);
  const daysValid = isValidDayOfMonth(statementDay) && isValidDayOfMonth(dueDay);
  const inferred: DueMonthOffset | null = daysValid ? inferDueMonthOffset(statementDay, dueDay) : null;
  const effectiveOffset: DueMonthOffset | null = values.offsetMode === "auto" ? inferred : (Number(values.offsetMode) as DueMonthOffset);
  const colorIsValid = HEX_COLOR_RE.test(values.color);

  const set = <K extends keyof CardFormValues>(key: K, value: CardFormValues[K], errorKey?: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    const k = errorKey ?? key;
    setFieldErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const parsed = parseCardForm(values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (props.mode === "create") {
        await props.onSubmit(cardCreatePayload(parsed.fields));
      } else {
        await props.onSubmit(cardUpdatePayload(parsed.fields, props.initial.is_active));
      }
    } catch (err) {
      // 只有畫面上真的有輸入框的欄位才能放到欄位下方；due_month_offset 的選單在天數不合法時不會出現
      const known = (mode === "create" ? CREATE_FIELDS : EDIT_FIELDS).filter((f) => f !== "due_month_offset" || inferred !== null);
      const split = splitFieldErrors(describeApiError(err), known);
      setFieldErrors(split.fieldErrors);
      setFormError(split.formError);
    } finally {
      // 成功、後端拒絕、網路錯誤都要把按鈕從「送出中」放開
      setSubmitting(false);
    }
  };

  const id = (name: string) => `${uid}-${name}`;

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate aria-busy={submitting} data-testid="card-form">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}

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
            <FieldSelect id={id("offset")} className="h-9 text-sm" value={values.offsetMode} onChange={(e) => set("offsetMode", e.target.value as CardFormValues["offsetMode"], "due_month_offset")}>
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
          {colorIsValid ? (
            <input type="color" aria-label="選色" className="size-11 shrink-0 rounded-md border" value={values.color.toUpperCase()} onChange={(e) => set("color", e.target.value.toUpperCase())} />
          ) : (
            // 沒有合法顏色就不顯示任何色塊：畫面看到的與送出的（null）一致
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground" data-testid="color-unset">
              未設定
            </span>
          )}
          <Input id={id("color")} maxLength={7} className="h-11" value={values.color} onChange={(e) => set("color", e.target.value)} aria-invalid={Boolean(fieldErrors.color)} />
          {values.color ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => set("color", "")}>
              清除
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => set("color", DEFAULT_CARD_COLOR)}>
              預設色
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
