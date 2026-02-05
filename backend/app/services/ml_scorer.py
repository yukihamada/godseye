"""
ML倒壊確率推論モジュール

起動時に学習済み LightGBM モデルをロードし、
地盤・ハザード・建物情報から倒壊確率 [0-1] を返す。
"""

import json
import logging
from pathlib import Path

import lightgbm as lgb
import numpy as np

logger = logging.getLogger(__name__)

# モデルファイルパス (Dockerfile で COPY される)
_MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "ml" / "model"
_MODEL_PATH = _MODEL_DIR / "collapse_model.txt"
_META_PATH = _MODEL_DIR / "model_meta.json"

# グローバルにキャッシュ
_model: lgb.Booster | None = None
_meta: dict | None = None


def _load_model() -> tuple[lgb.Booster | None, dict | None]:
    """モデルとメタ情報をロード。ファイルがなければ None を返す。"""
    global _model, _meta

    if _model is not None:
        return _model, _meta

    if not _MODEL_PATH.exists():
        logger.warning("ML model not found: %s", _MODEL_PATH)
        return None, None

    try:
        _model = lgb.Booster(model_file=str(_MODEL_PATH))
        logger.info("ML model loaded: %s", _MODEL_PATH)
    except Exception as e:
        logger.error("Failed to load ML model: %s", e)
        return None, None

    if _META_PATH.exists():
        with open(_META_PATH) as f:
            _meta = json.load(f)
        logger.info("Model meta loaded: AUC=%s", _meta.get("oof_auc"))
    else:
        _meta = {}

    return _model, _meta


def predict_collapse_probability(
    arv: float | None = None,
    avs: float | None = None,
    jcode: int | None = None,
    prob_i55: float | None = None,
    prob_i60: float | None = None,
    footprint_area_m2: float | None = None,
    gsi_fire: int | None = None,
    gsi_slope_failure: int | None = None,
    gsi_tsunami: int | None = None,
) -> float | None:
    """倒壊確率を予測する。

    Returns:
        0.0-1.0 の確率値。モデル未ロード時は None。
    """
    model, meta = _load_model()
    if model is None:
        return None

    # メタ情報の特徴量順序に従って配列を構成
    features = meta.get("features", [
        "ARV", "AVS", "JCODE",
        "T30_I55_PS", "T30_I60_PS",
        "footprint_area_m2",
        "GSI_fire", "GSI_slope_failure", "GSI_tsunami",
    ])

    feature_map = {
        "ARV": arv,
        "AVS": avs,
        "JCODE": jcode,
        "T30_I55_PS": prob_i55,
        "T30_I60_PS": prob_i60,
        "footprint_area_m2": footprint_area_m2,
        "GSI_fire": gsi_fire,
        "GSI_slope_failure": gsi_slope_failure,
        "GSI_tsunami": gsi_tsunami,
    }

    # NaN は LightGBM がネイティブに処理
    row = []
    for feat in features:
        val = feature_map.get(feat)
        row.append(val if val is not None else np.nan)

    X = np.array([row])
    prob = model.predict(X)[0]
    return float(np.clip(prob, 0.0, 1.0))


def get_model_info() -> dict | None:
    """モデルのメタ情報を返す (デバッグ・ヘルスチェック用)。"""
    _, meta = _load_model()
    return meta
