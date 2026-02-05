"""
Step 1: 能登半島地震データ → 学習用CSV生成パイプライン

1. Zenodo から GeoPackage ダウンロード
2. damage ∈ {0, 1} のみ抽出
3. フットプリント面積算出 (UTM変換)
4. 250mメッシュコード算出 → J-SHIS API一括取得
5. 結合して training_data.csv 出力
"""

import asyncio
import json
import math
import os
import sys
import time
from pathlib import Path

import geopandas as gpd
import httpx
import numpy as np
import pandas as pd
from pyproj import CRS, Transformer

# ── 定数 ──────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
GPKG_URL = "https://zenodo.org/records/15192949/files/Noto_Peninsula_Damage_2_5.gpkg"
GPKG_PATH = DATA_DIR / "Noto_Peninsula_Damage_2_5.gpkg"
JSHIS_CHECKPOINT = DATA_DIR / "jshis_checkpoint.json"
OUTPUT_CSV = DATA_DIR / "training_data.csv"

JSHIS_BASE = "https://www.j-shis.bosai.go.jp/map/api"
CONCURRENT_REQUESTS = 5
REQUEST_INTERVAL = 0.2  # seconds between batches


# ── 1. GeoPackage ダウンロード ────────────────────────
def download_gpkg() -> Path:
    """Zenodo から GeoPackage をダウンロード (未取得時のみ)。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if GPKG_PATH.exists():
        size_mb = GPKG_PATH.stat().st_size / (1024 * 1024)
        print(f"[skip] GeoPackage already exists ({size_mb:.1f} MB)")
        return GPKG_PATH

    print(f"[download] {GPKG_URL}")
    with httpx.Client(timeout=300, follow_redirects=True) as client:
        with client.stream("GET", GPKG_URL) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("content-length", 0))
            downloaded = 0
            with open(GPKG_PATH, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=1024 * 256):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded / total * 100
                        print(f"\r  {pct:.1f}% ({downloaded // (1024*1024)} MB)", end="")
            print()
    print(f"[done] saved to {GPKG_PATH}")
    return GPKG_PATH


# ── 2. GeoPackage 読み込み・前処理 ───────────────────
def load_and_preprocess(gpkg_path: Path) -> gpd.GeoDataFrame:
    """GeoPackage読み込み、ラベルフィルタ、面積算出。"""
    print("[load] reading GeoPackage ...")
    gdf = gpd.read_file(gpkg_path, layer="v2.5")
    print(f"  total records: {len(gdf)}")

    # damage カラム名を確認 (damage_val / damage / DAMAGE)
    damage_col = None
    for candidate in ["damage_val", "damage", "DAMAGE", "Damage"]:
        if candidate in gdf.columns:
            damage_col = candidate
            break
    if damage_col is None:
        print(f"  columns: {list(gdf.columns)}")
        raise ValueError("damage column not found in GeoPackage")
    print(f"  damage column: {damage_col}")

    # damage ∈ {0, 1} のみ (9=判定不能, 99=未評価 は除外)
    gdf = gdf[gdf[damage_col].isin([0, 1])].copy()
    gdf["damage"] = gdf[damage_col].astype(int)
    print(f"  after filter (0/1): {len(gdf)}")
    print(f"  label distribution: {gdf['damage'].value_counts().to_dict()}")

    # 重心の緯度経度
    centroids = gdf.geometry.centroid
    gdf["lat"] = centroids.y
    gdf["lng"] = centroids.x

    # フットプリント面積 (UTM zone 53N — 能登半島)
    utm_crs = CRS.from_epsg(32653)  # UTM zone 53N
    gdf_utm = gdf.to_crs(utm_crs)
    gdf["footprint_area_m2"] = gdf_utm.geometry.area
    print(f"  footprint area: median={gdf['footprint_area_m2'].median():.1f} m²")

    return gdf


# ── 3. 250mメッシュコード算出 ─────────────────────────
def latlon_to_mesh250(lat: float, lon: float) -> str:
    """緯度経度 → JIS 250mメッシュコード (10桁)。

    1次メッシュ (4桁) → 2次 (6桁) → 3次 (8桁) → 4次 250m (10桁)
    """
    # 1次メッシュ
    p = int(lat * 60 / 40)
    u = int(lon - 100)
    lat_r = lat * 60 - p * 40
    lon_r = lon - 100 - u

    # 2次メッシュ
    q = int(lat_r / 5)
    v = int(lon_r * 60 / 450)
    lat_r2 = lat_r - q * 5
    lon_r2 = lon_r * 60 - v * 450

    # 3次メッシュ
    r = int(lat_r2 * 60 / 30)
    w = int(lon_r2 / 45)
    lat_r3 = lat_r2 * 60 - r * 30
    lon_r3 = lon_r2 - w * 45

    # 4次 (250m = 1/2 of 3次)
    s = int(lat_r3 / 15)
    t = int(lon_r3 / 22.5)
    code_4th = s * 2 + t + 1  # 1-4

    mesh_code = f"{p:02d}{u:02d}{q}{v}{r}{w}{code_4th}"
    return mesh_code


def assign_mesh_codes(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """各建物に250mメッシュコードを付与。"""
    print("[mesh] computing 250m mesh codes ...")
    gdf["mesh_code"] = gdf.apply(
        lambda row: latlon_to_mesh250(row["lat"], row["lng"]), axis=1
    )
    n_meshes = gdf["mesh_code"].nunique()
    print(f"  unique meshes: {n_meshes}")
    return gdf


# ── 4. J-SHIS API 一括取得 ───────────────────────────
def mesh_to_center(mesh_code: str) -> tuple[float, float]:
    """250mメッシュコードの中心緯度経度を返す。"""
    p = int(mesh_code[0:2])
    u = int(mesh_code[2:4])
    q = int(mesh_code[4])
    v = int(mesh_code[5])
    r = int(mesh_code[6])
    w = int(mesh_code[7])
    code_4th = int(mesh_code[8]) if len(mesh_code) > 8 else 1

    if len(mesh_code) == 10:
        code_4th = int(mesh_code[8:10])
    elif len(mesh_code) == 9:
        code_4th = int(mesh_code[8])

    # 4次メッシュの南端・西端
    s = (code_4th - 1) // 2
    t = (code_4th - 1) % 2

    lat_sec = p * 40 * 60 + q * 5 * 60 + r * 30 + s * 15 + 7.5
    lon_sec = (100 + u) * 3600 + v * 450 + w * 45 + t * 22.5 + 11.25

    lat = lat_sec / 3600
    lon = lon_sec / 3600
    return lat, lon


async def fetch_jshis_for_mesh(
    client: httpx.AsyncClient,
    mesh_code: str,
    semaphore: asyncio.Semaphore,
    rep_lat: float | None = None,
    rep_lon: float | None = None,
) -> dict | None:
    """1メッシュ分の J-SHIS データを取得。

    rep_lat/rep_lon: メッシュ内の実際の建物座標（陸上であることが保証される）。
    指定がなければメッシュ中心座標を使う。
    """
    if rep_lat is not None and rep_lon is not None:
        lat, lon = rep_lat, rep_lon
    else:
        lat, lon = mesh_to_center(mesh_code)

    ground_url = f"{JSHIS_BASE}/sstrct/V4/meshinfo.geojson"
    hazard_url = f"{JSHIS_BASE}/pshm/Y2024/AVR/TTL_MTTL/meshinfo.geojson"
    params = {"position": f"{lon},{lat}", "epsg": "4326"}

    async with semaphore:
        try:
            g_resp = await client.get(ground_url, params=params)
            g_resp.raise_for_status()
            g_data = g_resp.json()

            await asyncio.sleep(REQUEST_INTERVAL)

            h_resp = await client.get(hazard_url, params=params)
            h_resp.raise_for_status()
            h_data = h_resp.json()
        except Exception as e:
            print(f"  [warn] mesh {mesh_code}: {e}")
            return None

    result = {"mesh_code": mesh_code}

    g_feats = g_data.get("features", [])
    if g_feats:
        props = g_feats[0].get("properties", {})
        result["ARV"] = _safe_float(props.get("ARV"))
        result["AVS"] = _safe_float(props.get("AVS"))
        result["JCODE"] = _safe_int(props.get("JCODE"))

    h_feats = h_data.get("features", [])
    if h_feats:
        props = h_feats[0].get("properties", {})
        result["T30_I55_PS"] = _safe_float(props.get("T30_I55_PS"))
        result["T30_I60_PS"] = _safe_float(props.get("T30_I60_PS"))

    return result


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        v = float(val)
        return v if not math.isnan(v) else None
    except (ValueError, TypeError):
        return None


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


async def fetch_all_jshis(
    mesh_codes: list[str],
    mesh_rep_coords: dict[str, tuple[float, float]] | None = None,
) -> pd.DataFrame:
    """全メッシュの J-SHIS データを並列取得 (チェックポイント付き)。

    mesh_rep_coords: {mesh_code: (lat, lon)} — メッシュ内の代表建物座標。
    """
    if mesh_rep_coords is None:
        mesh_rep_coords = {}

    # チェックポイント読み込み
    checkpoint: dict[str, dict] = {}
    if JSHIS_CHECKPOINT.exists():
        with open(JSHIS_CHECKPOINT) as f:
            checkpoint = json.load(f)
        print(f"[jshis] loaded checkpoint: {len(checkpoint)} meshes")

    remaining = [m for m in mesh_codes if m not in checkpoint]
    print(f"[jshis] total={len(mesh_codes)}, cached={len(checkpoint)}, remaining={len(remaining)}")

    if remaining:
        semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
        async with httpx.AsyncClient(timeout=30.0) as client:
            batch_size = 50
            for i in range(0, len(remaining), batch_size):
                batch = remaining[i : i + batch_size]
                tasks = []
                for m in batch:
                    rep = mesh_rep_coords.get(m)
                    rep_lat = rep[0] if rep else None
                    rep_lon = rep[1] if rep else None
                    tasks.append(
                        fetch_jshis_for_mesh(client, m, semaphore, rep_lat, rep_lon)
                    )
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for m, res in zip(batch, results):
                    if isinstance(res, dict):
                        checkpoint[m] = res
                    elif isinstance(res, Exception):
                        print(f"  [error] mesh {m}: {res}")

                # チェックポイント保存 (50メッシュごと)
                with open(JSHIS_CHECKPOINT, "w") as f:
                    json.dump(checkpoint, f)

                done = min(i + batch_size, len(remaining))
                total = len(remaining)
                pct = done / total * 100
                print(f"\r  J-SHIS progress: {done}/{total} ({pct:.1f}%)", end="")

            print()

    # DataFrame化
    records = list(checkpoint.values())
    if not records:
        return pd.DataFrame()
    return pd.DataFrame(records)


# ── 5. 結合・出力 ────────────────────────────────────
def merge_and_export(gdf: gpd.GeoDataFrame, jshis_df: pd.DataFrame) -> Path:
    """建物データと J-SHIS データを結合して CSV 出力。"""
    print("[merge] joining building data with J-SHIS ...")

    # GeoPackage にある GSI フィールドを取得
    gsi_cols = []
    for col in ["GSI_fire", "GSI_slope_failure", "GSI_tsunami", "USGS_MMI"]:
        # 大文字小文字違いに対応
        matched = [c for c in gdf.columns if c.lower() == col.lower()]
        if matched:
            gsi_cols.append((col, matched[0]))

    # 学習用カラムを構成
    df = gdf[["mesh_code", "lat", "lng", "footprint_area_m2", "damage"]].copy()
    for target_name, src_name in gsi_cols:
        df[target_name] = gdf[src_name].values

    # J-SHIS データとマージ
    if not jshis_df.empty:
        df = df.merge(jshis_df, on="mesh_code", how="left")

    # 自治体コード (市区町村単位の空間分割用)
    # メッシュコードの上4桁 (1次メッシュ) + 建物位置から簡易的に
    if "JCODE" not in df.columns:
        df["JCODE"] = np.nan

    # 出力
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    feature_cols = [
        "mesh_code", "lat", "lng",
        "ARV", "AVS", "JCODE",
        "T30_I55_PS", "T30_I60_PS",
        "footprint_area_m2",
        "USGS_MMI",
        "GSI_fire", "GSI_slope_failure", "GSI_tsunami",
        "damage",
    ]
    # 存在するカラムだけ使う
    existing = [c for c in feature_cols if c in df.columns]
    df = df[existing]

    df.to_csv(OUTPUT_CSV, index=False)
    print(f"[done] {OUTPUT_CSV}  ({len(df)} rows, {len(existing)} cols)")
    print(f"  columns: {existing}")
    return OUTPUT_CSV


# ── メイン ────────────────────────────────────────────
async def main():
    t0 = time.time()

    gpkg_path = download_gpkg()
    gdf = load_and_preprocess(gpkg_path)
    gdf = assign_mesh_codes(gdf)

    mesh_codes = gdf["mesh_code"].unique().tolist()

    # 各メッシュの代表建物座標 (陸上であることが保証される)
    mesh_rep_coords: dict[str, tuple[float, float]] = {}
    for mesh_code, group in gdf.groupby("mesh_code"):
        row = group.iloc[0]
        mesh_rep_coords[mesh_code] = (row["lat"], row["lng"])

    jshis_df = await fetch_all_jshis(mesh_codes, mesh_rep_coords)

    merge_and_export(gdf, jshis_df)

    elapsed = time.time() - t0
    print(f"\n=== Pipeline complete in {elapsed:.0f}s ===")


if __name__ == "__main__":
    asyncio.run(main())
