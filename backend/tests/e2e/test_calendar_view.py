"""月曆頁跨月週呈現（TC-UI-WEEK-006／REQ-UI-001；spec-gaps 9.3）。

2026-09-28（一）～2026-10-04（日）這一週的週四是 10/1，依週歸屬規則算 10 月。月曆列＝ISO 週，
顯示日曆月 M 時所有含 M 任一天的週都出現，所以這一列在 2026-09 與 2026-10 兩個月份都要出現，
而且兩邊都要標「這週算 10 月」。

不假造瀏覽器時間：從今天的月份用「上一月／下一月」按鈕切過去，最多點 36 次（三年），超過就失敗。
"""

from __future__ import annotations

import re

import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import E2EEnv

pytestmark = [pytest.mark.e2e, pytest.mark.p1]

MAX_MONTH_CLICKS = 36
# PageTitle 的文字：lib/game-month.ts::formatYearMonthLabel → 「2026 年 9 月」
MONTH_HEADING = re.compile(r"^\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*$")


def _month_label(year: int, month: int) -> str:
    return f"{year} 年 {month} 月"


def _current_month(page: Page) -> tuple[int, int]:
    heading = page.get_by_role("heading", name=MONTH_HEADING)
    expect(heading).to_be_visible()
    match = MONTH_HEADING.match(heading.inner_text())
    assert match, f"月曆頁標題不是「YYYY 年 M 月」：{heading.inner_text()!r}"
    return int(match.group(1)), int(match.group(2))


def goto_month(page: Page, year: int, month: int, clicks_so_far: int = 0) -> int:
    """用上一月／下一月按鈕切到目標月份；回傳累計點擊次數，超過上限就失敗。"""
    clicks = clicks_so_far
    while True:
        cur_year, cur_month = _current_month(page)
        delta = (year - cur_year) * 12 + (month - cur_month)
        if delta == 0:
            return clicks
        if clicks >= MAX_MONTH_CLICKS:
            pytest.fail(f"點了 {clicks} 次月份按鈕仍未到 {_month_label(year, month)}（目前 {_month_label(cur_year, cur_month)}）")
        page.get_by_role("button", name="下一月" if delta > 0 else "上一月").click()
        clicks += 1


def _assert_cross_month_week_shown(page: Page) -> None:
    # 該週的頭尾兩天都在格線上（每一格是按鈕，aria-label 以「M/D（週）」開頭；lib/dates.ts::formatDayLabel）
    # 斜線要跳脫：Playwright 把 re 轉成 JS 的 /.../ 字面值，沒跳脫的 / 會提早結束 regex
    expect(page.get_by_role("button", name=re.compile(r"^9\/28（一）"))).to_be_visible()
    expect(page.get_by_role("button", name=re.compile(r"^10\/4（日）"))).to_be_visible()
    # 「這週算 10 月」小標籤（容許空白差異）。10 月份的月曆還有 10/26～11/1 那一列也算 10 月，所以可能不只一個。
    label = page.get_by_text(re.compile(r"這週算\s*10\s*月"))
    expect(label).not_to_have_count(0)
    expect(label.first).to_be_visible()


def test_cross_month_week_label(page: Page, e2e_env: E2EEnv) -> None:
    page.goto(e2e_env.page_url("/calendar"))

    clicks = goto_month(page, 2026, 9)
    expect(page.get_by_role("heading", name=_month_label(2026, 9))).to_be_visible()
    _assert_cross_month_week_shown(page)

    goto_month(page, 2026, 10, clicks_so_far=clicks)
    expect(page.get_by_role("heading", name=_month_label(2026, 10))).to_be_visible()
    _assert_cross_month_week_shown(page)
