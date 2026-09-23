"""收入設定（SRS 4.1）。路由只做參數接收與回應，業務規則在 services/income.py。

- GET/PUT /months/{month}/income          月薪與儲蓄目標（GET 無紀錄時沿用上一有紀錄月份，不寫入）
- GET/POST/PUT/DELETE /extra-incomes      額外收入（GET 可帶 ?month=YYYY-MM）
- GET/POST/PUT/DELETE /recurring-expenses 固定支出（GET 可帶 ?month=YYYY-MM 只列該月生效者）

GET /months/{month}（月總覽）屬 Phase 2，不在此。
"""

from fastapi import APIRouter, Response, status

from app.deps import CurrentUserId, DbSession
from app.schemas.common import error_responses
from app.schemas.income import (
    ExtraIncomeCreate,
    ExtraIncomeOut,
    ExtraIncomeUpdate,
    MonthIncomeOut,
    MonthIncomeUpdate,
    RecurringExpenseCreate,
    RecurringExpenseOut,
    RecurringExpenseUpdate,
)
from app.services import income as service

router = APIRouter(tags=["income"])


# --- 月薪與儲蓄目標 -------------------------------------------------------------------


@router.get("/months/{month}/income", response_model=MonthIncomeOut, responses=error_responses(400))
def get_month_income(month: str, db: DbSession, user_id: CurrentUserId) -> MonthIncomeOut:
    return MonthIncomeOut.model_validate(service.get_month_income(db, user_id, month))


@router.put("/months/{month}/income", response_model=MonthIncomeOut, responses=error_responses(400))
def put_month_income(
    month: str, payload: MonthIncomeUpdate, db: DbSession, user_id: CurrentUserId
) -> MonthIncomeOut:
    return MonthIncomeOut.model_validate(service.upsert_month_income(db, user_id, month, payload))


# --- 額外收入 ----------------------------------------------------------------------------


@router.get("/extra-incomes", response_model=list[ExtraIncomeOut], responses=error_responses(400))
def list_extra_incomes(
    db: DbSession, user_id: CurrentUserId, month: str | None = None
) -> list[ExtraIncomeOut]:
    return [ExtraIncomeOut.model_validate(r) for r in service.list_extra_incomes(db, user_id, month)]


@router.post(
    "/extra-incomes",
    response_model=ExtraIncomeOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400),
)
def create_extra_income(payload: ExtraIncomeCreate, db: DbSession, user_id: CurrentUserId) -> ExtraIncomeOut:
    return ExtraIncomeOut.model_validate(service.create_extra_income(db, user_id, payload))


@router.put("/extra-incomes/{row_id}", response_model=ExtraIncomeOut, responses=error_responses(400, 404))
def update_extra_income(
    row_id: int, payload: ExtraIncomeUpdate, db: DbSession, user_id: CurrentUserId
) -> ExtraIncomeOut:
    return ExtraIncomeOut.model_validate(service.update_extra_income(db, user_id, row_id, payload))


@router.delete("/extra-incomes/{row_id}", status_code=status.HTTP_204_NO_CONTENT, responses=error_responses(404))
def delete_extra_income(row_id: int, db: DbSession, user_id: CurrentUserId) -> Response:
    service.delete_extra_income(db, user_id, row_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- 固定支出 ----------------------------------------------------------------------------


@router.get("/recurring-expenses", response_model=list[RecurringExpenseOut], responses=error_responses(400))
def list_recurring_expenses(
    db: DbSession, user_id: CurrentUserId, month: str | None = None
) -> list[RecurringExpenseOut]:
    return [RecurringExpenseOut.model_validate(r) for r in service.list_recurring_expenses(db, user_id, month)]


@router.post(
    "/recurring-expenses",
    response_model=RecurringExpenseOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400),
)
def create_recurring_expense(
    payload: RecurringExpenseCreate, db: DbSession, user_id: CurrentUserId
) -> RecurringExpenseOut:
    return RecurringExpenseOut.model_validate(service.create_recurring_expense(db, user_id, payload))


@router.put(
    "/recurring-expenses/{row_id}", response_model=RecurringExpenseOut, responses=error_responses(400, 404)
)
def update_recurring_expense(
    row_id: int, payload: RecurringExpenseUpdate, db: DbSession, user_id: CurrentUserId
) -> RecurringExpenseOut:
    return RecurringExpenseOut.model_validate(service.update_recurring_expense(db, user_id, row_id, payload))


@router.delete(
    "/recurring-expenses/{row_id}", status_code=status.HTTP_204_NO_CONTENT, responses=error_responses(404)
)
def delete_recurring_expense(row_id: int, db: DbSession, user_id: CurrentUserId) -> Response:
    service.delete_recurring_expense(db, user_id, row_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
