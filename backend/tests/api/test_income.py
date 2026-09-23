"""收入設定 API（SRS 4.1；TC-FUNC-INCOME-003、TC-NEG-INCOME-004；使用者隔離 3.2）。

TC-FUNC-INCOME-001（可支配計算）與 TC-NEG-INCOME-002（週鎖定）屬 Phase 2，本檔不寫。
DB 可能已有 user 1 的月薪紀錄（本機手動測試留下），所以月份一律用遠未來的年份避開。
"""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import errors
from app.models import ExtraIncome, MonthlyIncome, RecurringExpense
from tests.conftest import assert_api_error

pytestmark = pytest.mark.p0

# 用 2090 年避免撞到本機 DB 既有資料；交易會 rollback，不會留下
Y = "2090"


def income_url(month: str) -> str:
    return f"/api/v1/months/{month}/income"


EXTRA_URL = "/api/v1/extra-incomes"
RECURRING_URL = "/api/v1/recurring-expenses"


# --- 月薪與儲蓄目標 -------------------------------------------------------------------


def test_put_month_income_upserts_single_row(client: TestClient, db: Session, user_id: int) -> None:
    """REQ-INCOME-001：同一月第二次 PUT 是更新不是新增；回應 inherited_from 為 null。"""
    first = client.put(income_url(f"{Y}-03"), json={"salary": 50000, "savings_target": 5000})
    assert first.status_code == 200, first.text
    assert first.json() == {"month": f"{Y}-03", "salary": 50000, "savings_target": 5000, "inherited_from": None}

    second = client.put(income_url(f"{Y}-03"), json={"salary": 52000})
    assert second.status_code == 200, second.text
    assert second.json() == {"month": f"{Y}-03", "salary": 52000, "savings_target": 0, "inherited_from": None}

    rows = db.scalars(
        select(MonthlyIncome).where(MonthlyIncome.user_id == user_id, MonthlyIncome.month == f"{Y}-03")
    ).all()
    assert len(rows) == 1 and rows[0].salary == Decimal("52000") and rows[0].savings_target == Decimal("0")

    got = client.get(income_url(f"{Y}-03"))
    assert got.status_code == 200 and got.json() == second.json()


def test_new_month_defaults_to_prior_salary(client: TestClient, db: Session, user_id: int) -> None:
    """TC-FUNC-INCOME-003／REQ-INCOME-002：本月無紀錄 → 帶入上一有紀錄月份的值，inherited_from 標示來源，且不寫入。"""
    assert client.put(income_url(f"{Y}-01"), json={"salary": 48000, "savings_target": 3000}).status_code == 200
    # 之後的月份有紀錄不算「上一」；只往前找
    assert client.put(income_url(f"{Y}-06"), json={"salary": 99999, "savings_target": 1}).status_code == 200

    got = client.get(income_url(f"{Y}-04"))  # 02、03 都沒紀錄，跳過空月往前找到 01
    assert got.status_code == 200, got.text
    assert got.json() == {"month": f"{Y}-04", "salary": 48000, "savings_target": 3000, "inherited_from": f"{Y}-01"}

    # GET 沒有副作用：04 月仍無紀錄
    assert (
        db.scalar(select(MonthlyIncome).where(MonthlyIncome.user_id == user_id, MonthlyIncome.month == f"{Y}-04"))
        is None
    )
    # 覆寫後 inherited_from 變成 null
    put = client.put(income_url(f"{Y}-04"), json={"salary": 50000, "savings_target": 3000})
    assert put.json()["inherited_from"] is None
    assert client.get(income_url(f"{Y}-04")).json()["inherited_from"] is None


def test_month_income_without_any_record_returns_nulls(client: TestClient, db: Session, user_id: int) -> None:
    """任何月份都沒紀錄時金額為 null（前端顯示「尚未設定本月月薪」），不是 0，也不是 404。"""
    # 只看比 1900-01 更早的月份，一定沒有紀錄
    got = client.get(income_url("1900-01"))
    assert got.status_code == 200, got.text
    assert got.json() == {"month": "1900-01", "salary": None, "savings_target": None, "inherited_from": None}


