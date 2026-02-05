import os

from pydantic_settings import BaseSettings


def _parse_cors_origins() -> list[str]:
    """環境変数からCORSオリジンをパース"""
    env_origins = os.getenv("CORS_ORIGINS", "")
    if env_origins:
        return [o.strip() for o in env_origins.split(",") if o.strip()]
    # デフォルト（開発環境）
    return ["http://localhost:3000", "https://godseye-web.fly.dev"]


class Settings(BaseSettings):
    # API Keys
    google_streetview_api_key: str = ""
    tellus_api_token: str = ""
    roboflow_api_key: str = ""
    meshy_api_key: str = ""

    # External API URLs
    jshis_base_url: str = "https://www.j-shis.bosai.go.jp/map/api"
    plateau_base_url: str = "https://api.plateauview.mlit.go.jp"
    streetview_base_url: str = "https://maps.googleapis.com/maps/api/streetview"
    tellus_base_url: str = "https://www.tellusxdp.com/api/traveler/v1"

    # Security
    cors_origins: list[str] = _parse_cors_origins()

    # Logging
    log_level: str = "INFO"

    # Environment
    environment: str = "development"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
