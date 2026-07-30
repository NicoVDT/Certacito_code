import os
from pydantic_settings import BaseSettings

_backend_dir = os.path.dirname(os.path.abspath(__file__))


class Settings(BaseSettings):
    # db - env so no hardcoded creds
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://certacito:certacito@localhost:5432/certacito"
    )

    # jwt
    secret_key: str = os.getenv("SECRET_KEY", "dev-only-change-in-prod")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # policy engine - defaults sit next to this file
    policy_config_path: str = os.getenv("POLICY_CONFIG", os.path.join(_backend_dir, "policies.yaml"))
    rule_library_path: str = os.getenv("RULE_LIBRARY", os.path.join(_backend_dir, "rule_library.yaml"))

    # shared key for agent endpoints (intercept etc).
    # agents can't do jwt login so they get a key. empty = fail-closed.
    agent_api_key: str = os.getenv("AGENT_API_KEY", "")

    # rate limiter state. shared through redis so the counters survive a
    # restart and hold across more than one container
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # only turn this on when something in front of the app overwrites
    # x-real-ip. off, the header is whatever the client typed, and trusting
    # it hands out a fresh rate limit bucket per request
    trust_proxy_header: bool = os.getenv("TRUST_PROXY_HEADER", "false").lower() == "true"

    # approval queue sla (seconds)
    sla_timeout: int = 3600

    # smtp optional - reports still store without it, just no email
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_from: str = os.getenv("SMTP_FROM", "")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
