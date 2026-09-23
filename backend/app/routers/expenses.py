"""花費記錄（SRS 4.5）。路由只做參數接收與回應，業務規則在 services/expenses.py。

- GET    /expenses?start_date&end_date   花費列表（消費日區間，兩端皆含、皆可省略）／400
- POST   /expenses                       201／400／409（所屬月份已結算）
- PUT    /expenses/{id}                  200／400／404／409
- DELETE /expenses/{id}                  204／404／409
"""

from fastapi import APIRouter, Response, status

from app.deps import CurrentUserId, DbSession
from app.schemas.common import error_responses
from app.schemas.expense import ExpenseCreate, ExpenseOut, ExpenseUpdate
from app.services import expenses as service

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("", response_model=list[ExpenseOut], responses=error_responses(400))
def list_expenses(
    db: DbSession,
    user_id: CurrentUserId,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[ExpenseOut]:
    return [ExpenseOut.model_validate(e) for e in service.list_expenses(db, user_id, start_date, end_date)]


@router.post(
    "",
    response_model=ExpenseOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 409),
)
def create_expense(payload: ExpenseCreate, db: DbSession, user_id: CurrentUserId) -> ExpenseOut:
    return ExpenseOut.model_validate(service.create_expense(db, user_id, payload))


@router.put("/{expense_id}", response_model=ExpenseOut, responses=error_responses(400, 404, 409))
def update_expense(
    expense_id: int, payload: ExpenseUpdate, db: DbSession, user_id: CurrentUserId
) -> ExpenseOut:
    return ExpenseOut.model_validate(service.update_expense(db, user_id, expense_id, payload))


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(404, 409),
)
def delete_expense(expense_id: int, db: DbSession, user_id: CurrentUserId) -> Response:
    service.delete_expense(db, user_id, expense_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
