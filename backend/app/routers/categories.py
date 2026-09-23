"""消費分類體系（SRS 4.7）。路由只做參數接收與回應，業務規則在 services/categories.py。

- GET  /category-groups          一級分類清單（沒有 DELETE：內建類不可刪，REQ-CATEGORY-002）
- GET  /categories?group_id=     二級分類清單（含停用）
- POST /categories               201
- PUT  /categories/{id}          200／400／404／409
- DELETE /categories/{id}        204 真刪除；已被 expenses 引用 → 200 + 已停用的資料（REQ-CATEGORY-007）
"""

from fastapi import APIRouter, Response, status

from app.deps import CurrentUserId, DbSession
from app.schemas.category import CategoryCreate, CategoryGroupOut, CategoryOut, CategoryUpdate
from app.schemas.common import error_responses
from app.services import categories as service

router = APIRouter(tags=["categories"])


@router.get("/category-groups", response_model=list[CategoryGroupOut])
def list_category_groups(db: DbSession, user_id: CurrentUserId) -> list[CategoryGroupOut]:
    return [CategoryGroupOut.model_validate(g) for g in service.list_groups(db, user_id)]


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    db: DbSession, user_id: CurrentUserId, group_id: int | None = None
) -> list[CategoryOut]:
    return [CategoryOut.model_validate(c) for c in service.list_categories(db, user_id, group_id)]


@router.post(
    "/categories",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 409),
)
def create_category(payload: CategoryCreate, db: DbSession, user_id: CurrentUserId) -> CategoryOut:
    return CategoryOut.model_validate(service.create_category(db, user_id, payload))


@router.put(
    "/categories/{category_id}",
    response_model=CategoryOut,
    responses=error_responses(400, 404, 409),
)
def update_category(
    category_id: int, payload: CategoryUpdate, db: DbSession, user_id: CurrentUserId
) -> CategoryOut:
    return CategoryOut.model_validate(service.update_category(db, user_id, category_id, payload))


@router.delete(
    "/categories/{category_id}",
    response_model=CategoryOut | None,
    responses={
        **error_responses(404),
        status.HTTP_200_OK: {"model": CategoryOut, "description": "已被花費引用，改為停用並回傳資料"},
        status.HTTP_204_NO_CONTENT: {"description": "從未被引用，已真刪除"},
    },
)
def delete_category(category_id: int, db: DbSession, user_id: CurrentUserId) -> CategoryOut | Response:
    deactivated = service.delete_category(db, user_id, category_id)
    if deactivated is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return CategoryOut.model_validate(deactivated)
