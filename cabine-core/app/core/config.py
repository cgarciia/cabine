import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Cabine API"
    PROJECT_VERSION: str = "1.0.0"
    POSTGRES_SERVER: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    PERSON_TOKEN_EXPIRE_MINUTES: int = 30
    OPERATOR_TOKEN_EXPIRE_MINUTES: int = 480

    LOGIN_MAX_FAILURES_PER_SUBJECT: int = 5
    LOGIN_MAX_FAILURES_PER_IP: int = 30
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 300

    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    BACKEND_CORS_ORIGIN_REGEX: str = (
        r"https?://("
        r"localhost|127\.0\.0\.1|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?"
    )
    SQL_ECHO: bool = False
    CABIN_STATE_PATH: str = ""

    @property
    def ASYNC_DATABASE_URI(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()


def cabin_state_file() -> Path:
    configured = settings.CABIN_STATE_PATH.strip()
    if configured:
        return Path(configured)
    program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    return Path(program_data) / "Cabine" / "cabin.json"
