import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.routers import datasources, diagnose, mesh3d

# ログ設定
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """セキュリティヘッダーを追加するミドルウェア"""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーションのライフサイクル管理"""
    logger.info(f"Starting God's Eye API (env: {settings.environment})")
    logger.info(f"CORS origins: {settings.cors_origins}")
    # API設定状態をログ
    api_status = {
        "google_streetview": bool(settings.google_streetview_api_key),
        "tellus": bool(settings.tellus_api_token),
        "roboflow": bool(settings.roboflow_api_key),
        "meshy": bool(settings.meshy_api_key),
    }
    logger.info(f"API keys configured: {api_status}")
    yield
    logger.info("Shutting down God's Eye API")


app = FastAPI(
    title="God's Eye — 地震倒壊リスク診断API",
    version="0.1.0",
    description="PLATEAU, J-SHIS, Google Street View, Tellusを統合した建物地震リスク診断",
    lifespan=lifespan,
)

# Middlewares
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(diagnose.router)
app.include_router(datasources.router)
app.include_router(mesh3d.router)


@app.get("/health")
async def health():
    """基本ヘルスチェック"""
    return {"status": "ok"}


@app.get("/health/detailed")
async def health_detailed():
    """詳細ヘルスチェック - 依存サービスの状態を返す"""
    from pathlib import Path

    ml_model_path = Path(__file__).parent.parent / "ml" / "model" / "collapse_model.txt"

    return {
        "status": "ok",
        "environment": settings.environment,
        "services": {
            "google_streetview": "configured" if settings.google_streetview_api_key else "not_configured",
            "tellus": "configured" if settings.tellus_api_token else "not_configured",
            "roboflow": "configured" if settings.roboflow_api_key else "not_configured",
            "meshy": "configured" if settings.meshy_api_key else "not_configured",
            "ml_model": "loaded" if ml_model_path.exists() else "not_found",
        },
    }
