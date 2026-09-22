"""臨時 API 金鑰閘門（REQ-AUTH-000，規格見 docs/spec-gaps.md 第 5 節）。

Phase 3 導入 JWT（REQ-AUTH-001 起）後整個模組移除。

- 檢查請求標頭 ``X-API-Key`` 是否等於設定的 ``API_KEY``（常數時間比對）。
- 標頭缺少與不符**一律**回同一個 401 與同一個 body，不透露差異，避免用回應探測。
- 這個 dependency 掛在 ``routers/protected.py`` 的 router 層級，不逐個端點掛；
  新增業務 router 一律 include 進 protected router 就自動受檢。
- 豁免只有三個 health 端點（掛在 ``routers/health.py``，不經 protected router）。
- 金鑰來源是 ``request.app.state.settings``，讓 ``create_app(settings)`` 用哪份設定就檢查哪把金鑰。

用 ``APIKeyHeader`` 而不是一般 ``Header``：OpenAPI 會產生 ``securitySchemes.ApiKeyAuth``
與每個受保護操作的 ``security`` 欄位，Swagger UI 有「Authorize」按鈕，而且不會把
``X-API-Key`` 混進每個操作的參數清單（openapi-typescript 產出的型別不會被它污染）。
"""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader

API_KEY_HEADER = "X-API-Key"
UNAUTHORIZED_DETAIL = "unauthorized"

api_key_header = APIKeyHeader(
    name=API_KEY_HEADER,
    scheme_name="ApiKeyAuth",
    description="REQ-AUTH-000 臨時 API 金鑰；Phase 3 改為 JWT 後移除。",
    auto_error=False,  # 缺少標頭時不要讓 FastAPI 自己回 403，統一由下方回 401
)


def _matches(provided: str | None, expected: str) -> bool:
    if provided is None:
        return False
    return secrets.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def require_api_key(
    request: Request,
    provided: Annotated[str | None, Security(api_key_header)],
) -> None:
    """FastAPI dependency：金鑰不符即 401；成功不回傳任何東西。"""
    expected: str = request.app.state.settings.api_key
    if not _matches(provided, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=UNAUTHORIZED_DETAIL)
