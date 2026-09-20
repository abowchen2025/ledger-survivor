"""initial schema: 12 tables from SRS+FS v1.2 chapter 3

Revision ID: 0001
Revises:
Create Date: 2026-09-16

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MONEY = sa.Numeric(12, 2)
MONTH = sa.String(7)  # 'YYYY-MM'

# 列舉欄位一律用字串 + CHECK，不用 PostgreSQL 原生 ENUM（ADR-0003）
NECESSITY_VALUES = ("necessary", "flexible", "want", "excluded")
PAYMENT_METHOD_VALUES = ("cash", "credit_card", "mobile_pay", "transfer")
GRADE_VALUES = ("S", "A", "B", "C", "DEAD")

# 'YYYY-MM' 格式檢查：月份只能是 01～12，防止寫進 2026-13
MONTH_PATTERN = "^[0-9]{4}-(0[1-9]|1[0-2])$"


def _month_check(column: str, table: str, nullable: bool = False) -> sa.CheckConstraint:
    expr = f"{column} ~ '{MONTH_PATTERN}'"
    if nullable:
        expr = f"{column} IS NULL OR {expr}"
    return sa.CheckConstraint(expr, name=f"ck_{table}_{column}_format")


def _in_check(column: str, values: tuple[str, ...], name: str) -> sa.CheckConstraint:
    quoted = ", ".join(f"'{v}'" for v in values)
    return sa.CheckConstraint(f"{column} IN ({quoted})", name=name)


def upgrade() -> None:
    # users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )

    # monthly_incomes — unique(user_id, month)
    op.create_table(
        "monthly_incomes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("month", MONTH, nullable=False),
        sa.Column("salary", MONEY, nullable=False),
        sa.Column("savings_target", MONEY, nullable=False),
        sa.Column("note", sa.Text()),
        sa.UniqueConstraint("user_id", "month", name="uq_monthly_incomes_user_month"),
        _month_check("month", "monthly_incomes"),
    )
    op.create_index("ix_monthly_incomes_user_id", "monthly_incomes", ["user_id"])

    # extra_incomes
    op.create_table(
        "extra_incomes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("month", MONTH, nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        _month_check("month", "extra_incomes"),
    )
    op.create_index("ix_extra_incomes_user_id", "extra_incomes", ["user_id"])

    # recurring_expenses — end_month 可 null，若填須 ≥ start_month
    op.create_table(
        "recurring_expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("start_month", MONTH, nullable=False),
        sa.Column("end_month", MONTH),
        sa.CheckConstraint(
            "end_month IS NULL OR end_month >= start_month",
            name="ck_recurring_expenses_end_after_start",
        ),
        _month_check("start_month", "recurring_expenses"),
        _month_check("end_month", "recurring_expenses", nullable=True),
    )
    op.create_index("ix_recurring_expenses_user_id", "recurring_expenses", ["user_id"])

    # credit_cards — 只存 last4；is_active 預設 true
    op.create_table(
        "credit_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(20), nullable=False),
        sa.Column("bank", sa.String(20), nullable=False),
        sa.Column("last4", sa.String(4), nullable=False),
        sa.Column("statement_day", sa.SmallInteger(), nullable=False),
        sa.Column("due_day", sa.SmallInteger(), nullable=False),
        sa.Column("due_month_offset", sa.SmallInteger(), nullable=False),
        sa.Column("opening_billed_unpaid", MONEY, nullable=False),
        sa.Column("opening_unbilled", MONEY, nullable=False),
        sa.Column("opening_as_of", sa.Date()),
        sa.Column("color", sa.String(7)),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.CheckConstraint("statement_day BETWEEN 1 AND 31", name="ck_credit_cards_statement_day"),
        sa.CheckConstraint("due_day BETWEEN 1 AND 31", name="ck_credit_cards_due_day"),
        sa.CheckConstraint("due_month_offset IN (0, 1)", name="ck_credit_cards_due_month_offset"),
        # 只存末四碼，且只能是四個數字（不得含空白、字母或完整卡號）
        sa.CheckConstraint("last4 ~ '^[0-9]{4}$'", name="ck_credit_cards_last4_digits"),
        sa.CheckConstraint(
            "color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'", name="ck_credit_cards_color_hex"
        ),
    )
    op.create_index("ix_credit_cards_user_id", "credit_cards", ["user_id"])

    # installments — is_settled／is_cancelled 互斥
    op.create_table(
        "installments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("card_id", sa.Integer(), sa.ForeignKey("credit_cards.id"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("purchase_date", sa.Date(), nullable=False),
        sa.Column("total_amount", MONEY, nullable=False),
        sa.Column("total_periods", sa.Integer(), nullable=False),
        sa.Column("paid_periods", sa.Integer(), nullable=False),
        sa.Column("first_month", MONTH, nullable=False),
        sa.Column("first_month_override_reason", sa.String(100)),
        sa.Column("monthly_amount", MONEY, nullable=False),
        sa.Column("is_settled", sa.Boolean(), nullable=False),
        sa.Column("is_cancelled", sa.Boolean(), nullable=False),
        sa.CheckConstraint("total_periods >= 2", name="ck_installments_total_periods"),
        sa.CheckConstraint(
            "NOT (is_settled AND is_cancelled)",
            name="ck_installments_settled_cancelled_exclusive",
        ),
        _month_check("first_month", "installments"),
    )
    op.create_index("ix_installments_user_id", "installments", ["user_id"])
    op.create_index("ix_installments_card_id", "installments", ["card_id"])

    # category_groups — 一級分類
    op.create_table(
        "category_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("name", sa.String(10), nullable=False),
        # necessity 不用 NULL：REWARD 類填 'excluded'，分析程式不必到處判空
        sa.Column("necessity", sa.String(10), nullable=False),
        sa.Column("counts_toward_target", sa.Boolean(), nullable=False),
        # 基準佔比：REWARD 類為 NULL。架構描述 6.5 的基準總和檢查（90～110%）
        # 只計算 counts_toward_target = TRUE 的分類，REWARD 不參與
        sa.Column("benchmark_min_pct", sa.Numeric(5, 2)),
        sa.Column("benchmark_max_pct", sa.Numeric(5, 2)),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        _in_check("necessity", NECESSITY_VALUES, "ck_category_groups_necessity"),
        sa.CheckConstraint(
            "benchmark_min_pct IS NULL OR benchmark_max_pct IS NULL "
            "OR benchmark_min_pct <= benchmark_max_pct",
            name="ck_category_groups_benchmark_range",
        ),
        # 同一使用者的一級分類代碼不可重複（docs/spec-gaps.md #1）
        sa.UniqueConstraint("user_id", "code", name="uq_category_groups_user_code"),
    )
    op.create_index("ix_category_groups_user_id", "category_groups", ["user_id"])

    # categories — 二級分類，is_active 預設 true
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("category_groups.id"), nullable=False),
        sa.Column("name", sa.String(20), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        # 同一使用者同一一級分類下的二級分類名稱不可重複（docs/spec-gaps.md #1）
        sa.UniqueConstraint("user_id", "group_id", "name", name="uq_categories_user_group_name"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])
    op.create_index("ix_categories_group_id", "categories", ["group_id"])

    # expenses — date 為消費日 DATE；amount ≠ 0
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("item", sa.String(50), nullable=False),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("payment_method", sa.String(20), nullable=False),
        sa.Column("card_id", sa.Integer(), sa.ForeignKey("credit_cards.id")),
        sa.Column("note", sa.Text()),
        sa.CheckConstraint("amount <> 0", name="ck_expenses_amount_nonzero"),
        _in_check("payment_method", PAYMENT_METHOD_VALUES, "ck_expenses_payment_method"),
    )
    op.create_index("ix_expenses_user_id", "expenses", ["user_id"])
    op.create_index("ix_expenses_date", "expenses", ["date"])
    op.create_index("ix_expenses_category_id", "expenses", ["category_id"])
    op.create_index("ix_expenses_card_id", "expenses", ["card_id"])

    # weekly_targets — unique(user_id, iso_year, iso_week)
    op.create_table(
        "weekly_targets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("iso_year", sa.SmallInteger(), nullable=False),
        sa.Column("iso_week", sa.SmallInteger(), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("reason", sa.String(100), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", "iso_year", "iso_week", name="uq_weekly_targets_user_week"),
    )
    op.create_index("ix_weekly_targets_user_id", "weekly_targets", ["user_id"])

    # reward_ledger — unique(user_id, month)
    op.create_table(
        "reward_ledger",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("month", MONTH, nullable=False),
        sa.Column("grade", sa.String(10), nullable=False),
        sa.Column("reward_amount", MONEY, nullable=False),
        sa.Column("consume_pool_delta", MONEY, nullable=False),
        sa.Column("invest_pool_delta", MONEY, nullable=False),
        sa.Column("note", sa.Text()),
        sa.UniqueConstraint("user_id", "month", name="uq_reward_ledger_user_month"),
        _in_check("grade", GRADE_VALUES, "ck_reward_ledger_grade"),
        _month_check("month", "reward_ledger"),
    )
    op.create_index("ix_reward_ledger_user_id", "reward_ledger", ["user_id"])

    # achievements — unique(user_id, code)
    op.create_table(
        "achievements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column(
            "unlocked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint("user_id", "code", name="uq_achievements_user_code"),
    )
    op.create_index("ix_achievements_user_id", "achievements", ["user_id"])


def downgrade() -> None:
    for table in (
        "achievements",
        "reward_ledger",
        "weekly_targets",
        "expenses",
        "categories",
        "category_groups",
        "installments",
        "credit_cards",
        "recurring_expenses",
        "extra_incomes",
        "monthly_incomes",
        "users",
    ):
        op.drop_table(table)
