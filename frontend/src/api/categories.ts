/** 分類 API（SRS 4.7）。本輪只讀（seed 的 7 個一級、23 個二級分類）。 */
import { apiFetch } from "./client";
import type { components } from "./schema";

export type CategoryGroup = components["schemas"]["CategoryGroupOut"];
export type Category = components["schemas"]["CategoryOut"];

export function listCategoryGroups(): Promise<CategoryGroup[]> {
  return apiFetch<CategoryGroup[]>("/api/v1/category-groups");
}

export function listCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/api/v1/categories");
}
