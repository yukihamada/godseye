"""
建物築年推定サービス

国土地理院（GSI）の各年代の航空写真を比較し、
建物が初めて出現した時期から築年を推定する。

GSI 時系列航空写真レイヤー:
- gazo1: 1974-1978年撮影
- gazo2: 1979-1983年撮影
- gazo3: 1984-1986年撮影
- gazo4: 1988-1990年撮影
- ort_old10: 2007年前後撮影
- ort: 2010年前後撮影（電子国土オルソ）
- seamlessphoto: 最新撮影（2015年以降）
"""

import asyncio
import logging
import math
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

# 国土地理院タイルのベースURL
GSI_TILE_BASE = "https://cyberjapandata.gsi.go.jp/xyz"

# 時系列航空写真レイヤー（古い順）
# 各レイヤーの代表年と実際の撮影期間
HISTORICAL_LAYERS = [
    {"layer": "gazo1", "year": 1976, "period": "1974-1978", "zoom_max": 17},
    {"layer": "gazo2", "year": 1981, "period": "1979-1983", "zoom_max": 17},
    {"layer": "gazo3", "year": 1985, "period": "1984-1986", "zoom_max": 17},
    {"layer": "gazo4", "year": 1989, "period": "1988-1990", "zoom_max": 17},
    {"layer": "ort_old10", "year": 2007, "period": "2004-2007", "zoom_max": 18},
    {"layer": "ort", "year": 2010, "period": "2008-2012", "zoom_max": 18},
    {"layer": "seamlessphoto", "year": 2020, "period": "2015-現在", "zoom_max": 18},
]


@dataclass
class BuildingAgeResult:
    """建物築年推定結果"""
    estimated: bool = False  # 推定できたか
    year_built_min: int | None = None  # 推定築年（最小）
    year_built_max: int | None = None  # 推定築年（最大）
    confidence: str = "low"  # 推定の信頼度 (low/medium/high)
    first_appearance_layer: str | None = None  # 建物が初出現したレイヤー
    first_appearance_period: str | None = None  # 初出現した撮影期間
    available_layers: list[str] | None = None  # 利用可能だったレイヤー (field with mutable default - use factory in production)
    method: str = "historical_aerial"  # 推定手法


