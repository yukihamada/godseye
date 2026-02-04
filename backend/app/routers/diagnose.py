import asyncio

from fastapi import APIRouter

from app.models.schemas import DiagnoseRequest, DiagnoseResponse, RoboflowResult
from app.services.jshis import get_jshis_data
from app.services.plateau import get_plateau_data
from app.services.risk_engine import calculate_risk
from app.services.roboflow import analyze_building
from app.services.streetview import get_streetview_data
from app.services.tellus import get_tellus_data

router = APIRouter(prefix="/api", tags=["diagnose"])


@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose(req: DiagnoseRequest):
    """統合地震倒壊リスク診断を実行する。"""
    # 4つのデータソースを並行取得
    jshis_task = get_jshis_data(req.lat, req.lng)
    plateau_task = get_plateau_data(req.lat, req.lng)
    sv_task = get_streetview_data(req.lat, req.lng)
    tellus_task = get_tellus_data(req.lat, req.lng)

    jshis, plateau, streetview, tellus = await asyncio.gather(
        jshis_task, plateau_task, sv_task, tellus_task,
        return_exceptions=False,
    )

    # Street View画像が取得できたらRoboflow AI解析を実行
    roboflow = RoboflowResult()
    if streetview.available and streetview.image_urls:
        roboflow = await analyze_building(streetview)

    # リスク計算（Roboflow損傷スコアも統合）
    risk = calculate_risk(plateau, jshis, roboflow)

    return DiagnoseResponse(
        lat=req.lat,
        lng=req.lng,
        risk=risk,
        jshis=jshis,
        plateau=plateau,
        streetview=streetview,
        tellus=tellus,
        roboflow=roboflow,
    )
