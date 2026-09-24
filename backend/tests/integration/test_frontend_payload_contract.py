"""前端實際產生的 API payload × 後端真正的 Pydantic schema（契約測試）。

背景（2026-09-24）：Pages 上新增信用卡失敗。前端把整包表單狀態展開送出，多帶了 ``CardCreate``
沒有的 ``is_active``，後端 ``RequestModel`` 的 ``extra="forbid"`` 正確地回 400。typecheck 與 73 個
測試都沒抓到：TypeScript 展開物件不檢查多餘屬性、前端 mock 測試看不到後端 schema、
手寫 payload 的煙測驗的不是前端真正送出的東西。

做法（比照 test_week_rule_consistency.py）：
1. subprocess 執行 ``npm run payload:dump``（frontend/scripts/payload-dump.ts）：前端用「表單真正呼叫的
   組裝函式」（lib/card-payload.ts、lib/expense-payload.ts）對幾組代表性表單狀態產生 payload。
2. 這裡把每一筆丟進對應的 Pydantic 請求 schema ``model_validate``；任一筆被拒即失敗，訊息列出
   case id 與 pydantic 的錯誤（含 ``extra_forbidden`` 的欄位名）。
3. 另外檢查涵蓋面：卡片新增／編輯／停用、花費新增（現金、信用卡、行動支付、退款）／編輯
   都必須至少有一筆，避免有人把 case 刪掉讓測試變空。

這個測試擋的是「前端與後端對資料形狀的理解不一致」；型別檢查與 mock 測試都擋不住這一類。
不改後端任何行為，只讀 schema。

前置條件：Node.js 22 與 frontend/node_modules（``npm ci``）。CI 由 setup-node 提供；
本機缺少時直接失敗並說明原因，不會 skip。
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from pydantic import BaseModel, ValidationError

from app.schemas.card import CardCreate, CardUpdate
from app.schemas.expense import ExpenseCreate, ExpenseUpdate

pytestmark = [pytest.mark.p0, pytest.mark.integration]

BACKEND_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"

# 前端 dump 的 schema 名 → 後端真正的請求 schema（新增業務表單時在這裡登記）
SCHEMAS: dict[str, type[BaseModel]] = {
    "CardCreate": CardCreate,
    "CardUpdate": CardUpdate,
    "ExpenseCreate": ExpenseCreate,
    "ExpenseUpdate": ExpenseUpdate,
}

# 每個情境至少要有一筆 case（與 payload-dump.ts 的 Scenario 型別一致）
REQUIRED_SCENARIOS = {
    "card_create",
    "card_edit",
    "card_deactivate",
    "card_reactivate",
    "expense_create_cash",
    "expense_create_credit_card",
    "expense_create_mobile_pay",
    "expense_create_transfer",
    "expense_create_refund",
    "expense_edit",
}


@pytest.fixture(scope="module")
def dump() -> dict:
    """前端 dump 只跑一次，三個測試共用（npm 啟動要幾秒）。"""
    return _frontend_dump()


def _frontend_dump() -> dict:
    """執行 npm run payload:dump 取得前端輸出；任何環境問題都以失敗（非 skip）呈現。"""
    npm = shutil.which("npm")
    assert npm, "找不到 npm：契約測試需要 Node.js 22（CI 由 actions/setup-node 提供）"
    assert (FRONTEND_DIR / "node_modules").is_dir(), f"{FRONTEND_DIR / 'node_modules'} 不存在：請先在 frontend/ 執行 npm ci"
    proc = subprocess.run(
        [npm, "run", "--silent", "payload:dump"],
        cwd=FRONTEND_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
        check=False,
    )
    assert proc.returncode == 0, (
        f"npm run payload:dump 失敗（exit {proc.returncode}）\n--- stdout ---\n{proc.stdout}\n--- stderr ---\n{proc.stderr}"
    )
    return json.loads(proc.stdout)


def _format_errors(exc: ValidationError) -> str:
    return "; ".join(f"{'.'.join(str(p) for p in e['loc']) or '<root>'}: {e['type']} ({e['msg']})" for e in exc.errors())


def test_frontend_payloads_accepted_by_backend_schemas(dump: dict) -> None:
    """前端每一筆實際組出的 payload 都必須被對應的後端請求 schema 接受（extra=forbid 不放寬）。"""
    cases = dump["cases"]
    assert cases, "前端 payload dump 沒有任何 case"

    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)), f"case id 重複：{sorted(i for i in ids if ids.count(i) > 1)}"

    unknown_schemas = sorted({c["schema"] for c in cases} - SCHEMAS.keys())
    assert not unknown_schemas, f"前端 dump 用了後端沒登記的 schema 名：{unknown_schemas}（在本檔 SCHEMAS 登記）"

    rejected: list[str] = []
    for case in cases:
        schema = SCHEMAS[case["schema"]]
        try:
            schema.model_validate(case["payload"])
        except ValidationError as exc:
            rejected.append(f"{case['id']} → {schema.__name__}: {_format_errors(exc)}\n    payload={json.dumps(case['payload'], ensure_ascii=False)}")

    assert not rejected, "前端實際產生的 payload 被後端 schema 拒絕（前後端資料形狀不一致，Blocker）：\n" + "\n".join(rejected)


def test_frontend_payload_dump_covers_required_scenarios(dump: dict) -> None:
    """涵蓋面：卡片新增／編輯／停用／啟用、花費新增（現金、信用卡、行動支付、轉帳、退款）／編輯至少各一筆。"""
    scenarios = {c["scenario"] for c in dump["cases"]}
    missing = sorted(REQUIRED_SCENARIOS - scenarios)
    assert not missing, f"前端 payload dump 缺少情境：{missing}（見 frontend/scripts/payload-dump.ts）"
    unknown = sorted(scenarios - REQUIRED_SCENARIOS)
    assert not unknown, f"前端 dump 有後端沒登記的情境：{unknown}（在本檔 REQUIRED_SCENARIOS 登記）"


def test_frontend_card_create_never_sends_is_active(dump: dict) -> None:
    """2026-09-24 的回歸：新增卡片的 payload 不得含 is_active（CardCreate 沒有這個欄位）。"""
    offenders = [c["id"] for c in dump["cases"] if c["schema"] == "CardCreate" and "is_active" in c["payload"]]
    assert not offenders, f"新增卡片 payload 含 is_active：{offenders}"
