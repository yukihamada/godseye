"""
Step 2: LightGBM 倒壊予測モデル学習

- Model A (MMI込み): 評価用 — 訓練データの実際の揺れ情報を含む
- Model B (MMI抜き): デプロイ用 — 未来の地震では MMI 不明のため

空間分割: StratifiedGroupKFold (1次メッシュ単位)
不均衡対策: scale_pos_weight
"""

import json
import warnings
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    auc,
    classification_report,
    f1_score,
    precision_recall_curve,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold

warnings.filterwarnings("ignore", category=UserWarning)

# ── 定数 ──────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
MODEL_DIR = Path(__file__).parent / "model"
TRAINING_CSV = DATA_DIR / "training_data.csv"

# Model B (デプロイ用) の特徴量 — MMI なし
FEATURES_DEPLOY = [
    "ARV",
    "AVS",
    "JCODE",
    "T30_I55_PS",
    "T30_I60_PS",
    "footprint_area_m2",
    "GSI_fire",
    "GSI_slope_failure",
    "GSI_tsunami",
]

# Model A (評価用) — MMI あり
FEATURES_EVAL = FEATURES_DEPLOY + ["USGS_MMI"]

CATEGORICAL_FEATURES = ["JCODE"]

LABEL_COL = "damage"

LGB_PARAMS = {
    "objective": "binary",
    "metric": "auc",
    "num_leaves": 31,
    "learning_rate": 0.05,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "verbose": -1,
    "seed": 42,
}

N_ROUNDS = 500
EARLY_STOPPING = 50
N_FOLDS = 5


# ── データ読み込み ────────────────────────────────────
def load_data() -> pd.DataFrame:
    print(f"[load] {TRAINING_CSV}")
    df = pd.read_csv(TRAINING_CSV)
    print(f"  rows: {len(df)}")
    print(f"  label dist: {df[LABEL_COL].value_counts().to_dict()}")
    return df


# ── グループ作成 (空間分割用) ─────────────────────────
def create_groups(df: pd.DataFrame) -> np.ndarray:
    """2次メッシュコード (上6桁) をグループとして使用。
    同じ2次メッシュ内の建物は同じ fold に入る → データリーク防止。
    1次メッシュ(4桁)だと能登半島で4グループしかなく fold 分割不可。
    """
    if "mesh_code" in df.columns:
        groups = df["mesh_code"].astype(str).str[:6]
    else:
        # fallback: 緯度経度の粗いグリッド
        groups = (df["lat"] * 10).astype(int).astype(str) + "_" + (df["lng"] * 10).astype(int).astype(str)
    return groups.values


