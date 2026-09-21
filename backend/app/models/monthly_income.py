from decimal import Decimal

from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, MonthStr, month_check


class MonthlyIncome(Base):
    __tablename__ = "monthly_incomes"
    __table_args__ = (
        UniqueConstraint("user_id", "month", name="uq_monthly_incomes_user_month"),
        month_check("month", "monthly_incomes"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    month: Mapped[str] = mapped_column(MonthStr, nullable=False)
    salary: Mapped[Decimal] = mapped_column(nullable=False, default=0)
    savings_target: Mapped[Decimal] = mapped_column(nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text)
