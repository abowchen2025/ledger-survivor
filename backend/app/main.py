"""FastAPI 入口。Phase 0a 只掛 /api/v1/health。"""

from fastapi import FastAPI

from app.config import settings
from app.routers import health

app = FastAPI(
    title="Ledger Survivor API",
    version="0.1.0",
    debug=settings.debug,
)

app.include_router(health.router, prefix=settings.api_prefix)
