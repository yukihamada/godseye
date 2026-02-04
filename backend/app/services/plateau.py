"""PLATEAU 3D Tiles連携 — b3dmタイルから最寄りの建物を特定する。"""

import json
import math
import re
import struct
from typing import Any

import httpx

from app.models.schemas import PlateauResult

# 3D Tiles ベースURL
TILES_BASE = "https://plateau.geospatial.jp/main/data/3d-tiles/bldg"

# カタログAPI（自治体コード・名前の取得用）
CATALOG_URL = "https://api.plateauview.mlit.go.jp/datacatalog/citygml"

# 自治体コード上3桁 → リージョンスラッグ
REGION_MAP: dict[str, str] = {
    "131": "13100_tokyo",       # 東京23区
}

# キャッシュ（プロセスライフタイム）
_tileset_cache: dict[str, dict] = {}
_buildings_cache: dict[str, list[dict]] = {}

# 構造種別マッピング
STRUCTURE_MAP: dict[str, str] = {
    "耐火構造": "耐火",
    "準耐火構造": "準耐火",
    "防火構造": "防火",
    "木造": "木造",
    "鉄骨造": "S造",
    "鉄筋コンクリート造": "RC造",
    "鉄骨鉄筋コンクリート造": "SRC造",
    "軽量鉄骨造": "軽量S造",
}


async def get_plateau_data(lat: float, lng: float) -> PlateauResult:
    """座標から最寄りの建物を特定して属性を返す。"""
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # 1. メッシュコード → カタログAPI → 自治体候補リスト
            mesh = _latlng_to_mesh3(lat, lng)
            city_list = await _fetch_city_list(client, mesh)

            # カタログAPIにデータがない場合（大阪・名古屋等）→ 逆ジオコーディング
            if not city_list:
                return await _fallback_reverse_geocode(client, lat, lng)

            # 2. 各自治体の3D Tilesを試し、最寄りの建物を探す
            best_result: PlateauResult | None = None
            best_distance = float("inf")
            last_city_name: str | None = None

            for city_info in city_list:
                city_name = city_info["city_name"]
                last_city_name = last_city_name or city_name
                city_slug = city_info.get("city_slug")
                region_slug = city_info.get("region_slug")

                if not city_slug or not region_slug:
                    continue

                tileset_url = f"{TILES_BASE}/{region_slug}/{city_slug}/notexture/tileset.json"
                tileset = await _fetch_tileset(client, tileset_url)
                if not tileset:
                    continue

                tile_uri = _find_tile(tileset.get("root", {}), lat, lng)
                if not tile_uri:
                    continue

                base_url = tileset_url.rsplit("/", 1)[0]
                b3dm_url = f"{base_url}/{tile_uri}"
                buildings = await _fetch_buildings(client, b3dm_url)
                if not buildings:
                    continue

                best = _find_nearest(buildings, lat, lng)
                if best and best.get("distance_m", float("inf")) < best_distance:
                    best_distance = best["distance_m"]
                    best["city_name"] = city_name
                    best_result = _to_result(best)

            if best_result and best_result.building_id:
                return best_result

            return PlateauResult(city_name=last_city_name)

    except Exception:
        return PlateauResult()


async def _fallback_reverse_geocode(
    client: httpx.AsyncClient, lat: float, lng: float
) -> PlateauResult:
    """PLATEAU非対応エリア用: 国土地理院の逆ジオコーディングで住所を取得する。"""
    try:
        url = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress"
        params = {"lat": lat, "lon": lng}
        resp = await client.get(url, params=params)
        if resp.status_code != 200:
            return PlateauResult()

        data = resp.json()
        results = data.get("results", {})
        muniCd = results.get("mupiCd", "")
        lv01Nm = results.get("lv01Nm", "")

        # 市区町村名を構築
        city_name = lv01Nm if lv01Nm else None

        return PlateauResult(
            address=lv01Nm if lv01Nm else None,
            city_name=city_name,
        )
    except Exception:
        return PlateauResult()


# ---------------------------------------------------------------------------
# カタログAPI
# ---------------------------------------------------------------------------

async def _fetch_city_list(
    client: httpx.AsyncClient, mesh: str
) -> list[dict]:
    """メッシュコードから全自治体情報のリストを取得する。"""
    url = f"{CATALOG_URL}/m:{mesh}"
    resp = await client.get(url, params={"types": "bldg"})
    if resp.status_code != 200:
        return []

    data = resp.json()
    cities = data.get("cities", [])
    if not cities:
        return []

    result = []
    for city in cities:
        city_code = city.get("cityCode", "")
        city_name = city.get("cityName", "")
        city_slug = _extract_city_slug(city)
        region_slug = REGION_MAP.get(city_code[:3])

        result.append({
            "city_code": city_code,
            "city_name": city_name,
            "city_slug": city_slug,
            "region_slug": region_slug,
        })

    return result


