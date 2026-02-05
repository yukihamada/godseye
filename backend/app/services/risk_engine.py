import logging

from app.models.schemas import (
    JshisResult,
    PlateauResult,
    RiskBreakdown,
    RiskResult,
    RoboflowResult,
)
from app.services.ml_scorer import predict_collapse_probability

logger = logging.getLogger(__name__)


def calculate_risk(
    plateau: PlateauResult,
    jshis: JshisResult,
    roboflow: RoboflowResult | None = None,
    footprint_area_m2: float | None = None,
) -> RiskResult:
    """各データソースの情報を統合しリスクスコアを算出する。"""
    breakdown = RiskBreakdown()

    # 1. 築年数スコア (0-30点)
    if plateau.year_built:
        if plateau.year_built < 1981:
            breakdown.building_age_score = 30  # 旧耐震基準
        elif plateau.year_built < 2000:
            breakdown.building_age_score = 15  # 新耐震だが現行基準前
        else:
            breakdown.building_age_score = 5

    # 2. 構造種別スコア (0-25点)
    structure = plateau.structure_type or ""
    if "木造" in structure:
        breakdown.structure_score = 25
    elif "S造" in structure or "鉄骨" in structure or "軽量S" in structure:
        breakdown.structure_score = 15
    elif "SRC" in structure:
        breakdown.structure_score = 3
    elif "RC" in structure:
        breakdown.structure_score = 5
    elif "耐火" in structure:
        breakdown.structure_score = 5
    elif "準耐火" in structure:
        breakdown.structure_score = 12
    elif "防火" in structure:
        breakdown.structure_score = 20

    # 3. 地盤増幅率スコア (0-25点)
    if jshis.amplification_factor is not None:
        arv = jshis.amplification_factor
        breakdown.ground_score = min(25, int(arv * 12))

    # 4. 地震発生確率スコア (0-20点)
    if jshis.prob_intensity_6lower_30yr is not None:
        prob = jshis.prob_intensity_6lower_30yr
        breakdown.seismic_prob_score = min(20, int(prob * 40))

    # 5. 外観損傷スコア (0-15点) — Roboflow AI解析
    if roboflow and roboflow.analyzed and roboflow.damage_detected:
        # damage_score (0-100) → 0-15 にスケーリング
        breakdown.visual_damage_score = round(
            min(15, roboflow.damage_score * 0.15), 1
        )

    # ── ルールベーススコア ──
    rule_score = (
        breakdown.building_age_score
        + breakdown.structure_score
        + breakdown.ground_score
        + breakdown.seismic_prob_score
        + breakdown.visual_damage_score
    )
    rule_score = min(100, max(0, rule_score))

    # ── ML倒壊確率 ──
    # footprint_area_m2: PLATEAUの延床面積 or 引数で渡された値
    area = footprint_area_m2 or plateau.total_floor_area

    jcode_int = None
    if jshis.micro_topography_code is not None:
        try:
            jcode_int = int(jshis.micro_topography_code)
        except (ValueError, TypeError):
            pass

    ml_prob = predict_collapse_probability(
        arv=jshis.amplification_factor,
        avs=jshis.vs30,
        jcode=jcode_int,
        prob_i55=jshis.prob_intensity_6lower_30yr,
        prob_i60=jshis.prob_intensity_6upper_30yr,
        footprint_area_m2=area,
    )
    breakdown.ml_collapse_prob = ml_prob

    # ── ブレンド ──
    if ml_prob is not None:
        ml_score = ml_prob * 100  # 0-1 → 0-100
        has_plateau = plateau.year_built is not None or plateau.structure_type is not None
        if has_plateau:
            # PLATEAU建物データあり → ルールベース重視
            total = rule_score * 0.6 + ml_score * 0.4
        else:
            # PLATEAU建物データなし → ML重視 (建物情報の欠損を補完)
            total = rule_score * 0.4 + ml_score * 0.6
    else:
        total = rule_score

    total = min(100, max(0, total))

    level = _classify(total)
    description = _describe(level, plateau, jshis, roboflow, ml_prob)

    return RiskResult(
        score=total,
        level=level,
        breakdown=breakdown,
        description=description,
    )


def _classify(score: float) -> str:
    if score >= 75:
        return "極高"
    elif score >= 50:
        return "高"
    elif score >= 25:
        return "中"
    else:
        return "低"


def _describe(
    level: str,
    plateau: PlateauResult,
    jshis: JshisResult,
    roboflow: RoboflowResult | None = None,
    ml_prob: float | None = None,
) -> str:
    parts = []

    if plateau.year_built:
        if plateau.year_built < 1981:
            parts.append(f"築{2025 - plateau.year_built}年（1981年以前の旧耐震基準）で耐震性に懸念があります")
        elif plateau.year_built < 2000:
            parts.append(f"築{2025 - plateau.year_built}年（新耐震基準適用）")
        else:
            parts.append(f"築{2025 - plateau.year_built}年（現行耐震基準適用）")

    if plateau.structure_type:
        parts.append(f"構造: {plateau.structure_type}")

    if jshis.amplification_factor is not None:
        arv = jshis.amplification_factor
        if arv >= 2.0:
            parts.append(f"地盤増幅率 {arv:.2f} — 地盤が非常に軟弱です")
        elif arv >= 1.5:
            parts.append(f"地盤増幅率 {arv:.2f} — やや軟弱な地盤です")
        else:
            parts.append(f"地盤増幅率 {arv:.2f}")

    if jshis.micro_topography_name:
        parts.append(f"微地形: {jshis.micro_topography_name}")

    if roboflow and roboflow.analyzed and roboflow.damage_detected:
        parts.append(f"AI外観解析: {roboflow.summary}")

    if ml_prob is not None:
        pct = ml_prob * 100
        parts.append(f"ML倒壊確率: {pct:.1f}%")

    if not parts:
        return f"リスクレベル: {level}（データ不足のため参考値）"

    return f"リスクレベル: {level}。" + "。".join(parts) + "。"
