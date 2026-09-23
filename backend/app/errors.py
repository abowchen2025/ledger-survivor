"""統一業務錯誤格式（2026-09-23 ABow 決定，見 docs/spec-gaps.md 第 8 節 8.1）。

業務錯誤（400／403／404／409）一律回：

    {"error": {"code": "VALIDATION_ERROR", "message": "資料格式有誤", "fields": {"amount": "金額不可為0"}}}

- ``fields`` 的文字逐字使用 SRS 欄位規格表的「檢核失敗文案」，前端直接顯示不再翻譯；
  沒有欄位層級資訊時 ``fields`` 為 null。
- FastAPI 預設的 422（RequestValidationError）改回 400（SRS 的 API 表寫 400），欄位文案由
  請求 schema 的 ``field_messages``（見 ``schemas/common.py``）對應。
- 401 維持 ``{"detail": "unauthorized"}``，不套用本格式：它的 body 刻意不帶資訊，前端只看狀態碼。

丟法：services 直接 ``raise NotFound()``／``raise ValidationFailed({"amount": "金額不可為0"})``，
routers 不 try／except；``main.py`` 註冊的 handler 統一轉成上述 JSON。
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# 錯誤代碼（前端以此分流，不比對 message 文字）
VALIDATION_ERROR = "VALIDATION_ERROR"
NOT_FOUND = "NOT_FOUND"
CARD_IN_USE = "CARD_IN_USE"
MONTH_SETTLED = "MONTH_SETTLED"
INACTIVE_REFERENCE = "INACTIVE_REFERENCE"
DUPLICATE_NAME = "DUPLICATE_NAME"

# pydantic 錯誤 loc 的第一段是參數位置，不是欄位名
_LOCATION_MARKERS = frozenset({"body", "query", "path", "header", "cookie"})

# 非 SRS 欄位（查詢參數、未知欄位）或 schema 沒對應文案時的後備文字
FALLBACK_FIELD_MESSAGE = "格式有誤"
UNKNOWN_FIELD_MESSAGE = "不允許的欄位"


class ApiError(Exception):
    """業務錯誤基底。子類別固定 status_code 與 code，訊息可覆寫。"""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = VALIDATION_ERROR
    default_message: str = "資料格式有誤"

    def __init__(self, message: str | None = None, fields: dict[str, str] | None = None) -> None:
        self.message = message or self.default_message
        self.fields = fields
        super().__init__(self.message)

    def to_payload(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "fields": self.fields}}


class ValidationFailed(ApiError):
    """400：欄位檢核失敗。``fields`` 必填，文字用 SRS 檢核失敗文案。"""

    status_code = status.HTTP_400_BAD_REQUEST
    code = VALIDATION_ERROR
    default_message = "資料格式有誤"

    def __init__(self, fields: dict[str, str], message: str | None = None) -> None:
        super().__init__(message, fields)


class NotFound(ApiError):
    """404：資源不存在，**或屬於其他使用者**（3.2：不回 403，避免透露資料存在）。"""

    status_code = status.HTTP_404_NOT_FOUND
    code = NOT_FOUND
    default_message = "找不到資料"


class CardInUse(ApiError):
    """403：卡片已被 expenses 或 installments 引用，不可刪除（REQ-CARD-004；SRS 與 TC 寫 403，照做）。"""

    status_code = status.HTTP_403_FORBIDDEN
    code = CARD_IN_USE
    default_message = "此卡片已有花費或分期紀錄，無法刪除，請改用停用"


class MonthSettled(ApiError):
    """409：花費所屬月份（依週歸屬規則）已結算，不可新增／修改／刪除（REQ-EXPENSE-005）。"""

    status_code = status.HTTP_409_CONFLICT
    code = MONTH_SETTLED
    default_message = "該月已結算，請先取消結算"

    def __init__(self, month: str) -> None:
        self.month = month
        super().__init__(f"{month} 已結算，請先取消結算")


class InactiveReference(ApiError):
    """400：新增時引用了停用中的分類或信用卡（REQ-CARD-005、REQ-CATEGORY-007）。"""

    status_code = status.HTTP_400_BAD_REQUEST
    code = INACTIVE_REFERENCE
    default_message = "所選的分類或信用卡已停用"

    def __init__(self, fields: dict[str, str], message: str | None = None) -> None:
        super().__init__(message, fields)


class DuplicateName(ApiError):
    """409：同範圍內名稱重複（對應 DB 唯一約束，例如同一級分類下二級分類同名）。"""

    status_code = status.HTTP_409_CONFLICT
    code = DUPLICATE_NAME
    default_message = "名稱重複"

    def __init__(self, fields: dict[str, str], message: str | None = None) -> None:
        super().__init__(message, fields)


# --- handlers -----------------------------------------------------------------


def _api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_payload())


def _field_messages_for(request: Request) -> dict[str, str]:
    """從目前路由的 body 參數找出請求 schema 宣告的 ``field_messages``。"""
    route = request.scope.get("route")
    dependant = getattr(route, "dependant", None)
    messages: dict[str, str] = {}
    for param in getattr(dependant, "body_params", ()):
        annotation = getattr(getattr(param, "field_info", None), "annotation", None)
        declared = getattr(annotation, "field_messages", None)
        if isinstance(declared, dict):
            messages.update(declared)
    return messages


def _request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 → 400，欄位文案以 schema 的 ``field_messages`` 為準；同一欄位多個錯誤只取第一個。"""
    declared = _field_messages_for(request)
    fields: dict[str, str] = {}
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", ())]
        if loc and loc[0] in _LOCATION_MARKERS:
            loc = loc[1:]
        name = ".".join(loc) if loc else "body"
        if name in fields:
            continue
        if err.get("type") == "extra_forbidden":
            fields[name] = UNKNOWN_FIELD_MESSAGE
        else:
            fields[name] = declared.get(name, FALLBACK_FIELD_MESSAGE)
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=ValidationFailed(fields).to_payload(),
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _request_validation_handler)  # type: ignore[arg-type]
