"""信用卡主檔（SRS 4.2）。路由只做參數接收與回應，業務規則在 services/cards.py。

- GET    /cards          卡片清單（含停用）
- POST   /cards          201（含推算 due_month_offset）／400
- PUT    /cards/{id}     200／400／404
- DELETE /cards/{id}     204／403（已被 expenses 或 installments 引用，提示改用停用）／404
"""

from fastapi import APIRouter, Response, status

from app.deps import CurrentUserId, DbSession
from app.schemas.card import CardCreate, CardOut, CardUpdate
from app.schemas.common import error_responses
from app.services import cards as service

router = APIRouter(prefix="/cards", tags=["cards"])


@router.get("", response_model=list[CardOut])
def list_cards(db: DbSession, user_id: CurrentUserId) -> list[CardOut]:
    return [CardOut.model_validate(c) for c in service.list_cards(db, user_id)]


@router.post(
    "",
    response_model=CardOut,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400),
)
def create_card(payload: CardCreate, db: DbSession, user_id: CurrentUserId) -> CardOut:
    return CardOut.model_validate(service.create_card(db, user_id, payload))


@router.put("/{card_id}", response_model=CardOut, responses=error_responses(400, 404))
def update_card(card_id: int, payload: CardUpdate, db: DbSession, user_id: CurrentUserId) -> CardOut:
    return CardOut.model_validate(service.update_card(db, user_id, card_id, payload))


@router.delete(
    "/{card_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(403, 404),
)
def delete_card(card_id: int, db: DbSession, user_id: CurrentUserId) -> Response:
    service.delete_card(db, user_id, card_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
