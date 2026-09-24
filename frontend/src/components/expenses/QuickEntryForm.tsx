/**
 * 快速記帳表單（SRS 4.5；REQ-EXPENSE-001、REQ-NFR-002）。首頁常駐（mode="create"）與清單內編輯（mode="edit"）共用。
 *
 * 三次點擊內完成最常見的一筆：日期預設今天（Asia/Taipei）、分類與支付方式帶入上一筆，
 * 通常只要 ①輸入金額 ②輸入品項（或點最近品項）③按送出。
 *
 * - 金額 inputmode="decimal" 叫出數字鍵盤；退款用「退款」切換而不是負號（iOS 數字鍵盤沒有負號鍵）。
 * - 信用卡欄位只在信用卡／行動支付顯示；切回現金／轉帳時清空已選卡片（後端拒絕帶卡的現金花費，spec-gaps 8.5）。
 * - 卡片選單只列啟用中的卡（編輯時保留原本那張，即使已停用，spec-gaps 8.6）。
 * - 送出中按鈕停用，防止連點重複記帳；成功後清空金額、品項、備註、退款，保留日期、分類、支付方式、卡片。
 * - payload 不在這裡拼：一律交給 lib/expense-payload.ts 逐欄位依 ExpenseCreate／ExpenseUpdate 組裝。
 * - 錯誤處理：送出狀態一律在 finally 重設；後端 error.fields 有對應輸入框的顯示在欄位下方、不清空已輸入內容，
 *   沒有對應輸入框的併進表單頂部的整體錯誤（含欄位名與訊息），不靜默吞掉。
 */
import { type FormEvent, useEffect, useId, useState } from "react";

import type { Card } from "@/api/cards";
import { describeApiError, ERROR_CODES, splitFieldErrors } from "@/api/errors";
import type { ExpenseCreate, ExpenseUpdate, PaymentMethod } from "@/api/expenses";
import { FieldError } from "@/components/FieldError";
import { FieldSelect } from "@/components/FieldSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type ExpenseFormValues, expenseCreatePayload, expenseUpdatePayload, parseExpenseForm } from "@/lib/expense-payload";
import { PAYMENT_METHODS, cardFieldMode } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { todayTaipei } from "@/lib/week";
import { cardLabel } from "@/store/card-store";
import type { CategoryOption } from "@/store/category-store";

/** 表單狀態的型別定義在 lib/expense-payload.ts（payload 組裝與 scripts/payload-dump.ts 共用） */
export type QuickEntryValues = ExpenseFormValues;

// 畫面上有輸入框、能把後端 error.fields 顯示在欄位下方的欄位；card_id 只在卡片欄位顯示時算
const BASE_FIELDS = ["date", "amount", "item", "category_id", "payment_method", "note"] as const;

interface QuickEntryFormBaseProps {
  /** 預設值：create 帶今天與上一筆的分類／支付方式；edit 帶既有花費 */
  initial?: Partial<QuickEntryValues>;
  categories: CategoryOption[];
  cards: Card[];
  recentItems?: string[];
  onCancel?: () => void;
  /** 收到 INACTIVE_REFERENCE 時呼叫（外層重新載入分類／卡片選單） */
  onInactiveReference?: () => void;
  submitLabel?: string;
}

/**
 * onSubmit 依 mode 收不同型別：新增拿 ExpenseCreate（POST）、編輯拿 ExpenseUpdate（PUT），
 * 物件分別由 lib/expense-payload.ts 的 expenseCreatePayload／expenseUpdatePayload 逐欄位組成。
 * 成功要 resolve；失敗丟出原始錯誤（表單自己解讀 error.fields）。金鑰問題請在外層先攔下導向。
 */
export type QuickEntryFormProps = QuickEntryFormBaseProps &
  ({ mode: "create"; onSubmit: (payload: ExpenseCreate) => Promise<void> } | { mode: "edit"; onSubmit: (payload: ExpenseUpdate) => Promise<void> });

