"""Playwright e2e 共用 fixture（marker ``e2e``；預設不跑，見 pyproject 的 addopts）。

前置條件（缺任何一個會**失敗**、不會 skip）：

- 後端 uvicorn 在 ``E2E_API_URL``（預設 ``http://127.0.0.1:8765``），``CORS_ALLOWED_ORIGINS`` 含前端來源
  ``http://127.0.0.1:4173``，DB 已 ``alembic upgrade head``（含 seed：user 1、內建分類）。
- 前端 production build 由 ``vite preview --host 127.0.0.1 --port 4173 --strictPort`` 提供在
  ``E2E_BASE_URL``（預設 ``http://127.0.0.1:4173/ledger-survivor/``），建置時 ``VITE_API_BASE_URL`` 指向上面的後端。
- ``E2E_API_KEY``：後端那一把 ``API_KEY``。沒設時讀 repo 根目錄 ``.env`` 的 ``API_KEY``（本機開發的預設放法）。
  不能拿 ``app.config.settings.api_key``：tests/conftest.py 在 import 前就 ``setdefault`` 了一把測試用金鑰，
  與正在跑的 uvicorn 不一定相同。

**網址守門**：``E2E_API_URL`` 與 ``E2E_BASE_URL`` 的 host 只能是 ``127.0.0.1`` 或 ``localhost``，否則整個
session 直接失敗。e2e 會真的寫入花費，任何情況下都不得打到 Railway。

**金鑰登入**：session 開始時開一個瀏覽器 context，走設定頁用 ``getByLabel`` 輸入金鑰、按「儲存」，
把產生的 ``storage_state`` 交給所有測試的 context（``browser_context_args``）。測試碼不知道、也不該知道
localStorage 的鍵名——那是 ``frontend/src/api/api-key.ts`` 的實作細節。

**瀏覽器**：Chromium、390×844、``is_mobile``、``has_touch``、``zh-TW``、``Asia/Taipei``；``service_workers="block"``
讓 PWA 的 service worker 不介入（測的是頁面行為，不是快取）。
"""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import httpx
import pytest
from dotenv import dotenv_values
from playwright.sync_api import Browser, expect

REPO_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_BASE_URL = "http://127.0.0.1:4173/ledger-survivor/"
DEFAULT_API_URL = "http://127.0.0.1:8765"
ALLOWED_HOSTS = {"127.0.0.1", "localhost"}
READY_TIMEOUT_SECONDS = 60

# 手機優先（SRS 非功能需求）：iPhone 14 級的視窗；service worker 一律封鎖
MOBILE_CONTEXT: dict[str, Any] = {
    "viewport": {"width": 390, "height": 844},
    "device_scale_factor": 3,
    "is_mobile": True,
    "has_touch": True,
    "locale": "zh-TW",
    "timezone_id": "Asia/Taipei",
    "service_workers": "block",
}

LOCAL_HOWTO = """本機啟動方式（PowerShell，詳見 CLAUDE.md「常用指令」）：
  docker compose up -d db
  cd backend; uv run alembic upgrade head
  $env:CORS_ALLOWED_ORIGINS = "http://127.0.0.1:4173"; uv run uvicorn app.main:app --host 127.0.0.1 --port 8765
  cd frontend; $env:VITE_API_BASE_URL = "http://127.0.0.1:8765"; npm run build
  npx vite preview --host 127.0.0.1 --port 4173 --strictPort
  cd backend; uv run pytest -m e2e"""


@dataclass(frozen=True)
class E2EEnv:
    base_url: str  # 前端首頁，含 /ledger-survivor/ 與結尾斜線
    api_url: str  # 後端 host[:port]，不含 /api/v1
    api_key: str

    def page_url(self, route: str) -> str:
        """HashRouter：/calendar → http://127.0.0.1:4173/ledger-survivor/#/calendar"""
        return f"{self.base_url}#{route}"

    @property
    def api_v1(self) -> str:
        return f"{self.api_url}/api/v1"


def _assert_local(name: str, url: str) -> None:
    host = urlsplit(url).hostname
    if host not in ALLOWED_HOSTS:
        pytest.fail(
            f"{name}={url!r} 的 host 是 {host!r}，e2e 只允許 127.0.0.1 或 localhost。"
            "e2e 會真的寫入資料，不得對 Railway 或任何遠端環境執行；請改回本機位址或直接不要設定這個變數。",
            pytrace=False,
        )


