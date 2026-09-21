"""週歸屬規則（REQ-WEEK-001、REQ-WEEK-002、REQ-WEEK-005）。

- 週一為一週之始（ISO 8601 週）。
- 一週完整歸屬於「該週週四所在的月份」，不切割、不按比例分攤。
- 每月週數 = 該月內週四的個數（必為 4 或 5）。
- 日期一律使用 ``datetime.date``；「今天」以 Asia/Taipei 的本地日曆日為準。

本模組是純函式，不碰資料庫；前端 ``frontend/src/lib/week.ts`` 須與此邏輯一致，
兩端共用 ``tests/fixtures/week_cases.json`` 作為唯一真相。
"""

from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")

_MONTH_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")

# ISO 週內的星期序：週一=1 … 週四=4 … 週日=7
_MONDAY = 1
_THURSDAY = 4
_SUNDAY = 7


def today_taipei() -> date:
    """REQ-WEEK-005：以 Asia/Taipei 的本地日曆日作為「今天」。"""
    return datetime.now(TAIPEI).date()


def parse_month(month: str) -> tuple[int, int]:
    """把 'YYYY-MM' 解析為 (year, month)，格式錯誤丟 ValueError。"""
    m = _MONTH_RE.match(month)
    if not m:
        raise ValueError(f"month must be 'YYYY-MM', got {month!r}")
    return int(m.group(1)), int(m.group(2))


def format_month(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def week_of(d: date) -> tuple[int, int]:
    """回傳日期所屬的 ISO 週 (iso_year, iso_week)。"""
    iso = d.isocalendar()
    return iso.year, iso.week


def week_start(iso_year: int, iso_week: int) -> date:
    """該 ISO 週的週一。"""
    return date.fromisocalendar(iso_year, iso_week, _MONDAY)


def week_end(iso_year: int, iso_week: int) -> date:
    """該 ISO 週的週日。"""
    return date.fromisocalendar(iso_year, iso_week, _SUNDAY)


def week_thursday(iso_year: int, iso_week: int) -> date:
    """該 ISO 週的週四，決定整週歸屬月份。"""
    return date.fromisocalendar(iso_year, iso_week, _THURSDAY)


def week_belongs_to_month(iso_year: int, iso_week: int) -> str:
    """REQ-WEEK-001：一週歸屬於週四所在的月份，回傳 'YYYY-MM'。"""
    thu = week_thursday(iso_year, iso_week)
    return format_month(thu.year, thu.month)


def weeks_of_month(month: str) -> list[tuple[int, int]]:
    """該月（'YYYY-MM'）依 REQ-WEEK-001 擁有的所有週，依時間排序。

    做法：列出該月每個週四，各自對應一個 ISO 週。
    """
    year, mon = parse_month(month)
    days_in_month = calendar.monthrange(year, mon)[1]
    weeks: list[tuple[int, int]] = []
    for day in range(1, days_in_month + 1):
        d = date(year, mon, day)
        if d.isoweekday() == _THURSDAY:
            weeks.append(week_of(d))
    return weeks


def weeks_in_month(month: str) -> int:
    """REQ-WEEK-002：每月週數（4 或 5）。"""
    return len(weeks_of_month(month))


def week_index_in_month(iso_year: int, iso_week: int) -> int:
    """該週是其歸屬月份的第幾週（從 1 起算）。"""
    month = week_belongs_to_month(iso_year, iso_week)
    return weeks_of_month(month).index((iso_year, iso_week)) + 1


def week_range(iso_year: int, iso_week: int) -> list[date]:
    """該週的七個日曆日（週一～週日）。"""
    start = week_start(iso_year, iso_week)
    return [start + timedelta(days=i) for i in range(7)]
