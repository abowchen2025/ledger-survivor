"""收入設定（SRS 4.1）：月薪／儲蓄目標、額外收入、固定支出。可支配金額計算屬 Phase 2，不在此。"""

from __future__ import annotations

from decimal import Decimal

from pydantic import Field, ValidationInfo, field_validator

from app.schemas.common import Money, MonthField, RequestModel, ResponseModel

MONTH_MESSAGE = "月份格式須為 YYYY-MM"  # SRS 未列文案的月份欄位共用


# --- 月薪與儲蓄目標（REQ-INCOME-001、002、005） -------------------------------------------


class MonthIncomeOut(ResponseModel):
    """GET／PUT /months/{month}/income 的回應。

    - 該月有紀錄：三個值取自該月，``inherited_from`` 為 null。
    - 該月無紀錄：``salary``／``savings_target`` 取上一有紀錄月份的值，``inherited_from`` 填那個月份（讀取時推算、不寫入）。
    - 任何月份都沒有紀錄：兩個金額為 null，``inherited_from`` 為 null（前端顯示「尚未設定本月月薪」）。
    """

    month: str
    salary: Money | None
    savings_target: Money | None
    inherited_from: str | None


class MonthIncomeUpdate(RequestModel):
    field_messages = {
        "salary": "月薪不可為負數",
        "savings_target": "儲蓄目標不可為負數",
    }

    salary: Money = Field(ge=0)
    savings_target: Money = Field(default=Decimal("0"), ge=0)


# --- 額外收入（REQ-INCOME-003） -----------------------------------------------------------


class ExtraIncomeOut(ResponseModel):
    id: int
    month: str
    amount: Money
    name: str


class ExtraIncomeCreate(RequestModel):
    field_messages = {
        "month": MONTH_MESSAGE,
        "amount": "金額須大於0",
        "name": "請輸入收入名稱",
    }

    month: MonthField
    amount: Money = Field(gt=0)
    name: str = Field(min_length=1, max_length=50)


class ExtraIncomeUpdate(ExtraIncomeCreate):
    """PUT 整筆取代，欄位同新增。"""


# --- 固定支出（REQ-INCOME-004） -----------------------------------------------------------


class RecurringExpenseOut(ResponseModel):
    id: int
    name: str
    amount: Money
    start_month: str
    end_month: str | None


class RecurringExpenseCreate(RequestModel):
    field_messages = {
        "name": "請輸入支出名稱",
        "amount": "金額須大於0",
        "start_month": "請選擇起始月份",
        "end_month": "結束月不可早於起始月",
    }

    name: str = Field(min_length=1, max_length=50)
    amount: Money = Field(gt=0)
    start_month: MonthField
    end_month: MonthField | None = None

    @field_validator("end_month")
    @classmethod
    def _end_not_before_start(cls, value: str | None, info: ValidationInfo) -> str | None:
        start = info.data.get("start_month")
        # start_month 自己檢核失敗時 info.data 沒有它，交給它自己的錯誤訊息
        if value is not None and start is not None and value < start:
            raise ValueError("end_month must not be earlier than start_month")
        return value


class RecurringExpenseUpdate(RecurringExpenseCreate):
    """PUT 整筆取代，欄位同新增。"""
