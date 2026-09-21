"""應用程式設定：由環境變數／repo 根目錄 .env 讀取。"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# repo 根目錄的 .env（backend/ 的上一層）
_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


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


settings = Settings()
