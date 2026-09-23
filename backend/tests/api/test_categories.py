"""消費分類體系 API（SRS 4.7；TC-FUNC-CATEGORY-001、TC-FUNC-CATEGORY-005；使用者隔離 3.2）。

自訂一級分類（TC-NEG-CATEGORY-002／003、TC-FUNC-CATEGORY-004／006）屬 Phase 3，本檔不寫。
內建分類來自 migration 0002 的 seed（user 1）；本檔不假設資料庫其他表為空。
"""

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import errors
from app.models import Category, CategoryGroup, Expense
from tests.conftest import assert_api_error

pytestmark = pytest.mark.p0

GROUPS_URL = "/api/v1/category-groups"
CATEGORIES_URL = "/api/v1/categories"


def _group(db: Session, user_id: int, code: str = "FOOD") -> CategoryGroup:
    group = db.scalar(select(CategoryGroup).where(CategoryGroup.user_id == user_id, CategoryGroup.code == code))
    assert group is not None, f"seed 缺少 {code}"
    return group


def _category(db: Session, user_id: int, group: CategoryGroup) -> Category:
    cat = db.scalar(
        select(Category)
        .where(Category.user_id == user_id, Category.group_id == group.id, Category.is_active.is_(True))
        .order_by(Category.sort_order)
    )
    assert cat is not None
    return cat


def _add_expense(db: Session, user_id: int, category_id: int, when: date = date(2026, 9, 1)) -> Expense:
    expense = Expense(
        user_id=user_id,
        date=when,
        amount=Decimal("100"),
        item="測試",
        category_id=category_id,
        payment_method="cash",
    )
    db.add(expense)
    db.flush()
    return expense


# --- 一級分類 -------------------------------------------------------------------


def test_list_category_groups_returns_seven_builtin(client: TestClient) -> None:
    """REQ-CATEGORY-001：seed 的 7 個內建一級分類，依 sort_order 排序，REWARD 不計入週花費。"""
    resp = client.get(GROUPS_URL)
    assert resp.status_code == 200, resp.text
    groups = resp.json()
    codes = [g["code"] for g in groups if g["is_system"]]
    assert codes == ["FOOD", "CLOTHING", "HOUSING", "TRANSPORT", "EDUCATION", "ENTERTAINMENT", "REWARD"]
    reward = next(g for g in groups if g["code"] == "REWARD")
    assert reward["counts_toward_target"] is False
    assert reward["necessity"] == "excluded"


def test_builtin_group_cannot_be_deleted(client: TestClient, db: Session, user_id: int) -> None:
    """TC-FUNC-CATEGORY-001／REQ-CATEGORY-002：對內建一級分類執行刪除 → 拒絕，資料不變。

    /category-groups 沒有 DELETE 操作（內建類不可刪；自訂類 Phase 3 也只能停用，REQ-CATEGORY-005）。
    目前 /category-groups/{id} 連路徑都不存在 → 404；Phase 3 加上 PUT 後同一請求會變成 405。兩者都是拒絕。
    """
    food = _group(db, user_id, "FOOD")
    resp = client.delete(f"{GROUPS_URL}/{food.id}")
    assert resp.status_code in (404, 405), resp.text
    db.expire_all()
    still = db.get(CategoryGroup, food.id)
    assert still is not None and still.is_active is True and still.is_system is True


# --- 二級分類 CRUD -----------------------------------------------------------------


def test_create_update_and_hard_delete_unreferenced_category(client: TestClient, db: Session, user_id: int) -> None:
    """REQ-CATEGORY-007：新增 → 排在該一級分類最後；修改；從未被引用 → 真刪除（204）。"""
    food = _group(db, user_id, "FOOD")
    existing_max = max(c["sort_order"] for c in client.get(CATEGORIES_URL, params={"group_id": food.id}).json())

    created = client.post(CATEGORIES_URL, json={"name": "宵夜", "group_id": food.id})
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["name"] == "宵夜" and body["group_id"] == food.id
    assert body["is_system"] is False and body["is_active"] is True
    assert body["sort_order"] == existing_max + 1
    cid = body["id"]

    clothing = _group(db, user_id, "CLOTHING")
    updated = client.put(f"{CATEGORIES_URL}/{cid}", json={"name": "深夜食堂", "group_id": clothing.id, "sort_order": 99})
    assert updated.status_code == 200, updated.text
    assert updated.json() == {**body, "name": "深夜食堂", "group_id": clothing.id, "sort_order": 99}

    listed = client.get(CATEGORIES_URL).json()
    assert any(c["id"] == cid and c["name"] == "深夜食堂" for c in listed)

    deleted = client.delete(f"{CATEGORIES_URL}/{cid}")
    assert deleted.status_code == 204, deleted.text
    assert deleted.content == b""
    assert db.get(Category, cid) is None
    assert client.delete(f"{CATEGORIES_URL}/{cid}").status_code == 404