def _extract_city_slug(city: dict) -> str | None:
    """カタログAPIのレスポンスからcityスラッグを抽出する。"""
    # CityGML URLから抽出: ".../13104_shinjuku-ku_pref_2023_citygml_..."
    gml_url = city.get("url", "")
    m = re.search(r"/(\d{5}_[a-z][\w-]+?)_pref_", gml_url)
    if m:
        return m.group(1)

    # フォールバック: コード + 名前から構築を試みない（romaji変換が不正確になるため）
    return None


# ---------------------------------------------------------------------------
# 3D Tiles
# ---------------------------------------------------------------------------

async def _fetch_tileset(client: httpx.AsyncClient, url: str) -> dict | None:
    """tileset.jsonを取得する（キャッシュ付き）。"""
    if url in _tileset_cache:
        return _tileset_cache[url]

    resp = await client.get(url)
    if resp.status_code != 200:
        return None

    data = resp.json()
    _tileset_cache[url] = data
    return data


def _find_tile(tile: dict, lat: float, lng: float, depth: int = 0) -> str | None:
    """タイルツリーを走査して座標を含む最も詳細なタイルURIを返す。"""
    if depth > 15:
        return None

    region = tile.get("boundingVolume", {}).get("region")
    if not region:
        return None

    # region: [west, south, east, north, min_h, max_h] (ラジアン)
    DEG = 180.0 / math.pi
    west = region[0] * DEG
    south = region[1] * DEG
    east = region[2] * DEG
    north = region[3] * DEG

    if not (west <= lng <= east and south <= lat <= north):
        return None

    content_uri = tile.get("content", {}).get("uri")
    best = content_uri

    for child in tile.get("children", []):
        child_match = _find_tile(child, lat, lng, depth + 1)
        if child_match:
            best = child_match

    return best


# ---------------------------------------------------------------------------
# b3dm パース
# ---------------------------------------------------------------------------

async def _fetch_buildings(client: httpx.AsyncClient, b3dm_url: str) -> list[dict]:
    """b3dmファイルをダウンロードしてパースする（キャッシュ付き）。"""
    if b3dm_url in _buildings_cache:
        return _buildings_cache[b3dm_url]

    resp = await client.get(b3dm_url)
    if resp.status_code != 200:
        return []

    buildings = _parse_b3dm(resp.content)
    _buildings_cache[b3dm_url] = buildings
    return buildings


