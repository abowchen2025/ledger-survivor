/**
 * 花費（SRS 4.5）：本週清單、最近品項、快速記帳的「上一筆」預設值。
 *
 * - 本週範圍由頁面用 lib/dates.ts 的 currentWeek()（week.ts 週歸屬規則）算好傳進來，不是「今天往前七天」。
 * - lastUsed（分類、支付方式、卡片）存 localStorage，讓下次打開 App 也只要輸入金額、品項、送出（REQ-NFR-002）。
 * - recentItems 來自最近 60 天的花費紀錄，去重後最多 8 個，供品項快選（REQ-EXPENSE-001）。
 */
// 不用 zustand 的 devtools middleware：它讀整個 import.meta.env，Vite 會把含所有 VITE_* 的物件字面值嵌進產物，
// VITE_DEV_API_KEY 就會跟著進 dist（deploy-frontend.yml 的哨兵檢查會擋下）。見 api/api-key.ts 的說明。
import { create } from "zustand";

import {
  type Expense,
  type ExpenseCreate,
  type ExpenseUpdate,
  type PaymentMethod,
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense,
} from "@/api/expenses";
import { type CurrentWeek, daysBefore } from "@/lib/dates";
import { todayTaipei } from "@/lib/week";

export const LAST_USED_STORAGE_KEY = "ledger-survivor.quick-entry.last-used";
const RECENT_ITEMS_DAYS = 60;
const RECENT_ITEMS_MAX = 8;

export interface LastUsed {
  categoryId: number | null;
  paymentMethod: PaymentMethod;
  cardId: number | null;
}

const DEFAULT_LAST_USED: LastUsed = {
  categoryId: null,
  paymentMethod: "cash",
  cardId: null,
};

function readLastUsed(): LastUsed {
  try {
    const raw = localStorage.getItem(LAST_USED_STORAGE_KEY);
    if (!raw) return DEFAULT_LAST_USED;
    const parsed = JSON.parse(raw) as Partial<LastUsed>;
    return { ...DEFAULT_LAST_USED, ...parsed };
  } catch {
    return DEFAULT_LAST_USED;
  }
}

function writeLastUsed(value: LastUsed): void {
  try {
    localStorage.setItem(LAST_USED_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // 私密視窗或封鎖站台資料：只在本次頁面有效
  }
}

/** 由花費紀錄推出最近品項：日期新→舊、同日 id 大→小，去重。 */
export function recentItemsFrom(
  expenses: Expense[],
  max = RECENT_ITEMS_MAX,
): string[] {
  const sorted = [...expenses].sort((a, b) =>
    a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1,
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of sorted) {
    const item = e.item.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function inWeek(week: CurrentWeek | null, date: string): boolean {
  return week !== null && date >= week.start && date <= week.end;
}

function sortByDate(expenses: Expense[]): Expense[] {
  return [...expenses].sort((a, b) =>
    a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1,
  );
}

export interface ExpenseState {
  week: CurrentWeek | null;
  expenses: Expense[];
  loading: boolean;
  loaded: boolean;
  recentItems: string[];
  lastUsed: LastUsed;
  loadWeek: (week: CurrentWeek) => Promise<void>;
  loadRecentItems: () => Promise<void>;
  create: (payload: ExpenseCreate) => Promise<Expense>;
  update: (id: number, payload: ExpenseUpdate) => Promise<Expense>;
  remove: (id: number) => Promise<void>;
  rememberLastUsed: (value: LastUsed) => void;
}

export const useExpenseStore = create<ExpenseState>()((set, get) => ({
  week: null,
  expenses: [],
  loading: false,
  loaded: false,
  recentItems: [],
  lastUsed: readLastUsed(),

  loadWeek: async (week) => {
    set({ week, loading: true });
    try {
      const expenses = await listExpenses(week.start, week.end);
      set({ expenses: sortByDate(expenses), loading: false, loaded: true });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  loadRecentItems: async () => {
    const today = todayTaipei();
    const expenses = await listExpenses(
      daysBefore(today, RECENT_ITEMS_DAYS),
      today,
    );
    set({ recentItems: recentItemsFrom(expenses) });
  },

  create: async (payload) => {
    const created = await createExpense(payload);
    const { week, expenses, recentItems } = get();
    set({
      expenses: inWeek(week, created.date)
        ? sortByDate([...expenses, created])
        : expenses,
      recentItems: recentItemsFrom([
        created,
        ...recentItems.map((item, i) => ({ ...created, id: -i - 1, item })),
      ]),
    });
    get().rememberLastUsed({
      categoryId: created.category_id,
      paymentMethod: created.payment_method,
      cardId: created.card_id,
    });
    return created;
  },

  update: async (id, payload) => {
    const updated = await updateExpense(id, payload);
    const { week, expenses } = get();
    const without = expenses.filter((e) => e.id !== id);
    set({
      expenses: inWeek(week, updated.date)
        ? sortByDate([...without, updated])
        : without,
    });
    return updated;
  },

  remove: async (id) => {
    await deleteExpense(id);
    set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) }));
  },

  rememberLastUsed: (value) => {
    writeLastUsed(value);
    set({ lastUsed: value });
  },
}));
