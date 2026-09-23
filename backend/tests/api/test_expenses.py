"""花費記錄 API（SRS 4.5；TC-FUNC-EXPENSE-002、TC-EDGE-EXPENSE-003、TC-NEG-EXPENSE-004、
TC-FUNC-EXPENSE-005、TC-NEG-EXPENSE-006；決定 3.5～3.9；使用者隔離 3.2）。

TC-FUNC-EXPENSE-001（週花費計分）屬 Phase 2，本檔不寫。
「已結算」以直接在 reward_ledger 插入該月一列模擬（月結功能 Phase 3 才做）。
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import errors
from app.models import Category, CategoryGroup, CreditCard, Expense, RewardLedger
from app.services import week_rule
from app.services.settlement import game_month_of
from tests.conftest import assert_api_error

pytestmark = pytest.mark.p0

EXPENSES_URL = "/api/v1/expenses"


# --- helpers ---------------------------------------------------------------------------


def _active_category(db: Session, user_id: int) -> Category:
    cat = db.scalar(
        select(Category)
        .join(CategoryGroup, CategoryGroup.id == Category.group_id)
        .where(Category.user_id == user_id, Category.is_active.is_(True), CategoryGroup.code == "FOOD")
        .order_by(Category.sort_order)
    )
    assert cat is not None
    return cat


def _card(db: Session, user_id: int, statement_day: int = 5, is_active: bool = True) -> CreditCard:
    card = CreditCard(
        user_id=user_id, name="卡", bank="行", last4="0000", statement_day=statement_day, due_day=20,
        due_month_offset=0, opening_billed_unpaid=Decimal("0"), opening_unbilled=Decimal("0"), is_active=is_active,
    )
    db.add(card)
    db.flush()
    return card


def _settle(db: Session, user_id: int, month: str) -> None:
    db.add(RewardLedger(user_id=user_id, month=month, grade="A", reward_amount=Decimal("0")))
    db.flush()


def _payload(category: Category, **overrides) -> dict:
    base = {"amount": 120, "item": "午餐", "category_id": category.id, "payment_method": "cash"}
    return {**base, **overrides}


def _week_range(d: date) -> tuple[str, str]:
    iso_year, iso_week = week_rule.week_of(d)
    return week_rule.week_start(iso_year, iso_week).isoformat(), week_rule.week_end(iso_year, iso_week).isoformat()


class _FrozenDatetime(datetime):
    """讓 week_rule.today_taipei() 看到固定的瞬間；now(tz) 以 tz 換算，UTC 與台北會得到不同日期。"""

    frozen_utc: datetime

    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        if tz is None:
            return cls.frozen_utc.replace(tzinfo=None)
        return cls.frozen_utc.astimezone(tz)


def _freeze(monkeypatch: pytest.MonkeyPatch, utc_instant: datetime) -> None:
    frozen = type("Frozen", (_FrozenDatetime,), {"frozen_utc": utc_instant})
    monkeypatch.setattr(week_rule, "datetime", frozen)


# --- 基本 CRUD 與欄位檢核 ---------------------------------------------------------------


def test_create_list_update_delete_expense(client: TestClient, db: Session, user_id: int) -> None:
    """REQ-EXPENSE-001／002：新增（201）→ 區間查詢 → 編輯 → 刪除（204）。"""
    cat = _active_category(db, user_id)
    created = client.post(EXPENSES_URL, json=_payload(cat, date="2026-09-23", note="便當"))
    assert created.status_code == 201, created.text
    body = created.json()
    assert body == {
        "id": body["id"], "date": "2026-09-23", "amount": 120, "item": "午餐", "category_id": cat.id,
        "payment_method": "cash", "card_id": None, "note": "便當",
    }

    listed = client.get(EXPENSES_URL, params={"start_date": "2026-09-23", "end_date": "2026-09-23"}).json()
    assert body in listed
    assert body not in client.get(EXPENSES_URL, params={"start_date": "2026-09-24", "end_date": "2026-09-30"}).json()
    assert body in client.get(EXPENSES_URL, params={"end_date": "2026-09-23"}).json()  # 單邊區間

    # PUT 是整筆取代：沒送 note 就會變成 null
    updated = client.put(f"{EXPENSES_URL}/{body['id']}", json=_payload(cat, date="2026-09-22", amount=150.5, item="晚餐"))
    assert updated.status_code == 200, updated.text
    assert updated.json() == {**body, "date": "2026-09-22", "amount": 150.5, "item": "晚餐", "note": None}

    assert client.delete(f"{EXPENSES_URL}/{body['id']}").status_code == 204
    assert db.get(Expense, body["id"]) is None
    assert_api_error(client.delete(f"{EXPENSES_URL}/{body['id']}"), 404, errors.NOT_FOUND)


def test_amount_zero_rejected(client: TestClient, db: Session, user_id: int) -> None:
    """TC-NEG-EXPENSE-004／REQ-EXPENSE-001：金額 0 → 400，fields.amount「金額不可為0」。"""
    cat = _active_category(db, user_id)
    err = assert_api_error(client.post(EXPENSES_URL, json=_payload(cat, amount=0)), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"amount": "金額不可為0"}
    assert err["message"] == "資料格式有誤"


def test_negative_amount_refund_accepted(client: TestClient, db: Session, user_id: int) -> None:
    """TC-FUNC-EXPENSE-005／REQ-EXPENSE-001：負數金額（退款）→ 201 正常寫入。"""
    cat = _active_category(db, user_id)
    resp = client.post(EXPENSES_URL, json=_payload(cat, amount=-500, item="退貨", date="2026-09-23"))
    assert resp.status_code == 201, resp.text
    assert resp.json()["amount"] == -500
    assert db.get(Expense, resp.json()["id"]).amount == Decimal("-500")


def test_expense_validation_messages_from_srs(client: TestClient, db: Session, user_id: int) -> None:
    """欄位檢核失敗 → 400，fields 逐字用 SRS 4.5 欄位規格表文案；區間錯誤也是 400。"""
    err = assert_api_error(client.post(EXPENSES_URL, json={}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"amount": "金額不可為0", "item": "請輸入品項", "category_id": "請選擇分類", "payment_method": "請選擇支付方式"}

    cat = _active_category(db, user_id)
    bad = _payload(cat, date="2026-02-30", item="", payment_method="bitcoin", note="x" * 101)
    err = assert_api_error(client.post(EXPENSES_URL, json=bad), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"date": "請選擇日期", "item": "請輸入品項", "payment_method": "請選擇支付方式", "note": "備註最多100字"}

    # 不存在的分類 → 同一句「請選擇分類」
    err = assert_api_error(client.post(EXPENSES_URL, json=_payload(cat, category_id=999_999)), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"category_id": "請選擇分類"}

    err = assert_api_error(client.get(EXPENSES_URL, params={"start_date": "2026-09-30", "end_date": "2026-09-01"}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"end_date": "結束日不可早於起始日"}
    err = assert_api_error(client.get(EXPENSES_URL, params={"start_date": "2026/09/01"}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"start_date": "日期格式須為 YYYY-MM-DD"}


# --- 3.5 信用卡欄位規則 ----------------------------------------------------------------


def test_card_id_rule_per_payment_method(client: TestClient, db: Session, user_id: int) -> None:
    """3.5：credit_card 必填；mobile_pay 選填（有填＝綁卡）；cash／transfer 必須為 null。"""
    cat = _active_category(db, user_id)
    card = _card(db, user_id)

    err = assert_api_error(client.post(EXPENSES_URL, json=_payload(cat, payment_method="credit_card")), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"card_id": "請選擇信用卡"}
    assert client.post(EXPENSES_URL, json=_payload(cat, payment_method="credit_card", card_id=card.id, date="2026-09-23")).status_code == 201

    assert client.post(EXPENSES_URL, json=_payload(cat, payment_method="mobile_pay", date="2026-09-23")).status_code == 201
    bound = client.post(EXPENSES_URL, json=_payload(cat, payment_method="mobile_pay", card_id=card.id, date="2026-09-23"))
    assert bound.status_code == 201 and bound.json()["card_id"] == card.id

    for method in ("cash", "transfer"):
        err = assert_api_error(
            client.post(EXPENSES_URL, json=_payload(cat, payment_method=method, card_id=card.id)), 400, errors.VALIDATION_ERROR
        )
        assert err["fields"] == {"card_id": "此支付方式不可指定信用卡"}
        assert client.post(EXPENSES_URL, json=_payload(cat, payment_method=method, date="2026-09-23")).status_code == 201

    # 不存在的卡 → 「請選擇信用卡」
    err = assert_api_error(
        client.post(EXPENSES_URL, json=_payload(cat, payment_method="credit_card", card_id=999_999)), 400, errors.VALIDATION_ERROR
    )
    assert err["fields"] == {"card_id": "請選擇信用卡"}


# --- 3.6 停用中的參照 -------------------------------------------------------------------


def test_inactive_category_or_card_rejected_on_create_but_kept_when_unchanged(
    client: TestClient, db: Session, user_id: int
) -> None:
    """3.6：新增時分類／卡片須啟用中（400 INACTIVE_REFERENCE）；編輯時未改變的欄位可沿用停用值。"""
    cat = _active_category(db, user_id)
    card = _card(db, user_id)
    created = client.post(
        EXPENSES_URL, json=_payload(cat, payment_method="credit_card", card_id=card.id, date="2026-09-23")
    ).json()

    inactive_cat = Category(user_id=user_id, group_id=cat.group_id, name="停用分類", sort_order=99, is_active=False)
    db.add(inactive_cat)
    card.is_active = False
    db.flush()

    err = assert_api_error(
        client.post(EXPENSES_URL, json=_payload(inactive_cat, date="2026-09-23")), 400, errors.INACTIVE_REFERENCE
    )
    assert err["fields"] == {"category_id": "請選擇分類"}
    err = assert_api_error(
        client.post(EXPENSES_URL, json=_payload(cat, payment_method="credit_card", card_id=card.id, date="2026-09-23")),
        400,
        errors.INACTIVE_REFERENCE,
    )
    assert err["fields"] == {"card_id": "請選擇信用卡"}

    # 停用舊卡後，仍可修改用那張卡的舊花費（card_id 未改變）
    kept = client.put(
        f"{EXPENSES_URL}/{created['id']}",
        json=_payload(cat, payment_method="credit_card", card_id=card.id, date="2026-09-23", note="補備註"),
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["note"] == "補備註" and kept.json()["card_id"] == card.id

    # 但改成另一個停用值不行
    other_inactive = _card(db, user_id, is_active=False)
    assert_api_error(
        client.put(
            f"{EXPENSES_URL}/{created['id']}",
            json=_payload(cat, payment_method="credit_card", card_id=other_inactive.id, date="2026-09-23"),
        ),
        400,
        errors.INACTIVE_REFERENCE,
    )
    assert_api_error(
        client.put(
            f"{EXPENSES_URL}/{created['id']}",
            json=_payload(inactive_cat, payment_method="credit_card", card_id=card.id, date="2026-09-23"),
        ),
        400,
        errors.INACTIVE_REFERENCE,
    )


# --- 行為時鐘（REQ-EXPENSE-004）與時區（REQ-WEEK-005） --------------------------------------


def test_credit_card_uses_purchase_date_not_statement_date(client: TestClient, db: Session, user_id: int) -> None:
    """TC-FUNC-EXPENSE-002／REQ-EXPENSE-004：信用卡消費以消費日所屬週計入，不是結帳日／繳款日所屬週。

    卡片結帳日 5、繳款日 20；消費日 2026-09-23（W39）。結帳日 10/5（W41）與繳款日 10/20（W43）都在不同週。
    """
    cat = _active_category(db, user_id)
    card = _card(db, user_id, statement_day=5)
    purchase = date(2026, 9, 23)
    statement = date(2026, 10, 5)
    due = date(2026, 10, 20)
    assert week_rule.week_of(purchase) not in (week_rule.week_of(statement), week_rule.week_of(due))

    created = client.post(
        EXPENSES_URL, json=_payload(cat, payment_method="credit_card", card_id=card.id, date=purchase.isoformat())
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["date"] == purchase.isoformat()

    start, end = _week_range(purchase)
    assert body in client.get(EXPENSES_URL, params={"start_date": start, "end_date": end}).json()
    for other in (statement, due):
        start, end = _week_range(other)
        assert body not in client.get(EXPENSES_URL, params={"start_date": start, "end_date": end}).json()


def test_late_night_expense_correct_date(
    client: TestClient, db: Session, user_id: int, monkeypatch: pytest.MonkeyPatch
) -> None:
    """TC-EDGE-EXPENSE-003／REQ-WEEK-005：date 留空 → 伺服器以 Asia/Taipei 的今天為預設，不用 UTC。

    凍結在台北 2026-09-23 23:30（UTC 15:30）→ 記 09-23；再凍結在台北 09-24 00:30（UTC 09-23 16:30）→ 記 09-24，
    用 UTC 會錯記成 09-23。
    """
    cat = _active_category(db, user_id)

    _freeze(monkeypatch, datetime(2026, 9, 23, 15, 30, tzinfo=timezone.utc))  # 台北 23:30
    assert week_rule.today_taipei() == date(2026, 9, 23)
    resp = client.post(EXPENSES_URL, json=_payload(cat))  # 沒有 date
    assert resp.status_code == 201, resp.text
    assert resp.json()["date"] == "2026-09-23"

    _freeze(monkeypatch, datetime(2026, 9, 23, 16, 30, tzinfo=timezone.utc))  # 台北 09-24 00:30
    resp = client.post(EXPENSES_URL, json=_payload(cat))
    assert resp.status_code == 201, resp.text
    assert resp.json()["date"] == "2026-09-24"
    assert resp.json()["date"] != datetime(2026, 9, 23, 16, 30, tzinfo=timezone.utc).date().isoformat()


# --- 3.7 已結算月份（REQ-EXPENSE-005） ------------------------------------------------------


def test_settled_month_blocks_backfill(client: TestClient, db: Session, user_id: int) -> None:
    """TC-NEG-EXPENSE-006／REQ-EXPENSE-005：該月已結算 → POST 該月內日期 → 409，訊息提示須先取消結算。"""
    cat = _active_category(db, user_id)
    _settle(db, user_id, "2026-08")
    target = date(2026, 8, 12)  # 週三，週四 8/13 → 屬 8 月
    assert game_month_of(target) == "2026-08"

    err = assert_api_error(client.post(EXPENSES_URL, json=_payload(cat, date=target.isoformat())), 409, errors.MONTH_SETTLED)
    assert "2026-08" in err["message"] and "取消結算" in err["message"]
    assert err["fields"] is None


def test_settlement_uses_game_month_not_calendar_month(client: TestClient, db: Session, user_id: int) -> None:
    """3.7 情境 1：日曆月與遊戲月不同的補登。2026-09-29 屬 2026-W40（週四 10/1）→ 歸 10 月。

    只結算 9 月：9/29 可寫（它不是 9 月的關卡）；再結算 10 月：9/29 被擋，訊息說的是 10 月。
    """
    cat = _active_category(db, user_id)
    straddling = date(2026, 9, 29)
    assert straddling.month == 9 and game_month_of(straddling) == "2026-10"

    _settle(db, user_id, "2026-09")
    ok = client.post(EXPENSES_URL, json=_payload(cat, date=straddling.isoformat()))
    assert ok.status_code == 201, ok.text
    # 反過來：9/27（週日，屬 W39，週四 9/24 → 9 月）被 9 月的結算擋下
    blocked_sep = client.post(EXPENSES_URL, json=_payload(cat, date="2026-09-27"))
    assert_api_error(blocked_sep, 409, errors.MONTH_SETTLED)
    assert "2026-09" in blocked_sep.json()["error"]["message"]

    _settle(db, user_id, "2026-10")
    blocked = assert_api_error(client.post(EXPENSES_URL, json=_payload(cat, date=straddling.isoformat())), 409, errors.MONTH_SETTLED)
    assert "2026-10" in blocked["message"]


def test_put_moving_into_settled_month_returns_409(client: TestClient, db: Session, user_id: int) -> None:
    """3.7 情境 2：PUT 把日期從未結算月份移入已結算月份 → 409，資料不變。"""
    cat = _active_category(db, user_id)
    created = client.post(EXPENSES_URL, json=_payload(cat, date="2026-11-10")).json()
    _settle(db, user_id, "2026-10")

    resp = client.put(f"{EXPENSES_URL}/{created['id']}", json=_payload(cat, date="2026-10-14"))
    err = assert_api_error(resp, 409, errors.MONTH_SETTLED)
    assert "2026-10" in err["message"]
    db.expire_all()
    assert db.get(Expense, created["id"]).date == date(2026, 11, 10)


def test_put_moving_out_of_settled_month_returns_409(client: TestClient, db: Session, user_id: int) -> None:
    """3.7 情境 3：花費原本在已結算月份，PUT 改到未結算月份（或只改備註）→ 409；DELETE 也 409。"""
    cat = _active_category(db, user_id)
    created = client.post(EXPENSES_URL, json=_payload(cat, date="2026-10-14")).json()
    _settle(db, user_id, "2026-10")

    moved_out = client.put(f"{EXPENSES_URL}/{created['id']}", json=_payload(cat, date="2026-11-10"))
    err = assert_api_error(moved_out, 409, errors.MONTH_SETTLED)
    assert "2026-10" in err["message"]
    same_month_edit = client.put(f"{EXPENSES_URL}/{created['id']}", json=_payload(cat, date="2026-10-14", note="改備註"))
    assert_api_error(same_month_edit, 409, errors.MONTH_SETTLED)
    assert_api_error(client.delete(f"{EXPENSES_URL}/{created['id']}"), 409, errors.MONTH_SETTLED)

    db.expire_all()
    still = db.get(Expense, created["id"])
    assert still is not None and still.date == date(2026, 10, 14) and still.note is None


def test_unsettled_month_allows_create_update_delete(client: TestClient, db: Session, user_id: int) -> None:
    """3.7 情境 4：相鄰月份已結算不影響未結算月份的正常寫入、修改、刪除。"""
    cat = _active_category(db, user_id)
    _settle(db, user_id, "2026-10")
    _settle(db, user_id, "2026-12")

    created = client.post(EXPENSES_URL, json=_payload(cat, date="2026-11-10"))
    assert created.status_code == 201, created.text
    moved = client.put(f"{EXPENSES_URL}/{created.json()['id']}", json=_payload(cat, date="2026-11-25", note="ok"))
    assert moved.status_code == 200, moved.text
    assert client.delete(f"{EXPENSES_URL}/{created.json()['id']}").status_code == 204


# --- 使用者隔離（3.2） -------------------------------------------------------------


def test_other_users_expenses_are_invisible(
    client: TestClient, db: Session, user_id: int, other_user_id: int
) -> None:
    """別人的花費：GET 清單不出現；PUT／DELETE 回 404；引用別人的分類／卡片視同不存在（400）。"""
    other_group = CategoryGroup(
        user_id=other_user_id, code="FOOD", name="食", necessity="necessary", counts_toward_target=True,
        sort_order=1, is_system=True,
    )
    db.add(other_group)
    db.flush()
    other_cat = Category(user_id=other_user_id, group_id=other_group.id, name="別人的", sort_order=1)
    other_card = _card(db, other_user_id)
    db.add(other_cat)
    db.flush()
    other_expense = Expense(
        user_id=other_user_id, date=date(2026, 9, 23), amount=Decimal("999"), item="別人的花費",
        category_id=other_cat.id, payment_method="cash",
    )
    db.add(other_expense)
    db.flush()

    listed = client.get(EXPENSES_URL, params={"start_date": "2026-09-23", "end_date": "2026-09-23"}).json()
    assert other_expense.id not in {e["id"] for e in listed}
    assert other_expense.id not in {e["id"] for e in client.get(EXPENSES_URL).json()}

    mine = _active_category(db, user_id)
    assert_api_error(client.put(f"{EXPENSES_URL}/{other_expense.id}", json=_payload(mine, date="2026-09-23")), 404, errors.NOT_FOUND)
    assert_api_error(client.delete(f"{EXPENSES_URL}/{other_expense.id}"), 404, errors.NOT_FOUND)

    err = assert_api_error(client.post(EXPENSES_URL, json=_payload(other_cat, date="2026-09-23")), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"category_id": "請選擇分類"}
    err = assert_api_error(
        client.post(EXPENSES_URL, json=_payload(mine, payment_method="credit_card", card_id=other_card.id, date="2026-09-23")),
        400,
        errors.VALIDATION_ERROR,
    )
    assert err["fields"] == {"card_id": "請選擇信用卡"}

    # 別人的結算不影響我
    _settle(db, other_user_id, "2026-09")
    assert client.post(EXPENSES_URL, json=_payload(mine, date="2026-09-23")).status_code == 201

    db.expire_all()
    assert db.get(Expense, other_expense.id).item == "別人的花費"
