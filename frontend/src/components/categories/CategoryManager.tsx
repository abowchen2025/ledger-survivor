/**
 * 設定頁「分類管理」（SRS 4.7 二級分類部分）。
 *
 * - 一級分類以標籤列呈現（GET /category-groups），點擊展開其二級分類；一級本輪**唯讀**（PUT /category-groups Phase 3）。
 * - 二級分類：新增、改名、停用／啟用、刪除。刪除先確認；後端 204 → 從清單移除，200（已被花費引用）→ 改為停用並提示。
 * - DUPLICATE_NAME（409）顯示在名稱欄位下。已停用的灰階呈現，可重新啟用。
 * - 所有異動都經共用的 category-store，首頁快速記帳的分類選單跟著更新（不各自快取）。
 * payload 由 lib/category-payload.ts 組裝。
 */
import { type FormEvent, useEffect, useId, useState } from "react";

import { useAuthFailureRedirect } from "@/api/auth-guard";
import type { Category, CategoryGroup } from "@/api/categories";
import { describeApiError, ERROR_CODES, splitFieldErrors } from "@/api/errors";
import { FieldError } from "@/components/FieldError";
import { Toast, useTransientMessage } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categoryCreatePayload, categoryRenamePayload, categoryUpdateFromCategory, parseCategoryForm } from "@/lib/category-payload";
import { cn } from "@/lib/utils";
import { useCategoryStore } from "@/store/category-store";

export const DEACTIVATED_INSTEAD_MESSAGE = "此分類已有花費紀錄，已改為停用";

/** 後端 error.fields 的欄位；DUPLICATE_NAME（409）沒有 fields，這裡把它掛到 name 欄位下 */
function errorsFor(err: unknown): { fieldErrors: Record<string, string>; formError: string | null } {
  const info = describeApiError(err);
  if (info.code === ERROR_CODES.DUPLICATE_NAME) return { fieldErrors: { name: info.message }, formError: null };
  return splitFieldErrors(info, ["name", "group_id"]);
}

interface NameFormProps {
  initial?: string;
  submitLabel: string;
  placeholder?: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel?: () => void;
}

function NameForm({ initial = "", submitLabel, placeholder, onSubmit, onCancel }: NameFormProps) {
  const uid = useId();
  const [name, setName] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    const parsed = parseCategoryForm({ name });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await onSubmit(parsed.name);
      if (!initial) setName("");
    } catch (err) {
      const split = errorsFor(err);
      setFieldErrors(split.fieldErrors);
      setFormError(split.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="flex flex-col gap-1" onSubmit={submit} noValidate aria-busy={submitting} data-testid="category-form">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="form-error">
          {formError}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Label htmlFor={`${uid}-name`} className="sr-only">
          分類名稱
        </Label>
        <Input
          id={`${uid}-name`}
          maxLength={10}
          placeholder={placeholder}
          className="h-10"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setFieldErrors({});
          }}
          aria-invalid={Boolean(fieldErrors.name)}
        />
        <Button type="submit" size="sm" className="h-10" disabled={submitting}>
          {submitting ? "…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="outline" className="h-10" onClick={onCancel} disabled={submitting}>
            取消
          </Button>
        )}
      </div>
      <FieldError message={fieldErrors.name} />
    </form>
  );
}

export interface CategoryManagerProps {
  /** 測試注入；預設 window.confirm */
  confirm?: (message: string) => boolean;
}

