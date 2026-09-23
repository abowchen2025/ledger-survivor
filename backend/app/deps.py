"""FastAPI dependencies 共用型別。

- ``DbSession``：每個 request 一個 SQLAlchemy session（``database.get_db``）。
- ``CurrentUserId``：目前請求的使用者 id。**所有 service 查詢一律帶這個值過濾**，
  來源是認證 dependency，不是請求參數（3.2 使用者隔離）。初版固定 ``settings.default_user_id``（=1，
  REQ-AUTH-001）；Phase 3 改為 JWT 內的 ``user_id``，routers／services 不用改。
"""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db


def get_current_user_id(request: Request) -> int:
    return int(request.app.state.settings.default_user_id)


DbSession = Annotated[Session, Depends(get_db)]
CurrentUserId = Annotated[int, Depends(get_current_user_id)]
