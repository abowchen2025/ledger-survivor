/** lib/category-payload.ts：欄位集合就是 schema.d.ts 的 CategoryCreate／CategoryUpdate；文案同 SRS 4.7。 */
import { describe, expect, it } from "vitest";

import type { Category } from "@/api/categories";

import { categoryCreatePayload, categoryRenamePayload, categoryUpdateFromCategory, parseCategoryForm } from "./category-payload";

const category: Category = { id: 12, group_id: 1, name: "三餐外食", is_system: true, sort_order: 2, is_active: true };

describe("parseCategoryForm", () => {
  it("修剪空白；1～10 字", () => {
    expect(parseCategoryForm({ name: " 手搖飲 " })).toEqual({ ok: true, name: "手搖飲" });
    expect(parseCategoryForm({ name: "" })).toEqual({ ok: false, errors: { name: "請輸入分類名稱" } });
    expect(parseCategoryForm({ name: "一二三四五六七八九十一" })).toEqual({ ok: false, errors: { name: "請輸入分類名稱" } });
  });
});

describe("payload 欄位集合", () => {
  it("新增：name + group_id，不送 sort_order（後端排最後）", () => {
    const payload = categoryCreatePayload("手搖飲", 1);
    expect(Object.keys(payload).sort()).toEqual(["group_id", "name"]);
    expect(payload).toEqual({ name: "手搖飲", group_id: 1 });
  });

  it("改名：整筆 CategoryUpdate，其餘欄位沿用", () => {
    const payload = categoryRenamePayload(category, "外食");
    expect(Object.keys(payload).sort()).toEqual(["group_id", "is_active", "name", "sort_order"]);
    expect(payload).toEqual({ name: "外食", group_id: 1, sort_order: 2, is_active: true });
  });

  it("停用／啟用：只翻 is_active", () => {
    expect(categoryUpdateFromCategory(category, { is_active: false })).toEqual({ name: "三餐外食", group_id: 1, sort_order: 2, is_active: false });
    expect(categoryUpdateFromCategory({ ...category, is_active: false }, { is_active: true }).is_active).toBe(true);
    expect(categoryUpdateFromCategory(category)).toEqual({ name: "三餐外食", group_id: 1, sort_order: 2, is_active: true });
  });
});
