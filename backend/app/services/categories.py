"""消費分類體系業務邏輯（SRS 4.7；REQ-CATEGORY-001、002、007）。

- 一級分類：只讀清單（內建 7 類由 migration 0002 seed）。沒有 DELETE 端點：內建類不可刪
  （REQ-CATEGORY-002），自訂類 Phase 3 也只能停用（REQ-CATEGORY-005），所以刪除一律 405。
- 二級分類：完全自由增刪改（REQ-CATEGORY-007）。刪除時已被 expenses 引用 → 改為停用（回 200 + 資料），
  從未被引用 → 真刪除（回 204）。
- 所有查詢帶 user_id（3.2）；引用到別人的一級分類視同不存在（400，不透露）。
"""

from __future__ import annotations

from sqlalchemy import exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import DuplicateName, InactiveReference, ValidationFailed
from app.models import Category, CategoryGroup, Expense
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.services.common import get_owned_or_404

GROUP_MESSAGE = "請選擇所屬一級分類"
DUPLICATE_MESSAGE = "同一一級分類下已有相同名稱的分類"


def list_groups(db: Session, user_id: int) -> list[CategoryGroup]:
    """一級分類清單（含停用，前端以 is_active 判斷）。"""
    stmt = (
        select(CategoryGroup)
        .where(CategoryGroup.user_id == user_id)
        .order_by(CategoryGroup.sort_order, CategoryGroup.id)
    )
    return list(db.scalars(stmt))


def list_categories(db: Session, user_id: int, group_id: int | None = None) -> list[Category]:
    """二級分類清單（含停用）；可依一級分類篩選。"""
    stmt = (
        select(Category)
        .join(CategoryGroup, CategoryGroup.id == Category.group_id)
        .where(Category.user_id == user_id)
        .order_by(CategoryGroup.sort_order, Category.sort_order, Category.id)
    )
    if group_id is not None:
        stmt = stmt.where(Category.group_id == group_id)
    return list(db.scalars(stmt))


def _resolve_group(db: Session, user_id: int, group_id: int, allow_inactive: bool) -> CategoryGroup:
    """group_id 必須是自己的一級分類；停用中的只在「沒有改變」時允許沿用（3.6）。"""
    group = db.scalar(
        select(CategoryGroup).where(CategoryGroup.id == group_id, CategoryGroup.user_id == user_id)
    )
    if group is None:
        raise ValidationFailed({"group_id": GROUP_MESSAGE})
    if not group.is_active and not allow_inactive:
        raise InactiveReference({"group_id": GROUP_MESSAGE})
    return group


def _next_sort_order(db: Session, user_id: int, group_id: int) -> int:
    current = db.scalar(
        select(func.max(Category.sort_order)).where(
            Category.user_id == user_id, Category.group_id == group_id
        )
    )
    return (current or 0) + 1


def _flush_or_duplicate(db: Session) -> None:
    """uq_categories_user_group_name 撞到 → 409 DUPLICATE_NAME。"""
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if "uq_categories_user_group_name" in str(exc.orig):
            raise DuplicateName({"name": DUPLICATE_MESSAGE}) from None
        raise


def create_category(db: Session, user_id: int, payload: CategoryCreate) -> Category:
    _resolve_group(db, user_id, payload.group_id, allow_inactive=False)
    category = Category(
        user_id=user_id,
        group_id=payload.group_id,
        name=payload.name,
        is_system=False,
        sort_order=(
            payload.sort_order
            if payload.sort_order is not None
            else _next_sort_order(db, user_id, payload.group_id)
        ),
        is_active=True,
    )
    db.add(category)
    _flush_or_duplicate(db)
    db.commit()
    db.refresh(category)
    return category


def update_category(db: Session, user_id: int, category_id: int, payload: CategoryUpdate) -> Category:
    category = get_owned_or_404(db, Category, user_id, category_id)
    group_unchanged = payload.group_id == category.group_id
    _resolve_group(db, user_id, payload.group_id, allow_inactive=group_unchanged)
    category.name = payload.name
    category.group_id = payload.group_id
    if payload.sort_order is not None:
        category.sort_order = payload.sort_order
    category.is_active = payload.is_active
    _flush_or_duplicate(db)
    db.commit()
    db.refresh(category)
    return category


def is_category_referenced(db: Session, category_id: int) -> bool:
    return bool(db.scalar(select(exists().where(Expense.category_id == category_id))))


def delete_category(db: Session, user_id: int, category_id: int) -> Category | None:
    """REQ-CATEGORY-007：已被 expenses 引用 → 停用並回傳資料；否則真刪除並回傳 None。"""
    category = get_owned_or_404(db, Category, user_id, category_id)
    if is_category_referenced(db, category.id):
        category.is_active = False
        db.commit()
        db.refresh(category)
        return category
    db.delete(category)
    db.commit()
    return None
