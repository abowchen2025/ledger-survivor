"""前後端 week_rule 一致性（TC-SEC-WEEK-004／REQ-NFR-003）。

做法：
1. 用 subprocess 執行 ``npm run week:dump``（frontend/scripts/week-dump.ts），
   前端以 TypeScript 的 week.ts 對 fixture 全部案例計算，輸出 JSON 到 stdout。
2. 後端在這裡用 Python 的 week_rule 對同一批輸入日期計算。
3. 逐筆、逐欄位比對「兩端的輸出」。fixture 只提供輸入日期，
   答案欄位在這個測試裡完全不看：兩邊各自對答案只能證明各自會對答案，
   不能證明實作等價（例如兩邊在 fixture 沒覆蓋的欄位上不同）。
4. 額外驗證前端讀的就是後端這一份檔案（realpath 與 sha256 都相同），
   而不是一份複製品。

前置條件：Node.js 22 與 frontend/node_modules（``npm ci``）。CI 由 setup-node 提供；
本機缺少時本測試會直接失敗並說明原因，不會 skip。
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from datetime import date
from pathlib import Path

import pytest

from app.services import week_rule

pytestmark = [pytest.mark.p0, pytest.mark.integration]

BACKEND_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"
FIXTURE = BACKEND_DIR / "tests" / "fixtures" / "week_cases.json"

# 兩端都要輸出、逐一比對的欄位（date 是輸入，不在此列）
COMPARED_FIELDS = (
    "iso_year",
    "iso_week",
    "belongs_month",
    "week_start",
    "week_end",
    "week_index_in_month",
    "weeks_in_month",
    "week_range",
)


def _backend_row(day_str: str) -> dict:
    """後端對單一輸入日期的完整輸出，鍵名與前端 dump 相同。"""
    day = date.fromisoformat(day_str)
    iso_year, iso_week = week_rule.week_of(day)
    belongs = week_rule.week_belongs_to_month(iso_year, iso_week)
    return {
        "date": day_str,
        "iso_year": iso_year,
        "iso_week": iso_week,
        "belongs_month": belongs,
        "week_start": week_rule.week_start(iso_year, iso_week).isoformat(),
        "week_end": week_rule.week_end(iso_year, iso_week).isoformat(),
        "week_index_in_month": week_rule.week_index_in_month(iso_year, iso_week),
        "weeks_in_month": week_rule.weeks_in_month(belongs),
        "week_range": [d.isoformat() for d in week_rule.week_range(iso_year, iso_week)],
    }


def _frontend_dump() -> dict:
    """執行 npm run week:dump 取得前端輸出；任何環境問題都以失敗（非 skip）呈現。"""
    npm = shutil.which("npm")
    assert npm, "找不到 npm：一致性測試需要 Node.js 22（CI 由 actions/setup-node 提供）"
    assert (FRONTEND_DIR / "node_modules").is_dir(), (
        f"{FRONTEND_DIR / 'node_modules'} 不存在：請先在 frontend/ 執行 npm ci"
    )
    proc = subprocess.run(
        [npm, "run", "--silent", "week:dump"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
        check=False,
    )
    assert proc.returncode == 0, (
        f"npm run week:dump 失敗（exit {proc.returncode}）\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
    )
    return json.loads(proc.stdout)


def test_frontend_backend_same_fixture() -> None:
    """TC-SEC-WEEK-004：前後端對 fixture 全部案例的輸出逐筆比對，任一筆不一致即失敗。"""
    raw = FIXTURE.read_bytes()
    inputs = [c["date"] for c in json.loads(raw.decode("utf-8"))["cases"]]
    assert len(inputs) >= 12, "week_cases.json 至少需 12 筆案例"

    dump = _frontend_dump()

    # (a) 前端讀的是後端這一份檔案，不是複製品
    assert Path(dump["fixture"]).resolve() == FIXTURE.resolve(), (
        f"前端讀的 fixture 路徑不是後端那一份：{dump['fixture']}"
    )
    assert dump["sha256"] == hashlib.sha256(raw).hexdigest(), "前端讀到的 fixture 內容與後端不同"

    # (b) 前端跑了全部案例，且順序一致
    frontend_rows = dump["cases"]
    assert [r["date"] for r in frontend_rows] == inputs, "前端輸出的案例數或順序與 fixture 不符"

    # (c) 逐筆、逐欄位比對兩端輸出（不看 fixture 的答案欄位）
    mismatches: list[str] = []
    for fe in frontend_rows:
        be = _backend_row(fe["date"])
        for field in COMPARED_FIELDS:
            if fe.get(field) != be[field]:
                mismatches.append(f"{fe['date']} {field}: frontend={fe.get(field)!r} backend={be[field]!r}")

    assert not mismatches, "前後端 week_rule 輸出不一致（Blocker）：\n" + "\n".join(mismatches)
