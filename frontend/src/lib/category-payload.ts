/**
 * 二級分類表單 → API payload 的唯一組裝點（SRS 4.7）。做法同 lib/card-payload.ts（ADR-0008）。
 * 一級分類本輪唯讀（PUT /category-groups 是 Phase 3），這裡沒有它的 payload。
 */
import type { Category, CategoryCreate, CategoryUpdate } from "@/api/categories";

// SRS 4.7 二級分類欄位規格表「檢核失敗文案」（與後端 schemas/category.py 同一句）
export const CATEGORY_MESSAGES = {
  name: "請輸入分類名稱",
  group_id: "請選擇所屬一級分類",
} as const;

export interface CategoryFormValues {
  name: string;
}

export type CategoryFormParseResult = { ok: true; name: string } | { ok: false; errors: Record<string, string> };

/** 名稱 1～10 字 */
export function parseCategoryForm(values: CategoryFormValues): CategoryFormParseResult {
  const name = values.name.trim();
  if (!name || name.length > 10) return { ok: false, errors: { name: CATEGORY_MESSAGES.name } };
  return { ok: true, name };
}

/** POST /categories：新增到指定一級分類；sort_order 不送，後端排在該一級分類最後 */
export function categoryCreatePayload(name: string, groupId: number): CategoryCreate {
  return {
    name,
    group_id: groupId,
  };
}

/** PUT /categories/{id}（改名）：整筆取代，group_id／sort_order／is_active 沿用既有值 */
export function categoryRenamePayload(category: Category, name: string): CategoryUpdate {
  return {
    name,
    group_id: category.group_id,
    sort_order: category.sort_order,
    is_active: category.is_active,
  };
}

/** PUT /categories/{id}（停用／重新啟用）：從既有分類逐欄位組出，只翻 is_active */
export function categoryUpdateFromCategory(category: Category, overrides: Partial<Pick<CategoryUpdate, "is_active">> = {}): CategoryUpdate {
  return {
    name: category.name,
    group_id: category.group_id,
    sort_order: category.sort_order,
    is_active: overrides.is_active === undefined ? category.is_active : overrides.is_active,
  };
}
