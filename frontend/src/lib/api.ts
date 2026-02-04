const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface DiagnoseRequest {
  lat: number;
  lng: number;
}

export interface RiskResult {
  score: number;
  level: string;
  breakdown: RiskBreakdown;
  description: string;
}

export interface JshisResult {
  amplification_factor: number | null;
  vs30: number | null;
  micro_topography_code: string | null;
  micro_topography_name: string | null;
  prob_intensity_6lower_30yr: number | null;
  prob_intensity_6upper_30yr: number | null;
}

export interface PlateauResult {
  building_id: string | null;
  building_name: string | null;
  address: string | null;
  year_built: number | null;
  structure_type: string | null;
  fireproof_type: string | null;
  height: number | null;
  floors_above: number | null;
  floors_below: number | null;
  total_floor_area: number | null;
  usage: string | null;
  city_name: string | null;
  distance_m: number | null;
}

export interface StreetViewResult {
  available: boolean;
  image_urls: string[];
  pano_id: string | null;
}

export interface TellusResult {
  scenes_found: number;
  scene_ids: string[];
  observation_dates: string[];
}

export interface RoboflowPrediction {
  class: string;
  class_ja?: string;
  model?: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoboflowResult {
  analyzed: boolean;
  damage_detected: boolean;
  predictions: RoboflowPrediction[];
  damage_score: number;
  summary: string;
  image_url: string | null;
}

export interface RiskBreakdown {
  building_age_score: number;
  structure_score: number;
  ground_score: number;
  seismic_prob_score: number;
  visual_damage_score: number;
}

export interface DiagnoseResponse {
  lat: number;
  lng: number;
  risk: RiskResult;
  jshis: JshisResult;
  plateau: PlateauResult;
  streetview: StreetViewResult;
  tellus: TellusResult;
  roboflow: RoboflowResult;
}

export async function diagnose(req: DiagnoseRequest): Promise<DiagnoseResponse> {
  const res = await fetch(`${API_BASE}/api/diagnose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  // 国土地理院 住所検索API（日本の番地レベルまで対応）
  const gsiUrl = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
  const gsiRes = await fetch(gsiUrl);
  if (gsiRes.ok) {
    const gsiData = await gsiRes.json();
    if (gsiData.length > 0) {
      const [lng, lat] = gsiData[0].geometry.coordinates;
      return { lat, lng };
    }
  }

  // フォールバック: Nominatim
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=jp&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "GodsEye/1.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}
