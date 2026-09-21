from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """GET /health 與 /health/live：只表示程序活著。"""

    status: Literal["ok"]


class MigrationCheck(BaseModel):
    ok: bool
    db_revision: str | None
    code_head: str


class ReadinessChecks(BaseModel):
    db: Literal["ok", "error"]
    migration: MigrationCheck


class ReadinessResponse(BaseModel):
    """GET /health/ready：200 時 status=ok；503 時 status=degraded，checks 說明哪一項不符。"""

    status: Literal["ok", "degraded"]
    checks: ReadinessChecks
