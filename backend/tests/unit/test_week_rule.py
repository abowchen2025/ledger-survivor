"""週歸屬規則單元測試（REQ-WEEK-001、REQ-WEEK-002、REQ-WEEK-005）。

所有日期資料一律來自 tests/fixtures/week_cases.json，測試碼不寫死任何日期。
函式名稱與 docs/test_conditions_v1_1.yaml 的 script 欄位一致。
"""

from datetime import date, timedelta

import pytest

from app.services import week_rule
from tests.conftest import cases_for

pytestmark = pytest.mark.p0


def _assert_whole_week(case: dict) -> None:
    """整週七天都必須得到同一個 ISO 週與同一個歸屬月份。"""
    expected_week = (case["iso_year"], case["iso_week"])
    day = case["week_start"]
    while day <= case["week_end"]:
        assert week_rule.week_of(day) == expected_week, f"{day} 的 ISO 週錯誤"
        assert week_rule.week_belongs_to_month(*expected_week) == case["belongs_month"], (
            f"{day} 所屬週應歸 {case['belongs_month']}"
        )
        day += timedelta(days=1)


def test_week_belongs_to_month_thursday_boundary(week_cases: list[dict]) -> None:
    """TC-EDGE-WEEK-001／REQ-WEEK-001：跨兩個日曆月的週，整週歸週四所在月份，不切割。"""
    for case in cases_for(week_cases, "TC-EDGE-WEEK-001"):
        iso_year, iso_week = week_rule.week_of(case["date"])
        assert (iso_year, iso_week) == (case["iso_year"], case["iso_week"])

        belongs = week_rule.week_belongs_to_month(iso_year, iso_week)
        assert belongs == case["belongs_month"]
        # 此 TC 的案例必須是跨月週（週一與週日在不同日曆月），且歸屬月份 = 週四所在月份
        start, end = case["week_start"], case["week_end"]
        assert (start.year, start.month) != (end.year, end.month), "此 TC 的案例須為跨月週"
        thursday = week_rule.week_thursday(iso_year, iso_week)
        assert week_rule.format_month(thursday.year, thursday.month) == belongs

        assert week_rule.week_start(iso_year, iso_week) == case["week_start"]
        assert week_rule.week_end(iso_year, iso_week) == case["week_end"]
        assert week_rule.week_index_in_month(iso_year, iso_week) == case["week_index_in_month"]
        _assert_whole_week(case)


def test_week_belongs_to_month_prior_boundary(week_cases: list[dict]) -> None:
    """TC-EDGE-WEEK-002／REQ-WEEK-001：輸入日期的日曆月份與歸屬月份不同，不得按日期本身的月份歸屬。"""
    for case in cases_for(week_cases, "TC-EDGE-WEEK-002"):
        d: date = case["date"]
        calendar_month = week_rule.format_month(d.year, d.month)
        assert calendar_month != case["belongs_month"], "此 TC 的案例日期須落在非歸屬月份"

        iso_year, iso_week = week_rule.week_of(d)
        assert (iso_year, iso_week) == (case["iso_year"], case["iso_week"])
        assert week_rule.week_belongs_to_month(iso_year, iso_week) == case["belongs_month"]
        assert week_rule.week_start(iso_year, iso_week) == case["week_start"]
        assert week_rule.week_end(iso_year, iso_week) == case["week_end"]
        assert week_rule.week_index_in_month(iso_year, iso_week) == case["week_index_in_month"]
        _assert_whole_week(case)


def test_month_week_count_4_or_5(week_cases: list[dict]) -> None:
    """TC-FUNC-WEEK-003／REQ-WEEK-002：每月週數由規則算出，與 fixture 人工手算一致，且只會是 4 或 5。

    fixture 是「規則真相表」不是「測試案例清單」：這裡跑過所有帶 weeks_in_month 的案例，
    不只篩 tc 含 TC-FUNC-WEEK-003 的那幾筆；同時仍要求至少有一筆標了該 TC。
    """
    assert cases_for(week_cases, "TC-FUNC-WEEK-003")  # TC 標記存在（可追溯），但不以它篩選
    expected_by_month: dict[str, int] = {}
    for case in (c for c in week_cases if "weeks_in_month" in c):
        expected_by_month.setdefault(case["belongs_month"], case["weeks_in_month"])
        assert expected_by_month[case["belongs_month"]] == case["weeks_in_month"], (
            f"fixture 內 {case['belongs_month']} 的 weeks_in_month 不一致"
        )

    counts = set(expected_by_month.values())
    assert 4 in counts and 5 in counts, "fixture 須同時含 4 週月與 5 週月樣本"

    for month, expected in expected_by_month.items():
        actual = week_rule.weeks_in_month(month)
        assert actual == expected, f"{month} 週數應為 {expected}，得到 {actual}"
        assert actual in (4, 5)
        # 該月每一週都必須歸屬回這個月，且序號連續
        weeks = week_rule.weeks_of_month(month)
        assert len(weeks) == expected
        for idx, (y, w) in enumerate(weeks, start=1):
            assert week_rule.week_belongs_to_month(y, w) == month
            assert week_rule.week_index_in_month(y, w) == idx


def test_cross_year_week_iso_year_differs_from_calendar_year(week_cases: list[dict]) -> None:
    """REQ-WEEK-001：跨年週的 ISO 年可與日曆年不同，fixture 兩個方向都要有，且週歸屬只看週四。

    - 日曆年 < ISO 年：例如 2025-12-29（ISO 2026-W01，歸 2026-01）
    - 日曆年 > ISO 年：例如 2027-01-02（ISO 2026-W53，歸 2026-12）
    """
    lower = [c for c in week_cases if c["date"].year < c["iso_year"]]
    higher = [c for c in week_cases if c["date"].year > c["iso_year"]]
    assert lower, "fixture 缺「日曆年 < ISO 年」案例"
    assert higher, "fixture 缺「日曆年 > ISO 年」案例"
    for case in lower + higher:
        iso_year, iso_week = week_rule.week_of(case["date"])
        assert iso_year == case["iso_year"], case
        assert week_rule.week_belongs_to_month(iso_year, iso_week) == case["belongs_month"], case
        # 歸屬月的週清單必須包含這一週（例如 weeks_in_month("2026-01") 要算進 2025-12-29 那週）
        assert (iso_year, iso_week) in week_rule.weeks_of_month(case["belongs_month"]), case


def test_all_cases_roundtrip(week_cases: list[dict]) -> None:
    """全部 fixture 案例逐筆比對，任一欄位不符即失敗（前後端一致性的後端基準）。"""
    for case in week_cases:
        iso_year, iso_week = week_rule.week_of(case["date"])
        assert (iso_year, iso_week) == (case["iso_year"], case["iso_week"]), case
        assert week_rule.week_belongs_to_month(iso_year, iso_week) == case["belongs_month"], case
        assert week_rule.week_start(iso_year, iso_week) == case["week_start"], case
        assert week_rule.week_end(iso_year, iso_week) == case["week_end"], case
        assert week_rule.week_index_in_month(iso_year, iso_week) == case["week_index_in_month"], case
        assert week_rule.weeks_in_month(case["belongs_month"]) == case["weeks_in_month"], case


def test_today_taipei_returns_date() -> None:
    """REQ-WEEK-005：「今天」以 Asia/Taipei 本地日曆日回傳 date，不是 datetime。"""
    today = week_rule.today_taipei()
    assert type(today) is date
    assert week_rule.TAIPEI.key == "Asia/Taipei"