# ── モデル学習 ────────────────────────────────────────
def train_and_evaluate(
    df: pd.DataFrame,
    features: list[str],
    model_name: str,
) -> tuple[lgb.Booster, dict]:
    """StratifiedGroupKFold で学習・評価。最終モデルは全データで再学習。"""
    print(f"\n{'='*60}")
    print(f"Training: {model_name}")
    print(f"Features: {features}")
    print(f"{'='*60}")

    # 存在する特徴量のみ使用
    available = [f for f in features if f in df.columns]
    missing = [f for f in features if f not in df.columns]
    if missing:
        print(f"  [warn] missing features: {missing}")
    features = available

    X = df[features].copy()
    y = df[LABEL_COL].values
    groups = create_groups(df)

    # カテゴリ特徴量
    cat_cols = [c for c in CATEGORICAL_FEATURES if c in features]
    for c in cat_cols:
        X[c] = X[c].astype("category")

    # 不均衡対策
    n_pos = y.sum()
    n_neg = len(y) - n_pos
    scale_pos_weight = n_neg / n_pos if n_pos > 0 else 1.0
    print(f"  pos={n_pos}, neg={n_neg}, scale_pos_weight={scale_pos_weight:.2f}")

    params = {**LGB_PARAMS, "scale_pos_weight": scale_pos_weight}

    # CV
    sgkf = StratifiedGroupKFold(n_splits=N_FOLDS, shuffle=True, random_state=42)
    oof_probs = np.zeros(len(df))
    fold_aucs = []

    for fold_i, (train_idx, val_idx) in enumerate(sgkf.split(X, y, groups)):
        X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_tr, y_val = y[train_idx], y[val_idx]

        dtrain = lgb.Dataset(X_tr, y_tr, categorical_feature=cat_cols)
        dval = lgb.Dataset(X_val, y_val, categorical_feature=cat_cols, reference=dtrain)

        model = lgb.train(
            params,
            dtrain,
            num_boost_round=N_ROUNDS,
            valid_sets=[dval],
            callbacks=[
                lgb.early_stopping(EARLY_STOPPING),
                lgb.log_evaluation(100),
            ],
        )

        val_probs = model.predict(X_val)
        oof_probs[val_idx] = val_probs

        fold_auc = roc_auc_score(y_val, val_probs)
        fold_aucs.append(fold_auc)
        print(f"  Fold {fold_i+1}: AUC={fold_auc:.4f} (best_iter={model.best_iteration})")

    # OOF 全体の評価
    oof_auc = roc_auc_score(y, oof_probs)
    print(f"\n  OOF AUC: {oof_auc:.4f} (mean fold: {np.mean(fold_aucs):.4f} ± {np.std(fold_aucs):.4f})")

    # 最適閾値 (F1最大化)
    precisions, recalls, thresholds = precision_recall_curve(y, oof_probs)
    f1s = 2 * precisions * recalls / (precisions + recalls + 1e-8)
    best_idx = np.argmax(f1s)
    best_threshold = float(thresholds[best_idx]) if best_idx < len(thresholds) else 0.5
    print(f"  Best threshold (F1): {best_threshold:.4f}")

    # 閾値適用後の分類レポート
    oof_preds = (oof_probs >= best_threshold).astype(int)
    print("\n  Classification Report (OOF):")
    print(classification_report(y, oof_preds, target_names=["survive", "collapse"], digits=4))

    # 校正曲線
    try:
        prob_true, prob_pred = calibration_curve(y, oof_probs, n_bins=10, strategy="quantile")
        print("  Calibration (quantile bins):")
        for pt, pp in zip(prob_true, prob_pred):
            print(f"    pred={pp:.3f} → actual={pt:.3f}")
    except Exception:
        pass

    # 全データで再学習 (デプロイ用)
    print("\n  Retraining on full data ...")
    dtrain_full = lgb.Dataset(X, y, categorical_feature=cat_cols)
    final_model = lgb.train(
        params,
        dtrain_full,
        num_boost_round=model.best_iteration or N_ROUNDS,
    )

    # 特徴量重要度
    importance = dict(zip(features, final_model.feature_importance(importance_type="gain").tolist()))
    print("  Feature importance (gain):")
    for feat, imp in sorted(importance.items(), key=lambda x: -x[1]):
        print(f"    {feat}: {imp:.1f}")

    meta = {
        "model_name": model_name,
        "features": features,
        "categorical_features": cat_cols,
        "oof_auc": round(oof_auc, 4),
        "fold_aucs": [round(a, 4) for a in fold_aucs],
        "best_threshold": round(best_threshold, 4),
        "scale_pos_weight": round(scale_pos_weight, 2),
        "best_iteration": model.best_iteration,
        "n_samples": len(df),
        "n_positive": int(n_pos),
        "feature_importance": {k: round(v, 1) for k, v in importance.items()},
    }

    return final_model, meta


# ── 保存 ──────────────────────────────────────────────
def save_model(model: lgb.Booster, meta: dict, suffix: str = ""):
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    model_path = MODEL_DIR / f"collapse_model{suffix}.txt"
    meta_path = MODEL_DIR / f"model_meta{suffix}.json"

    model.save_model(str(model_path))
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    size_kb = model_path.stat().st_size / 1024
    print(f"  Saved: {model_path} ({size_kb:.0f} KB)")
    print(f"  Saved: {meta_path}")


# ── メイン ────────────────────────────────────────────
def main():
    df = load_data()

    # Model A: MMI込み (評価用)
    model_a, meta_a = train_and_evaluate(df, FEATURES_EVAL, "Model A (with MMI)")
    save_model(model_a, meta_a, suffix="_eval")

    # Model B: MMI抜き (デプロイ用)
    model_b, meta_b = train_and_evaluate(df, FEATURES_DEPLOY, "Model B (deploy)")
    save_model(model_b, meta_b, suffix="")

    print("\n=== Training complete ===")
    print(f"  Model A AUC: {meta_a['oof_auc']}")
    print(f"  Model B AUC: {meta_b['oof_auc']}")
    print(f"  Deploy model: {MODEL_DIR / 'collapse_model.txt'}")


if __name__ == "__main__":
    main()