def test_negative_salary_rejected(client: TestClient) -> None:
    """TC-NEG-INCOME-004／REQ-INCOME-001：月薪負數 → 400，fields.salary 為「月薪不可為負數」。"""
    err = assert_api_error(
        client.put(income_url(f"{Y}-05"), json={"salary": -1, "savings_target": 0}), 400, errors.VALIDATION_ERROR
    )
    assert err["fields"] == {"salary": "月薪不可為負數"}
    err = assert_api_error(
        client.put(income_url(f"{Y}-05"), json={"salary": 1000, "savings_target": -5}), 400, errors.VALIDATION_ERROR
    )
    assert err["fields"] == {"savings_target": "儲蓄目標不可為負數"}
    # 超過兩位小數也是同一句
    err = assert_api_error(client.put(income_url(f"{Y}-05"), json={"salary": 1000.123}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"salary": "月薪不可為負數"}


def test_month_path_format_validated(client: TestClient) -> None:
    """月份格式非 YYYY-MM → 400（SRS 4.1 API 表）。"""
    # "2026/09" 含斜線會變成另一條路徑（404），不是檢核問題，不列
    for bad in ("2026-13", "202609", "2026-9", "2026-00"):
        err = assert_api_error(client.get(income_url(bad)), 400, errors.VALIDATION_ERROR)
        assert err["fields"] == {"month": "月份格式須為 YYYY-MM"}
        assert_api_error(client.put(income_url(bad), json={"salary": 1}), 400, errors.VALIDATION_ERROR)


# --- 額外收入（REQ-INCOME-003） -----------------------------------------------------------


def test_extra_income_crud_and_month_filter(client: TestClient, db: Session) -> None:
    created = client.post(EXTRA_URL, json={"month": f"{Y}-02", "amount": 30000, "name": "年終"})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body == {"id": body["id"], "month": f"{Y}-02", "amount": 30000, "name": "年終"}
    other = client.post(EXTRA_URL, json={"month": f"{Y}-03", "amount": 1000, "name": "獎金"}).json()

    in_feb = client.get(EXTRA_URL, params={"month": f"{Y}-02"}).json()
    assert [r["id"] for r in in_feb] == [body["id"]]
    assert {r["id"] for r in client.get(EXTRA_URL).json()} >= {body["id"], other["id"]}

    updated = client.put(f"{EXTRA_URL}/{body['id']}", json={"month": f"{Y}-02", "amount": 35000.5, "name": "年終獎金"})
    assert updated.status_code == 200, updated.text
    assert updated.json() == {**body, "amount": 35000.5, "name": "年終獎金"}

    assert client.delete(f"{EXTRA_URL}/{body['id']}").status_code == 204
    assert db.get(ExtraIncome, body["id"]) is None
    assert_api_error(client.delete(f"{EXTRA_URL}/{body['id']}"), 404, errors.NOT_FOUND)


def test_extra_income_validation_messages(client: TestClient) -> None:
    err = assert_api_error(client.post(EXTRA_URL, json={"month": f"{Y}-02", "amount": 0, "name": ""}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"amount": "金額須大於0", "name": "請輸入收入名稱"}
    err = assert_api_error(client.post(EXTRA_URL, json={"month": "2026-9", "amount": 1, "name": "x"}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"month": "月份格式須為 YYYY-MM"}
    err = assert_api_error(client.get(EXTRA_URL, params={"month": "bad"}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"month": "月份格式須為 YYYY-MM"}


# --- 固定支出（REQ-INCOME-004） -----------------------------------------------------------


def test_recurring_expense_crud_and_active_month_filter(client: TestClient, db: Session) -> None:
    """起訖月篩選：start ≤ month ≤ end；end 為 null 表示持續生效；已過期的不列（TC-FUNC-INCOME-001 的資料面）。"""
    rent = client.post(RECURRING_URL, json={"name": "房租", "amount": 15000, "start_month": f"{Y}-01"})
    assert rent.status_code == 201, rent.text
    assert rent.json()["end_month"] is None
    gym = client.post(
        RECURRING_URL, json={"name": "健身房", "amount": 1500, "start_month": f"{Y}-02", "end_month": f"{Y}-04"}
    ).json()

    def ids(month: str) -> set[int]:
        return {r["id"] for r in client.get(RECURRING_URL, params={"month": month}).json()}

    assert ids(f"{Y}-01") >= {rent.json()["id"]} and gym["id"] not in ids(f"{Y}-01")  # 未開始
    assert {rent.json()["id"], gym["id"]} <= ids(f"{Y}-03")  # 兩者都生效
    assert gym["id"] in ids(f"{Y}-04")  # 結束月當月仍生效
    assert gym["id"] not in ids(f"{Y}-05") and rent.json()["id"] in ids(f"{Y}-05")  # 過期不列、無結束月持續

    updated = client.put(
        f"{RECURRING_URL}/{gym['id']}", json={"name": "健身房年約", "amount": 1200, "start_month": f"{Y}-02", "end_month": None}
    )
    assert updated.status_code == 200 and updated.json()["end_month"] is None

    assert client.delete(f"{RECURRING_URL}/{gym['id']}").status_code == 204
    assert db.get(RecurringExpense, gym["id"]) is None


def test_recurring_expense_validation_messages(client: TestClient) -> None:
    """end_month 早於 start_month → 400「結束月不可早於起始月」；其餘欄位用 SRS 文案。"""
    err = assert_api_error(
        client.post(RECURRING_URL, json={"name": "x", "amount": 1, "start_month": f"{Y}-05", "end_month": f"{Y}-04"}),
        400,
        errors.VALIDATION_ERROR,
    )
    assert err["fields"] == {"end_month": "結束月不可早於起始月"}
    err = assert_api_error(client.post(RECURRING_URL, json={"name": "", "amount": -1}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"name": "請輸入支出名稱", "amount": "金額須大於0", "start_month": "請選擇起始月份"}
    # 起訖同月合法
    assert client.post(
        RECURRING_URL, json={"name": "一次", "amount": 1, "start_month": f"{Y}-05", "end_month": f"{Y}-05"}
    ).status_code == 201


# --- 使用者隔離（3.2） -------------------------------------------------------------


def test_other_users_income_rows_are_invisible(
    client: TestClient, db: Session, user_id: int, other_user_id: int
) -> None:
    """別人的月薪不被沿用；別人的額外收入／固定支出清單不出現、PUT／DELETE 回 404。"""
    db.add(MonthlyIncome(user_id=other_user_id, month=f"{Y}-07", salary=Decimal("77777"), savings_target=Decimal("0")))
    extra = ExtraIncome(user_id=other_user_id, month=f"{Y}-08", amount=Decimal("500"), name="別人的獎金")
    recurring = RecurringExpense(user_id=other_user_id, name="別人的房租", amount=Decimal("9000"), start_month=f"{Y}-01")
    db.add_all([extra, recurring])
    db.flush()

    # 月薪：user 1 在 2090-08 沒有紀錄；別人的 2090-07 不得被當成「上一有紀錄月份」
    got = client.get(income_url(f"{Y}-08")).json()
    assert got["inherited_from"] != f"{Y}-07" and got["salary"] != 77777

    assert extra.id not in {r["id"] for r in client.get(EXTRA_URL).json()}
    assert client.get(EXTRA_URL, params={"month": f"{Y}-08"}).json() == []
    assert recurring.id not in {r["id"] for r in client.get(RECURRING_URL).json()}

    extra_payload = {"month": f"{Y}-08", "amount": 1, "name": "偷改"}
    assert_api_error(client.put(f"{EXTRA_URL}/{extra.id}", json=extra_payload), 404, errors.NOT_FOUND)
    assert_api_error(client.delete(f"{EXTRA_URL}/{extra.id}"), 404, errors.NOT_FOUND)
    rec_payload = {"name": "偷改", "amount": 1, "start_month": f"{Y}-01"}
    assert_api_error(client.put(f"{RECURRING_URL}/{recurring.id}", json=rec_payload), 404, errors.NOT_FOUND)
    assert_api_error(client.delete(f"{RECURRING_URL}/{recurring.id}"), 404, errors.NOT_FOUND)

    db.expire_all()
    assert db.get(ExtraIncome, extra.id).name == "別人的獎金"
    assert db.get(RecurringExpense, recurring.id).name == "別人的房租"
