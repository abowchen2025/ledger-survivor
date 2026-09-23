/**
 * 分類參照資料（一級 + 二級），供快速記帳的分類選單與清單顯示。
 * 只讀；INACTIVE_REFERENCE 時呼叫 load() 重新載入。
 */
// 不用 zustand 的 devtools middleware：它讀整個 import.meta.env，Vite 會把含所有 VITE_* 的物件字面值嵌進產物，
// VITE_DEV_API_KEY 就會跟著進 dist（deploy-frontend.yml 的哨兵檢查會擋下）。見 api/api-key.ts 的說明。
import { create } from "zustand";

import {
  type Category,
  type CategoryGroup,
  listCategories,
  listCategoryGroups,
} from "@/api/categories";

export interface CategoryState {
  groups: CategoryGroup[];
  categories: Category[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
}

export const useCategoryStore = create<CategoryState>()((set, get) => ({
  groups: [],
  categories: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [groups, categories] = await Promise.all([
        listCategoryGroups(),
        listCategories(),
      ]);
      set({ groups, categories, loaded: true, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
}));

export interface CategoryOption {
  id: number;
  name: string;
  groupId: number;
  groupName: string;
  /** REWARD 類（counts_toward_target=false）：不計入週花費，清單要特殊標示 */
  isReward: boolean;
  isActive: boolean;
}

/** 依一級分類 sort_order → 二級 sort_order 排好、附上一級名稱的選項清單（含停用，呼叫端自行過濾）。 */
export function categoryOptions(
  groups: CategoryGroup[],
  categories: Category[],
): CategoryOption[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  return categories
    .filter((c) => groupById.has(c.group_id))
    .map((c) => {
      const g = groupById.get(c.group_id)!;
      return {
        id: c.id,
        name: c.name,
        groupId: g.id,
        groupName: g.name,
        isReward: !g.counts_toward_target,
        isActive: c.is_active && g.is_active,
      };
    })
    .sort((a, b) => {
      const ga = groupById.get(a.groupId)!;
      const gb = groupById.get(b.groupId)!;
      if (ga.sort_order !== gb.sort_order) return ga.sort_order - gb.sort_order;
      const ca = categories.find((c) => c.id === a.id)!;
      const cb = categories.find((c) => c.id === b.id)!;
      return ca.sort_order - cb.sort_order || ca.id - cb.id;
    });
}
