"""健康檢查（REQ-NFR-008，規格見 docs/spec-gaps.md 第 6 節）。

- liveness：程序活著就算，不查任何依賴。
- readiness：資料庫可連，且 ``alembic_version`` 等於程式碼的 head revision。
  任一不符即為 degraded；Railway 的 Healthcheck Path 指向 readiness，
  讓「服務活著但 migration 沒跑」的部署直接失敗，而不是靜靜上線。

不透露連線字串或例外內容（REQ-NFR-004 的精神）：回應只給 ok／error 與 revision 字串，
細節寫 log。
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import ProgrammingError, SQLAlchemyError

logger = logging.getLogger(__name__)

# backend/alembic（與 alembic.ini 的 script_location 相同，但不經 ini，避免 Windows cp950 讀檔問題）
ALEMBIC_DIR = Path(__file__).resolve().parents[2] / "alembic"


def code_head_revision() -> str:
    """程式碼裡 alembic 的 head revision；多個 head 視為錯誤（分支未合併）。"""
    cfg = Config()
    cfg.set_main_option("script_location", str(ALEMBIC_DIR))
    heads = ScriptDirectory.from_config(cfg).get_heads()
    if len(heads) != 1:
        raise RuntimeError(f"expected exactly one alembic head, got {heads!r}")
    return heads[0]


@dataclass(frozen=True)
class ReadinessResult:
    db_ok: bool
    db_revision: str | None  # None：連不上，或 alembic_version 表不存在（migration 從未跑）
    code_head: str

    @property
    def migration_ok(self) -> bool:
        return self.db_ok and self.db_revision == self.code_head

    @property
    def ready(self) -> bool:
        return self.db_ok and self.migration_ok

    def to_payload(self) -> dict:
        return {
            "status": "ok" if self.ready else "degraded",
            "checks": {
                "db": "ok" if self.db_ok else "error",
                "migration": {
                    "ok": self.migration_ok,
                    "db_revision": self.db_revision,
                    "code_head": self.code_head,
                },
            },
        }


def check_readiness(engine: Engine) -> ReadinessResult:
    """連一次 DB，讀 alembic_version；連線失敗或表不存在都回 degraded，不丟例外。"""
    code_head = code_head_revision()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            try:
                row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
            except ProgrammingError:
                # alembic_version 不存在：資料庫是空的，migration 從未執行
                conn.rollback()
                logger.warning("readiness: alembic_version table missing (migrations never ran)")
                return ReadinessResult(db_ok=True, db_revision=None, code_head=code_head)
    except SQLAlchemyError:
        logger.exception("readiness: database connection failed")
        return ReadinessResult(db_ok=False, db_revision=None, code_head=code_head)

    db_revision = row[0] if row else None
    if db_revision != code_head:
        logger.warning("readiness: db revision %r != code head %r", db_revision, code_head)
    return ReadinessResult(db_ok=True, db_revision=db_revision, code_head=code_head)
