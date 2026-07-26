"""应用配置"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 9752
    cors_origins: list[str] = ["http://localhost:9753"]
    log_level: str = "INFO"

    model_config = {"env_prefix": "APP_", "env_file": ".env"}


settings = Settings()
