/** 分類 API（SRS 4.7）。一級分類唯讀（PUT /category-groups Phase 3）；二級分類 CRUD。型別全部來自 schema.d.ts。 */
import { apiFetch, resolvePath } from "./client";
import type { components } from "./schema";

export type CategoryGroup = components["schemas"]["CategoryGroupOut"];
export type Category = components["schemas"]["CategoryOut"];
export type CategoryCreate = components["schemas"]["CategoryCreate"];
export type CategoryUpdate = components["schemas"]["CategoryUpdate"];

export function listCategoryGroups(): Promise<CategoryGroup[]> {
  return apiFetch<CategoryGroup[]>("/api/v1/category-groups");
}

export function listCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/api/v1/categories");
}

export function createCategory(payload: CategoryCreate): Promise<Category> {
  return apiFetch<Category>("/api/v1/categories", { method: "POST", json: payload });
}

export function updateCategory(id: number, payload: CategoryUpdate): Promise<Category> {
  return apiFetch<Category>(resolvePath("/api/v1/categories/{category_id}", { category_id: id }), { method: "PUT", json: payload });
}

/**
 * DELETE 有兩種結果（REQ-CATEGORY-007；spec-gaps 8.10）：
 * - 從未被花費引用 → 204，回 undefined，呼叫端從清單移除；
 * - 已被引用 → 200 並回傳 is_active=false 的資料，呼叫端改成停用並提示。
 */
export function deleteCategory(id: number): Promise<Category | undefined> {
  return apiFetch<Category | undefined>(resolvePath("/api/v1/categories/{category_id}", { category_id: id }), { method: "DELETE" });
}
