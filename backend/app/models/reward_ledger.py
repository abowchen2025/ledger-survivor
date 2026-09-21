from decimal import Decimal

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, MonthStr, in_check, month_check

GRADE_VALUES = ("S", "A", "B", "C", "DEAD")  # 陣亡 = DEAD


class RewardLedger(Base):
    """月結紀錄；同一使用者同一月僅一筆。"""

    __tablename__ = "reward_ledger"
    __table_args__ = (
        UniqueConstraint("user_id", "month", name="uq_reward_ledger_user_month"),
        in_check("grade", GRADE_VALUES, "ck_reward_ledger_grade"),
        month_check("month", "reward_ledger"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    month: Mapped[str] = mapped_column(MonthStr, nullable=False)
    grade: Mapped[str] = mapped_column(String(10), nullable=False)
    reward_amount: Mapped[Decimal] = mapped_column(nullable=False, default=0)
    consume_pool_delta: Mapped[Decimal] = mapped_column(nullable=False, default=0)
    invest_pool_delta: Mapped[Decimal] = mapped_column(nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(Text)
