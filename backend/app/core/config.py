"""应用配置"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 9752
    APP_CORS_ORIGINS: list[str] = ["http://localhost:9753"]
    APP_LOG_LEVEL: str = "INFO"

    model_config = {"env_prefix": "APP_", "env_file": ".env"}


settings = Settings()