def latlng_to_tile(lat: float, lng: float, zoom: int) -> tuple[int, int]:
    """緯度経度をタイル座標に変換（Web Mercator）"""
    n = 2 ** zoom
    x = int((lng + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


async def check_tile_exists(
    client: httpx.AsyncClient,
    layer: str,
    lat: float,
    lng: float,
    zoom: int = 17,
) -> bool:
    """指定レイヤーのタイルが存在するかチェック"""
    x, y = latlng_to_tile(lat, lng, zoom)
    tile_url = f"{GSI_TILE_BASE}/{layer}/{zoom}/{x}/{y}.jpg"

    try:
        resp = await client.head(tile_url, follow_redirects=True)
        return resp.status_code == 200
    except Exception:
        return False


async def get_available_layers(
    lat: float,
    lng: float,
    timeout: float = 15.0,
) -> list[dict]:
    """指定座標で利用可能な時系列航空写真レイヤーを取得"""
    available = []

    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = []
        for layer_info in HISTORICAL_LAYERS:
            zoom = min(layer_info["zoom_max"], 17)  # 存在確認はzoom=17で
            task = check_tile_exists(client, layer_info["layer"], lat, lng, zoom)
            tasks.append(task)

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for layer_info, result in zip(HISTORICAL_LAYERS, results):
            if result is True:  # 明示的にTrueの場合のみ
                available.append(layer_info)

    return available


async def estimate_building_age(
    lat: float,
    lng: float,
    plateau_year_built: int | None = None,
) -> BuildingAgeResult:
    """建物の築年を時系列航空写真から推定する。

    Args:
        lat: 緯度
        lng: 経度
        plateau_year_built: PLATEAUから取得した築年（あれば参考に使用）

    Returns:
        BuildingAgeResult: 推定結果

    推定ロジック:
    1. 古い年代の航空写真から順にチェック
    2. 建物が存在しないレイヤーと存在するレイヤーの境界を特定
    3. 境界の前後の期間を築年の推定範囲とする
    """
    result = BuildingAgeResult()

    try:
        available_layers = await get_available_layers(lat, lng)

        if not available_layers:
            logger.warning(f"No historical aerial photos available at ({lat}, {lng})")
            return result

        result.available_layers = [layer["layer"] for layer in available_layers]

        # PLATEAUの築年があれば、その年以降のレイヤーのみ対象
        # (建物が存在するはずなので検証に使用)
        if plateau_year_built:
            result.year_built_min = plateau_year_built
            result.year_built_max = plateau_year_built
            result.estimated = True
            result.confidence = "high"
            result.method = "plateau_data"
            return result

        # 利用可能なレイヤーを古い順にソート
        available_layers.sort(key=lambda x: x["year"])

        if len(available_layers) >= 2:
            # 複数レイヤーが利用可能な場合、最も古いレイヤーで建物が確認できると仮定
            # （実際の画像解析は別途AIで行う必要がある）
            # ここでは最も古いレイヤーの存在期間を築年推定の上限とする

            oldest = available_layers[0]
            newest = available_layers[-1]

            # 最も古いレイヤーより前に建物が存在した可能性
            result.estimated = True
            result.year_built_max = oldest["year"]

            # 最も古いレイヤーの前の10年を下限として推定
            # （レイヤーが存在する＝その時点で建物がある可能性が高い）
            result.year_built_min = oldest["year"] - 10

            result.first_appearance_layer = oldest["layer"]
            result.first_appearance_period = oldest["period"]
            result.confidence = "low"  # 画像解析なしでは信頼度低

            # 複数の時代のレイヤーがあればやや信頼度上昇
            if len(available_layers) >= 3:
                result.confidence = "medium"

        elif len(available_layers) == 1:
            # 1つのレイヤーのみ利用可能
            layer = available_layers[0]
            result.estimated = True
            result.year_built_max = layer["year"]
            result.year_built_min = layer["year"] - 20  # 推定幅を広くとる
            result.first_appearance_layer = layer["layer"]
            result.first_appearance_period = layer["period"]
            result.confidence = "low"

        return result

    except Exception as e:
        logger.error(f"Building age estimation failed at ({lat}, {lng}): {type(e).__name__}: {e}")
        return result


async def get_historical_aerial_urls(
    lat: float,
    lng: float,
    zoom: int = 17,
) -> list[dict]:
    """指定座標の時系列航空写真URLを取得する。

    Args:
        lat: 緯度
        lng: 経度
        zoom: ズームレベル（デフォルト17）

    Returns:
        利用可能な時系列画像のURL情報リスト
    """
    results = []

    async def check_layer(client: httpx.AsyncClient, layer_info: dict) -> dict | None:
        actual_zoom = min(zoom, layer_info["zoom_max"])
        actual_x, actual_y = latlng_to_tile(lat, lng, actual_zoom)
        tile_url = f"{GSI_TILE_BASE}/{layer_info['layer']}/{actual_zoom}/{actual_x}/{actual_y}.jpg"

        try:
            resp = await client.head(tile_url, follow_redirects=True)
            if resp.status_code == 200:
                return {
                    "layer": layer_info["layer"],
                    "year": layer_info["year"],
                    "period": layer_info["period"],
                    "url": tile_url,
                    "zoom": actual_zoom,
                }
        except Exception:
            pass
        return None

    async with httpx.AsyncClient(timeout=15.0) as client:
        tasks = [check_layer(client, layer_info) for layer_info in HISTORICAL_LAYERS]
        layer_results = await asyncio.gather(*tasks, return_exceptions=True)

        for layer_info, result in zip(HISTORICAL_LAYERS, layer_results):
            if isinstance(result, dict):
                results.append(result)

    # 年代順にソート
    results.sort(key=lambda x: x["year"])
    return results
