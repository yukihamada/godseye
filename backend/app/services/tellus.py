import httpx

from app.config import settings
from app.models.schemas import TellusResult

# PALSAR-2 L2.1のデータセットID
PALSAR2_DATASET_ID = "b0e16dea-6544-4422-926f-ad3ec9a3fcbd"


async def get_tellus_data(lat: float, lng: float) -> TellusResult:
    """Tellus APIからSAR画像シーンを検索する。"""
    token = settings.tellus_api_token
    if not token:
        return TellusResult()

    try:
        scenes = await _search_scenes(lat, lng, token)
        return TellusResult(
            scenes_found=len(scenes),
            scene_ids=[s.get("id", "") for s in scenes[:10]],
            observation_dates=[
                s.get("properties", {}).get("start_datetime", "")[:10]
                for s in scenes[:10]
            ],
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Tellus API error: %s", e)
        return TellusResult()


async def _search_scenes(lat: float, lng: float, token: str) -> list[dict]:
    """対象座標付近のSARシーンを検索する。"""
    delta = 0.05
    polygon = [
        [lng - delta, lat - delta],
        [lng + delta, lat - delta],
        [lng + delta, lat + delta],
        [lng - delta, lat + delta],
        [lng - delta, lat - delta],
    ]

    url = f"{settings.tellus_base_url}/data-search/"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    body = {
        "datasets": [PALSAR2_DATASET_ID],
        "query": {},
        "intersects": {
            "type": "Polygon",
            "coordinates": [polygon],
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            import logging
            logging.getLogger(__name__).warning(
                "Tellus API returned %s: %s", resp.status_code, resp.text[:200]
            )
            return []
        data = resp.json()

    items = data.get("features", data.get("items", []))
    # 最新10件に絞る
    return items[:10]
