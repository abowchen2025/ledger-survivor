"""月結狀態查詢（REQ-EXPENSE-005 的「已結算月份」判定；3.7）。

- 花費「所屬月份」依週歸屬規則（``week_rule.week_belongs_to_month``）判定，**不依日曆月**：
  2026-09-29 屬 2026-W40，週四是 10/1，所以歸 10 月——要看 10 月有沒有結算，不是 9 月。
  結算是行為時鐘的概念，而一週永遠不切割；用日曆月判定的話，已結算的 9 月可能被 9/29 的補登
  偷偷改掉，而那筆其實屬於 10 月的關卡。
- 「已結算」＝該月在 ``reward_ledger`` 有紀錄。月結功能 Phase 3 才做，這個檢查現在就要有；
  取消結算＝刪除該列（表上沒有取消旗標，Phase 3 若改為旗標，只需改 ``is_month_settled``）。
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.errors import MonthSettled
from app.models import RewardLedger
from app.services import week_rule


def game_month_of(d: date) -> str:
    """日期所屬的遊戲月份（'YYYY-MM'）：其 ISO 週的週四所在月份（REQ-WEEK-001）。"""
    return week_rule.week_belongs_to_month(*week_rule.week_of(d))


def is_month_settled(db: Session, user_id: int, month: str) -> bool:
    return bool(
        db.scalar(
            select(exists().where(RewardLedger.user_id == user_id, RewardLedger.month == month))
        )
    )


def assert_dates_not_in_settled_month(db: Session, user_id: int, *dates: date) -> None:
    """任一日期所屬的遊戲月份已結算 → 409 MONTH_SETTLED（帶該月份）。同一月只查一次。"""
    seen: set[str] = set()
    for d in dates:
        month = game_month_of(d)
        if month in seen:
            continue
        seen.add(month)
        if is_month_settled(db, user_id, month):
            raise MonthSettled(month)
