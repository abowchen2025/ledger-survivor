"""首頁快速記帳 → 本週清單／HP（TC-E2E-001／REQ-EXPENSE-001）。

YAML 登記的 script 是 ``test_record_expense_updates_home_hp``，但 expected 同時涵蓋 Phase 1 已有的
「即時出現在本週清單、不整頁重整」與 Phase 2／3 才有的「剩餘額度、HP 條同步更新」，所以拆成兩個函式
（spec-gaps 第 12 節）：

- ``test_record_expense_updates_home_week_list``：現在就要過。
- ``test_record_expense_updates_home_hp``：``xfail(strict=True)``，實作剩餘額度與 HP 後會 XPASS 變紅，屆時移除 xfail。

兩個測試都用 API 刪掉自己建立的花費（品項是唯一字串），本機重複執行不留資料。
"""

from __future__ import annotations

import re
import secrets
from datetime import date, timedelta
from typing import Iterator

import httpx
import pytest
from playwright.sync_api import Page, expect

from tests.e2e.conftest import E2EEnv

pytestmark = [pytest.mark.e2e, pytest.mark.p0]

RELOAD_MARKER = "ledger-survivor-e2e-no-reload"


def _unique_item() -> str:
    return f"e2e-{secrets.token_hex(4)}"


@pytest.fixture
def expense_cleanup(api_client: httpx.Client, today_taipei: date) -> Iterator[list[str]]:
    """測試把用過的品項名稱 append 進來；teardown 用 API 把今天前後一天內同名的花費全部刪掉。"""
    items: list[str] = []
    yield items
    if not items:
        return
    start = (today_taipei - timedelta(days=1)).isoformat()
    end = (today_taipei + timedelta(days=1)).isoformat()
    listed = api_client.get("/expenses", params={"start_date": start, "end_date": end})
    listed.raise_for_status()
    leftovers = [e for e in listed.json() if e["item"] in items]
    for expense in leftovers:
        deleted = api_client.delete(f"/expenses/{expense['id']}")
        assert deleted.status_code == 204, f"teardown 刪除花費 {expense['id']} 失敗：{deleted.status_code} {deleted.text}"


def _pick_counting_category(page: Page) -> str:
    """分類選單裡第一個「計入週花費、啟用中」的選項文字（不依賴 seed 的名稱）。"""
    select = page.get_by_label("分類", exact=True)
    expect(select).to_be_visible()
    options = select.get_by_role("option").all_text_contents()
    for text in options:
        if text.strip() and "選擇分類" not in text and "不計入" not in text and "已停用" not in text:
            return text
    pytest.fail(f"分類選單沒有可用的計入分類：{options!r}")


def record_expense_on_home(page: Page, e2e_env: E2EEnv, item: str, amount: str = "120") -> None:
    """開首頁、在快速記帳表單填一筆（日期用預設今天、支付方式用預設）並送出。"""
    page.goto(e2e_env.page_url("/"))
    amount_input = page.get_by_label("金額", exact=True)
    expect(amount_input).to_be_visible()
    # 送出前在 window 放標記；整頁重新載入會把它洗掉
    page.evaluate("marker => { window.__ledgerE2E = marker; }", RELOAD_MARKER)

    amount_input.fill(amount)
    page.get_by_label("品項", exact=True).fill(item)
    page.get_by_label("分類", exact=True).select_option(label=_pick_counting_category(page))
    page.get_by_role("button", name="記一筆").click()


def _expect_in_week_list(page: Page, item: str) -> None:
    # 清單每筆是 <li>；最近品項的快選鈕也會出現同名文字，但那是 button 不是 listitem
    row = page.get_by_role("listitem").filter(has_text=item)
    expect(row).to_have_count(1)
    expect(row).to_be_visible()


def test_record_expense_updates_home_week_list(page: Page, e2e_env: E2EEnv, expense_cleanup: list[str]) -> None:
    item = _unique_item()
    expense_cleanup.append(item)

    record_expense_on_home(page, e2e_env, item)

    _expect_in_week_list(page, item)
    # 成功後表單清空金額與品項，日期／分類保留（REQ-NFR-002 三次點擊內記下一筆）
    expect(page.get_by_label("金額", exact=True)).to_have_value("")
    expect(page.get_by_label("品項", exact=True)).to_have_value("")
    # 沒有整頁重新載入：送出前放的標記還在
    assert page.evaluate("() => window.__ledgerE2E") == RELOAD_MARKER


@pytest.mark.xfail(strict=True, raises=AssertionError, reason="剩餘額度屬 Phase 2、HP 條屬 Phase 3，尚未實作；實作後本測試會 XPASS 變紅，屆時移除 xfail")
def test_record_expense_updates_home_hp(page: Page, e2e_env: E2EEnv, expense_cleanup: list[str]) -> None:
    item = _unique_item()
    expense_cleanup.append(item)

    record_expense_on_home(page, e2e_env, item)
    _expect_in_week_list(page, item)

    # Phase 2：剩餘額度；Phase 3：HP 條（progressbar）——兩者都要與清單同步更新，不需整頁重整
    expect(page.get_by_text(re.compile(r"剩餘額度"))).to_be_visible()
    expect(page.get_by_role("progressbar", name=re.compile("HP"))).to_be_visible()
    assert page.evaluate("() => window.__ledgerE2E") == RELOAD_MARKER
