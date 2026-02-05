"""
国土地理院 航空写真タイル取得サービス

建物上空の航空写真（オルソ画像）を取得し、
屋根の状態評価に使用する。
"""

import math
from dataclasses import dataclass

import httpx


@dataclass
class AerialPhotoResult:
    """航空写真取得結果"""
    available: bool
    image_url: str | None = None
    tile_url: str | None = None  # タイルURL（デバッグ用）
    zoom: int = 18
    center_lat: float | None = None
    center_lng: float | None = None


# 国土地理院タイルのベースURL
GSI_TILE_BASE = "https://cyberjapandata.gsi.go.jp/xyz"

# 利用可能なレイヤー（優先順）
# seamlessphoto: 最新オルソ画像（全国）
# ort: 電子国土オルソ（やや古い）
PHOTO_LAYERS = ["seamlessphoto", "ort"]


def latlng_to_tile(lat: float, lng: float, zoom: int) -> tuple[int, int]:
    """緯度経度をタイル座標に変換（Web Mercator）"""
    n = 2 ** zoom
    x = int((lng + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tile_to_latlng(x: int, y: int, zoom: int) -> tuple[float, float]:
    """タイル座標の中心緯度経度を計算"""
    n = 2 ** zoom
    lng = (x + 0.5) / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / n)))
    lat = math.degrees(lat_rad)
    return lat, lng


async def get_aerial_photo(lat: float, lng: float, zoom: int = 18) -> AerialPhotoResult:
    """指定座標の航空写真タイルURLを取得する。

    Args:
        lat: 緯度
        lng: 経度
        zoom: ズームレベル（デフォルト18 = 約1m/px）

    Returns:
        AerialPhotoResult: 航空写真情報
    """
    x, y = latlng_to_tile(lat, lng, zoom)

    async with httpx.AsyncClient(timeout=10.0) as client:
        for layer in PHOTO_LAYERS:
            tile_url = f"{GSI_TILE_BASE}/{layer}/{zoom}/{x}/{y}.jpg"

            try:
                # HEADリクエストでタイルの存在を確認
                resp = await client.head(tile_url)
                if resp.status_code == 200:
                    center_lat, center_lng = tile_to_latlng(x, y, zoom)
                    return AerialPhotoResult(
                        available=True,
                        image_url=tile_url,
                        tile_url=tile_url,
                        zoom=zoom,
                        center_lat=center_lat,
                        center_lng=center_lng,
                    )
            except Exception:
                continue

    return AerialPhotoResult(available=False)


async def get_aerial_photo_composite(
    lat: float,
    lng: float,
    zoom: int = 18,
    grid_size: int = 1,
) -> list[str]:
    """建物周辺の複数タイルを取得して合成用URLリストを返す。

    Args:
        lat: 中心緯度
        lng: 中心経度
        zoom: ズームレベル
        grid_size: グリッドサイズ（1=1枚、3=3x3=9枚）

    Returns:
        タイルURLのリスト（左上から右下へ）
    """
    cx, cy = latlng_to_tile(lat, lng, zoom)
    offset = grid_size // 2
    urls = []

    async with httpx.AsyncClient(timeout=10.0) as client:
        for layer in PHOTO_LAYERS:
            layer_urls = []
            all_available = True

            for dy in range(-offset, offset + 1):
                for dx in range(-offset, offset + 1):
                    x, y = cx + dx, cy + dy
                    tile_url = f"{GSI_TILE_BASE}/{layer}/{zoom}/{x}/{y}.jpg"

                    try:
                        resp = await client.head(tile_url)
                        if resp.status_code == 200:
                            layer_urls.append(tile_url)
                        else:
                            all_available = False
                            break
                    except Exception:
                        all_available = False
                        break

                if not all_available:
                    break

            if all_available and layer_urls:
                return layer_urls

    return urls


def get_tile_bounds(x: int, y: int, zoom: int) -> dict:
    """タイルの境界ボックスを取得"""
    n = 2 ** zoom

    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0

    north_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    south_rad = math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n)))

    north = math.degrees(north_rad)
    south = math.degrees(south_rad)

    return {
        "north": north,
        "south": south,
        "east": east,
        "west": west,
    }
