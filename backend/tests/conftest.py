"""共用 fixture：載入 tests/fixtures/week_cases.json（週規則唯一真相）。"""

import json
from datetime import date
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _to_date(s: str) -> date:
    return date.fromisoformat(s)


@pytest.fixture(scope="session")
def week_cases() -> list[dict]:
    """回傳 week_cases.json 的 cases，日期字串已轉為 date。"""
    raw = json.loads((FIXTURES_DIR / "week_cases.json").read_text(encoding="utf-8"))
    cases = []
    for c in raw["cases"]:
        cases.append(
            {
                **c,
                "date": _to_date(c["date"]),
                "week_start": _to_date(c["week_start"]),
                "week_end": _to_date(c["week_end"]),
            }
        )
    assert len(cases) >= 12, "week_cases.json 至少需 12 筆案例"
    return cases


def cases_for(week_cases: list[dict], tc_id: str) -> list[dict]:
    """依測試條件編號篩選案例；篩不到任何案例視為 fixture 缺漏。"""
    selected = [c for c in week_cases if tc_id in c.get("tc", [])]
    assert selected, f"week_cases.json 沒有標記 {tc_id} 的案例"
    return selected
