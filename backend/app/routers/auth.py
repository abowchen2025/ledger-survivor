"""認證模組（初版）。

GET /auth/me：回傳目前請求被視為的 user_id（REQ-AUTH-001：固定 1）。
這是 REQ-AUTH-000 閘門目前唯一受保護的端點，用途是讓 curl／前端能實際驗證
「正確金鑰回 200、缺少或錯誤回 401」與 CORS 預檢；Phase 3 換 JWT 後改回 token 內的 user_id。
不在 SRS 裡，缺口記在 docs/spec-gaps.md 第 5 節。
"""

from fastapi import APIRouter, Request

from app.schemas.auth import MeResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=MeResponse)
def me(request: Request) -> MeResponse:
    return MeResponse(user_id=request.app.state.settings.default_user_id)