export function CategoryManager({ confirm }: CategoryManagerProps) {
  const { groups, categories, loaded, loading, load, create, update, remove } = useCategoryStore();
  const redirectOnAuthFailure = useAuthFailureRedirect();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowNotice, setRowNotice] = useState<{ id: number; message: string } | null>(null);
  const [toast, showToast] = useTransientMessage();
  const ask = confirm ?? ((message: string) => window.confirm(message));

  useEffect(() => {
    if (loaded) return;
    load().catch((err: unknown) => {
      if (!redirectOnAuthFailure(err)) setLoadError(describeApiError(err).message);
    });
  }, [loaded, load, redirectOnAuthFailure]);

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const selectedGroup: CategoryGroup | undefined = sortedGroups.find((g) => g.id === selectedGroupId) ?? sortedGroups[0];
  const visible = selectedGroup ? categories.filter((c) => c.group_id === selectedGroup.id).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) : [];

  /** 金鑰問題導向（這裡就是設定頁）；其他錯誤丟回表單／列自己顯示 */
  const guard = async <T,>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      redirectOnAuthFailure(err);
      throw err;
    }
  };

  const onCreate = async (name: string) => {
    if (!selectedGroup) return;
    await guard(() => create(categoryCreatePayload(name, selectedGroup.id)));
    showToast(`已新增「${name}」`);
  };

  const onRename = async (category: Category, name: string) => {
    await guard(() => update(category.id, categoryRenamePayload(category, name)));
    setEditingId(null);
    showToast(`已改名為「${name}」`);
  };

  const toggleActive = async (category: Category) => {
    setBusyId(category.id);
    setRowNotice(null);
    try {
      await guard(() => update(category.id, categoryUpdateFromCategory(category, { is_active: !category.is_active })));
      showToast(category.is_active ? `已停用「${category.name}」` : `已重新啟用「${category.name}」`);
    } catch (err) {
      setRowNotice({ id: category.id, message: describeApiError(err).message });
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (category: Category) => {
    if (!ask(`刪除「${category.name}」？若已有花費紀錄，將改為停用`)) return;
    setBusyId(category.id);
    setRowNotice(null);
    try {
      const result = await guard(() => remove(category.id));
      if (result.outcome === "deactivated") {
        setRowNotice({ id: category.id, message: DEACTIVATED_INSTEAD_MESSAGE });
        showToast(DEACTIVATED_INSTEAD_MESSAGE);
      } else {
        showToast(`已刪除「${category.name}」`);
      }
    } catch (err) {
      setRowNotice({ id: category.id, message: describeApiError(err).message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-6 rounded-lg border p-4 text-sm" aria-labelledby="category-manager-title">
      <div className="flex items-center justify-between">
        <h3 id="category-manager-title" className="font-semibold">
          分類管理
        </h3>
        <span className="text-xs text-muted-foreground">一級分類名稱與基準之後才能編輯</span>
      </div>

      {loadError && (
        <p role="alert" className="mt-3 text-destructive">
          {loadError}
        </p>
      )}
      {loading && !loaded && (
        <div className="mt-3 flex gap-2" aria-busy="true" aria-label="載入中">
          <div className="h-8 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-16 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-16 animate-pulse rounded-full bg-muted" />
        </div>
      )}

      {loaded && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="一級分類">
            {sortedGroups.map((g) => {
              const active = selectedGroup?.id === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={cn("rounded-full border px-3 py-1.5 text-sm", active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted", !g.is_active && "opacity-60")}
                  onClick={() => setSelectedGroupId(g.id)}
                >
                  {g.name}
                  {!g.counts_toward_target && <span className="ml-1 text-xs opacity-80">（不計入）</span>}
                </button>
              );
            })}
          </div>

          {selectedGroup && (
            <div className="mt-3 flex flex-col gap-2" role="tabpanel" aria-label={`${selectedGroup.name} 的二級分類`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{selectedGroup.name}</span>
                <Badge variant="outline">{selectedGroup.necessity}</Badge>
                {!selectedGroup.counts_toward_target && <Badge variant="outline" className="border-dashed">此類花費不計入週花費</Badge>}
              </div>
              {visible.length === 0 && <p className="text-xs text-muted-foreground">這個一級分類下還沒有二級分類</p>}
              <ul className="flex flex-col divide-y rounded-lg border empty:hidden">
                {visible.map((c) => (
                  <li key={c.id} className={cn("flex flex-wrap items-center gap-2 p-2", !c.is_active && "opacity-60 grayscale")} data-testid="category-row" data-inactive={!c.is_active || undefined}>
                    {editingId === c.id ? (
                      <div className="flex-1">
                        <NameForm initial={c.name} submitLabel="儲存" onSubmit={(name) => onRename(c, name)} onCancel={() => setEditingId(null)} />
                      </div>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">
                          {c.name}
                          {!c.is_active && (
                            <Badge variant="secondary" className="ml-2">
                              已停用
                            </Badge>
                          )}
                        </span>
                        <Button type="button" variant="ghost" size="xs" onClick={() => setEditingId(c.id)} aria-label={`改名 ${c.name}`}>
                          改名
                        </Button>
                        <Button type="button" variant="ghost" size="xs" disabled={busyId === c.id} onClick={() => void toggleActive(c)} aria-label={`${c.is_active ? "停用" : "重新啟用"} ${c.name}`}>
                          {c.is_active ? "停用" : "重新啟用"}
                        </Button>
                        <Button type="button" variant="ghost" size="xs" className="text-destructive" disabled={busyId === c.id} onClick={() => void onDelete(c)} aria-label={`刪除 ${c.name}`}>
                          刪除
                        </Button>
                      </>
                    )}
                    {rowNotice?.id === c.id && (
                      <p role="alert" className="w-full text-xs text-muted-foreground" data-testid="row-notice">
                        {rowNotice.message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <NameForm submitLabel="新增" placeholder={`在「${selectedGroup.name}」新增二級分類`} onSubmit={onCreate} />
            </div>
          )}
        </>
      )}
      <Toast message={toast} />
    </section>
  );
}
