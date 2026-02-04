"""Roboflow連携 — Street View画像から複数AIモデルで建物劣化を解析する。"""

import asyncio

import httpx

from app.config import settings
from app.models.schemas import RoboflowResult, StreetViewResult

# Roboflow Hosted Inference API
DETECT_URL = "https://detect.roboflow.com"

# 使用モデル（並列実行）
MODELS = [
    {
        "id": "building-damage-detection-ahwco",
        "version": "1",
        "category": "損傷",
    },
    {
        "id": "building-crack-detection-dmhfv",
        "version": "1",
        "category": "ひび割れ",
    },
    {
        "id": "concrete-defect-detection-zuym8",
        "version": "1",
        "category": "コンクリート劣化",
    },
]

# クラス名の日本語マッピング
CLASS_NAME_JA: dict[str, str] = {
    # damage model
    "0": "損傷なし",
    "1": "軽微損傷",
    "2": "中度損傷",
    "3": "重度損傷",
    "4": "倒壊寸前",
    "5": "全壊",
    "damage": "損傷",
    # crack model
    "crack": "ひび割れ",
    "Crack": "ひび割れ",
    # concrete defect model
    "Exposed_reinforcement": "鉄筋露出",
    "Ruststrain": "錆汚れ",
    "Scaling": "剥離",
    "Spalling": "剥落",
    "efflorescence": "白華",
    "corrosion": "腐食",
}


async def analyze_building(streetview: StreetViewResult) -> RoboflowResult:
    """Street View画像を複数AIモデルで分析して建物の劣化・損傷を検出する。"""
    api_key = settings.roboflow_api_key
    if not api_key or not streetview.available or not streetview.image_urls:
        return RoboflowResult()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            image_url = streetview.image_urls[0]

            # 全モデルを並列実行
            tasks = [
                _run_detection(client, image_url, api_key, m)
                for m in MODELS
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 全結果を統合
            all_predictions: list[dict] = []
            for res in results:
                if isinstance(res, list):
                    all_predictions.extend(res)

            if not all_predictions:
                return RoboflowResult(
                    analyzed=True,
                    summary="損傷は検出されませんでした",
                    image_url=image_url,
                )

            damage_score = _calc_damage_score(all_predictions)
            summary = _build_summary(all_predictions, damage_score)

            return RoboflowResult(
                analyzed=True,
                damage_detected=True,
                predictions=all_predictions,
                damage_score=damage_score,
                summary=summary,
                image_url=image_url,
            )

    except Exception:
        return RoboflowResult()


async def _run_detection(
    client: httpx.AsyncClient,
    image_url: str,
    api_key: str,
    model: dict,
) -> list[dict]:
    """Roboflow APIで1モデルの検出を実行する。"""
    url = f"{DETECT_URL}/{model['id']}/{model['version']}"
    params = {
        "api_key": api_key,
        "image": image_url,
        "confidence": "25",
    }

    resp = await client.post(url, params=params)
    if resp.status_code != 200:
        return []

    data = resp.json()
    predictions = data.get("predictions", [])

    # カテゴリとモデル情報を付加 + クラス名を日本語化
    for p in predictions:
        p["model"] = model["category"]
        raw_class = p.get("class", "")
        p["class_ja"] = CLASS_NAME_JA.get(raw_class, raw_class)

    return predictions


def _calc_damage_score(predictions: list[dict]) -> float:
    """検出結果から0-100の損傷スコアを算出する。"""
    if not predictions:
        return 0.0

    total = 0.0
    for p in predictions:
        confidence = p.get("confidence", 0)
        w = p.get("width", 0)
        h = p.get("height", 0)
        area_ratio = (w * h) / (640 * 640)
        total += confidence * min(area_ratio * 5, 1.0)

    count_factor = min(len(predictions) / 5, 1.0)
    raw = (total / max(len(predictions), 1)) * 50 + count_factor * 50

    return round(min(100, max(0, raw)), 1)


def _build_summary(predictions: list[dict], score: float) -> str:
    """検出結果の日本語サマリーを生成する。"""
    # カテゴリごとに集計
    categories: dict[str, list[str]] = {}
    for p in predictions:
        cat = p.get("model", "検出")
        cls_ja = p.get("class_ja", p.get("class", ""))
        conf = p.get("confidence", 0)
        label = f"{cls_ja}({conf:.0%})"
        categories.setdefault(cat, []).append(label)

    parts = []
    for cat, items in categories.items():
        unique = list(dict.fromkeys(items))[:3]
        parts.append(f"{cat}: {', '.join(unique)}")

    detail = " / ".join(parts)

    if score >= 60:
        level = "重度の劣化"
    elif score >= 30:
        level = "中程度の劣化"
    elif score > 0:
        level = "軽微な劣化"
    else:
        level = "劣化なし"

    return f"{level} — {detail}" if detail else level
