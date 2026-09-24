// @vitest-environment jsdom
/**
 * 分類管理（SRS 4.7；ABow 2026-09-24 第 2.2 節）。
 * API 模組整個 mock 掉，store 用真的：驗「異動後共用 store 跟著變」（首頁快速記帳選單讀同一份）。
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import type { Category, CategoryGroup } from "@/api/categories";
import * as categoriesApi from "@/api/categories";
import { ApiError } from "@/api/client";
import { categoryOptions, useCategoryStore } from "@/store/category-store";

import { CategoryManager, DEACTIVATED_INSTEAD_MESSAGE } from "./CategoryManager";

vi.mock("@/api/categories", () => ({
  listCategoryGroups: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

const groups: CategoryGroup[] = [
  { id: 1, code: "FOOD", name: "食", necessity: "必要", counts_toward_target: true, benchmark_min_pct: "20", benchmark_max_pct: "30", sort_order: 1, is_system: true, is_active: true },
  { id: 7, code: "REWARD", name: "獎勵", necessity: "想要", counts_toward_target: false, benchmark_min_pct: null, benchmark_max_pct: null, sort_order: 7, is_system: true, is_active: true },
];
const categories: Category[] = [
  { id: 11, group_id: 1, name: "三餐外食", is_system: true, sort_order: 1, is_active: true },
  { id: 12, group_id: 1, name: "手搖飲", is_system: false, sort_order: 2, is_active: true },
  { id: 71, group_id: 7, name: "犒賞自己", is_system: true, sort_order: 1, is_active: true },
];

const api = vi.mocked(categoriesApi);

function setup(confirmAnswer = true) {
  const confirm = vi.fn().mockReturnValue(confirmAnswer);
  const utils = render(
    <MemoryRouter>
      <CategoryManager confirm={confirm} />
    </MemoryRouter>,
  );
  return { ...utils, confirm, user: userEvent.setup() };
}

const row = (name: string) => screen.getByText(name).closest("li")!;

beforeEach(() => {
  vi.clearAllMocks();
  useCategoryStore.setState({ groups: [], categories: [], loaded: false, loading: false });
  api.listCategoryGroups.mockResolvedValue(groups);
  api.listCategories.mockResolvedValue(categories);
});

describe("CategoryManager 呈現", () => {
  it("一級分類標籤列，預設展開第一個；點「獎勵」切換二級清單並標示不計入", async () => {
    const { user } = setup();
    await waitFor(() => expect(screen.getByRole("tab", { name: /食/ })).toBeInTheDocument());
    expect(screen.getByText("三餐外食")).toBeInTheDocument();
    expect(screen.queryByText("犒賞自己")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /獎勵/ }));
    expect(screen.getByText("犒賞自己")).toBeInTheDocument();
    expect(screen.getByText("此類花費不計入週花費")).toBeInTheDocument();
  });
});

describe("CategoryManager 刪除的兩種結果", () => {
  it("204（從未被引用）→ 從清單移除；store 同步，快速記帳選項也不再有它", async () => {
    api.deleteCategory.mockResolvedValue(undefined);
    const { user, confirm } = setup();
    await waitFor(() => expect(screen.getByText("手搖飲")).toBeInTheDocument());
    await user.click(within(row("手搖飲")).getByRole("button", { name: "刪除 手搖飲" }));
    expect(confirm).toHaveBeenCalledWith("刪除「手搖飲」？若已有花費紀錄，將改為停用");
    await waitFor(() => expect(screen.queryByText("手搖飲")).not.toBeInTheDocument());
    expect(api.deleteCategory).toHaveBeenCalledWith(12);
    const { groups: g, categories: c } = useCategoryStore.getState();
    expect(categoryOptions(g, c).map((o) => o.name)).not.toContain("手搖飲");
  });

  it("200（已被花費引用）→ 留在清單改為停用、灰階，提示「此分類已有花費紀錄，已改為停用」", async () => {
    api.deleteCategory.mockResolvedValue({ ...categories[0], is_active: false });
    const { user } = setup();
    await waitFor(() => expect(screen.getByText("三餐外食")).toBeInTheDocument());
    await user.click(within(row("三餐外食")).getByRole("button", { name: "刪除 三餐外食" }));
    await waitFor(() => expect(screen.getByTestId("row-notice")).toHaveTextContent(DEACTIVATED_INSTEAD_MESSAGE));
    const li = row("三餐外食");
    expect(li).toHaveAttribute("data-inactive", "true");
    expect(within(li).getByText("已停用")).toBeInTheDocument();
    expect(within(li).getByRole("button", { name: "重新啟用 三餐外食" })).toBeInTheDocument();
    expect(useCategoryStore.getState().categories.find((c) => c.id === 11)?.is_active).toBe(false);
  });

  it("確認對話框按取消 → 不呼叫 API", async () => {
    const { user } = setup(false);
    await waitFor(() => expect(screen.getByText("手搖飲")).toBeInTheDocument());
    await user.click(within(row("手搖飲")).getByRole("button", { name: "刪除 手搖飲" }));
    expect(api.deleteCategory).not.toHaveBeenCalled();
    expect(screen.getByText("手搖飲")).toBeInTheDocument();
  });
});

describe("CategoryManager 新增／改名／停用", () => {
  it("新增：payload 是 {name, group_id}（目前展開的一級分類）；成功後出現在清單與 store", async () => {
    api.createCategory.mockResolvedValue({ id: 13, group_id: 1, name: "早餐", is_system: false, sort_order: 3, is_active: true });
    const { user } = setup();
    await waitFor(() => expect(screen.getByText("手搖飲")).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText("在「食」新增二級分類"), "早餐");
    await user.click(screen.getByRole("button", { name: "新增" }));
    await waitFor(() => expect(screen.getByText("早餐")).toBeInTheDocument());
    expect(api.createCategory).toHaveBeenCalledWith({ name: "早餐", group_id: 1 });
    expect(useCategoryStore.getState().categories.some((c) => c.id === 13)).toBe(true);
  });

  it("DUPLICATE_NAME（409）顯示在名稱欄位下", async () => {
    api.createCategory.mockRejectedValue(new ApiError(409, { error: { code: "DUPLICATE_NAME", message: "同一一級分類下已有相同名稱的分類", fields: null } }));
    const { user } = setup();
    await waitFor(() => expect(screen.getByText("手搖飲")).toBeInTheDocument());
    const input = screen.getByPlaceholderText("在「食」新增二級分類");
    await user.type(input, "手搖飲");
    await user.click(screen.getByRole("button", { name: "新增" }));
    await waitFor(() => expect(screen.getByText("同一一級分類下已有相同名稱的分類")).toBeInTheDocument());
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue("手搖飲");
    expect(screen.queryByTestId("form-error")).not.toBeInTheDocument();
  });

  it("改名：整筆 CategoryUpdate，其餘欄位沿用", async () => {
    api.updateCategory.mockImplementation(async (id, payload) => ({ ...categories.find((c) => c.id === id)!, ...payload, sort_order: payload.sort_order ?? 0 }));
    const { user } = setup();
    await waitFor(() => expect(screen.getByText("手搖飲")).toBeInTheDocument());
    await user.click(within(row("手搖飲")).getByRole("button", { name: "改名 手搖飲" }));
    const input = screen.getByDisplayValue("手搖飲");
    await user.clear(input);
    await user.type(input, "飲料");
    await user.click(screen.getByRole("button", { name: "儲存" }));
    await waitFor(() => expect(screen.getByText("飲料")).toBeInTheDocument());
    expect(api.updateCategory).toHaveBeenCalledWith(12, { name: "飲料", group_id: 1, sort_order: 2, is_active: true });
  });

  it("停用 → 灰階並可重新啟用；payload 只翻 is_active", async () => {
    api.updateCategory.mockImplementation(async (id, payload) => ({ ...categories.find((c) => c.id === id)!, ...payload, sort_order: payload.sort_order ?? 0 }));
    const { user } = setup();
    await waitFor(() => expect(screen.getByText("手搖飲")).toBeInTheDocument());
    await user.click(within(row("手搖飲")).getByRole("button", { name: "停用 手搖飲" }));
    await waitFor(() => expect(row("手搖飲")).toHaveAttribute("data-inactive", "true"));
    expect(api.updateCategory).toHaveBeenLastCalledWith(12, { name: "手搖飲", group_id: 1, sort_order: 2, is_active: false });
    await user.click(within(row("手搖飲")).getByRole("button", { name: "重新啟用 手搖飲" }));
    await waitFor(() => expect(row("手搖飲")).not.toHaveAttribute("data-inactive"));
    expect(api.updateCategory).toHaveBeenLastCalledWith(12, { name: "手搖飲", group_id: 1, sort_order: 2, is_active: true });
  });
});
