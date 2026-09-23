"""信用卡主檔業務邏輯（SRS 4.2；REQ-CARD-001～006）。

純函式（不碰 DB，供單元測試與之後的分期／現金流模組共用）：
- ``infer_due_month_offset``：REQ-CARD-002 繳款月偏移推算。
- ``day_in_month``：REQ-CARD-006 結帳日／繳款日 31 在不足 31 天的月份視為該月最後一日。

CRUD 一律帶 user_id（3.2）。刪除（REQ-CARD-004）：已被 expenses 或 installments 引用 → 403 CARD_IN_USE，
訊息提示改用停用（SRS 與 TC-FUNC-CARD-004 寫 403，照做）；未曾引用 → 真刪除。
"""

from __future__ import annotations

import calendar
from datetime import date

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.errors import CardInUse
from app.models import CreditCard, Expense, Installment
from app.schemas.card import CardCreate, CardUpdate
from app.services.common import get_owned_or_404


def infer_due_month_offset(statement_day: int, due_day: int) -> int:
    """REQ-CARD-002：繳款日 ≤ 結帳日 → 次月（1）；繳款日 > 結帳日 → 同月（0）。"""
    return 1 if due_day <= statement_day else 0


def day_in_month(year: int, month: int, day: int) -> date:
    """REQ-CARD-006：day 超過該月天數時取該月最後一日（例如 31 → 2 月 28／29、4 月 30）。"""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def list_cards(db: Session, user_id: int) -> list[CreditCard]:
    """卡片清單（含停用，REQ-CARD-005 由前端依 is_active 過濾選單）。"""
    stmt = select(CreditCard).where(CreditCard.user_id == user_id).order_by(CreditCard.id)
    return list(db.scalars(stmt))


def create_card(db: Session, user_id: int, payload: CardCreate) -> CreditCard:
    offset = (
        payload.due_month_offset
        if payload.due_month_offset is not None
        else infer_due_month_offset(payload.statement_day, payload.due_day)
    )
    card = CreditCard(
        user_id=user_id,
        name=payload.name,
        bank=payload.bank,
        last4=payload.last4,
        statement_day=payload.statement_day,
        due_day=payload.due_day,
        due_month_offset=offset,
        opening_billed_unpaid=payload.opening_billed_unpaid,
        opening_unbilled=payload.opening_unbilled,
        opening_as_of=payload.opening_as_of,
        color=payload.color,
        is_active=True,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def update_card(db: Session, user_id: int, card_id: int, payload: CardUpdate) -> CreditCard:
    card = get_owned_or_404(db, CreditCard, user_id, card_id)
    source_changed = (
        payload.statement_day != card.statement_day or payload.due_day != card.due_day
    )
    if payload.due_month_offset is not None:
        card.due_month_offset = payload.due_month_offset
    elif source_changed:
        # TC-NEG-CARD-003：來源欄位變了就重新推算，不沿用舊的覆寫值
        card.due_month_offset = infer_due_month_offset(payload.statement_day, payload.due_day)
    card.name = payload.name
    card.bank = payload.bank
    card.last4 = payload.last4
    card.statement_day = payload.statement_day
    card.due_day = payload.due_day
    card.color = payload.color
    card.is_active = payload.is_active
    db.commit()
    db.refresh(card)
    return card


def is_card_referenced(db: Session, card_id: int) -> bool:
    """REQ-CARD-004：被 expenses 或 installments 任一引用即為「已引用」。"""
    by_expense = db.scalar(select(exists().where(Expense.card_id == card_id)))
    by_installment = db.scalar(select(exists().where(Installment.card_id == card_id)))
    return bool(by_expense or by_installment)


def delete_card(db: Session, user_id: int, card_id: int) -> None:
    card = get_owned_or_404(db, CreditCard, user_id, card_id)
    if is_card_referenced(db, card.id):
        raise CardInUse()
    db.delete(card)
    db.commit()
