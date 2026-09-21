"""SQLAlchemy 2.x engine 與 session 管理（同步 psycopg 3）。"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, echo=settings.debug, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency：每個 request 一個 session。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
