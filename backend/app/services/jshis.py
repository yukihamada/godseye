import httpx

from app.config import settings
from app.models.schemas import JshisResult


async def fetch_ground_info(lat: float, lng: float) -> JshisResult:
    """J-SHIS APIから表層地盤情報を取得する。"""
    url = f"{settings.jshis_base_url}/sstrct/V4/meshinfo.geojson"
    params = {"position": f"{lng},{lat}", "epsg": "4326"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    result = JshisResult()

    features = data.get("features", [])
    if not features:
        return result

    props = features[0].get("properties", {})
    result.amplification_factor = _to_float(props.get("ARV"))
    result.vs30 = _to_float(props.get("AVS"))
    result.micro_topography_code = props.get("JCODE")
    result.micro_topography_name = props.get("JNAME")

    return result


async def fetch_hazard_info(lat: float, lng: float) -> dict:
    """J-SHIS APIから地震ハザード情報（30年確率）を取得する。"""
    url = f"{settings.jshis_base_url}/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson"
    params = {"position": f"{lng},{lat}", "epsg": "4326"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    features = data.get("features", [])
    if not features:
        return {}

    return features[0].get("properties", {})


async def get_jshis_data(lat: float, lng: float) -> JshisResult:
    """地盤情報とハザード情報を統合して返す。"""
    result = await fetch_ground_info(lat, lng)

    try:
        hazard = await fetch_hazard_info(lat, lng)
        result.prob_intensity_6lower_30yr = _to_float(hazard.get("T30_I55_PS"))
        result.prob_intensity_6upper_30yr = _to_float(hazard.get("T30_I60_PS"))
    except Exception:
        pass

    return result


def _to_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