def test_referenced_category_soft_deleted(client: TestClient, db: Session, user_id: int) -> None:
    """TC-FUNC-CATEGORY-005／REQ-CATEGORY-007：已被 expenses 引用 → 200、is_active=false、不硬刪、花費不受影響。"""
    food = _group(db, user_id, "FOOD")
    created = client.post(CATEGORIES_URL, json={"name": "待停用", "group_id": food.id}).json()
    expense = _add_expense(db, user_id, created["id"])

    resp = client.delete(f"{CATEGORIES_URL}/{created['id']}")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {**created, "is_active": False}

    db.expire_all()
    still = db.get(Category, created["id"])
    assert still is not None and still.is_active is False
    assert db.get(Expense, expense.id).category_id == created["id"]

    # 停用後仍在清單裡（前端以 is_active 呈現），並可用 PUT 重新啟用
    listed = client.get(CATEGORIES_URL, params={"group_id": food.id}).json()
    assert any(c["id"] == created["id"] and c["is_active"] is False for c in listed)
    reactivated = client.put(
        f"{CATEGORIES_URL}/{created['id']}", json={"name": "待停用", "group_id": food.id, "is_active": True}
    )
    assert reactivated.status_code == 200 and reactivated.json()["is_active"] is True


def test_category_validation_messages_from_srs(client: TestClient, db: Session, user_id: int) -> None:
    """欄位檢核失敗 → 400，fields 逐字用 SRS 4.7 二級分類欄位規格表的文案。"""
    food = _group(db, user_id, "FOOD")
    err = assert_api_error(client.post(CATEGORIES_URL, json={"group_id": food.id}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"name": "請輸入分類名稱"}
    err = assert_api_error(
        client.post(CATEGORIES_URL, json={"name": "十一個字十一個字十一個", "group_id": food.id}), 400, errors.VALIDATION_ERROR
    )
    assert err["fields"] == {"name": "請輸入分類名稱"}
    err = assert_api_error(client.post(CATEGORIES_URL, json={"name": "x"}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"group_id": "請選擇所屬一級分類"}
    # 不存在的一級分類 → 同一句
    err = assert_api_error(client.post(CATEGORIES_URL, json={"name": "x", "group_id": 999_999}), 400, errors.VALIDATION_ERROR)
    assert err["fields"] == {"group_id": "請選擇所屬一級分類"}


def test_duplicate_name_in_same_group_returns_409(client: TestClient, db: Session, user_id: int) -> None:
    """uq_categories_user_group_name：同一一級分類下同名 → 409 DUPLICATE_NAME；不同一級分類可同名。"""
    food = _group(db, user_id, "FOOD")
    clothing = _group(db, user_id, "CLOTHING")
    assert client.post(CATEGORIES_URL, json={"name": "同名", "group_id": food.id}).status_code == 201
    assert_api_error(
        client.post(CATEGORIES_URL, json={"name": "同名", "group_id": food.id}),
        409,
        errors.DUPLICATE_NAME,
        {"name": "同一一級分類下已有相同名稱的分類"},
    )
    assert client.post(CATEGORIES_URL, json={"name": "同名", "group_id": clothing.id}).status_code == 201


def test_inactive_group_rejected_on_create_but_kept_on_unchanged_update(
    client: TestClient, db: Session, user_id: int
) -> None:
    """3.6：新增時 group_id 須啟用中（400 INACTIVE_REFERENCE）；編輯時 group_id 未改變可沿用停用值。"""
    food = _group(db, user_id, "FOOD")
    created = client.post(CATEGORIES_URL, json={"name": "沿用", "group_id": food.id}).json()

    food.is_active = False
    db.flush()
    try:
        assert_api_error(
            client.post(CATEGORIES_URL, json={"name": "新的", "group_id": food.id}),
            400,
            errors.INACTIVE_REFERENCE,
            {"group_id": "請選擇所屬一級分類"},
        )
        kept = client.put(f"{CATEGORIES_URL}/{created['id']}", json={"name": "沿用改名", "group_id": food.id})
        assert kept.status_code == 200, kept.text
        other = client.post(CATEGORIES_URL, json={"name": "別組", "group_id": _group(db, user_id, "CLOTHING").id}).json()
        moved_in = client.put(f"{CATEGORIES_URL}/{other['id']}", json={"name": "別組", "group_id": food.id})
        assert_api_error(moved_in, 400, errors.INACTIVE_REFERENCE)
    finally:
        food.is_active = True
        db.flush()


# --- 使用者隔離（3.2） -------------------------------------------------------------


def test_other_users_categories_are_invisible(
    client: TestClient, db: Session, user_id: int, other_user_id: int
) -> None:
    """別人的一級／二級分類：清單不出現；PUT／DELETE by id 回 404；POST 引用別人的一級分類回 400。"""
    other_group = CategoryGroup(
        user_id=other_user_id, code="FOOD", name="食", necessity="necessary", counts_toward_target=True,
        sort_order=1, is_system=True, is_active=True,
    )
    db.add(other_group)
    db.flush()
    other_cat = Category(user_id=other_user_id, group_id=other_group.id, name="別人的", is_system=False, sort_order=1)
    db.add(other_cat)
    db.flush()

    assert other_group.id not in {g["id"] for g in client.get(GROUPS_URL).json()}
    assert other_cat.id not in {c["id"] for c in client.get(CATEGORIES_URL).json()}
    assert client.get(CATEGORIES_URL, params={"group_id": other_group.id}).json() == []

    payload = {"name": "改名", "group_id": other_group.id}
    assert_api_error(client.put(f"{CATEGORIES_URL}/{other_cat.id}", json=payload), 404, errors.NOT_FOUND)
    assert_api_error(client.delete(f"{CATEGORIES_URL}/{other_cat.id}"), 404, errors.NOT_FOUND)
    assert_api_error(client.post(CATEGORIES_URL, json={"name": "偷用", "group_id": other_group.id}), 400, errors.VALIDATION_ERROR)

    db.expire_all()
    assert db.get(Category, other_cat.id).name == "別人的"
