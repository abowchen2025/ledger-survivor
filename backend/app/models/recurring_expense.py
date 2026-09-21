from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, MonthStr, month_check


class RecurringExpense(Base):
    """固定支出；end_month 可為 null，若填須 ≥ start_month。"""

    __tablename__ = "recurring_expenses"
    __table_args__ = (
        CheckConstraint(
            "end_month IS NULL OR end_month >= start_month",
            name="ck_recurring_expenses_end_after_start",
        ),
        month_check("start_month", "recurring_expenses"),
        month_check("end_month", "recurring_expenses", nullable=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[Decimal] = mapped_column(nullable=False)
    start_month: Mapped[str] = mapped_column(MonthStr, nullable=False)
    end_month: Mapped[str | None] = mapped_column(MonthStr)
