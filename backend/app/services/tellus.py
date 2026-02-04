import httpx

from app.config import settings
from app.models.schemas import TellusResult

# PALSAR-2のデータセットID (Tellus上)
PALSAR2_DATASET_ID = "ea71ef6e-9569-49fc-be16-ba2d3a11571a"


async def get_tellus_data(lat: float, lng: float) -> TellusResult:
    """Tellus APIからSAR画像シーンを検索する。"""
    token = settings.tellus_api_token
    if not token:
        return TellusResult()

    try:
        scenes = await _search_scenes(lat, lng, token)
        return TellusResult(
            scenes_found=len(scenes),
            scene_ids=[s.get("dataset_id", s.get("id", "")) for s in scenes[:10]],
            observation_dates=[s.get("date", s.get("begin_at", "")) for s in scenes[:10]],
        )
    except Exception:
        return TellusResult()


async def _search_scenes(lat: float, lng: float, token: str) -> list[dict]:
    """対象座標付近のSARシーンを検索する。"""
    # バウンディングボックス (±0.05度 ≈ 約5km)
    delta = 0.05
    bbox = f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}"

    url = f"{settings.tellus_base_url}/datasets/{PALSAR2_DATASET_ID}/data-search/"
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "bbox": bbox,
        "limit": 10,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=headers, params=params)
        if resp.status_code != 200:
            return []
        data = resp.json()

    return data.get("items", data.get("results", []))
