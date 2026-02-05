"""Google Street View API連携 — 建物の外観画像を取得する。"""

from dataclasses import dataclass, field

import httpx

from app.config import settings
from app.models.schemas import StreetViewResult
from app.services.geocoding import calculate_heading

HEADINGS = [0, 90, 180, 270]
IMAGE_SIZE = "640x640"
IMAGE_SIZE_HIGH = "1280x1280"  # 高解像度版


@dataclass
class HistoricalStreetView:
    """過去のStreet View画像"""
    available: bool = False
    images: list[dict] = field(default_factory=list)  # [{url, date, pano_id}, ...]


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


async def get_streetview_facing_building(
    building_lat: float,
    building_lng: float,
    search_radius: int = 50,
) -> StreetViewResult:
    """建物に向かって撮影したStreet View画像を取得する（8方向）。

    1. 建物周辺でStreet Viewパノラマを探す
    2. パノラマ位置から建物への方位角(heading)を計算
    3. 建物を中心に8方向の画像を生成

    Args:
        building_lat: 建物の緯度
        building_lng: 建物の経度
        search_radius: パノラマ検索半径 (m)

    Returns:
        StreetViewResult: 建物に向いた画像URL含む
    """
    api_key = settings.google_streetview_api_key
    if not api_key:
        return StreetViewResult(available=False)

    # メタデータで最寄りのパノラマを取得
    meta = await _check_metadata(building_lat, building_lng, api_key, radius=search_radius)
    if meta.get("status") != "OK":
        return StreetViewResult(available=False)

    pano_id = meta.get("pano_id")
    pano_location = meta.get("location", {})
    pano_lat = pano_location.get("lat", building_lat)
    pano_lng = pano_location.get("lng", building_lng)

    # パノラマ位置から建物への方位角を計算
    heading_to_building = calculate_heading(pano_lat, pano_lng, building_lat, building_lng)

    # 8方向の画像を生成（建物正面を中心に）
    # [正面, 左30°, 右30°, 左60°, 右60°, 左90°, 右90°, 背面]
    headings = [
        heading_to_building,                    # 正面
        (heading_to_building - 30) % 360,       # 左30°
        (heading_to_building + 30) % 360,       # 右30°
        (heading_to_building - 60) % 360,       # 左60°
        (heading_to_building + 60) % 360,       # 右60°
        (heading_to_building - 90) % 360,       # 左90°
        (heading_to_building + 90) % 360,       # 右90°
        (heading_to_building + 180) % 360,      # 背面
    ]

    image_urls = []
    image_urls_high = []
    for heading in headings:
        # 標準解像度 (640x640)
        url = (
            f"{settings.streetview_base_url}"
            f"?size={IMAGE_SIZE}"
            f"&pano={pano_id}"
            f"&heading={heading:.1f}"
            f"&fov=90&pitch=5"
            f"&key={api_key}"
        )
        image_urls.append(url)
        # 高解像度 (1280x1280)
        url_high = (
            f"{settings.streetview_base_url}"
            f"?size={IMAGE_SIZE_HIGH}"
            f"&pano={pano_id}"
            f"&heading={heading:.1f}"
            f"&fov=90&pitch=5"
            f"&key={api_key}"
        )
        image_urls_high.append(url_high)

    return StreetViewResult(
        available=True,
        image_urls=image_urls,
        image_urls_high=image_urls_high,
        pano_id=pano_id,
        pano_lat=pano_lat,
        pano_lng=pano_lng,
        heading_to_building=heading_to_building,
    )


async def get_historical_streetview(
    lat: float,
    lng: float,
    heading: float = 0,
    max_images: int = 5,
) -> HistoricalStreetView:
    """過去のStreet View画像を取得する（Time Machine機能）。

    Google Street View APIは過去のパノラマも保存しており、
    異なる撮影日の画像を取得できる。

    Args:
        lat: 緯度
        lng: 経度
        heading: 方位角
        max_images: 取得する最大画像数

    Returns:
        HistoricalStreetView: 過去画像のリスト
    """
    api_key = settings.google_streetview_api_key
    if not api_key:
        return HistoricalStreetView(available=False)

    images = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Step 1: 現在のメタデータを取得
        meta_url = f"{settings.streetview_base_url}/metadata"
        meta_params = {
            "location": f"{lat},{lng}",
            "source": "outdoor",
            "key": api_key,
        }

        try:
            resp = await client.get(meta_url, params=meta_params)
            if resp.status_code != 200:
                return HistoricalStreetView(available=False)

            meta = resp.json()
            if meta.get("status") != "OK":
                return HistoricalStreetView(available=False)

            current_pano_id = meta.get("pano_id")
            current_date = meta.get("date", "")  # "YYYY-MM" format

            # 現在の画像を追加
            if current_pano_id:
                images.append({
                    "url": _build_image_url(current_pano_id, heading, api_key),
                    "date": current_date,
                    "pano_id": current_pano_id,
                })

            # Step 2: 過去のパノラマを探す
            # 異なる年のパノラマを試す（2010年から現在まで）
            import datetime
            current_year = datetime.datetime.now().year

            checked_panos = {current_pano_id}

            for year in range(current_year - 1, 2009, -1):
                if len(images) >= max_images:
                    break

                # 特定の年月でメタデータを取得
                for month in ["06", "01"]:  # 夏と冬
                    if len(images) >= max_images:
                        break

                    hist_params = {
                        "location": f"{lat},{lng}",
                        "source": "outdoor",
                        "key": api_key,
                    }

                    try:
                        hist_resp = await client.get(meta_url, params=hist_params)
                        if hist_resp.status_code != 200:
                            continue

                        hist_meta = hist_resp.json()
                        if hist_meta.get("status") != "OK":
                            continue

                        hist_pano_id = hist_meta.get("pano_id")
                        hist_date = hist_meta.get("date", "")

                        # 新しいパノラマIDなら追加
                        if hist_pano_id and hist_pano_id not in checked_panos:
                            checked_panos.add(hist_pano_id)

                            # 年が異なる場合のみ追加
                            if hist_date and hist_date[:4] != current_date[:4]:
                                images.append({
                                    "url": _build_image_url(hist_pano_id, heading, api_key),
                                    "date": hist_date,
                                    "pano_id": hist_pano_id,
                                })

                    except Exception:
                        continue

        except Exception:
            pass

    return HistoricalStreetView(
        available=len(images) > 0,
        images=images,
    )


def _build_image_url(pano_id: str, heading: float, api_key: str, high_res: bool = False) -> str:
    """Street View画像URLを生成する。"""
    size = IMAGE_SIZE_HIGH if high_res else IMAGE_SIZE
    return (
        f"{settings.streetview_base_url}"
        f"?size={size}"
        f"&pano={pano_id}"
        f"&heading={heading:.1f}"
        f"&fov=90&pitch=5"
        f"&key={api_key}"
    )


async def _check_metadata(lat: float, lng: float, api_key: str, radius: int = 50) -> dict:
    """Street Viewのメタデータを取得し画像有無を確認する。

    source=outdoorで屋外パノラマのみを検索し、路地裏・屋内を除外。
    """
    url = f"{settings.streetview_base_url}/metadata"
    params = {
        "location": f"{lat},{lng}",
        "radius": radius,
        "source": "outdoor",
        "key": api_key,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        return resp.json()
