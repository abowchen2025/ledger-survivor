"""信用卡主檔 API（SRS 4.2；TC-NEG-CARD-003、TC-FUNC-CARD-004；使用者隔離 3.2）。"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import errors
from app.models import Category, CreditCard, Expense, Installment
from tests.conftest import assert_api_error

pytestmark = pytest.mark.p0

CARDS_URL = "/api/v1/cards"

BASE_CARD = {
    "name": "測試卡",
    "bank": "測試銀行",
    "last4": "1234",
    "statement_day": 27,
    "due_day": 15,
}


def _create(client: TestClient, **overrides) -> dict:
    resp = client.post(CARDS_URL, json={**BASE_CARD, **overrides})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _put_payload(card: dict, **overrides) -> dict:
    keys = ("name", "bank", "last4", "statement_day", "due_day", "color", "is_active")
    return {**{k: card[k] for k in keys}, **overrides}


def _any_category(db: Session, user_id: int) -> Category:
    cat = db.scalar(select(Category).where(Category.user_id == user_id, Category.is_active.is_(True)))
    assert cat is not None
    return cat


# --- 建立與推算 ---------------------------------------------------------------------


def test_create_card_infers_due_month_offset_and_defaults(client: TestClient) -> None:
    """REQ-CARD-002／003：未給 due_month_offset 時依結帳日／繳款日推算；期初卡債預設 0；不存完整卡號。"""
    card = _create(client)  # 27／15 → 1
    assert card["due_month_offset"] == 1
    assert card["opening_billed_unpaid"] == 0 and card["opening_unbilled"] == 0
    assert card["opening_as_of"] is None and card["color"] is None
    assert card["is_active"] is True
    assert set(card) == {
        "id", "name", "bank", "last4", "statement_day", "due_day", "due_month_offset",
        "opening_billed_unpaid", "opening_unbilled", "opening_as_of", "color", "is_active",
    }

    same_month = _create(client, statement_day=1, due_day=20, last4="0002")
    assert same_month["due_month_offset"] == 0

    overridden = _create(client, statement_day=1, due_day=20, due_month_offset=1, last4="0003")
    assert overridden["due_month_offset"] == 1

    with_opening = _create(
        client, last4="0004", opening_billed_unpaid=1200.5, opening_unbilled=300, opening_as_of="2026-09-01", color="#FF8800"
    )
    assert with_opening["opening_billed_unpaid"] == 1200.5
    assert with_opening["opening_unbilled"] == 300
    assert with_opening["opening_as_of"] == "2026-09-01"
    assert with_opening["color"] == "#FF8800"

    listed = client.get(CARDS_URL).json()
    assert {c["id"] for c in listed} >= {card["id"], same_month["id"], overridden["id"], with_opening["id"]}


def test_due_offset_override_recalculates_on_source_change(client: TestClient) -> None:
    """TC-NEG-CARD-003／REQ-CARD-002：覆寫值只在來源欄位不變時保留；結帳日或繳款日一改就重新推算。"""
    card = _create(client, statement_day=1, due_day=20, due_month_offset=1)  # 推算應為 0，手動覆寫成 1
    assert card["due_month_offset"] == 1

    # 來源欄位沒變（只改名）→ 保留覆寫值
    renamed = client.put(f"{CARDS_URL}/{card['id']}", json=_put_payload(card, name="改名"))
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["due_month_offset"] == 1

    # 改結帳日（1 → 25；繳款 20 ≤ 25 → 1）：重新推算，恰好也是 1；改繳款日（20 → 28；28 > 25 → 0）：變成 0
    changed = client.put(f"{CARDS_URL}/{card['id']}", json=_put_payload(card, statement_day=25, due_day=28))
    assert changed.status_code == 200, changed.text
    assert changed.json()["due_month_offset"] == 0

    # 同一請求明確再給覆寫值 → 覆寫值優先
    forced = client.put(
        f"{CARDS_URL}/{card['id']}", json=_put_payload(card, statement_day=5, due_day=28, due_month_offset=1)
    )
    assert forced.status_code == 200, forced.text
    assert forced.json()["due_month_offset"] == 1


def test_card_validation_messages_from_srs(client: TestClient) -> None:
    """欄位檢核失敗 → 400，fields 逐字用 SRS 4.2 欄位規格表文案。"""
    err = assert_api_error(client.post(CARDS_URL, json={}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {
        "name": "請輸入卡片名稱",
        "bank": "請輸入發卡銀行",
        "last4": "請輸入卡號末四碼（4位數字）",
        "statement_day": "結帳日須介於1-31",
        "due_day": "繳款日須介於1-31",
    }
    bad = {
        **BASE_CARD,
        "last4": "12345",
        "statement_day": 0,
        "due_day": 32,
        "color": "red",
        "opening_billed_unpaid": -1,
        "due_month_offset": 2,
    }
    err = assert_api_error(client.post(CARDS_URL, json=bad), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {
        "last4": "請輸入卡號末四碼（4位數字）",
        "statement_day": "結帳日須介於1-31",
        "due_day": "繳款日須介於1-31",
        "color": "顏色格式錯誤",
        "opening_billed_unpaid": "金額不可為負數",
        "due_month_offset": "繳款月偏移須為0或1",
    }
    # 完整卡號也擋（只收末四碼，REQ-CARD-001）
    err = assert_api_error(client.post(CARDS_URL, json={**BASE_CARD, "last4": "4111111111111111"}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"last4": "請輸入卡號末四碼（4位數字）"}


def test_opening_balances_locked_after_create(client: TestClient, db: Session) -> None:
    """SRS 4.2 條件呈現邏輯：期初卡債只在新增時可填，編輯既有卡片不可再改 → PUT 送了回 400。"""
    card = _create(client, opening_billed_unpaid=500)
    resp = client.put(f"{CARDS_URL}/{card['id']}", json={**_put_payload(card), "opening_billed_unpaid": 0})
    assert_api_error(resp, 400, errors.VALIDATION_ERROR, {"opening_billed_unpaid": errors.UNKNOWN_FIELD_MESSAGE})
    db.expire_all()
    assert db.get(CreditCard, card["id"]).opening_billed_unpaid == Decimal("500")


def test_deactivate_card_via_put(client: TestClient) -> None:
    """REQ-CARD-005：停用只是 is_active=false，清單仍列出（前端灰階）。"""
    card = _create(client)
    resp = client.put(f"{CARDS_URL}/{card['id']}", json=_put_payload(card, is_active=False))
    assert resp.status_code == 200 and resp.json()["is_active"] is False
    assert any(c["id"] == card["id"] and c["is_active"] is False for c in client.get(CARDS_URL).json())


# --- 刪除（REQ-CARD-004） -------------------------------------------------------------


def test_delete_unreferenced_card_returns_204(client: TestClient, db: Session) -> None:
    card = _create(client)
    resp = client.delete(f"{CARDS_URL}/{card['id']}")
    assert resp.status_code == 204 and resp.content == b""
    assert db.get(CreditCard, card["id"]) is None
    assert_api_error(client.delete(f"{CARDS_URL}/{card['id']}"), 404, errors.NOT_FOUND)


def test_delete_referenced_card_returns_403(client: TestClient, db: Session, user_id: int) -> None:
    """TC-FUNC-CARD-004／REQ-CARD-004：被 expenses 或 installments 引用 → 403 CARD_IN_USE，訊息提示改用停用。"""
    by_expense = _create(client, last4="1111")
    db.add(
        Expense(
            user_id=user_id, date=date(2026, 9, 1), amount=Decimal("100"), item="刷卡",
            category_id=_any_category(db, user_id).id, payment_method="credit_card", card_id=by_expense["id"],
        )
    )
    by_installment = _create(client, last4="2222")
    db.add(
        Installment(
            user_id=user_id, card_id=by_installment["id"], name="分期", purchase_date=date(2026, 9, 1),
            total_amount=Decimal("12000"), total_periods=12, paid_periods=0, first_month="2026-10",
            monthly_amount=Decimal("1000"),
        )
    )
    db.flush()

    for card in (by_expense, by_installment):
        err = assert_api_error(client.delete(f"{CARDS_URL}/{card['id']}"), 403, errors.CARD_IN_USE)
        assert "停用" in err["message"]
        assert err["fields"] is None
        db.expire_all()
        assert db.get(CreditCard, card["id"]) is not None


# --- 使用者隔離（3.2） -------------------------------------------------------------


def test_other_users_cards_are_invisible(client: TestClient, db: Session, other_user_id: int) -> None:
    """別人的卡片：GET 清單不出現；PUT／DELETE by id 回 404（不是 403）；資料不變。"""
    other = CreditCard(
        user_id=other_user_id, name="別人的卡", bank="B", last4="9999", statement_day=5, due_day=25, due_month_offset=0,
        opening_billed_unpaid=Decimal("0"), opening_unbilled=Decimal("0"),
    )
    db.add(other)
    db.flush()

    assert other.id not in {c["id"] for c in client.get(CARDS_URL).json()}
    payload = {"name": "偷改", "bank": "B", "last4": "9999", "statement_day": 5, "due_day": 25}
    assert_api_error(client.put(f"{CARDS_URL}/{other.id}", json=payload), 404, errors.NOT_FOUND)
    assert_api_error(client.delete(f"{CARDS_URL}/{other.id}"), 404, errors.NOT_FOUND)

    db.expire_all()
    still = db.get(CreditCard, other.id)
    assert still is not None and still.name == "別人的卡"
