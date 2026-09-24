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
