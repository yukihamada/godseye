from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    google_streetview_api_key: str = ""
    tellus_api_token: str = ""
    roboflow_api_key: str = ""

    jshis_base_url: str = "https://www.j-shis.bosai.go.jp/map/api"
    plateau_base_url: str = "https://api.plateauview.mlit.go.jp"
    streetview_base_url: str = "https://maps.googleapis.com/maps/api/streetview"
    tellus_base_url: str = "https://www.tellusxdp.com/api/traveler/v1"

    cors_origins: list[str] = [
        "http://localhost:3000",
        "https://godseye-web.fly.dev",
    ]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
