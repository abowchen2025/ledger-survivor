from decimal import Decimal

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, MonthStr, month_check


class ExtraIncome(Base):
    __tablename__ = "extra_incomes"
    __table_args__ = (month_check("month", "extra_incomes"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    month: Mapped[str] = mapped_column(MonthStr, nullable=False)
    amount: Mapped[Decimal] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
