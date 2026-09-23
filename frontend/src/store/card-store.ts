/**
 * 信用卡主檔（SRS 4.2）：清單 + CRUD，設定頁的信用卡管理與快速記帳的卡片選單共用。
 * 快速記帳只列啟用中的卡（REQ-CARD-005）：用 activeCards()。
 */
// 不用 zustand 的 devtools middleware：它讀整個 import.meta.env，Vite 會把含所有 VITE_* 的物件字面值嵌進產物，
// VITE_DEV_API_KEY 就會跟著進 dist（deploy-frontend.yml 的哨兵檢查會擋下）。見 api/api-key.ts 的說明。
import { create } from "zustand";

import {
  type Card,
  type CardCreate,
  type CardUpdate,
  createCard,
  deleteCard,
  listCards,
  updateCard,
} from "@/api/cards";

export interface CardState {
  cards: Card[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
  create: (payload: CardCreate) => Promise<Card>;
  update: (id: number, payload: CardUpdate) => Promise<Card>;
  remove: (id: number) => Promise<void>;
}

export const useCardStore = create<CardState>()((set, get) => ({
  cards: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const cards = await listCards();
      set({ cards, loaded: true, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  create: async (payload) => {
    const card = await createCard(payload);
    set((s) => ({ cards: [...s.cards, card] }));
    return card;
  },
  update: async (id, payload) => {
    const card = await updateCard(id, payload);
    set((s) => ({ cards: s.cards.map((c) => (c.id === id ? card : c)) }));
    return card;
  },
  remove: async (id) => {
    await deleteCard(id);
    set((s) => ({ cards: s.cards.filter((c) => c.id !== id) }));
  },
}));

export function activeCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.is_active);
}

/** 顯示用：卡名（末四碼） */
export function cardLabel(card: Card): string {
  return `${card.name}（${card.last4}）`;
}
