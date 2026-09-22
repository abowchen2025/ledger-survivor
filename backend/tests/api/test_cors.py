"""CORS 來源白名單（REQ-NFR-009；TC-SEC-CORS-001～003，規格見 docs/spec-gaps.md 第 7 節）。

瀏覽器對帶自訂標頭（X-API-Key）的跨來源請求一定先送 OPTIONS 預檢；預檢不帶 X-API-Key，
由 CORSMiddleware 在進路由之前回應，所以 REQ-AUTH-000 的閘門不會擋到預檢。
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings, parse_origins
from app.main import CORS_ALLOW_METHODS, create_app
from app.security import API_KEY_HEADER

pytestmark = pytest.mark.p0

ALLOWED = "https://abowchen2025.github.io"
DEV_ALLOWED = "http://localhost:5173"
NOT_ALLOWED = "https://evil.example"
PROTECTED_PATH = "/api/v1/auth/me"


def _settings(origins: str = f"{ALLOWED},{DEV_ALLOWED}") -> Settings:
    return Settings(_env_file=None, api_key="correct-key", cors_allowed_origins=origins)


def _preflight(client: TestClient, origin: str, path: str = PROTECTED_PATH, method: str = "GET"):
    return client.options(
        path,
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "x-api-key, content-type",
        },
    )


def test_preflight_from_allowed_origin_permits_x_api_key() -> None:
    """TC-SEC-CORS-001：白名單來源的預檢（要求 X-API-Key）→ 200，回應允許該來源、該標頭與該方法。"""
    with TestClient(create_app(_settings())) as client:
        resp = _preflight(client, ALLOWED)
    assert resp.status_code == 200, resp.text
    assert resp.headers["access-control-allow-origin"] == ALLOWED
    allowed_headers = {h.strip().lower() for h in resp.headers["access-control-allow-headers"].split(",")}
    assert API_KEY_HEADER.lower() in allowed_headers
    assert "content-type" in allowed_headers
    allowed_methods = {m.strip() for m in resp.headers["access-control-allow-methods"].split(",")}
    assert "GET" in allowed_methods
    assert "*" not in allowed_methods and "*" not in allowed_headers
    # 沒有 cookie 驗證：不得宣告 allow-credentials
    assert "access-control-allow-credentials" not in resp.headers


def test_preflight_from_unlisted_origin_is_rejected() -> None:
    """TC-SEC-CORS-002：非白名單來源的預檢被拒（400），且回應不含 allow-origin。

    瀏覽器判定預檢成敗看的是 Access-Control-Allow-Origin；Starlette 對不允許的來源
    仍會附 allow-methods／allow-headers（那是靜態設定，不含來源資訊），但沒有 allow-origin
    就等於拒絕，正式請求不會被送出。
    """
    with TestClient(create_app(_settings())) as client:
        resp = _preflight(client, NOT_ALLOWED)
    assert resp.status_code == 400
    assert "access-control-allow-origin" not in resp.headers
    assert NOT_ALLOWED not in resp.text


def test_actual_request_echoes_only_allowed_origin() -> None:
    """TC-SEC-CORS-003：正式請求（帶正確金鑰）只對白名單來源回 allow-origin；非白名單來源拿不到。"""
    with TestClient(create_app(_settings())) as client:
        ok = client.get(PROTECTED_PATH, headers={"Origin": ALLOWED, API_KEY_HEADER: "correct-key"})
        dev = client.get(PROTECTED_PATH, headers={"Origin": DEV_ALLOWED, API_KEY_HEADER: "correct-key"})
        bad = client.get(PROTECTED_PATH, headers={"Origin": NOT_ALLOWED, API_KEY_HEADER: "correct-key"})
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == ALLOWED
    assert dev.headers["access-control-allow-origin"] == DEV_ALLOWED
    assert bad.status_code == 200  # 伺服器仍處理，但瀏覽器因缺 allow-origin 而擋下回應
    assert "access-control-allow-origin" not in bad.headers
    assert ok.headers["access-control-allow-origin"] != "*"


def test_preflight_for_health_does_not_require_api_key() -> None:
    """預檢在路由之前由中介層處理；對受保護路徑的預檢不帶金鑰也不會被 401。"""
    with TestClient(create_app(_settings())) as client:
        resp = _preflight(client, ALLOWED, path=PROTECTED_PATH, method="POST")
    assert resp.status_code == 200


def test_allow_methods_are_explicit() -> None:
    """allow_methods 列出實際會用到的四種，不用萬用字元。"""
    assert CORS_ALLOW_METHODS == ["GET", "POST", "PUT", "DELETE"]


def test_origins_parsed_from_comma_separated_env() -> None:
    """CORS_ALLOWED_ORIGINS 逗號分隔 → list；空白與空項目忽略。"""
    assert parse_origins(" http://localhost:5173 , http://127.0.0.1:5173,, ") == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    assert _settings("").cors_allowed_origins == []
    assert _settings(ALLOWED).cors_allowed_origins == [ALLOWED]
    assert Settings(_env_file=None, api_key="k").cors_allowed_origins == []


@pytest.mark.parametrize(
    "bad",
    [
        "*",
        "https://*.github.io",
        f"{ALLOWED}/ledger-survivor",  # Origin 標頭不帶路徑，帶了永遠比不中
        f"{ALLOWED}/",
        "abowchen2025.github.io",  # 缺 scheme
        "ftp://abowchen2025.github.io",
    ],
)
def test_wildcard_or_path_origins_are_rejected_at_startup(bad: str) -> None:
    """禁止 allow_origins=["*"]；帶路徑或缺 scheme 的來源在啟動時就報錯，不要靜靜失效。"""
    with pytest.raises(ValidationError, match="CORS_ALLOWED_ORIGINS"):
        _settings(f"{ALLOWED},{bad}")
