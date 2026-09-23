"""信用卡繳款月偏移推算與 31 日邊界（REQ-CARD-002、REQ-CARD-006；TC-EDGE-CARD-001、TC-EDGE-CARD-002）。

純函式測試，不碰資料庫。函式名稱與 docs/test_conditions_v1_1.yaml 的 script 欄位一致。
"""

import json
from datetime import date

import pytest

from app.services.cards import day_in_month, infer_due_month_offset
from tests.conftest import FIXTURES_DIR

pytestmark = pytest.mark.p0


def test_due_offset_matches_shared_fixture() -> None:
    """前後端共用 tests/fixtures/card_due_offset_cases.json（前端 src/lib/card-due-offset.test.ts 讀同一份）。"""
    raw = json.loads((FIXTURES_DIR / "card_due_offset_cases.json").read_text(encoding="utf-8"))
    cases = raw["cases"]
    assert len(cases) >= 3
    for case in cases:
        got = infer_due_month_offset(case["statement_day"], case["due_day"])
        assert got == case["expected"], f"{case['statement_day']}/{case['due_day']}: {case.get('note', '')}"


def test_due_before_statement_next_month() -> None:
    """TC-EDGE-CARD-001：結帳日 27、繳款日 15 → 繳款日 ≤ 結帳日 → 次月，偏移 1。"""
    assert infer_due_month_offset(statement_day=27, due_day=15) == 1
    # 邊界：繳款日等於結帳日也是「≤」→ 1
    assert infer_due_month_offset(statement_day=15, due_day=15) == 1


def test_due_after_statement_same_month() -> None:
    """TC-EDGE-CARD-002：結帳日 1、繳款日 20 → 繳款日 > 結帳日 → 同月，偏移 0。"""
    assert infer_due_month_offset(statement_day=1, due_day=20) == 0
    assert infer_due_month_offset(statement_day=19, due_day=20) == 0


@pytest.mark.parametrize(
    ("year", "month", "day", "expected"),
    [
        (2026, 2, 31, date(2026, 2, 28)),  # 平年 2 月
        (2028, 2, 31, date(2028, 2, 29)),  # 閏年 2 月
        (2026, 4, 31, date(2026, 4, 30)),  # 30 天的月份
        (2026, 1, 31, date(2026, 1, 31)),  # 剛好 31 天：不變
        (2026, 2, 15, date(2026, 2, 15)),  # 未超過：不變
    ],
)
def test_day_31_clamped_to_last_day_of_month(year: int, month: int, day: int, expected: date) -> None:
    """REQ-CARD-006：結帳日設 31 但當月不足 31 天時，視為該月最後一日。"""
    assert day_in_month(year, month, day) == expected
