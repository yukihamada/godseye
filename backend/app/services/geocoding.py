"""
住所ジオコーディングサービス

住所文字列 → 緯度経度 + 建物特定
複数のジオコーディングAPIを併用して精度を高める
"""

import math
import re
from dataclasses import dataclass

import httpx


@dataclass
class GeocodingResult:
    """ジオコーディング結果"""
    lat: float
    lng: float
    address: str  # 正規化された住所
    confidence: float  # 信頼度 0-1
    source: str  # 使用したAPI


async def geocode_address(address: str) -> GeocodingResult | None:
    """住所文字列から緯度経度を取得する。

    以下の順序で試行:
    1. 国土地理院 ジオコーディングAPI（日本住所に最適）
    2. Nominatim（OSMベース、フォールバック）
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1. GSI（国土地理院）
        result = await _geocode_gsi(client, address)
        if result and result.confidence > 0.5:
            return result

        # 2. Nominatim（フォールバック）
        result = await _geocode_nominatim(client, address)
        if result:
            return result

    return None


async def _geocode_gsi(client: httpx.AsyncClient, address: str) -> GeocodingResult | None:
    """国土地理院 地理院地図APIでジオコーディング"""
    url = "https://msearch.gsi.go.jp/address-search/AddressSearch"
    params = {"q": address}

    try:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

        if not data:
            return None

        # 最も関連性の高い結果を使用
        best = data[0]
        geometry = best.get("geometry", {})
        coords = geometry.get("coordinates", [])

        if len(coords) < 2:
            return None

        lng, lat = coords[0], coords[1]
        normalized_address = best.get("properties", {}).get("title", address)

        # 信頼度: 番地レベルまで一致していれば高い
        confidence = _estimate_confidence(address, normalized_address)

        return GeocodingResult(
            lat=lat,
            lng=lng,
            address=normalized_address,
            confidence=confidence,
            source="gsi",
        )
    except Exception:
        return None


async def _geocode_nominatim(client: httpx.AsyncClient, address: str) -> GeocodingResult | None:
    """Nominatim (OpenStreetMap) でジオコーディング"""
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": address,
        "format": "json",
        "addressdetails": 1,
        "limit": 1,
        "countrycodes": "jp",
    }
    headers = {"User-Agent": "GodsEye-RiskDiagnosis/1.0"}

    try:
        resp = await client.get(url, params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        if not data:
            return None

        best = data[0]
        lat = float(best["lat"])
        lng = float(best["lon"])
        display_name = best.get("display_name", address)

        # Nominatim の importance を信頼度に使用
        importance = float(best.get("importance", 0.5))
        confidence = min(importance, 0.9)  # 最大0.9（GSIの方が信頼性高い）

        return GeocodingResult(
            lat=lat,
            lng=lng,
            address=display_name,
            confidence=confidence,
            source="nominatim",
        )
    except Exception:
        return None


def _estimate_confidence(query: str, result: str) -> float:
    """クエリと結果の一致度から信頼度を推定"""
    # 番地・号まで含まれているか
    has_banchi = bool(re.search(r"\d+[-−]\d+", query) or re.search(r"\d+番", query))
    result_has_banchi = bool(re.search(r"\d+[-−]\d+", result) or re.search(r"\d+番", result))

    if has_banchi and result_has_banchi:
        return 0.9
    elif has_banchi:
        return 0.6  # クエリに番地があるが結果にない
    else:
        return 0.7  # 町丁目レベル


def calculate_heading(from_lat: float, from_lng: float, to_lat: float, to_lng: float) -> float:
    """2点間の方位角（heading）を計算する。北=0°、東=90°"""
    lat1 = math.radians(from_lat)
    lat2 = math.radians(to_lat)
    diff_lng = math.radians(to_lng - from_lng)

    x = math.sin(diff_lng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(diff_lng)

    heading = math.degrees(math.atan2(x, y))
    return (heading + 360) % 360


def offset_point(lat: float, lng: float, distance_m: float, bearing_deg: float) -> tuple[float, float]:
    """指定した方位・距離だけ離れた点の座標を計算"""
    R = 6371000  # 地球半径 (m)
    bearing = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lng1 = math.radians(lng)

    lat2 = math.asin(
        math.sin(lat1) * math.cos(distance_m / R) +
        math.cos(lat1) * math.sin(distance_m / R) * math.cos(bearing)
    )
    lng2 = lng1 + math.atan2(
        math.sin(bearing) * math.sin(distance_m / R) * math.cos(lat1),
        math.cos(distance_m / R) - math.sin(lat1) * math.sin(lat2)
    )

    return math.degrees(lat2), math.degrees(lng2)
