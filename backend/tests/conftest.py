"""共用 fixture。

- ``week_cases``：載入 tests/fixtures/week_cases.json（週規則唯一真相）。
- ``API_KEY``：REQ-AUTH-000 fail closed，import app 之前先給一把。
- ``db``／``client``：API 測試用。每個測試在**一個外層交易**內執行，結束後 rollback；
  service 裡的 ``db.commit()`` 只釋放 savepoint，不會真的寫進資料庫。需要本機／CI 的 PostgreSQL
  已 ``alembic upgrade head``（含 seed：user 1、內建分類）；DB 不可用會失敗不會 skip。
- ``other_user_id``：在同一交易內建立 user 2，供使用者隔離測試（3.2）直接插入他人資料。
"""

import json
import os
from collections.abc import Iterator
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

FIXTURES_DIR = Path(__file__).parent / "fixtures"

# REQ-AUTH-000：Settings 沒有 API_KEY 就建不起來（fail closed），測試環境在 import app 之前先給一把。
# 用 setdefault：shell 或 CI 已設定時以其為準；環境變數優先於 .env，所以本機與 CI 讀到的是同一把。
# 這不是旁路——app 仍走完整檢查路徑，只是測試知道正確答案。
TEST_API_KEY = "test-api-key-not-a-secret"
os.environ.setdefault("API_KEY", TEST_API_KEY)


def _to_date(s: str) -> date:
    return date.fromisoformat(s)


@pytest.fixture(scope="session")
def week_cases() -> list[dict]:
    """回傳 week_cases.json 的 cases，日期字串已轉為 date。"""
    raw = json.loads((FIXTURES_DIR / "week_cases.json").read_text(encoding="utf-8"))
    cases = []
    for c in raw["cases"]:
        cases.append(
            {
                **c,
                "date": _to_date(c["date"]),
                "week_start": _to_date(c["week_start"]),
                "week_end": _to_date(c["week_end"]),
            }
        )
    assert len(cases) >= 12, "week_cases.json 至少需 12 筆案例"
    return cases


def cases_for(week_cases: list[dict], tc_id: str) -> list[dict]:
    """依測試條件編號篩選案例；篩不到任何案例視為 fixture 缺漏。"""
    selected = [c for c in week_cases if tc_id in c.get("tc", [])]
    assert selected, f"week_cases.json 沒有標記 {tc_id} 的案例"
    return selected


# --- API 測試：交易隔離的 DB session 與帶金鑰的 client ---------------------------


@pytest.fixture
def db() -> Iterator[Session]:
    """綁在單一連線的外層交易上的 session；測試結束 rollback，資料不留痕。"""
    from app import database
    from app.database import get_db
    from app.main import app

    connection = database.engine.connect()
    outer = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        autoflush=False,
        expire_on_commit=False,
    )
    app.dependency_overrides[get_db] = lambda: session
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    """已帶正確 X-API-Key 的 TestClient；用 module-level app（與 uvicorn 相同）。"""
    from app.config import settings
    from app.main import app
    from app.security import API_KEY_HEADER

    with TestClient(app, headers={API_KEY_HEADER: settings.api_key}) as c:
        yield c


@pytest.fixture
def user_id() -> int:
    """目前請求被視為的使用者（REQ-AUTH-001 固定 1）。"""
    from app.config import settings

    return settings.default_user_id


@pytest.fixture
def other_user_id(db: Session) -> int:
    """建立另一個使用者（id=2）在同一交易內，供 3.2 使用者隔離測試插入「別人的資料」。"""
    from app.models import User

    db.merge(User(id=2, email="user2@ledger-survivor.test", password_hash="!test"))
    db.flush()
    return 2


def assert_api_error(resp, status_code: int, code: str, fields: dict[str, str] | None = None) -> dict:
    """統一錯誤格式斷言：{"error": {"code", "message", "fields"}}；回傳 error 物件供再檢查。"""
    assert resp.status_code == status_code, resp.text
    body = resp.json()
    assert set(body) == {"error"}, body
    err = body["error"]
    assert set(err) == {"code", "message", "fields"}, err
    assert err["code"] == code, err
    assert isinstance(err["message"], str) and err["message"]
    if fields is not None:
        assert err["fields"] == fields, err
    return err
