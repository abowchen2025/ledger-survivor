"""SQLAlchemy 2.x engine 與 session 管理（同步 psycopg 3）。"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# connect_timeout：DB 連不上時 5 秒內失敗。沒有它，Windows／某些網路會等 TCP 逾時（實測 2 分鐘），
# /health/ready 會卡住，Railway healthcheck 也會誤判。
engine = create_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency：每個 request 一個 session。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
