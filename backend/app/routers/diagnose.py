import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    AerialPhotoResult,
    BuildingAgeResult,
    DiagnoseRequest,
    DiagnoseResponse,
    HistoricalImage,
    HistoricalStreetViewResult,
    JshisResult,
    PlateauResult,
    PlacePhoto,
    PlacesResult,
    RoboflowResult,
    StreetViewResult,
    TellusResult,
)

logger = logging.getLogger(__name__)
from app.services.aerial import get_aerial_photo
from app.services.building_age import estimate_building_age
from app.services.geocoding import geocode_address
from app.services.jshis import get_jshis_data
from app.services.places import get_place_photos
from app.services.plateau import get_plateau_data
from app.services.risk_engine import calculate_risk
from app.services.roboflow import analyze_building
from app.services.streetview import (
    get_historical_streetview,
    get_streetview_data,
    get_streetview_facing_building,
)
from app.services.tellus import get_tellus_data

router = APIRouter(prefix="/api", tags=["diagnose"])


@router.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose(req: DiagnoseRequest):
    """統合地震倒壊リスク診断を実行する。

    住所またはlat/lngを指定可能。
    PLATEAU建物座標が取得できた場合はその座標でStreet Viewを取得（より正確）。
    """
    # 座標の決定（住所 or lat/lng）
    lat: float
    lng: float
    resolved_address: str | None = None

    if req.address:
        # 住所からジオコーディング
        geo_result = await geocode_address(req.address)
        if not geo_result:
            raise HTTPException(status_code=400, detail="住所が見つかりませんでした")
        lat = geo_result.lat
        lng = geo_result.lng
        resolved_address = geo_result.address
    elif req.lat is not None and req.lng is not None:
        lat = req.lat
        lng = req.lng
    else:
        raise HTTPException(status_code=400, detail="lat/lng または address を指定してください")

    # Step 1: まずPLATEAU・J-SHIS・Tellusを並行取得（個別失敗を許容）
    jshis_task = get_jshis_data(lat, lng)
    plateau_task = get_plateau_data(lat, lng)
    tellus_task = get_tellus_data(lat, lng)

    results = await asyncio.gather(
        jshis_task, plateau_task, tellus_task,
        return_exceptions=True,
    )

    # 個別サービスの失敗をログしてデフォルト値で継続
    jshis = results[0] if not isinstance(results[0], Exception) else JshisResult()
    if isinstance(results[0], Exception):
        logger.warning(f"J-SHIS API failed: {results[0]}")

    plateau = results[1] if not isinstance(results[1], Exception) else PlateauResult()
    if isinstance(results[1], Exception):
        logger.warning(f"PLATEAU API failed: {results[1]}")

    tellus = results[2] if not isinstance(results[2], Exception) else TellusResult()
    if isinstance(results[2], Exception):
        logger.warning(f"Tellus API failed: {results[2]}")

    # Step 2: PLATEAU建物座標があればそれを使用、なければジオコーディング座標
    # これにより「丁目中心」ではなく「実際の建物位置」でStreet Viewを取得
    building_lat = plateau.building_lat if plateau.building_lat else lat
    building_lng = plateau.building_lng if plateau.building_lng else lng

    # Step 3: Street View、航空写真、周辺施設写真、築年推定を建物座標で取得
    aerial_task = get_aerial_photo(building_lat, building_lng, zoom=18)
    places_task = get_place_photos(building_lat, building_lng, radius=30, max_photos=5)
    # 築年推定（PLATEAUの築年があれば参照用に渡す）
    building_age_task = estimate_building_age(
        building_lat, building_lng, plateau_year_built=plateau.year_built
    )

    # 住所指定 or PLATEAU建物が見つかった場合は建物向き最適化Street View
    if req.address or plateau.building_id:
        sv_task = get_streetview_facing_building(building_lat, building_lng)
    else:
        sv_task = get_streetview_data(building_lat, building_lng)

    results2 = await asyncio.gather(
        aerial_task, sv_task, places_task, building_age_task,
        return_exceptions=True,
    )

    # 個別サービスの失敗をログしてデフォルト値で継続
    aerial_result = results2[0] if not isinstance(results2[0], Exception) else None
    if isinstance(results2[0], Exception):
        logger.warning(f"Aerial photo API failed: {results2[0]}")

    streetview = results2[1] if not isinstance(results2[1], Exception) else StreetViewResult()
    if isinstance(results2[1], Exception):
        logger.warning(f"Street View API failed: {results2[1]}")

    places_photos = results2[2] if not isinstance(results2[2], Exception) else []
    if isinstance(results2[2], Exception):
        logger.warning(f"Places API failed: {results2[2]}")

    building_age_result = results2[3] if not isinstance(results2[3], Exception) else None
    if isinstance(results2[3], Exception):
        logger.warning(f"Building age estimation failed: {results2[3]}")

    # 航空写真結果をスキーマに変換
    if aerial_result:
        aerial = AerialPhotoResult(
            available=aerial_result.available,
            image_url=aerial_result.image_url,
            zoom=aerial_result.zoom,
            source="gsi",
        )
    else:
        aerial = AerialPhotoResult(available=False, image_url=None, zoom=18, source="gsi")

    # 築年推定結果をスキーマに変換
    if building_age_result:
        building_age = BuildingAgeResult(
            estimated=building_age_result.estimated,
            year_built_min=building_age_result.year_built_min,
            year_built_max=building_age_result.year_built_max,
            confidence=building_age_result.confidence,
            first_appearance_layer=building_age_result.first_appearance_layer,
            first_appearance_period=building_age_result.first_appearance_period,
            available_layers=building_age_result.available_layers,
            method=building_age_result.method,
        )
    else:
        building_age = BuildingAgeResult()

    # Places写真をスキーマに変換
    places = PlacesResult(
        available=len(places_photos) > 0,
        photos=[
            PlacePhoto(
                url=p["url"],
                attribution=p.get("attribution", ""),
                place_name=p.get("place_name", ""),
                place_type=p.get("place_type", ""),
            )
            for p in places_photos
        ] if places_photos else [],
    )

    # PLATEAUで住所が取得できた場合は使用
    if plateau.address and not resolved_address:
        resolved_address = plateau.address

    # Step 4: 過去のStreet View画像を取得（建物への方位角を使用）
    heading = streetview.heading_to_building if streetview.heading_to_building else 0
    historical_sv = await get_historical_streetview(
        building_lat, building_lng, heading=heading, max_images=5
    )

    # HistoricalStreetViewをスキーマに変換
    streetview_historical = HistoricalStreetViewResult(
        available=historical_sv.available,
        images=[
            HistoricalImage(
                url=img["url"],
                date=img.get("date", ""),
                pano_id=img.get("pano_id", ""),
            )
            for img in historical_sv.images
        ],
    )

    # Street View画像が取得できたらRoboflow AI解析を実行
    roboflow = RoboflowResult()
    if streetview.available and streetview.image_urls:
        roboflow = await analyze_building(streetview)

    # リスク計算（Roboflow損傷スコア + ML倒壊確率 + 築年推定も統合）
    risk = calculate_risk(
        plateau, jshis, roboflow,
        footprint_area_m2=plateau.total_floor_area,
        building_age=building_age,
    )

    return DiagnoseResponse(
        lat=lat,
        lng=lng,
        address=resolved_address,
        risk=risk,
        jshis=jshis,
        plateau=plateau,
        streetview=streetview,
        streetview_historical=streetview_historical,
        places=places,
        aerial=aerial,
        building_age=building_age,
        tellus=tellus,
        roboflow=roboflow,
    )
