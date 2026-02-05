from pydantic import BaseModel, Field


class DiagnoseRequest(BaseModel):
    lat: float | None = Field(None, ge=-90, le=90, description="緯度")
    lng: float | None = Field(None, ge=-180, le=180, description="経度")
    address: str | None = Field(None, description="住所（緯度経度の代わりに指定可）")


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
    building_lat: float | None = Field(None, description="建物中心の緯度")
    building_lng: float | None = Field(None, description="建物中心の経度")
    year_built: int | None = Field(None, description="築年 (建築年)")
    structure_type: str | None = Field(None, description="構造種別 (木造/S造/RC造等)")
    fireproof_type: str | None = Field(None, description="耐火構造種別")
    height: float | None = Field(None, description="建物高さ (m)")
    floors_above: int | None = Field(None, description="地上階数")
    floors_below: int | None = Field(None, description="地下階数")
    total_floor_area: float | None = Field(None, description="延床面積 (m²)")
    usage: str | None = Field(None, description="用途")
    city_name: str | None = Field(None, description="PLATEAU対象自治体名")
    city_code: str | None = Field(None, description="自治体コード")
    distance_m: float | None = Field(None, description="指定座標からの距離 (m)")
    tiles_url: str | None = Field(None, description="3D Tiles URL")


class StreetViewResult(BaseModel):
    available: bool = Field(False, description="Street View画像が利用可能か")
    image_urls: list[str] = Field(default_factory=list, description="画像URL (640x640)")
    image_urls_high: list[str] = Field(default_factory=list, description="高解像度画像URL (1280x1280)")
    pano_id: str | None = Field(None, description="パノラマID")
    pano_lat: float | None = Field(None, description="パノラマ撮影位置の緯度")
    pano_lng: float | None = Field(None, description="パノラマ撮影位置の経度")
    heading_to_building: float | None = Field(None, description="建物への方位角 (0-360°)")


class RoboflowResult(BaseModel):
    analyzed: bool = Field(False, description="AI解析を実行したか")
    damage_detected: bool = Field(False, description="損傷が検出されたか")
    predictions: list[dict] = Field(default_factory=list, description="検出結果の詳細 (各結果に image_index, source_image_url を含む)")
    damage_score: float = Field(0, ge=0, le=100, description="損傷スコア (0-100)")
    summary: str = Field("", description="検出結果サマリー")
    image_url: str | None = Field(None, description="解析に使用した画像URL (最初の画像)")
    analyzed_image_count: int = Field(0, description="解析した画像枚数 (最大4枚)")


class TellusResult(BaseModel):
    scenes_found: int = Field(0, description="検出SAR画像シーン数")
    scene_ids: list[str] = Field(default_factory=list, description="シーンID一覧")
    observation_dates: list[str] = Field(default_factory=list, description="観測日一覧")


class PlacePhoto(BaseModel):
    url: str = Field(..., description="写真URL")
    attribution: str = Field("", description="帰属表示")
    place_name: str = Field("", description="施設名")
    place_type: str = Field("", description="施設タイプ")


class PlacesResult(BaseModel):
    available: bool = Field(False, description="周辺施設写真が利用可能か")
    photos: list[PlacePhoto] = Field(default_factory=list, description="施設写真リスト")


class HistoricalImage(BaseModel):
    url: str = Field(..., description="画像URL")
    date: str = Field("", description="撮影日 (YYYY-MM)")
    pano_id: str = Field("", description="パノラマID")


class HistoricalStreetViewResult(BaseModel):
    available: bool = Field(False, description="過去画像が利用可能か")
    images: list[HistoricalImage] = Field(default_factory=list, description="過去画像リスト")


class AerialPhotoResult(BaseModel):
    available: bool = Field(False, description="航空写真が利用可能か")
    image_url: str | None = Field(None, description="航空写真タイルURL")
    zoom: int = Field(18, description="ズームレベル")
    source: str = Field("gsi", description="データソース (gsi=国土地理院)")


class BuildingAgeResult(BaseModel):
    estimated: bool = Field(False, description="築年を推定できたか")
    year_built_min: int | None = Field(None, description="推定築年（最小）")
    year_built_max: int | None = Field(None, description="推定築年（最大）")
    confidence: str = Field("low", description="推定の信頼度 (low/medium/high)")
    first_appearance_layer: str | None = Field(None, description="建物が初出現した航空写真レイヤー")
    first_appearance_period: str | None = Field(None, description="初出現した撮影期間")
    available_layers: list[str] | None = Field(None, description="利用可能だった時系列レイヤー")
    method: str = Field("historical_aerial", description="推定手法")


class RiskBreakdown(BaseModel):
    building_age_score: float = Field(0, description="築年数スコア (0-30)")
    structure_score: float = Field(0, description="構造種別スコア (0-25)")
    ground_score: float = Field(0, description="地盤増幅率スコア (0-25)")
    seismic_prob_score: float = Field(0, description="地震発生確率スコア (0-20)")
    visual_damage_score: float = Field(0, description="外観損傷スコア (0-15)")
    ml_collapse_prob: float | None = Field(None, description="ML倒壊確率 (0.0-1.0)")


class RiskResult(BaseModel):
    score: float = Field(0, ge=0, le=100, description="総合リスクスコア (0-100)")
    level: str = Field("不明", description="リスクレベル (低/中/高/極高)")
    breakdown: RiskBreakdown = Field(default_factory=RiskBreakdown)
    description: str = Field("", description="リスク説明文")


class DiagnoseResponse(BaseModel):
    lat: float
    lng: float
    address: str | None = Field(None, description="ジオコーディング結果の住所")
    risk: RiskResult
    jshis: JshisResult
    plateau: PlateauResult
    streetview: StreetViewResult
    streetview_historical: HistoricalStreetViewResult = Field(
        default_factory=HistoricalStreetViewResult, description="過去のStreet View画像"
    )
    places: PlacesResult = Field(default_factory=PlacesResult, description="周辺施設の写真")
    aerial: AerialPhotoResult = Field(default_factory=lambda: AerialPhotoResult())
    building_age: BuildingAgeResult = Field(
        default_factory=BuildingAgeResult, description="時系列航空写真からの築年推定"
    )
    tellus: TellusResult
    roboflow: RoboflowResult
