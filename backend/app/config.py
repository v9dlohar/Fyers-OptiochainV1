"""Application configuration."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables or .env."""

    app_name: str = "Options Chain API"
    environment: str = "development"
    api_prefix: str = ""
    frontend_origin: str = "http://localhost:3000"
    database_url: str = "sqlite:///./options_chain.db"
    secret_key: str = "change-me-in-environment-use-at-least-32-bytes"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30
    jwt_algorithm: str = "HS256"
    admin_email: str = ""
    fyers_client_id: str = ""
    fyers_client_secret: str = ""
    fyers_pin: str = ""
    fyers_redirect_uri: str = ""
    fyers_api_base_url: str = "https://api-t1.fyers.in"
    fyers_encryption_key: str = ""
    fyers_oauth_state_expire_minutes: int = 10

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return a cached settings instance."""

    return Settings()
