"""花費記錄（SRS 4.5）。date 是消費日（行為時鐘）；信用卡的結帳日／繳款日在這裡完全不出現（REQ-EXPENSE-004）。"""

from __future__ import annotations

from datetime import date as date_type
from typing import Literal

from pydantic import Field, field_validator

from app.models.expense import PAYMENT_METHOD_VALUES
from app.schemas.common import Money, RequestModel, ResponseModel

PaymentMethod = Literal["cash", "credit_card", "mobile_pay", "transfer"]
assert set(PaymentMethod.__args__) == set(PAYMENT_METHOD_VALUES)  # 與 DB CHECK 一致

# SRS 4.5 欄位規格表「檢核失敗文案」；note 的 SRS 寫「—」，用本檔自訂文案（記在 spec-gaps 8.1）
EXPENSE_FIELD_MESSAGES = {
    "date": "請選擇日期",
    "amount": "金額不可為0",
    "item": "請輸入品項",
    "category_id": "請選擇分類",
    "payment_method": "請選擇支付方式",
    "card_id": "請選擇信用卡",
    "note": "備註最多100字",
}
# 3.5：cash／transfer 不得帶 card_id（SRS 未列文案）
CARD_NOT_ALLOWED_MESSAGE = "此支付方式不可指定信用卡"


class ExpenseOut(ResponseModel):
    id: int
    date: date_type
    amount: Money
    item: str
    category_id: int
    payment_method: PaymentMethod
    card_id: int | None
    note: str | None


class _ExpenseFields(RequestModel):
    field_messages = EXPENSE_FIELD_MESSAGES

    amount: Money
    item: str = Field(min_length=1, max_length=50)
    category_id: int
    payment_method: PaymentMethod
    # 3.5：credit_card 必填；mobile_pay 選填（有填＝綁卡）；cash／transfer 必須為 null。跨欄位規則在 service。
    card_id: int | None = None
    note: str | None = Field(default=None, max_length=100)

    @field_validator("amount")
    @classmethod
    def _amount_nonzero(cls, value):
        # REQ-EXPENSE-001：≠0，支援負數（退款）
        if value == 0:
            raise ValueError("amount must not be 0")
        return value


class ExpenseCreate(_ExpenseFields):
    # 未提供 → 伺服器以 Asia/Taipei 的今天為預設（3.9；REQ-WEEK-005），不可用 UTC
    date: date_type | None = None


class ExpenseUpdate(_ExpenseFields):
    """PUT 整筆取代：date 必填（「預設今天」只適用於新增）。"""

    date: date_type
