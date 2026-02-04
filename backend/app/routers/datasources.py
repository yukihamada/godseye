from fastapi import APIRouter, Query

from app.models.schemas import JshisResult, PlateauResult, StreetViewResult, TellusResult
from app.services.jshis import get_jshis_data
from app.services.plateau import get_plateau_data
from app.services.streetview import get_streetview_data
from app.services.tellus import get_tellus_data

router = APIRouter(prefix="/api", tags=["datasources"])


@router.get("/jshis", response_model=JshisResult)
async def jshis_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    """J-SHIS地盤情報を取得する。"""
    return await get_jshis_data(lat, lng)


@router.get("/plateau", response_model=PlateauResult)
async def plateau_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    """PLATEAU建物属性を取得する。"""
    return await get_plateau_data(lat, lng)


@router.get("/streetview", response_model=StreetViewResult)
async def streetview_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    """Google Street View画像情報を取得する。"""
    return await get_streetview_data(lat, lng)


@router.get("/tellus", response_model=TellusResult)
async def tellus_endpoint(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    """Tellus SAR画像シーン情報を取得する。"""
    return await get_tellus_data(lat, lng)
