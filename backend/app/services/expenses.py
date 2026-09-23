"""花費記錄業務邏輯（SRS 4.5；REQ-EXPENSE-001、002、004、005；決定 3.5～3.9）。

只看行為時鐘（消費日 ``date``）。信用卡的結帳日／繳款日不參與任何判斷（REQ-EXPENSE-004）。

- 3.5 信用卡欄位：credit_card → card_id 必填；mobile_pay → 選填（有填＝綁卡）；cash／transfer → 必須為 null。
- 3.6 停用參照：新增時 category_id／card_id 必須啟用中（400 INACTIVE_REFERENCE）；
  編輯時若該欄位沒改變，允許沿用停用值（停用舊卡後仍能改過去花費的備註）。
- 3.7 已結算月份：依 ``settlement.game_month_of``（週歸屬）判定；PUT 改日期時新舊兩個月份都查，
  任一已結算 → 409（移出與移入都會改變該月結果）；DELETE 查原日期。
- 3.9 date 未提供 → Asia/Taipei 的今天（``week_rule.today_taipei``），不可用 UTC。
- 不存在或屬於別人的分類／卡片視同「沒選」（400 VALIDATION_ERROR），不透露存在（3.2）。
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import InactiveReference, ValidationFailed
from app.models import Category, CreditCard, Expense
from app.schemas.expense import (
    CARD_NOT_ALLOWED_MESSAGE,
    EXPENSE_FIELD_MESSAGES,
    ExpenseCreate,
    ExpenseUpdate,
)
from app.services import week_rule
from app.services.common import DATE_RANGE_MESSAGE, get_owned_or_404, parse_date_param
from app.services.settlement import assert_dates_not_in_settled_month

CARD_REQUIRED_METHODS = frozenset({"credit_card"})
CARD_OPTIONAL_METHODS = frozenset({"mobile_pay"})
# 其餘（cash、transfer）不得帶卡


def list_expenses(
    db: Session, user_id: int, start_date: str | None = None, end_date: str | None = None
) -> list[Expense]:
    """依消費日區間列出（兩端皆含、皆可省略）；start > end → 400。"""
    start = parse_date_param(start_date, "start_date")
    end = parse_date_param(end_date, "end_date")
    if start is not None and end is not None and start > end:
        raise ValidationFailed({"end_date": DATE_RANGE_MESSAGE})
    stmt = select(Expense).where(Expense.user_id == user_id)
    if start is not None:
        stmt = stmt.where(Expense.date >= start)
    if end is not None:
        stmt = stmt.where(Expense.date <= end)
    return list(db.scalars(stmt.order_by(Expense.date, Expense.id)))


def _check_card_rule(payment_method: str, card_id: int | None) -> None:
    """3.5：支付方式決定 card_id 必填／選填／禁止。"""
    if payment_method in CARD_REQUIRED_METHODS and card_id is None:
        raise ValidationFailed({"card_id": EXPENSE_FIELD_MESSAGES["card_id"]})
    if (
        payment_method not in CARD_REQUIRED_METHODS
        and payment_method not in CARD_OPTIONAL_METHODS
        and card_id is not None
    ):
        raise ValidationFailed({"card_id": CARD_NOT_ALLOWED_MESSAGE})


def _resolve_category(db: Session, user_id: int, category_id: int, allow_inactive: bool) -> None:
    category = db.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if category is None:
        raise ValidationFailed({"category_id": EXPENSE_FIELD_MESSAGES["category_id"]})
    if not category.is_active and not allow_inactive:
        raise InactiveReference({"category_id": EXPENSE_FIELD_MESSAGES["category_id"]})


def _resolve_card(db: Session, user_id: int, card_id: int | None, allow_inactive: bool) -> None:
    if card_id is None:
        return
    card = db.scalar(select(CreditCard).where(CreditCard.id == card_id, CreditCard.user_id == user_id))
    if card is None:
        raise ValidationFailed({"card_id": EXPENSE_FIELD_MESSAGES["card_id"]})
    if not card.is_active and not allow_inactive:
        raise InactiveReference({"card_id": EXPENSE_FIELD_MESSAGES["card_id"]})


def create_expense(db: Session, user_id: int, payload: ExpenseCreate) -> Expense:
    when: date = payload.date if payload.date is not None else week_rule.today_taipei()
    _check_card_rule(payload.payment_method, payload.card_id)
    _resolve_category(db, user_id, payload.category_id, allow_inactive=False)
    _resolve_card(db, user_id, payload.card_id, allow_inactive=False)
    assert_dates_not_in_settled_month(db, user_id, when)
    expense = Expense(
        user_id=user_id,
        date=when,
        amount=payload.amount,
        item=payload.item,
        category_id=payload.category_id,
        payment_method=payload.payment_method,
        card_id=payload.card_id,
        note=payload.note,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def update_expense(db: Session, user_id: int, expense_id: int, payload: ExpenseUpdate) -> Expense:
    expense = get_owned_or_404(db, Expense, user_id, expense_id)
    _check_card_rule(payload.payment_method, payload.card_id)
    _resolve_category(
        db, user_id, payload.category_id, allow_inactive=payload.category_id == expense.category_id
    )
    _resolve_card(db, user_id, payload.card_id, allow_inactive=payload.card_id == expense.card_id)
    # 3.7：舊日期與新日期所屬月份都要檢查
    assert_dates_not_in_settled_month(db, user_id, expense.date, payload.date)
    expense.date = payload.date
    expense.amount = payload.amount
    expense.item = payload.item
    expense.category_id = payload.category_id
    expense.payment_method = payload.payment_method
    expense.card_id = payload.card_id
    expense.note = payload.note
    db.commit()
    db.refresh(expense)
    return expense


def delete_expense(db: Session, user_id: int, expense_id: int) -> None:
    expense = get_owned_or_404(db, Expense, user_id, expense_id)
    assert_dates_not_in_settled_month(db, user_id, expense.date)
    db.delete(expense)
    db.commit()
