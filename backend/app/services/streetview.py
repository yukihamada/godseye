import httpx

from app.config import settings
from app.models.schemas import StreetViewResult

HEADINGS = [0, 90, 180, 270]
IMAGE_SIZE = "640x640"


async def get_streetview_data(lat: float, lng: float) -> StreetViewResult:
    """Google Street View Static APIから4方向の画像情報を取得する。"""
    api_key = settings.google_streetview_api_key
    if not api_key:
        return StreetViewResult(available=False)

    # まずメタデータで画像の有無を確認（無料）
    meta = await _check_metadata(lat, lng, api_key)
    if not meta.get("status") == "OK":
        return StreetViewResult(available=False)

    pano_id = meta.get("pano_id")

    # 4方向の画像URLを生成
    image_urls = []
    for heading in HEADINGS:
        url = (
            f"{settings.streetview_base_url}"
            f"?size={IMAGE_SIZE}"
            f"&location={lat},{lng}"
            f"&heading={heading}"
            f"&fov=90&pitch=10"
            f"&key={api_key}"
        )
        image_urls.append(url)

    return StreetViewResult(
        available=True,
        image_urls=image_urls,
        pano_id=pano_id,
    )


async def _check_metadata(lat: float, lng: float, api_key: str) -> dict:
    """Street Viewのメタデータを取得し画像有無を確認する。"""
    url = f"{settings.streetview_base_url}/metadata"
    params = {
        "location": f"{lat},{lng}",
        "key": api_key,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()
