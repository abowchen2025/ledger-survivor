from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CreditCard(Base):
    """信用卡主檔。只存 last4，不存完整卡號。"""

    __tablename__ = "credit_cards"
    __table_args__ = (
        CheckConstraint("statement_day BETWEEN 1 AND 31", name="ck_credit_cards_statement_day"),
        CheckConstraint("due_day BETWEEN 1 AND 31", name="ck_credit_cards_due_day"),
        CheckConstraint("due_month_offset IN (0, 1)", name="ck_credit_cards_due_month_offset"),
        # 只存末四碼，且只能是四個數字
        CheckConstraint("last4 ~ '^[0-9]{4}$'", name="ck_credit_cards_last4_digits"),
        CheckConstraint(
            "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'", name="ck_credit_cards_color_hex"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(20), nullable=False)
    bank: Mapped[str] = mapped_column(String(20), nullable=False)
    last4: Mapped[str] = mapped_column(String(4), nullable=False)
    statement_day: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    due_day: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # 系統推算（繳款日 ≤ 結帳日 → 1，否則 0），可覆寫
    due_month_offset: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    opening_billed_unpaid: Mapped[Decimal] = mapped_column(nullable=False, default=0)
    opening_unbilled: Mapped[Decimal] = mapped_column(nullable=False, default=0)
    opening_as_of: Mapped[date | None] = mapped_column(Date)
    color: Mapped[str | None] = mapped_column(String(7))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