function defaults(initial: Partial<QuickEntryValues> | undefined): QuickEntryValues {
  return {
    date: todayTaipei(),
    amountInput: "",
    refund: false,
    item: "",
    categoryId: null,
    paymentMethod: "cash",
    cardId: null,
    note: "",
    ...initial,
  };
}

export function QuickEntryForm(props: QuickEntryFormProps) {
  const { mode, initial, categories, cards, recentItems = [], onCancel, onInactiveReference, submitLabel } = props;
  const uid = useId();
  const [values, setValues] = useState<QuickEntryValues>(() => defaults(initial));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showNote, setShowNote] = useState(Boolean(initial?.note));

  // 上一筆預設值在載入完成後才到：create 模式且使用者尚未動過對應欄位時跟著更新
  useEffect(() => {
    if (mode !== "create" || !initial) return;
    setValues((v) => ({
      ...v,
      categoryId: v.categoryId ?? initial.categoryId ?? null,
      paymentMethod: initial.paymentMethod ?? v.paymentMethod,
      cardId: v.cardId ?? initial.cardId ?? null,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initial?.categoryId, initial?.paymentMethod, initial?.cardId]);

  const cardMode = cardFieldMode(values.paymentMethod);
  const selectableCards = cards.filter((c) => c.is_active || c.id === values.cardId);
  const selectableCategories = categories.filter((c) => c.isActive || c.id === values.categoryId);

  // 表單欄位 → 後端 error.fields 的鍵
  const ERROR_KEY: Record<keyof QuickEntryValues, string> = {
    date: "date",
    amountInput: "amount",
    refund: "amount",
    item: "item",
    categoryId: "category_id",
    paymentMethod: "payment_method",
    cardId: "card_id",
    note: "note",
  };

  const set = <K extends keyof QuickEntryValues>(key: K, value: QuickEntryValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    // 使用者一改該欄位就清掉它的錯誤，其他欄位的錯誤留著
    setFieldErrors((e) => {
      const errorKey = ERROR_KEY[key];
      if (!(errorKey in e)) return e;
      const next = { ...e };
      delete next[errorKey];
      return next;
    });
  };

  const changePaymentMethod = (method: PaymentMethod) => {
    setValues((v) => ({
      ...v,
      paymentMethod: method,
      // 現金／轉帳不得帶卡：切換時清空，避免送出被後端拒絕
      cardId: cardFieldMode(method) === "hidden" ? null : v.cardId,
    }));
    setFieldErrors((e) => {
      const next = { ...e };
      delete next.card_id;
      delete next.payment_method;
      return next;
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const parsed = parseExpenseForm(values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (props.mode === "create") {
        await props.onSubmit(expenseCreatePayload(parsed.fields));
      } else {
        await props.onSubmit(expenseUpdatePayload(parsed.fields));
      }
      if (mode === "create") {
        setValues((v) => ({ ...v, amountInput: "", item: "", note: "", refund: false }));
        setShowNote(false);
      }
    } catch (err) {
      const info = describeApiError(err);
      const known: string[] = [...BASE_FIELDS, ...(cardMode !== "hidden" ? ["card_id"] : [])];
      const split = splitFieldErrors(info, known);
      setFieldErrors(split.fieldErrors);
      setFormError(split.formError);
      // 備註欄收合時收到 note 的錯誤：展開讓文案看得到
      if (split.fieldErrors.note) setShowNote(true);
      if (info.code === ERROR_CODES.INACTIVE_REFERENCE) onInactiveReference?.();
    } finally {
      // 成功、後端拒絕、網路錯誤都要把按鈕從「送出中」放開
      setSubmitting(false);
    }
  };

  const ids = {
    amount: `${uid}-amount`,
    item: `${uid}-item`,
    category: `${uid}-category`,
    card: `${uid}-card`,
    date: `${uid}-date`,
    note: `${uid}-note`,
    refund: `${uid}-refund`,
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate aria-busy={submitting} data-testid="quick-entry-form">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.amount}>金額</Label>
          <Input
            id={ids.amount}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            className={cn("h-11 text-lg", values.refund && "text-destructive")}
            value={values.amountInput}
            onChange={(e) => set("amountInput", e.target.value)}
            aria-invalid={Boolean(fieldErrors.amount)}
            aria-describedby={fieldErrors.amount ? `${ids.amount}-error` : undefined}
          />
        </div>
        <div className="flex h-11 items-center gap-2">
          <Switch id={ids.refund} checked={values.refund} onCheckedChange={(checked) => set("refund", checked)} aria-label="退款" data-testid="refund-switch" />
          <Label htmlFor={ids.refund} className={cn("text-muted-foreground", values.refund && "text-destructive")}>
            退款
          </Label>
        </div>
      </div>
      <FieldError id={`${ids.amount}-error`} message={fieldErrors.amount} />

      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.item}>品項</Label>
        <Input
          id={ids.item}
          autoComplete="off"
          maxLength={50}
          placeholder="例：午餐"
          className="h-11"
          value={values.item}
          onChange={(e) => set("item", e.target.value)}
          aria-invalid={Boolean(fieldErrors.item)}
        />
        <FieldError message={fieldErrors.item} />
        {recentItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1" aria-label="最近品項">
            {recentItems.map((item) => (
              <Button
                key={item}
                type="button"
                variant={values.item === item ? "secondary" : "outline"}
                size="sm"
                onClick={() => set("item", item)}
              >
                {item}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.category}>分類</Label>
          <FieldSelect
            id={ids.category}
            value={values.categoryId ?? ""}
            onChange={(e) => set("categoryId", e.target.value ? Number(e.target.value) : null)}
            aria-invalid={Boolean(fieldErrors.category_id)}
          >
            <option value="">選擇分類</option>
            {selectableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.groupName}｜{c.name}
                {c.isReward ? "（不計入週花費）" : ""}
                {c.isActive ? "" : "（已停用）"}
              </option>
            ))}
          </FieldSelect>
          <FieldError message={fieldErrors.category_id} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.date}>日期</Label>
          <Input id={ids.date} type="date" className="h-11" value={values.date} onChange={(e) => set("date", e.target.value)} aria-invalid={Boolean(fieldErrors.date)} />
          <FieldError message={fieldErrors.date} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">支付方式</legend>
        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="支付方式">
          {PAYMENT_METHODS.map((m) => (
            <Button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={values.paymentMethod === m.value}
              variant={values.paymentMethod === m.value ? "default" : "outline"}
              className="h-10"
              onClick={() => changePaymentMethod(m.value)}
            >
              {m.label}
            </Button>
          ))}
        </div>
        <FieldError message={fieldErrors.payment_method} />
      </fieldset>

      {cardMode !== "hidden" && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.card}>信用卡{cardMode === "optional" ? "（選填，有選代表綁卡）" : ""}</Label>
          <FieldSelect
            id={ids.card}
            value={values.cardId ?? ""}
            onChange={(e) => set("cardId", e.target.value ? Number(e.target.value) : null)}
            aria-invalid={Boolean(fieldErrors.card_id)}
          >
            <option value="">{cardMode === "optional" ? "未綁卡" : "選擇信用卡"}</option>
            {selectableCards.map((c) => (
              <option key={c.id} value={c.id}>
                {cardLabel(c)}
                {c.is_active ? "" : "（已停用）"}
              </option>
            ))}
          </FieldSelect>
          {selectableCards.length === 0 && <p className="text-xs text-muted-foreground">尚未新增信用卡，到「設定」頁新增</p>}
          <FieldError message={fieldErrors.card_id} />
        </div>
      )}

      {showNote ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.note}>備註</Label>
          <Input id={ids.note} maxLength={100} value={values.note} onChange={(e) => set("note", e.target.value)} aria-invalid={Boolean(fieldErrors.note)} />
          <FieldError message={fieldErrors.note} />
        </div>
      ) : (
        <button type="button" className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setShowNote(true)}>
          加備註
        </button>
      )}

      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1 text-base" disabled={submitting} data-testid="submit">
          {submitting ? "送出中…" : submitLabel ?? (mode === "create" ? "記一筆" : "儲存")}
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
