"""FastAPI 入口。

- ``create_app(settings)``：組出應用程式；測試可用不同的 Settings（例如指定 CORS 來源）建 app。
- 模組層級的 ``app`` 給 uvicorn 用（``uvicorn app.main:app``）。

路由掛載分兩層：
- ``routers/health.py``：三個 health 端點，不檢查 API 金鑰（Railway healthcheck 要能打）。
- ``routers/protected.py``：其餘所有端點，router 層級掛 ``require_api_key``（REQ-AUTH-000）。

CORS（REQ-NFR-009）：明確來源清單、不用萬用字元、``allow_credentials=False``（用標頭不是 cookie）、
``allow_headers`` 一定要含 ``X-API-Key``，否則瀏覽器的預檢請求會擋掉正式請求。

錯誤格式：``errors.install_error_handlers`` 把業務錯誤（``ApiError``）與請求檢核失敗（FastAPI 預設 422）
統一成 ``{"error": {"code", "message", "fields"}}``，422 改回 400（SRS 的 API 表寫 400）；
OpenAPI 因此移除自動加上的 422 回應宣告（``_openapi_without_422``）。401 維持 ``{"detail": "unauthorized"}``。

OpenAPI 文件（``/openapi.json``、``/docs``、``/redoc``）依 ``DEBUG`` 開關：``DEBUG=false``（Railway）全部關閉，
不在公開網址上放互動式介面；``DEBUG=true``（本機，``.env.example`` 預設）全開，``npm run gen:api`` 才讀得到。
不是為了保密（repo 公開，schema 本來就推得出來），是縮小公開面。2026-09-23 ABow 決定。
"""

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.config import Settings, settings as default_settings
from app.errors import install_error_handlers
from app.routers import health, protected
from app.security import API_KEY_HEADER

# 實際會用到的方法（SRS 的 API 只有 GET／POST／PUT／DELETE）；預檢 OPTIONS 由中介層自己處理。
CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "DELETE"]
# Content-Type: application/json 不是 simple header，預檢也會要求它。
CORS_ALLOW_HEADERS = [API_KEY_HEADER, "Content-Type"]


def create_app(settings: Settings = default_settings) -> FastAPI:
    app = FastAPI(
        title="Ledger Survivor API",
        version="0.1.0",
        debug=settings.debug,
        # DEBUG=false → 三個文件端點都不存在（404）；DEBUG=true → FastAPI 預設路徑
        openapi_url="/openapi.json" if settings.debug else None,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
    )
    app.state.settings = settings

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_credentials=False,
        allow_methods=CORS_ALLOW_METHODS,
        allow_headers=CORS_ALLOW_HEADERS,
    )

    install_error_handlers(app)

    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(protected.router, prefix=settings.api_prefix)

    app.openapi = lambda: _openapi_without_422(app)  # type: ignore[method-assign]
    return app


def _openapi_without_422(app: FastAPI) -> dict[str, Any]:
    """FastAPI 會替每個有參數的操作自動宣告 422；本專案檢核失敗回 400，422 永遠不會出現，
    留著會讓 openapi-typescript 產生用不到的型別，所以移除。其餘內容維持 FastAPI 預設。"""
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description,
        routes=app.routes,
    )
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            responses = operation.get("responses", {})
            responses.pop("422", None)
    if "HTTPValidationError" in schema.get("components", {}).get("schemas", {}):
        schema["components"]["schemas"].pop("HTTPValidationError", None)
        schema["components"]["schemas"].pop("ValidationError", None)
    app.openapi_schema = schema
    return schema


app = create_app()
