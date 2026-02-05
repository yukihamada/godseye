"""Google Places API連携 — 建物周辺の施設写真を取得する。"""

import httpx

from app.config import settings


async def get_place_photos(
    lat: float,
    lng: float,
    radius: int = 30,
    max_photos: int = 5,
) -> list[dict]:
    """建物周辺のGoogle Places写真を取得する。

    Args:
        lat: 緯度
        lng: 経度
        radius: 検索半径（メートル）
        max_photos: 取得する最大写真数

    Returns:
        写真情報のリスト [{url, attribution, place_name, place_type}, ...]
    """
    api_key = settings.google_streetview_api_key  # 同じAPIキーを使用
    if not api_key:
        return []

    photos = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Step 1: Nearby Search で周辺施設を検索
        nearby_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        nearby_params = {
            "location": f"{lat},{lng}",
            "radius": radius,
            "key": api_key,
        }

        try:
            resp = await client.get(nearby_url, params=nearby_params)
            if resp.status_code != 200:
                return []

            data = resp.json()
            places = data.get("results", [])

            # Step 2: 各施設の写真を取得
            for place in places[:5]:  # 最大5施設
                place_photos = place.get("photos", [])
                place_name = place.get("name", "")
                place_types = place.get("types", [])

                # 施設タイプを日本語化
                place_type = _translate_place_type(place_types)

                for photo in place_photos[:2]:  # 1施設あたり最大2枚
                    photo_ref = photo.get("photo_reference")
                    if not photo_ref:
                        continue

                    # 写真URLを生成
                    photo_url = (
                        f"https://maps.googleapis.com/maps/api/place/photo"
                        f"?maxwidth=640"
                        f"&photo_reference={photo_ref}"
                        f"&key={api_key}"
                    )

                    # 帰属表示
                    attributions = photo.get("html_attributions", [])
                    attribution = attributions[0] if attributions else ""

                    photos.append({
                        "url": photo_url,
                        "attribution": attribution,
                        "place_name": place_name,
                        "place_type": place_type,
                    })

                    if len(photos) >= max_photos:
                        return photos

        except Exception:
            pass

    return photos


def _translate_place_type(types: list[str]) -> str:
    """Google Places タイプを日本語に変換。"""
    type_map = {
        "restaurant": "飲食店",
        "cafe": "カフェ",
        "store": "店舗",
        "convenience_store": "コンビニ",
        "supermarket": "スーパー",
        "bank": "銀行",
        "hospital": "病院",
        "pharmacy": "薬局",
        "school": "学校",
        "park": "公園",
        "shrine": "神社",
        "temple": "寺院",
        "church": "教会",
        "gas_station": "ガソリンスタンド",
        "parking": "駐車場",
        "lodging": "宿泊施設",
        "real_estate_agency": "不動産",
        "local_government_office": "役所",
        "post_office": "郵便局",
        "police": "警察",
        "fire_station": "消防署",
    }

    for t in types:
        if t in type_map:
            return type_map[t]

    return "施設"
