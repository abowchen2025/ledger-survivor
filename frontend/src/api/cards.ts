/** 信用卡 API（SRS 4.2）。型別全部來自 schema.d.ts，不手寫。 */
import { apiFetch, resolvePath } from "./client";
import type { components } from "./schema";

export type Card = components["schemas"]["CardOut"];
export type CardCreate = components["schemas"]["CardCreate"];
export type CardUpdate = components["schemas"]["CardUpdate"];

export function listCards(): Promise<Card[]> {
  return apiFetch<Card[]>("/api/v1/cards");
}

export function createCard(payload: CardCreate): Promise<Card> {
  return apiFetch<Card>("/api/v1/cards", { method: "POST", json: payload });
}

export function updateCard(id: number, payload: CardUpdate): Promise<Card> {
  return apiFetch<Card>(resolvePath("/api/v1/cards/{card_id}", { card_id: id }), { method: "PUT", json: payload });
}

export function deleteCard(id: number): Promise<void> {
  return apiFetch<void>(resolvePath("/api/v1/cards/{card_id}", { card_id: id }), { method: "DELETE" });
}

/** PUT 是整筆取代：從既有卡片組出 CardUpdate（不含 opening_*，建立後鎖定）。 */
export function toCardUpdate(card: Card, overrides: Partial<CardUpdate> = {}): CardUpdate {
  return {
    name: card.name,
    bank: card.bank,
    last4: card.last4,
    statement_day: card.statement_day,
    due_day: card.due_day,
    due_month_offset: card.due_month_offset as 0 | 1,
    color: card.color,
    is_active: card.is_active,
    ...overrides,
  };
}
