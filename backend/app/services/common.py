"""services 共用小工具：查詢一律過濾 user_id、月份／日期參數解析。"""

from __future__ import annotations

from datetime import date
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import NotFound, ValidationFailed
from app.models.base import Base
from app.services import week_rule

ModelT = TypeVar("ModelT", bound=Base)

MONTH_FORMAT_MESSAGE = "月份格式須為 YYYY-MM"
DATE_FORMAT_MESSAGE = "日期格式須為 YYYY-MM-DD"
DATE_RANGE_MESSAGE = "結束日不可早於起始日"


def get_owned_or_404(db: Session, model: type[ModelT], user_id: int, obj_id: int) -> ModelT:
    """依 id 取回**屬於該使用者**的資料；不存在或屬於別人一律 404（3.2：不回 403，不透露存在）。"""
    obj = db.scalar(select(model).where(model.id == obj_id, model.user_id == user_id))
    if obj is None:
        raise NotFound()
    return obj


def parse_month_param(value: str, field: str = "month") -> str:
    """路徑／查詢參數的 'YYYY-MM'；格式錯誤 → 400 VALIDATION_ERROR。回傳原字串（已驗證）。"""
    try:
        week_rule.parse_month(value)
    except ValueError:
        raise ValidationFailed({field: MONTH_FORMAT_MESSAGE}) from None
    return value


def parse_date_param(value: str | None, field: str) -> date | None:
    """查詢參數的 'YYYY-MM-DD'；None 原樣回傳，格式錯誤 → 400 VALIDATION_ERROR。"""
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationFailed({field: DATE_FORMAT_MESSAGE}) from None