def _resolve_api_key() -> str:
    key = os.environ.get("E2E_API_KEY", "").strip()
    if key:
        return key
    from_dotenv = (dotenv_values(REPO_ROOT / ".env").get("API_KEY") or "").strip()
    if from_dotenv:
        return from_dotenv
    pytest.fail(
        "找不到 e2e 要用的 API 金鑰：請設定環境變數 E2E_API_KEY（與正在跑的後端 API_KEY 相同），"
        "或在 repo 根目錄 .env 放 API_KEY。",
        pytrace=False,
    )


@pytest.fixture(scope="session")
def e2e_env() -> E2EEnv:
    base_url = os.environ.get("E2E_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL
    api_url = os.environ.get("E2E_API_URL", DEFAULT_API_URL).strip() or DEFAULT_API_URL
    # 守門先於一切：連健康檢查都不對遠端打
    _assert_local("E2E_API_URL", api_url)
    _assert_local("E2E_BASE_URL", base_url)
    if not base_url.endswith("/"):
        base_url += "/"
    return E2EEnv(base_url=base_url, api_url=api_url.rstrip("/"), api_key=_resolve_api_key())


def _probe(url: str) -> str | None:
    """回 None 表示 200；否則回傳失敗原因（給逾時訊息用）。"""
    try:
        r = httpx.get(url, timeout=2.0, follow_redirects=True)
    except httpx.HTTPError as exc:
        return f"{type(exc).__name__}: {exc}"
    return None if r.status_code == 200 else f"HTTP {r.status_code}: {r.text[:200]}"


@pytest.fixture(scope="session", autouse=True)
def e2e_services_ready(e2e_env: E2EEnv) -> None:
    """輪詢後端 readiness 與前端首頁，最多 60 秒；逾時列出缺哪一個與本機怎麼起。"""
    targets = {
        "後端 GET /api/v1/health/ready": f"{e2e_env.api_v1}/health/ready",
        "前端首頁": e2e_env.base_url,
    }
    deadline = time.monotonic() + READY_TIMEOUT_SECONDS
    last: dict[str, str] = {}
    while True:
        last = {name: reason for name, url in targets.items() if (reason := _probe(url)) is not None}
        if not last:
            return
        if time.monotonic() >= deadline:
            break
        time.sleep(1.0)
    missing = "\n".join(f"  - {name}（{targets[name]}）：{reason}" for name, reason in last.items())
    pytest.fail(
        f"等了 {READY_TIMEOUT_SECONDS} 秒仍未就緒：\n{missing}\n{LOCAL_HOWTO}",
        pytrace=False,
    )


@pytest.fixture(scope="session")
def api_client(e2e_env: E2EEnv) -> Iterator[httpx.Client]:
    """帶金鑰的後端 client，給測試 teardown 清資料用；base_url 已含 /api/v1。"""
    with httpx.Client(base_url=e2e_env.api_v1, headers={"X-API-Key": e2e_env.api_key}, timeout=10.0) as client:
        yield client


@pytest.fixture(scope="session")
def api_key_storage_state(browser: Browser, e2e_env: E2EEnv) -> dict[str, Any]:
    """走設定頁存金鑰（ADR-0007：金鑰由使用者輸入、存 localStorage），回傳 storage_state 供所有測試沿用。"""
    context = browser.new_context(**MOBILE_CONTEXT)
    try:
        page = context.new_page()
        page.goto(e2e_env.page_url("/settings"))
        page.get_by_label(re.compile(r"^金鑰")).fill(e2e_env.api_key)
        page.get_by_role("form", name="API 金鑰").get_by_role("button", name="儲存").click()
        expect(page.get_by_text("已儲存在這個瀏覽器")).to_be_visible()
        return context.storage_state()
    finally:
        context.close()


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args: dict[str, Any], api_key_storage_state: dict[str, Any]) -> dict[str, Any]:
    """覆蓋 pytest-playwright 的 context 參數：手機裝置設定 + 已存金鑰的 storage_state。"""
    return {**browser_context_args, **MOBILE_CONTEXT, "storage_state": api_key_storage_state}


@pytest.fixture(scope="session")
def today_taipei() -> date:
    """今天（Asia/Taipei）；與前端 lib/week.ts::todayTaipei 同一個時區。"""
    return datetime.now(ZoneInfo("Asia/Taipei")).date()
