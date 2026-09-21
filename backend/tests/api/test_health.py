"""GET /api/v1/health 回 200 與 {"status": "ok"}（Phase 0 驗收：Railway /health 回 200）。"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.p0


def test_health_returns_ok() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
