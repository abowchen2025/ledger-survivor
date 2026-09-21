"""健康檢查端點（REQ-NFR-008；TC-FUNC-HEALTH-001～005，見 docs/spec-gaps.md 第 6 節）。

/health/ready 的正常路徑需要本機 DB 已 ``alembic upgrade head``（CI 的 backend job 會先跑）。
DB 不可用時該測試會失敗，不會 skip。
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app import database
from app.config import settings
from app.main import app
from app.services import health as health_service

pytestmark = pytest.mark.p0


def test_health_returns_ok() -> None:
    """TC-FUNC-HEALTH-005：/health 維持既有行為，固定回 200 與 {"status": "ok"}。"""
    with TestClient(app) as client:
        resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_health_live_returns_ok_without_dependencies(monkeypatch: pytest.MonkeyPatch) -> None:
    """TC-FUNC-HEALTH-001：liveness 不查 DB，即使 DB 連不上也回 200。"""
    monkeypatch.setattr(
        database, "engine", create_engine("postgresql+psycopg://nobody:nobody@127.0.0.1:1/nowhere", connect_args={"connect_timeout": 2})
    )
    with TestClient(app) as client:
        resp = client.get("/api/v1/health/live")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_health_ready_ok_when_db_at_head() -> None:
    """TC-FUNC-HEALTH-002：DB 可連且 alembic_version == 程式碼 head → 200、status ok。"""
    with TestClient(app) as client:
        resp = client.get("/api/v1/health/ready")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"]["db"] == "ok"
    assert body["checks"]["migration"]["ok"] is True
    assert body["checks"]["migration"]["db_revision"] == body["checks"]["migration"]["code_head"]
    assert body["checks"]["migration"]["code_head"] == health_service.code_head_revision()


def test_health_ready_degraded_when_revision_mismatch(monkeypatch: pytest.MonkeyPatch) -> None:
    """TC-FUNC-HEALTH-003：DB 可連但 revision 不等於 head → 503、status degraded、migration.ok false。"""
    monkeypatch.setattr(health_service, "code_head_revision", lambda: "ffff_not_deployed")
    with TestClient(app) as client:
        resp = client.get("/api/v1/health/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["checks"]["db"] == "ok"
    assert body["checks"]["migration"] == {
        "ok": False,
        "db_revision": body["checks"]["migration"]["db_revision"],
        "code_head": "ffff_not_deployed",
    }
    assert body["checks"]["migration"]["db_revision"] not in (None, "ffff_not_deployed")


def test_health_ready_degraded_when_db_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    """TC-FUNC-HEALTH-004：DB 連不上 → 503、checks.db == error，回應不含連線細節。"""
    bad_url = "postgresql+psycopg://nobody:nobody@127.0.0.1:1/nowhere"
    monkeypatch.setattr(database, "engine", create_engine(bad_url, connect_args={"connect_timeout": 2}))
    with TestClient(app) as client:
        resp = client.get("/api/v1/health/ready")
    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["checks"]["db"] == "error"
    assert body["checks"]["migration"]["ok"] is False
    assert body["checks"]["migration"]["db_revision"] is None
    # 不得洩漏連線字串、主機、帳號或例外文字
    for secret in ("nobody", "127.0.0.1:1", "nowhere", "psycopg", "Traceback", settings.database_url):
        assert secret not in resp.text
