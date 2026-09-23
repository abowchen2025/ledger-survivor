"""信用卡主檔（SRS 4.2）。只存 last4，不存完整卡號（REQ-CARD-001）。"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.common import Money, RequestModel, ResponseModel

HEX_COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"

# SRS 4.2 欄位規格表「檢核失敗文案」；SRS 寫「—」或未列的欄位用本檔自訂文案（記在 spec-gaps 8.1）
CARD_FIELD_MESSAGES = {
    "name": "請輸入卡片名稱",
    "bank": "請輸入發卡銀行",
    "last4": "請輸入卡號末四碼（4位數字）",
    "statement_day": "結帳日須介於1-31",
    "due_day": "繳款日須介於1-31",
    "due_month_offset": "繳款月偏移須為0或1",
    "color": "顏色格式錯誤",
    "opening_billed_unpaid": "金額不可為負數",
    "opening_unbilled": "金額不可為負數",
    "opening_as_of": "期初日期格式有誤",
    "is_active": "啟用狀態須為布林值",
}


class CardOut(ResponseModel):
    id: int
    name: str
    bank: str
    last4: str
    statement_day: int
    due_day: int
    due_month_offset: int
    opening_billed_unpaid: Money
    opening_unbilled: Money
    opening_as_of: date | None
    color: str | None
    is_active: bool


class CardCreate(RequestModel):
    field_messages = CARD_FIELD_MESSAGES

    name: str = Field(min_length=1, max_length=20)
    bank: str = Field(min_length=1, max_length=20)
    last4: str = Field(pattern=r"^[0-9]{4}$")
    statement_day: int = Field(ge=1, le=31)
    due_day: int = Field(ge=1, le=31)
    # 未給 → 系統依 REQ-CARD-002 推算；有給 → 視為覆寫
    due_month_offset: Literal[0, 1] | None = None
    color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    # REQ-CARD-003 期初卡債，只在新增時可填
    opening_billed_unpaid: Money = Field(default=Decimal("0"), ge=0)
    opening_unbilled: Money = Field(default=Decimal("0"), ge=0)
    opening_as_of: date | None = None


class CardUpdate(RequestModel):
    """PUT 整筆取代。期初卡債欄位（opening_*）不在此：建立後鎖定不可再改，送了會因 extra=forbid 回 400。

    due_month_offset：有給 → 覆寫；沒給且結帳日／繳款日有變 → 依新值重新推算（TC-NEG-CARD-003）；
    沒給且來源欄位沒變 → 維持原值。
    """

    field_messages = CARD_FIELD_MESSAGES

    name: str = Field(min_length=1, max_length=20)
    bank: str = Field(min_length=1, max_length=20)
    last4: str = Field(pattern=r"^[0-9]{4}$")
    statement_day: int = Field(ge=1, le=31)
    due_day: int = Field(ge=1, le=31)
    due_month_offset: Literal[0, 1] | None = None
    color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    is_active: bool = True
