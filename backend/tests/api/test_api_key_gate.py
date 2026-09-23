"""臨時 API 金鑰閘門（REQ-AUTH-000；TC-SEC-AUTH-000a～e，規格見 docs/spec-gaps.md 第 5 節）。

受保護端點以 GET /api/v1/auth/me 代表；閘門掛在 routers/protected.py 的 router 層級，
所以這裡驗的是「經過 protected router 的任何端點」的行為，不是 /auth/me 自己。
"""

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.main import app, create_app
from app.routers import protected
from app.security import API_KEY_HEADER, UNAUTHORIZED_DETAIL

pytestmark = pytest.mark.p0

PROTECTED_PATH = "/api/v1/auth/me"
HEALTH_PATHS = ("/api/v1/health", "/api/v1/health/live", "/api/v1/health/ready")


def _settings(**overrides: object) -> Settings:
    """不讀 .env、不受本機環境變數影響的 Settings（API_KEY 一定明確給）。"""
    base = {"api_key": "correct-key", "cors_allowed_origins": []}
    return Settings(_env_file=None, **{**base, **overrides})


def test_missing_api_key_returns_401() -> None:
    """TC-SEC-AUTH-000a：沒有 X-API-Key → 401，body 固定 {"detail": "unauthorized"}。"""
    with TestClient(create_app(_settings())) as client:
        resp = client.get(PROTECTED_PATH)
    assert resp.status_code == 401
    assert resp.json() == {"detail": UNAUTHORIZED_DETAIL}


def test_wrong_api_key_returns_same_401_body() -> None:
    """TC-SEC-AUTH-000b：錯誤金鑰 → 401，且回應 body 與缺少金鑰時完全相同（不可探測差異）。"""
    with TestClient(create_app(_settings())) as client:
        missing = client.get(PROTECTED_PATH)
        wrong = client.get(PROTECTED_PATH, headers={API_KEY_HEADER: "wrong-key"})
        empty = client.get(PROTECTED_PATH, headers={API_KEY_HEADER: ""})
        prefix = client.get(PROTECTED_PATH, headers={API_KEY_HEADER: "correct-ke"})
    for resp in (wrong, empty, prefix):
        assert resp.status_code == 401
        assert resp.content == missing.content
        assert resp.headers["content-type"] == missing.headers["content-type"]


def test_correct_api_key_returns_200() -> None:
    """TC-SEC-AUTH-000c：正確金鑰 → 200；受保護端點回固定 user_id=1（REQ-AUTH-001）。"""
    with TestClient(create_app(_settings())) as client:
        resp = client.get(PROTECTED_PATH, headers={API_KEY_HEADER: "correct-key"})
    assert resp.status_code == 200
    assert resp.json() == {"user_id": 1}


def test_api_key_header_name_is_case_insensitive() -> None:
    """HTTP 標頭名稱不分大小寫；瀏覽器與 curl 送 x-api-key 也要能過。"""
    with TestClient(create_app(_settings())) as client:
        resp = client.get(PROTECTED_PATH, headers={"x-api-key": "correct-key"})
    assert resp.status_code == 200


@pytest.mark.parametrize("path", HEALTH_PATHS)
def test_health_endpoints_exempt_from_api_key(path: str) -> None:
    """TC-SEC-AUTH-000d：三個 health 端點不需金鑰（Railway healthcheck 不帶標頭）。

    /health/ready 依 DB 狀態回 200 或 503，但絕不能是 401。
    """
    with TestClient(create_app(_settings())) as client:
        resp = client.get(path)
    assert resp.status_code != 401, resp.text
    if path.endswith("/ready"):
        assert resp.status_code in (200, 503)
    else:
        assert resp.status_code == 200


def test_startup_fails_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """TC-SEC-AUTH-000e：API_KEY 未設定或為空 → Settings 建立失敗（應用啟動即失敗，fail closed）。"""
    monkeypatch.delenv("API_KEY", raising=False)
    with pytest.raises(ValidationError, match="api_key"):
        Settings(_env_file=None)
    with pytest.raises(ValidationError, match="API_KEY must be set and non-empty"):
        Settings(_env_file=None, api_key="")
    with pytest.raises(ValidationError, match="API_KEY must be set and non-empty"):
        Settings(_env_file=None, api_key="   ")
    monkeypatch.setenv("API_KEY", "")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_gate_is_router_level_not_per_endpoint() -> None:
    """新增業務 router 只要 include 進 protected router 就自動受檢，不必逐個端點掛 dependency。"""
    extra = APIRouter(prefix="/probe", tags=["test-only"])

    @extra.get("/ping")
    def ping() -> dict[str, bool]:
        return {"pong": True}

    protected_copy = APIRouter(dependencies=protected.router.dependencies)
    protected_copy.include_router(extra)
    test_app = create_app(_settings())
    test_app.include_router(protected_copy, prefix="/api/v1")

    with TestClient(test_app) as client:
        assert client.get("/api/v1/probe/ping").status_code == 401
        ok = client.get("/api/v1/probe/ping", headers={API_KEY_HEADER: "correct-key"})
    assert ok.status_code == 200
    assert ok.json() == {"pong": True}


def test_module_level_app_uses_env_api_key() -> None:
    """uvicorn 用的 app（app.main:app）讀的是環境變數的 API_KEY，不是寫死的值。"""
    from app.config import settings

    with TestClient(app) as client:
        assert client.get(PROTECTED_PATH).status_code == 401
        assert client.get(PROTECTED_PATH, headers={API_KEY_HEADER: settings.api_key}).status_code == 200


def test_openapi_declares_api_key_security_scheme() -> None:
    """OpenAPI 只在受保護操作上宣告 ApiKeyAuth，health 端點沒有；金鑰不會變成每個操作的參數。"""
    schema = create_app(_settings()).openapi()
    assert schema["components"]["securitySchemes"]["ApiKeyAuth"] == {
        "type": "apiKey",
        "in": "header",
        "name": API_KEY_HEADER,
        "description": "REQ-AUTH-000 臨時 API 金鑰；Phase 3 改為 JWT 後移除。",
    }
    assert schema["paths"][PROTECTED_PATH]["get"]["security"] == [{"ApiKeyAuth": []}]
    assert "parameters" not in schema["paths"][PROTECTED_PATH]["get"]
    for path in HEALTH_PATHS:
        assert "security" not in schema["paths"][path]["get"]


@pytest.mark.parametrize("path", ["/openapi.json", "/docs", "/redoc"])
def test_openapi_docs_closed_when_debug_false(path: str) -> None:
    """TC-SEC-DOCS-001：DEBUG=false（Railway）時 OpenAPI 文件與互動介面不存在；DEBUG=true（本機）全開。"""
    with TestClient(create_app(_settings(debug=False))) as client:
        assert client.get(path).status_code == 404
    with TestClient(create_app(_settings(debug=True))) as client:
        assert client.get(path).status_code == 200
