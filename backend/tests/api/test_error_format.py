"""統一錯誤格式與使用者隔離的共用機制（docs/spec-gaps.md 第 8 節 8.1、8.2）。

這裡用只存在於測試內的探針 router 驗機制本身，不依賴任何業務模組：
- ApiError 子類別 → 對應狀態碼 + {"error": {"code", "message", "fields"}}
- pydantic 檢核失敗 → 400（不是 FastAPI 預設 422），fields 文字取自 schema 的 field_messages
- 401 維持 {"detail": "unauthorized"}
- OpenAPI 不宣告 422
- CurrentUserId 來自設定，不受請求參數影響
"""

from decimal import Decimal

import pytest
from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

from app import errors
from app.config import Settings
from app.deps import CurrentUserId
from app.main import create_app
from app.schemas.common import Money, RequestModel, ResponseModel, error_responses
from app.security import API_KEY_HEADER, UNAUTHORIZED_DETAIL, require_api_key
from tests.conftest import assert_api_error

pytestmark = pytest.mark.p0

KEY = "probe-key"


class ProbeBody(RequestModel):
    field_messages = {"amount": "金額不可為0", "item": "請輸入品項"}

    amount: Money
    item: str


class ProbeOut(ResponseModel):
    amount: Money
    item: str


def _probe_app() -> FastAPI:
    app = create_app(Settings(_env_file=None, api_key=KEY, cors_allowed_origins=[]))
    probe = APIRouter(prefix="/probe", tags=["test-only"])

    @probe.get("/not-found")
    def not_found() -> None:
        raise errors.NotFound()

    @probe.get("/card-in-use")
    def card_in_use() -> None:
        raise errors.CardInUse()

    @probe.get("/settled")
    def settled() -> None:
        raise errors.MonthSettled("2026-10")

    @probe.get("/inactive")
    def inactive() -> None:
        raise errors.InactiveReference({"card_id": "請選擇信用卡"})

    @probe.get("/validation")
    def validation() -> None:
        raise errors.ValidationFailed({"salary": "月薪不可為負數"})

    @probe.post("/body", response_model=ProbeOut, responses=error_responses(400))
    def body(payload: ProbeBody) -> ProbeOut:
        return ProbeOut(amount=payload.amount, item=payload.item)

    @probe.get("/whoami")
    def whoami(user_id: CurrentUserId, user_id_param: int | None = None) -> dict:
        return {"user_id": user_id}

    # 掛在受金鑰保護的 router 之下：與正式業務 router 走同一條路
    guarded = APIRouter(dependencies=[Depends(require_api_key)])
    guarded.include_router(probe)
    app.include_router(guarded, prefix="/api/v1")
    return app


@pytest.fixture
def probe() -> TestClient:
    return TestClient(_probe_app(), headers={API_KEY_HEADER: KEY})


@pytest.mark.parametrize(
    ("path", "status", "code"),
    [
        ("/api/v1/probe/not-found", 404, errors.NOT_FOUND),
        ("/api/v1/probe/card-in-use", 403, errors.CARD_IN_USE),
        ("/api/v1/probe/settled", 409, errors.MONTH_SETTLED),
        ("/api/v1/probe/inactive", 400, errors.INACTIVE_REFERENCE),
        ("/api/v1/probe/validation", 400, errors.VALIDATION_ERROR),
    ],
)
def test_api_error_uses_unified_envelope(probe: TestClient, path: str, status: int, code: str) -> None:
    """每個 ApiError 子類別 → 對應狀態碼與 {"error": {code, message, fields}}。"""
    err = assert_api_error(probe.get(path), status, code)
    if code == errors.INACTIVE_REFERENCE:
        assert err["fields"] == {"card_id": "請選擇信用卡"}
    elif code == errors.VALIDATION_ERROR:
        assert err["fields"] == {"salary": "月薪不可為負數"}
    elif code == errors.MONTH_SETTLED:
        assert "2026-10" in err["message"] and "取消結算" in err["message"]
        assert err["fields"] is None
    else:
        assert err["fields"] is None