def _parse_b3dm(data: bytes) -> list[dict]:
    """b3dmバイナリから建物リストを抽出する。"""
    if len(data) < 28:
        return []

    magic, version, byte_len, ft_json_len, ft_bin_len, bt_json_len, bt_bin_len = \
        struct.unpack("<4sIIIIII", data[:28])

    if magic != b"b3dm":
        return []

    offset = 28

    # Feature table JSON (BATCH_LENGTH を取得)
    ft_json: dict = {}
    if ft_json_len > 0:
        try:
            ft_json = json.loads(
                data[offset : offset + ft_json_len].decode("utf-8").rstrip("\x00")
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
    offset += ft_json_len
    offset += ft_bin_len  # Feature table binary をスキップ

    # Batch table JSON
    bt_json: dict = {}
    if bt_json_len > 0:
        try:
            bt_json = json.loads(
                data[offset : offset + bt_json_len].decode("utf-8").rstrip("\x00")
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            return []
    offset += bt_json_len

    # Batch table binary
    bt_binary = data[offset : offset + bt_bin_len] if bt_bin_len > 0 else b""

    num_features = ft_json.get("BATCH_LENGTH", 0)
    if num_features == 0:
        return []

    return _extract_buildings(bt_json, bt_binary, num_features)


def _extract_buildings(bt_json: dict, bt_binary: bytes, count: int) -> list[dict]:
    """バッチテーブルから建物属性を抽出する。"""
    # 全属性を解決 (JSON配列 + バイナリ参照)
    resolved: dict[str, list] = {}
    for key, value in bt_json.items():
        if isinstance(value, list):
            resolved[key] = value
        elif isinstance(value, dict) and "byteOffset" in value:
            arr = _read_binary(bt_binary, value, count)
            if arr is not None:
                resolved[key] = arr

    buildings: list[dict] = []
    for i in range(count):
        b: dict[str, Any] = {}
        for key, values in resolved.items():
            if i < len(values):
                b[key] = values[i]
        buildings.append(b)

    return buildings


def _read_binary(bt_binary: bytes, info: dict, count: int) -> list | None:
    """バッチテーブルバイナリからデータ配列を読み取る。"""
    byte_offset = info.get("byteOffset", 0)
    comp_type = info.get("componentType", "")

    fmt_map: dict[str, tuple[str, int]] = {
        "DOUBLE": ("d", 8),
        "FLOAT": ("f", 4),
        "INT": ("i", 4),
        "UNSIGNED_INT": ("I", 4),
        "SHORT": ("h", 2),
        "UNSIGNED_SHORT": ("H", 2),
        "BYTE": ("b", 1),
        "UNSIGNED_BYTE": ("B", 1),
    }

    if comp_type not in fmt_map:
        return None

    fmt_char, size = fmt_map[comp_type]
    total_size = count * size

    if byte_offset + total_size > len(bt_binary):
        return None

    return list(
        struct.unpack(
            f"<{count}{fmt_char}",
            bt_binary[byte_offset : byte_offset + total_size],
        )
    )


# ---------------------------------------------------------------------------
# 最寄り建物の特定
# ---------------------------------------------------------------------------

def _find_nearest(buildings: list[dict], lat: float, lng: float) -> dict | None:
    """座標に最も近い建物を返す。"""
    best = None
    best_dist = float("inf")

    for b in buildings:
        b_lng = b.get("_x")
        b_lat = b.get("_y")

        if b_lng is None or b_lat is None:
            continue

        # 座標がWGS84の範囲内かチェック
        if not (isinstance(b_lng, (int, float)) and isinstance(b_lat, (int, float))):
            continue
        if not (100 < b_lng < 180 and 20 < b_lat < 50):
            continue

        d = _haversine(lat, lng, b_lat, b_lng)
        if d < best_dist:
            best_dist = d
            best = b

    if best is not None:
        best["distance_m"] = round(best_dist, 1)

    return best


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """2点間の距離 (メートル)。"""
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# メッシュコード計算
# ---------------------------------------------------------------------------

def _latlng_to_mesh3(lat: float, lng: float) -> str:
    """緯度経度をJIS 3次メッシュコード（約1km四方）に変換する。"""
    p = int(lat * 60 / 40)
    u = int(lng - 100)
    p2 = int((lat * 60 - p * 40) / 5)
    u2 = int(((lng - 100) - u) * 60 / 7.5)
    p3 = int((lat * 60 - p * 40 - p2 * 5) / 0.5)
    u3 = int((((lng - 100) - u) * 60 - u2 * 7.5) / 0.75)
    return f"{p * 100 + u}{p2}{u2}{p3}{u3}"


# ---------------------------------------------------------------------------
# 結果変換
# ---------------------------------------------------------------------------

def _to_result(b: dict) -> PlateauResult:
    """建物dictからPlateauResultに変換する。"""

    def _get(*keys: str) -> Any:
        for k in keys:
            v = b.get(k)
            if v is not None and v != "":
                return v
        return None

    # 高さ
    height = b.get("_height")
    if isinstance(height, (int, float)) and height > 0:
        height = round(float(height), 1)
    else:
        height = None

    # 階数
    floors_above = _get("地上階数")
    if isinstance(floors_above, (int, float)):
        floors_above = int(floors_above)
    else:
        floors_above = None

    floors_below = _get("地下階数")
    if isinstance(floors_below, (int, float)):
        floors_below = int(floors_below)
    else:
        floors_below = None

    # 面積
    area = _get("建物利用現況_図上面積", "延床面積")
    if isinstance(area, (int, float)) and area > 0:
        area = float(area)
    else:
        area = None

    # 構造種別
    raw_structure = _get("建物構造")
    structure = STRUCTURE_MAP.get(raw_structure, raw_structure) if raw_structure else None

    # 耐火種別（建物構造が耐火系の場合は別途セット）
    fireproof = None
    if raw_structure and "耐火" in raw_structure or (raw_structure and "防火" in raw_structure):
        fireproof = raw_structure

    return PlateauResult(
        building_id=_get("建物ID", "_gml_id"),
        building_name=_get("名称"),
        address=_get("住所"),
        year_built=None,  # b3dmにはほとんど含まれない
        structure_type=structure,
        fireproof_type=fireproof,
        height=height,
        floors_above=floors_above,
        floors_below=floors_below,
        total_floor_area=area,
        usage=_get("用途", "建物利用現況_中分類"),
        city_name=b.get("city_name"),
        distance_m=b.get("distance_m"),
    )
