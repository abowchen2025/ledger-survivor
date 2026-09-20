from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WeeklyTarget(Base):
    """週上限覆寫值；只存覆寫，預設值即時計算。locked_at 設定後不可再改。"""

    __tablename__ = "weekly_targets"
    __table_args__ = (
        UniqueConstraint("user_id", "iso_year", "iso_week", name="uq_weekly_targets_user_week"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    iso_year: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    iso_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    amount: Mapped[Decimal] = mapped_column(nullable=False)
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
