from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, in_check

# 必要／彈性／想要／不列入。'excluded' 給 counts_toward_target=false 的分類（REWARD），不用 NULL
NECESSITY_VALUES = ("necessary", "flexible", "want", "excluded")


class CategoryGroup(Base):
    """一級分類。內建 7 類 is_system=true，不可刪除。"""

    __tablename__ = "category_groups"
    __table_args__ = (
        in_check("necessity", NECESSITY_VALUES, "ck_category_groups_necessity"),
        CheckConstraint(
            "benchmark_min_pct IS NULL OR benchmark_max_pct IS NULL "
            "OR benchmark_min_pct <= benchmark_max_pct",
            name="ck_category_groups_benchmark_range",
        ),
        UniqueConstraint("user_id", "code", name="uq_category_groups_user_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(10), nullable=False)
    necessity: Mapped[str] = mapped_column(String(10), nullable=False)
    # REWARD 類為 false，不計入週花費
    counts_toward_target: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # 基準佔比。REWARD 類為 NULL；架構描述 6.5 的基準總和檢查（90～110%）
    # 只計算 counts_toward_target = true 的分類，REWARD 不參與（docs/spec-gaps.md #3）
    benchmark_min_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    benchmark_max_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
