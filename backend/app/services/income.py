"""收入設定業務邏輯（SRS 4.1；REQ-INCOME-001～005）。可支配金額／週上限計算屬 Phase 2，不在此。

月薪（REQ-INCOME-001、002）：
- 同一使用者同一月只有一筆（uq_monthly_incomes_user_month），PUT 走 upsert。
- GET 該月無紀錄時**讀取時推算、不寫入**：回上一有紀錄月份的值，``inherited_from`` 填那個月份。
  只有 PUT 才寫入——GET 不該有副作用，而且 Phase 2 的可支配計算要用同一套推算（``resolve_month_income``）。

所有查詢一律帶 user_id（3.2）。
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import ExtraIncome, MonthlyIncome, RecurringExpense
from app.schemas.income import (
    ExtraIncomeCreate,
    ExtraIncomeUpdate,
    MonthIncomeUpdate,
    RecurringExpenseCreate,
    RecurringExpenseUpdate,
)
from app.services.common import get_owned_or_404, parse_month_param


# --- 月薪與儲蓄目標 -------------------------------------------------------------------


@dataclass(frozen=True)
class ResolvedMonthIncome:
    month: str
    salary: Decimal | None
    savings_target: Decimal | None
    inherited_from: str | None


def resolve_month_income(db: Session, user_id: int, month: str) -> ResolvedMonthIncome:
    """該月的月薪與儲蓄目標；無紀錄時沿用上一有紀錄月份（REQ-INCOME-002），完全沒有紀錄時為 None。"""
    own = db.scalar(
        select(MonthlyIncome).where(MonthlyIncome.user_id == user_id, MonthlyIncome.month == month)
    )
    if own is not None:
        return ResolvedMonthIncome(month, own.salary, own.savings_target, None)
    prior = db.scalar(
        select(MonthlyIncome)
        .where(MonthlyIncome.user_id == user_id, MonthlyIncome.month < month)
        .order_by(MonthlyIncome.month.desc())
        .limit(1)
    )
    if prior is None:
        return ResolvedMonthIncome(month, None, None, None)
    return ResolvedMonthIncome(month, prior.salary, prior.savings_target, prior.month)


def get_month_income(db: Session, user_id: int, month: str) -> ResolvedMonthIncome:
    return resolve_month_income(db, user_id, parse_month_param(month))


def upsert_month_income(
    db: Session, user_id: int, month: str, payload: MonthIncomeUpdate
) -> ResolvedMonthIncome:
    """REQ-INCOME-001：同一月第二次設定是更新不是新增。"""
    month = parse_month_param(month)
    row = db.scalar(
        select(MonthlyIncome).where(MonthlyIncome.user_id == user_id, MonthlyIncome.month == month)
    )
    if row is None:
        row = MonthlyIncome(user_id=user_id, month=month)
        db.add(row)
    row.salary = payload.salary
    row.savings_target = payload.savings_target
    db.commit()
    db.refresh(row)
    return ResolvedMonthIncome(month, row.salary, row.savings_target, None)


# --- 額外收入 ----------------------------------------------------------------------------


def list_extra_incomes(db: Session, user_id: int, month: str | None = None) -> list[ExtraIncome]:
    stmt = select(ExtraIncome).where(ExtraIncome.user_id == user_id)
    if month is not None:
        stmt = stmt.where(ExtraIncome.month == parse_month_param(month))
    return list(db.scalars(stmt.order_by(ExtraIncome.month, ExtraIncome.id)))


def create_extra_income(db: Session, user_id: int, payload: ExtraIncomeCreate) -> ExtraIncome:
    row = ExtraIncome(user_id=user_id, month=payload.month, amount=payload.amount, name=payload.name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_extra_income(db: Session, user_id: int, row_id: int, payload: ExtraIncomeUpdate) -> ExtraIncome:
    row = get_owned_or_404(db, ExtraIncome, user_id, row_id)
    row.month = payload.month
    row.amount = payload.amount
    row.name = payload.name
    db.commit()
    db.refresh(row)
    return row


def delete_extra_income(db: Session, user_id: int, row_id: int) -> None:
    row = get_owned_or_404(db, ExtraIncome, user_id, row_id)
    db.delete(row)
    db.commit()


# --- 固定支出 ----------------------------------------------------------------------------


def list_recurring_expenses(db: Session, user_id: int, month: str | None = None) -> list[RecurringExpense]:
    """清單；帶 month 時只回該月生效的項目（start ≤ month ≤ end 或 end 為 null，REQ-INCOME-004）。"""
    stmt = select(RecurringExpense).where(RecurringExpense.user_id == user_id)
    if month is not None:
        month = parse_month_param(month)
        stmt = stmt.where(
            RecurringExpense.start_month <= month,
            or_(RecurringExpense.end_month.is_(None), RecurringExpense.end_month >= month),
        )
    return list(db.scalars(stmt.order_by(RecurringExpense.start_month, RecurringExpense.id)))


def create_recurring_expense(db: Session, user_id: int, payload: RecurringExpenseCreate) -> RecurringExpense:
    row = RecurringExpense(
        user_id=user_id,
        name=payload.name,
        amount=payload.amount,
        start_month=payload.start_month,
        end_month=payload.end_month,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_recurring_expense(
    db: Session, user_id: int, row_id: int, payload: RecurringExpenseUpdate
) -> RecurringExpense:
    row = get_owned_or_404(db, RecurringExpense, user_id, row_id)
    row.name = payload.name
    row.amount = payload.amount
    row.start_month = payload.start_month
    row.end_month = payload.end_month
    db.commit()
    db.refresh(row)
    return row


def delete_recurring_expense(db: Session, user_id: int, row_id: int) -> None:
    row = get_owned_or_404(db, RecurringExpense, user_id, row_id)
    db.delete(row)
    db.commit()
