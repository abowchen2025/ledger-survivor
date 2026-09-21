from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, MonthStr, month_check


class Installment(Base):
    """分期。不建 expenses 記錄；is_settled 與 is_cancelled 互斥。"""

    __tablename__ = "installments"
    __table_args__ = (
        CheckConstraint("total_periods >= 2", name="ck_installments_total_periods"),
        CheckConstraint(
            "NOT (is_settled AND is_cancelled)",
            name="ck_installments_settled_cancelled_exclusive",
        ),
        month_check("first_month", "installments"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("credit_cards.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(nullable=False)
    total_periods: Mapped[int] = mapped_column(Integer, nullable=False)
    paid_periods: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 系統推算，可覆寫；覆寫時 first_month_override_reason 必填（應用層檢核）
    first_month: Mapped[str] = mapped_column(MonthStr, nullable=False)
    first_month_override_reason: Mapped[str | None] = mapped_column(String(100))
    # 系統計算，可覆寫
    monthly_amount: Mapped[Decimal] = mapped_column(nullable=False)
    is_settled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