def test_request_validation_returns_400_with_srs_field_messages(probe: TestClient) -> None:
    """pydantic 檢核失敗 → 400（不是 422），fields 用 schema 宣告的 SRS 文案，不論失敗原因。"""
    # 型別錯誤 + 缺欄位 → 各自對應該欄位的同一句文案
    err = assert_api_error(
        probe.post("/api/v1/probe/body", json={"amount": "abc"}), 400, errors.VALIDATION_ERROR
    )
    assert err["fields"] == {"amount": "金額不可為0", "item": "請輸入品項"}
    assert err["message"] == "資料格式有誤"

    # 小數位過多 → 同一句
    err = assert_api_error(
        probe.post("/api/v1/probe/body", json={"amount": 1.234, "item": "x"}),
        400,
        errors.VALIDATION_ERROR,
    )
    assert err["fields"] == {"amount": "金額不可為0"}

    # 未知欄位（extra=forbid）→ 400，不靜靜忽略
    err = assert_api_error(
        probe.post("/api/v1/probe/body", json={"amount": 1, "item": "x", "bogus": 1}),
        400,
        errors.VALIDATION_ERROR,
    )
    assert err["fields"] == {"bogus": errors.UNKNOWN_FIELD_MESSAGE}

    # 沒有 field_messages 對應的位置（例如查詢參數）→ 後備文字，仍是 400
    err = assert_api_error(
        probe.get("/api/v1/probe/whoami", params={"user_id_param": "not-int"}),
        400,
        errors.VALIDATION_ERROR,
    )
    assert err["fields"] == {"user_id_param": errors.FALLBACK_FIELD_MESSAGE}


def test_money_accepts_number_and_serializes_as_number(probe: TestClient) -> None:
    """Money：輸入 JSON number（最多兩位小數），輸出 JSON number；內部是 Decimal。"""
    resp = probe.post("/api/v1/probe/body", json={"amount": 12.5, "item": "x"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"amount": 12.5, "item": "x"}
    assert ProbeBody(amount=12.5, item="x").amount == Decimal("12.5")


def test_unauthorized_body_unchanged(probe: TestClient) -> None:
    """401 不套用統一格式，維持 {"detail": "unauthorized"}（前端只看狀態碼）。"""
    resp = probe.get("/api/v1/probe/not-found", headers={API_KEY_HEADER: "wrong"})
    assert resp.status_code == 401
    assert resp.json() == {"detail": UNAUTHORIZED_DETAIL}


def test_current_user_id_comes_from_settings_not_request(probe: TestClient) -> None:
    """3.2：user_id 來自認證 dependency；請求參數怎麼傳都不影響。"""
    assert probe.get("/api/v1/probe/whoami").json() == {"user_id": 1}
    assert probe.get("/api/v1/probe/whoami", params={"user_id_param": 2}).json() == {"user_id": 1}


def test_openapi_declares_400_envelope_and_no_422(probe: TestClient) -> None:
    """OpenAPI：error_responses 宣告的 400 指向 ErrorResponse；FastAPI 自動的 422 全部移除。"""
    schema = probe.app.openapi()
    op = schema["paths"]["/api/v1/probe/body"]["post"]
    ref = op["responses"]["400"]["content"]["application/json"]["schema"]["$ref"]
    assert ref.endswith("/ErrorResponse")
    for path_item in schema["paths"].values():
        for operation in path_item.values():
            assert "422" not in operation.get("responses", {})
    assert "HTTPValidationError" not in schema["components"]["schemas"]
    # Money 在 OpenAPI 是 number，不是 anyOf[number, string]
    amount_schema = schema["components"]["schemas"]["ProbeBody"]["properties"]["amount"]
    assert amount_schema["type"] == "number", amount_schema
