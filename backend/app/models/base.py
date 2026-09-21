from decimal import Decimal

from sqlalchemy import CheckConstraint, Numeric, String
from sqlalchemy.orm import DeclarativeBase

# 金額統一 NUMERIC(12,2)；月份統一 'YYYY-MM' 字串
Money = Numeric(12, 2)
MonthStr = String(7)

# 'YYYY-MM' 格式：月份只能是 01～12（與 alembic/versions/0001 一致）
MONTH_PATTERN = "^[0-9]{4}-(0[1-9]|1[0-2])$"


def month_check(column: str, table: str, nullable: bool = False) -> CheckConstraint:
    """月份欄位格式 CHECK；名稱 ck_{table}_{column}_format，與 migration 同名。"""
    expr = f"{column} ~ '{MONTH_PATTERN}'"
    if nullable:
        expr = f"{column} IS NULL OR {expr}"
    return CheckConstraint(expr, name=f"ck_{table}_{column}_format")


def in_check(column: str, values: tuple[str, ...], name: str) -> CheckConstraint:
    """列舉欄位用字串 + CHECK，不用 PostgreSQL 原生 ENUM（ADR-0003）。"""
    quoted = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({quoted})", name=name)


class Base(DeclarativeBase):
    type_annotation_map = {Decimal: Money}
