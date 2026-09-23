"""schema 共用基底與型別。

- ``RequestModel``：所有請求 body 的基底。``extra="forbid"``（未知欄位 → 400），並以
  ``field_messages`` 宣告每個欄位檢核失敗時的文案（逐字取自 SRS 欄位規格表），
  ``errors.py`` 的 handler 把 pydantic 錯誤換成這些文字。一個欄位一句文案，不分失敗原因。
- ``ResponseModel``：ORM → 回應（``from_attributes``）。
- ``Money``：金額 NUMERIC(12,2)。輸入接受 number，最多兩位小數；輸出序列化為 JSON number。
- ``ErrorResponse``：統一錯誤格式，用於 OpenAPI 的 4xx 回應宣告（``error_responses``）。
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any, ClassVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, WithJsonSchema

Money = Annotated[
    Decimal,
    Field(max_digits=12, decimal_places=2),
    PlainSerializer(lambda v: float(v), return_type=float, when_used="json"),
    WithJsonSchema({"type": "number"}, mode="validation"),
]

# 'YYYY-MM'，月份 01～12（與 models/base.py MONTH_PATTERN 一致）
MONTH_PATTERN = r"^[0-9]{4}-(0[1-9]|1[0-2])$"
MonthField = Annotated[str, Field(pattern=MONTH_PATTERN, min_length=7, max_length=7)]


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # 欄位名 → SRS 檢核失敗文案；子類別覆寫
    field_messages: ClassVar[dict[str, str]] = {}


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ErrorBody(BaseModel):
    code: str
    message: str
    fields: dict[str, str] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """給 ``@router.<method>(responses=...)`` 用：宣告哪些 4xx 會回統一錯誤格式。"""
    return {code: {"model": ErrorResponse} for code in status_codes}
