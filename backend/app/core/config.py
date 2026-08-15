"""应用配置"""
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 9752
    cors_origins: list[str] = ["http://localhost:9753", "null"]
    log_level: str = "INFO"
    operation_log_retention_days: int = Field(default=30, ge=7, le=30)

    model_config = {"env_prefix": "APP_", "env_file": ".env"}


settings = Settings()
