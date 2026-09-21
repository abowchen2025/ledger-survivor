"""seed: user id=1, 7 built-in category groups, default sub-categories

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-16

依據：架構描述 v2.2 6.2（分類定義、necessity、counts_toward_target）、6.3（佔比基準）；
SRS+FS v1.2 第三章 users（Phase 0 seed id=1 佔位帳號）、REQ-CATEGORY-001。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

USER_ID = 1

# (code, name, necessity, counts_toward_target, benchmark_min_pct, benchmark_max_pct, sort_order, 二級分類)
# REWARD 類（counts_toward_target=false）在 6.2／6.3 沒有 necessity 與基準佔比：
# necessity 填 'excluded'（不用 NULL），benchmark_min_pct／max_pct 維持 NULL；
# 架構描述 6.5 的基準總和檢查（90～110%）只計 counts_toward_target=true 的分類，REWARD 不參與。
# 見 docs/spec-gaps.md #3
GROUPS = [
    ("FOOD", "食", "necessary", True, 30, 40, 1, ["三餐外食", "食材採買", "飲料零食", "聚餐應酬"]),
    ("CLOTHING", "衣", "flexible", True, 5, 10, 2, ["服飾鞋包", "美容美髮", "配件飾品"]),
    ("HOUSING", "住", "necessary", True, 10, 15, 3, ["水電瓦斯", "居家用品", "修繕", "通訊網路"]),
    ("TRANSPORT", "行", "necessary", True, 10, 15, 4, ["大眾運輸", "油資停車", "計程車與共乘", "車輛保養"]),
    ("EDUCATION", "育", "flexible", True, 5, 15, 5, ["書籍課程", "訂閱服務", "醫療保健", "運動健身"]),
    ("ENTERTAINMENT", "樂", "want", True, 10, 20, 6, ["娛樂休閒", "旅遊", "3C 與嗜好", "禮物人情"]),
    ("REWARD", "獎勵", "excluded", False, None, None, 7, []),
]


def upgrade() -> None:
    conn = op.get_bind()

    # users：id=1 佔位帳號（email／password_hash Phase 3 才真正使用）
    conn.execute(
        sa.text(
            "INSERT INTO users (id, email, password_hash) "
            "VALUES (:id, :email, :password_hash)"
        ),
        {"id": USER_ID, "email": "user1@ledger-survivor.local", "password_hash": "!placeholder"},
    )
    # 手動指定 id 後把序列推到 1，之後自動編號從 2 開始
    conn.execute(sa.text("SELECT setval(pg_get_serial_sequence('users', 'id'), :v)"), {"v": USER_ID})

    for code, name, necessity, counts, pct_min, pct_max, order, subs in GROUPS:
        group_id = conn.execute(
            sa.text(
                "INSERT INTO category_groups "
                "(user_id, code, name, necessity, counts_toward_target, "
                " benchmark_min_pct, benchmark_max_pct, sort_order, is_system, is_active) "
                "VALUES (:user_id, :code, :name, :necessity, :counts, "
                "        :pct_min, :pct_max, :sort_order, TRUE, TRUE) "
                "RETURNING id"
            ),
            {
                "user_id": USER_ID,
                "code": code,
                "name": name,
                "necessity": necessity,
                "counts": counts,
                "pct_min": pct_min,
                "pct_max": pct_max,
                "sort_order": order,
            },
        ).scalar_one()

        for idx, sub_name in enumerate(subs, start=1):
            conn.execute(
                sa.text(
                    "INSERT INTO categories "
                    "(user_id, group_id, name, is_system, sort_order, is_active) "
                    "VALUES (:user_id, :group_id, :name, TRUE, :sort_order, TRUE)"
                ),
                {"user_id": USER_ID, "group_id": group_id, "name": sub_name, "sort_order": idx},
            )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("DELETE FROM categories WHERE user_id = :u AND is_system = TRUE"), {"u": USER_ID}
    )
    conn.execute(
        sa.text("DELETE FROM category_groups WHERE user_id = :u AND is_system = TRUE"),
        {"u": USER_ID},
    )
    conn.execute(sa.text("DELETE FROM users WHERE id = :u"), {"u": USER_ID})
