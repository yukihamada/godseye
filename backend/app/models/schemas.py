from pydantic import BaseModel, Field


class DiagnoseRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90, description="緯度")
    lng: float = Field(..., ge=-180, le=180, description="経度")


class JshisResult(BaseModel):
    amplification_factor: float | None = Field(None, description="表層地盤増幅率 (ARV)")
    vs30: float | None = Field(None, description="平均S波速度 Vs30 (m/s)")
    micro_topography_code: str | None = Field(None, description="微地形区分コード (JCODE)")
    micro_topography_name: str | None = Field(None, description="微地形区分名 (JNAME)")
    prob_intensity_6lower_30yr: float | None = Field(
        None, description="30年以内に震度6弱以上の発生確率"
    )
    prob_intensity_6upper_30yr: float | None = Field(
        None, description="30年以内に震度6強以上の発生確率"
    )


class PlateauResult(BaseModel):
    building_id: str | None = Field(None, description="建物ID (gml:id)")
    building_name: str | None = Field(None, description="建物名称")
    address: str | None = Field(None, description="住所")
    year_built: int | None = Field(None, description="築年 (建築年)")
    structure_type: str | None = Field(None, description="構造種別 (木造/S造/RC造等)")
    fireproof_type: str | None = Field(None, description="耐火構造種別")
    height: float | None = Field(None, description="建物高さ (m)")
    floors_above: int | None = Field(None, description="地上階数")
    floors_below: int | None = Field(None, description="地下階数")
    total_floor_area: float | None = Field(None, description="延床面積 (m²)")
    usage: str | None = Field(None, description="用途")
    city_name: str | None = Field(None, description="PLATEAU対象自治体名")
    distance_m: float | None = Field(None, description="指定座標からの距離 (m)")


class StreetViewResult(BaseModel):
    available: bool = Field(False, description="Street View画像が利用可能か")
    image_urls: list[str] = Field(default_factory=list, description="4方向の画像URL")
    pano_id: str | None = Field(None, description="パノラマID")


class RoboflowResult(BaseModel):
    analyzed: bool = Field(False, description="AI解析を実行したか")
    damage_detected: bool = Field(False, description="損傷が検出されたか")
    predictions: list[dict] = Field(default_factory=list, description="検出結果の詳細")
    damage_score: float = Field(0, ge=0, le=100, description="損傷スコア (0-100)")
    summary: str = Field("", description="検出結果サマリー")
    image_url: str | None = Field(None, description="解析に使用した画像URL")


class TellusResult(BaseModel):
    scenes_found: int = Field(0, description="検出SAR画像シーン数")
    scene_ids: list[str] = Field(default_factory=list, description="シーンID一覧")
    observation_dates: list[str] = Field(default_factory=list, description="観測日一覧")


class RiskBreakdown(BaseModel):
    building_age_score: float = Field(0, description="築年数スコア (0-30)")
    structure_score: float = Field(0, description="構造種別スコア (0-25)")
    ground_score: float = Field(0, description="地盤増幅率スコア (0-25)")
    seismic_prob_score: float = Field(0, description="地震発生確率スコア (0-20)")
    visual_damage_score: float = Field(0, description="外観損傷スコア (0-15)")


class RiskResult(BaseModel):
    score: float = Field(0, ge=0, le=100, description="総合リスクスコア (0-100)")
    level: str = Field("不明", description="リスクレベル (低/中/高/極高)")
    breakdown: RiskBreakdown = Field(default_factory=RiskBreakdown)
    description: str = Field("", description="リスク説明文")


class DiagnoseResponse(BaseModel):
    lat: float
    lng: float
    risk: RiskResult
    jshis: JshisResult
    plateau: PlateauResult
    streetview: StreetViewResult
    tellus: TellusResult
    roboflow: RoboflowResult
