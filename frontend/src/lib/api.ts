const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface DiagnoseRequest {
  lat?: number;
  lng?: number;
  address?: string;
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
  building_lat: number | null;
  building_lng: number | null;
  year_built: number | null;
  structure_type: string | null;
  fireproof_type: string | null;
  height: number | null;
  floors_above: number | null;
  floors_below: number | null;
  total_floor_area: number | null;
  usage: string | null;
  city_name: string | null;
  city_code: string | null;
  distance_m: number | null;
  tiles_url: string | null;
}

export interface StreetViewResult {
  available: boolean;
  image_urls: string[];
  image_urls_high: string[];
  pano_id: string | null;
  pano_lat?: number | null;
  pano_lng?: number | null;
  heading_to_building?: number | null;
}

export interface HistoricalImage {
  url: string;
  date: string;
  pano_id: string;
}

export interface HistoricalStreetViewResult {
  available: boolean;
  images: HistoricalImage[];
}

export interface PlacePhoto {
  url: string;
  attribution: string;
  place_name: string;
  place_type: string;
}

export interface PlacesResult {
  available: boolean;
  photos: PlacePhoto[];
}

export interface AerialPhotoResult {
  available: boolean;
  image_url: string | null;
  zoom: number;
  source: string;
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
  image_index?: number;
  source_image_url?: string;
}

export interface RoboflowResult {
  analyzed: boolean;
  damage_detected: boolean;
  predictions: RoboflowPrediction[];
  damage_score: number;
  summary: string;
  image_url: string | null;
  analyzed_image_count?: number;
}

export interface BuildingAgeResult {
  estimated: boolean;
  year_built_min: number | null;
  year_built_max: number | null;
  confidence: string;
  first_appearance_layer: string | null;
  first_appearance_period: string | null;
  available_layers: string[];
  method: string | null;
}

export interface RiskBreakdown {
  building_age_score: number;
  structure_score: number;
  ground_score: number;
  seismic_prob_score: number;
  visual_damage_score: number;
  ml_collapse_prob: number | null;
}

export interface DiagnoseResponse {
  lat: number;
  lng: number;
  address: string | null;
  risk: RiskResult;
  jshis: JshisResult;
  plateau: PlateauResult;
  streetview: StreetViewResult;
  streetview_historical: HistoricalStreetViewResult;
  places: PlacesResult;
  aerial: AerialPhotoResult;
  building_age: BuildingAgeResult;
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

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; displayName?: string } | null> {
  // 国土地理院 住所検索API（日本の番地レベルまで対応）
  const gsiUrl = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
  const gsiRes = await fetch(gsiUrl);
  if (gsiRes.ok) {
    const gsiData = await gsiRes.json();
    if (gsiData.length > 0) {
      const [lng, lat] = gsiData[0].geometry.coordinates;
      const displayName = gsiData[0].properties?.title || address;
      return { lat, lng, displayName };
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
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

export async function getStreetViewPreview(lat: number, lng: number): Promise<StreetViewResult> {
  const res = await fetch(`${API_BASE}/api/streetview?lat=${lat}&lng=${lng}`);
  if (!res.ok) {
    return { available: false, image_urls: [], image_urls_high: [], pano_id: null };
  }
  return res.json();
}
