"""健康檢查端點（REQ-NFR-008）。路由不放業務邏輯，就緒檢查在 services/health.py。

- GET /health        固定回 {"status": "ok"}（維持既有行為，現有測試與文件指向它）
- GET /health/live   liveness：只回 ok，不查依賴
- GET /health/ready  readiness：DB 可連 + alembic_version == 程式碼 head，否則 503 degraded
                     Railway 的 Healthcheck Path 指向這裡
"""

from fastapi import APIRouter, Response, status

from app import database
from app.schemas.health import HealthResponse, ReadinessResponse
from app.services.health import check_readiness

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/health/live", response_model=HealthResponse)
def health_live() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ReadinessResponse}},
)
def health_ready(response: Response) -> ReadinessResponse:
    result = check_readiness(database.engine)
    if not result.ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse.model_validate(result.to_payload())
