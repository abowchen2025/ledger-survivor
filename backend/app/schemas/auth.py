from pydantic import BaseModel


class MeResponse(BaseModel):
    """目前請求被視為哪個使用者（REQ-AUTH-001：初版固定 user_id=1）。"""

    user_id: int
