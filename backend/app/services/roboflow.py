"""Roboflow連携 — Street View画像から複数AIモデルで建物劣化を解析する。"""

import asyncio
import logging

import httpx

from app.config import settings
from app.models.schemas import RoboflowResult, StreetViewResult

logger = logging.getLogger(__name__)

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
    """Street View画像を複数AIモデルで分析して建物の劣化・損傷を検出する。

    最大4枚の画像を解析し、全モデル×全画像を並列実行して結果を統合する。
    """
    api_key = settings.roboflow_api_key
    if not api_key or not streetview.available or not streetview.image_urls:
        return RoboflowResult()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 最大4枚の画像を解析対象とする
            images_to_analyze = streetview.image_urls[:4]

            # 全モデル×全画像を並列実行
            tasks = []
            for img_idx, image_url in enumerate(images_to_analyze):
                for model in MODELS:
                    tasks.append(
                        _run_detection(client, image_url, api_key, model, img_idx)
                    )

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
                    image_url=images_to_analyze[0],
                    analyzed_image_count=len(images_to_analyze),
                )

            damage_score = _calc_damage_score(all_predictions, len(images_to_analyze))
            summary = _build_summary(all_predictions, damage_score, len(images_to_analyze))

            return RoboflowResult(
                analyzed=True,
                damage_detected=True,
                predictions=all_predictions,
                damage_score=damage_score,
                summary=summary,
                image_url=images_to_analyze[0],
                analyzed_image_count=len(images_to_analyze),
            )

    except Exception as e:
        logger.warning(f"Roboflow analysis failed: {type(e).__name__}: {e}")
        return RoboflowResult()


async def _run_detection(
    client: httpx.AsyncClient,
    image_url: str,
    api_key: str,
    model: dict[str, str],
    image_index: int = 0,
) -> list[dict[str, object]]:
    """Roboflow APIで1モデルの検出を実行する。

    Args:
        client: HTTP client
        image_url: 解析対象の画像URL
        api_key: Roboflow APIキー
        model: モデル設定（id, version, category）
        image_index: 画像のインデックス（0始まり）

    Returns:
        検出結果のリスト（各結果に image_index が付加される）
    """
    url = f"{DETECT_URL}/{model['id']}/{model['version']}"
    params = {
        "api_key": api_key,
        "image": image_url,
        "confidence": "25",
    }

    resp = await client.post(url, params=params)
    if resp.status_code != 200:
        logger.warning(f"Roboflow model {model['id']} returned {resp.status_code}")
        return []

    data = resp.json()
    predictions = data.get("predictions", [])

    # カテゴリとモデル情報を付加 + クラス名を日本語化 + 画像インデックスを記録
    for p in predictions:
        p["model"] = model["category"]
        raw_class = p.get("class", "")
        p["class_ja"] = CLASS_NAME_JA.get(raw_class, raw_class)
        p["image_index"] = image_index
        p["source_image_url"] = image_url

    return predictions


def _calc_damage_score(predictions: list[dict], image_count: int = 1) -> float:
    """検出結果から0-100の損傷スコアを算出する。

    複数画像からの検出結果を統合してスコア化する。
    - 画像ごとにスコアを計算し、最大値と平均値の加重平均を取る
    - 複数画像で検出された場合は信頼性が高いため、スコアを補正する

    Args:
        predictions: 全画像からの検出結果
        image_count: 解析した画像の枚数

    Returns:
        0-100の損傷スコア
    """
    if not predictions:
        return 0.0

    # 画像ごとにスコアを計算
    image_scores: dict[int, float] = {}
    image_predictions: dict[int, list[dict]] = {}

    for p in predictions:
        img_idx = p.get("image_index", 0)
        image_predictions.setdefault(img_idx, []).append(p)

    for img_idx, preds in image_predictions.items():
        total = 0.0
        for p in preds:
            confidence = p.get("confidence", 0)
            w = p.get("width", 0)
            h = p.get("height", 0)
            area_ratio = (w * h) / (640 * 640)
            total += confidence * min(area_ratio * 5, 1.0)

        count_factor = min(len(preds) / 5, 1.0)
        raw = (total / max(len(preds), 1)) * 50 + count_factor * 50
        image_scores[img_idx] = min(100, max(0, raw))

    if not image_scores:
        return 0.0

    scores = list(image_scores.values())
    max_score = max(scores)
    avg_score = sum(scores) / len(scores)

    # 最大値70%、平均30%で加重平均
    base_score = max_score * 0.7 + avg_score * 0.3

    # 複数画像で検出された場合、信頼性ボーナスを付与（最大10%）
    images_with_detections = len(image_scores)
    consistency_bonus = min((images_with_detections - 1) * 5, 10) if images_with_detections > 1 else 0

    final_score = min(100, base_score + consistency_bonus)

    return round(final_score, 1)


def _build_summary(predictions: list[dict], score: float, image_count: int = 1) -> str:
    """検出結果の日本語サマリーを生成する。

    Args:
        predictions: 全画像からの検出結果
        score: 算出された損傷スコア
        image_count: 解析した画像の枚数

    Returns:
        日本語のサマリー文字列
    """
    # カテゴリごとに集計
    categories: dict[str, list[str]] = {}
    images_with_detections: set[int] = set()

    for p in predictions:
        cat = p.get("model", "検出")
        cls_ja = p.get("class_ja", p.get("class", ""))
        conf = p.get("confidence", 0)
        img_idx = p.get("image_index", 0)
        label = f"{cls_ja}({conf:.0%})"
        categories.setdefault(cat, []).append(label)
        images_with_detections.add(img_idx)

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

    # 解析画像数の情報を追加
    detection_info = f"({len(images_with_detections)}/{image_count}枚で検出)"

    return f"{level} {detection_info} — {detail}" if detail else f"{level} {detection_info}"
