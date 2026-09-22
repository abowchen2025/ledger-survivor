"""應用程式設定：由環境變數／repo 根目錄 .env 讀取。

安全相關欄位一律 fail closed：
- ``API_KEY``（REQ-AUTH-000）缺少或為空 → 建立 Settings 時就拋 ValidationError，應用啟動失敗。
  程式碼裡沒有「不檢查」的分支或旁路旗標。
- ``CORS_ALLOWED_ORIGINS``（REQ-NFR-009，見 docs/spec-gaps.md 第 7 節）是逗號分隔的來源清單，
  這裡解析成 list；禁止 ``*``，來源只能是 scheme + host[:port]（Origin 標頭本來就不帶路徑）。
  未設定時為空清單：不允許任何跨來源請求，而不是全開。
"""

from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# repo 根目錄的 .env（backend/ 的上一層）
_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


def parse_origins(raw: str | list[str]) -> list[str]:
    """把逗號分隔字串解析成來源清單；空白與空項目忽略。"""
    if isinstance(raw, str):
        return [item.strip() for item in raw.split(",") if item.strip()]
    return [item.strip() for item in raw if item.strip()]


def validate_origin(origin: str) -> str:
    """一個合法來源 = scheme://host[:port]，不得是萬用字元、不得帶路徑／查詢／片段。"""
    if origin == "*" or "*" in origin:
        raise ValueError(f"CORS_ALLOWED_ORIGINS must not contain a wildcard: {origin!r}")
    parts = urlsplit(origin)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError(f"CORS_ALLOWED_ORIGINS entry must be scheme://host[:port]: {origin!r}")
    if parts.path or parts.query or parts.fragment:
        raise ValueError(
            f"CORS_ALLOWED_ORIGINS entry must not contain a path (Origin headers never do): {origin!r}"
        )
    return origin


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_ROOT_ENV, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://ledger:ledger@localhost:55432/ledger_survivor"
    debug: bool = False
    tz: str = "Asia/Taipei"  # REQ-WEEK-005：固定 Asia/Taipei
    api_prefix: str = "/api/v1"
    default_user_id: int = 1  # 初版單人使用，所有表 user_id 固定為 1

    # REQ-AUTH-000：沒有預設值。環境變數缺少 → pydantic「Field required」，應用啟動失敗。
    api_key: str

    # REQ-NFR-009：NoDecode 讓 pydantic-settings 不把環境變數當 JSON 解析，交給下方 validator 切逗號。
    cors_allowed_origins: Annotated[list[str], NoDecode] = []

    @field_validator("api_key")
    @classmethod
    def _api_key_non_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("API_KEY must be set and non-empty (REQ-AUTH-000, fail closed)")
        return value

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_and_validate_origins(cls, value: str | list[str]) -> list[str]:
        return [validate_origin(origin) for origin in parse_origins(value)]


settings = Settings()
