from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Category(Base):
    """二級分類。已被 expenses 引用者刪除時改為停用（is_active=false）。"""

    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "group_id", "name", name="uq_categories_user_group_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("category_groups.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(20), nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
