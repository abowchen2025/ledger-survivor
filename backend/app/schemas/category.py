"""消費分類體系（SRS 4.7）：一級分類唯讀清單、二級分類 CRUD。

自訂一級分類（POST／PUT /category-groups）屬 Phase 3，本輪不做。
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from app.schemas.common import RequestModel, ResponseModel


class CategoryGroupOut(ResponseModel):
    id: int
    code: str
    name: str
    necessity: str
    counts_toward_target: bool
    benchmark_min_pct: Decimal | None
    benchmark_max_pct: Decimal | None
    sort_order: int
    is_system: bool
    is_active: bool


class CategoryOut(ResponseModel):
    id: int
    group_id: int
    name: str
    is_system: bool
    sort_order: int
    is_active: bool


class CategoryCreate(RequestModel):
    """SRS 4.7 二級分類欄位規格表。"""

    field_messages = {
        "name": "請輸入分類名稱",
        "group_id": "請選擇所屬一級分類",
        "sort_order": "排序須為整數",
    }

    name: str = Field(min_length=1, max_length=10)
    group_id: int
    sort_order: int | None = None  # 未給 → 排在該一級分類最後


class CategoryUpdate(RequestModel):
    """PUT 為整筆取代：name／group_id 必填；is_active 可用來停用／重新啟用。"""

    field_messages = {
        "name": "請輸入分類名稱",
        "group_id": "請選擇所屬一級分類",
        "sort_order": "排序須為整數",
        "is_active": "啟用狀態須為布林值",
    }

    name: str = Field(min_length=1, max_length=10)
    group_id: int
    sort_order: int | None = None  # 未給 → 維持原值
    is_active: bool = True
