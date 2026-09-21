from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, in_check

# 現金／信用卡／行動支付／轉帳
PAYMENT_METHOD_VALUES = ("cash", "credit_card", "mobile_pay", "transfer")


class Expense(Base):
    """花費記錄。date 為消費日（行為時鐘），DATE 型別（REQ-WEEK-005）。"""

    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount <> 0", name="ck_expenses_amount_nonzero"),
        in_check("payment_method", PAYMENT_METHOD_VALUES, "ck_expenses_payment_method"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(nullable=False)
    item: Mapped[str] = mapped_column(String(50), nullable=False)
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id"), nullable=False, index=True
    )
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    card_id: Mapped[int | None] = mapped_column(ForeignKey("credit_cards.id"), index=True)
    note: Mapped[str | None] = mapped_column(Text)
