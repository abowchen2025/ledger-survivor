/**
 * 設定頁「信用卡管理」（SRS 4.2）：清單（停用的灰階）、新增、編輯、停用／啟用、刪除。
 * 刪除被引用的卡片會收到 403 CARD_IN_USE：顯示訊息並提供「改為停用」按鈕（REQ-CARD-004）。
 */
import { useEffect, useState } from "react";

import { type Card, toCardUpdate } from "@/api/cards";
import { useAuthFailureRedirect } from "@/api/auth-guard";
import { describeApiError, ERROR_CODES } from "@/api/errors";
import { CardForm, type CardFormPayload } from "@/components/cards/CardForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeDueMonthOffset } from "@/lib/card-due-offset";
import { formatAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCardStore } from "@/store/card-store";

export function CardManager() {
  const { cards, loaded, loading, load, create, update, remove } = useCardStore();
  const redirectOnAuthFailure = useAuthFailureRedirect();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rowNotice, setRowNotice] = useState<{ id: number; message: string; offerDeactivate: boolean } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (loaded) return;
    load().catch((err: unknown) => {
      if (!redirectOnAuthFailure(err)) setLoadError(describeApiError(err).message);
    });
  }, [loaded, load, redirectOnAuthFailure]);

  /** 金鑰問題導向設定頁（這裡就是設定頁，等於什麼都不做）；其他錯誤丟回表單顯示 */
  const guard = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (err) {
      if (redirectOnAuthFailure(err)) return;
      throw err;
    }
  };

  const onCreate = async (payload: CardFormPayload) => {
    await guard(() => create(payload));
    setAdding(false);
  };

  const onEdit = async (card: Card, payload: CardFormPayload) => {
    await guard(() => update(card.id, { ...payload, is_active: card.is_active }));
    setEditingId(null);
  };

  const toggleActive = async (card: Card) => {
    setBusyId(card.id);
    setRowNotice(null);
    try {
      await guard(() => update(card.id, toCardUpdate(card, { is_active: !card.is_active })));
    } catch (err) {
      setRowNotice({ id: card.id, message: describeApiError(err).message, offerDeactivate: false });
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (card: Card) => {
    if (!window.confirm(`刪除「${card.name}（${card.last4}）」？已有花費或分期引用的卡片無法刪除，只能停用。`)) return;
    setBusyId(card.id);
    setRowNotice(null);
    try {
      await guard(() => remove(card.id));
    } catch (err) {
      const info = describeApiError(err);
      setRowNotice({ id: card.id, message: info.message, offerDeactivate: info.code === ERROR_CODES.CARD_IN_USE && card.is_active });
    } finally {
      setBusyId(null);
    }
  };

  const sorted = [...cards].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.id - b.id);

  return (
    <section className="mt-6 rounded-lg border p-4 text-sm" aria-labelledby="card-manager-title">
      <div className="flex items-center justify-between">
        <h3 id="card-manager-title" className="font-semibold">
          信用卡管理
        </h3>
        {!adding && (
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            新增卡片
          </Button>
        )}
      </div>

      {adding && (
        <div className="mt-3 rounded-lg border p-3">
          <CardForm mode="create" onSubmit={onCreate} onCancel={() => setAdding(false)} />
        </div>
      )}

      {loadError && (
        <p role="alert" className="mt-3 text-destructive">
          {loadError}
        </p>
      )}
      {loading && !loaded && <p className="mt-3 text-muted-foreground">載入中…</p>}

      {loaded && cards.length === 0 && !adding && (
        <button type="button" className="mt-3 w-full rounded-lg border border-dashed px-4 py-6 text-muted-foreground" onClick={() => setAdding(true)}>
          尚未新增信用卡，點此新增
        </button>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {sorted.map((card) => (
          <li key={card.id} className={cn("rounded-lg border p-3", !card.is_active && "opacity-60 grayscale")} data-testid="card-row">
            {editingId === card.id ? (
              <CardForm mode="edit" initial={card} onSubmit={(payload) => onEdit(card, payload)} onCancel={() => setEditingId(null)} />
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="size-8 shrink-0 rounded-md border" style={{ backgroundColor: card.color ?? "transparent" }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{card.name}</span>
                      <span className="text-muted-foreground">•••• {card.last4}</span>
                      {!card.is_active && <Badge variant="secondary">已停用</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {card.bank}｜結帳 {card.statement_day} 日、繳款 {card.due_day} 日｜{describeDueMonthOffset(card.due_month_offset as 0 | 1).replace("這張卡", "")}
                    </div>
                    {(card.opening_billed_unpaid !== 0 || card.opening_unbilled !== 0) && (
                      <div className="text-xs text-muted-foreground">
                        期初：已出帳未繳 {formatAmount(card.opening_billed_unpaid)}、未出帳 {formatAmount(card.opening_unbilled)}
                        {card.opening_as_of ? `（${card.opening_as_of}）` : ""}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingId(card.id)}>
                    編輯
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={busyId === card.id} onClick={() => void toggleActive(card)}>
                    {card.is_active ? "停用" : "重新啟用"}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" disabled={busyId === card.id} onClick={() => void onDelete(card)}>
                    刪除
                  </Button>
                </div>
                {rowNotice?.id === card.id && (
                  <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive">
                    <span>{rowNotice.message}</span>
                    {rowNotice.offerDeactivate && (
                      <Button type="button" size="sm" variant="outline" onClick={() => void toggleActive(card)}>
                        改為停用
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
