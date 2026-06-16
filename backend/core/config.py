from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator
from typing import List

# Hardcoded defaults that must never be used in production. They exist only so
# the app boots in local dev; APP_ENV=production rejects them (see validator).
_INSECURE_SECRETS = {"supersecretkey-change-in-production", "local-dev-secret-key-not-for-production"}


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://uptime:uptime_secret@localhost:5432/uptime_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "supersecretkey-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "noreply@uptime.io"
    FRONTEND_URL: str = "http://localhost"
    TELEGRAM_BOT_TOKEN: str = ""
    CORS_ORIGINS: List[str] = ["http://localhost", "http://localhost:3000", "http://localhost:5173"]
    # Stripe billing
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    # OAuth (Google)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    # OAuth (GitHub)
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    # App
    APP_NAME: str = "Uptime"
    APP_ENV: str = "development"  # development | production
    # Monitoring engine controls.
    # Run the in-process asyncio engine? Disable when a separate Celery worker
    # owns checks, otherwise both run and every monitor is checked twice.
    ENABLE_INPROCESS_MONITOR: bool = True
    # Allow monitors that target private/loopback/link-local addresses. Safe for
    # local dev; MUST be False in a multi-tenant deployment to prevent SSRF
    # (e.g. users probing 169.254.169.254 cloud metadata or internal services).
    ALLOW_PRIVATE_TARGETS: bool = True

    @field_validator("DATABASE_URL")
    @classmethod
    def require_postgres(cls, value: str) -> str:
        if value.startswith("sqlite"):
            raise ValueError("SQLite is disabled. Set DATABASE_URL to a PostgreSQL connection string.")
        return value

    @model_validator(mode="after")
    def enforce_production_hardening(self):
        if self.APP_ENV == "production":
            if self.SECRET_KEY in _INSECURE_SECRETS or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY must be a strong, unique value (>=32 chars) in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
                )
            if self.ALLOW_PRIVATE_TARGETS:
                # Not fatal, but loudly discouraged: leaving this on in prod is an SSRF vector.
                import logging
                logging.getLogger("uptime.config").warning(
                    "ALLOW_PRIVATE_TARGETS=True in production — monitors can reach internal hosts (SSRF risk)."
                )
        return self

    class Config:
        env_file = ".env"


settings = Settings()
