"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useMemo } from "react";
import SearchBar from "@/components/SearchBar";
import RiskPanel from "@/components/RiskPanel";
import BuildingSelector from "@/components/BuildingSelector";
import { diagnose, geocodeAddress, type DiagnoseResponse } from "@/lib/api";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

const DEFAULT_CENTER: [number, number] = [35.7100, 139.8300]; // 東京東部

const HOTSPOTS = [
  { name: "立石7丁目", area: "葛飾区", lat: 35.7385, lng: 139.8520, risk: 53.0, arv: 2.12, tag: "自然堤防", desc: "6.2m/122m2" },
  { name: "堀切4丁目", area: "葛飾区", lat: 35.7455, lng: 139.8155, risk: 53.0, arv: 2.40, tag: "旧河道", desc: "9.8m/124m2" },
  { name: "西新井本町2丁目", area: "足立区", lat: 35.7830, lng: 139.7750, risk: 52.7, arv: 2.44, tag: "三角州", desc: "住宅密集地" },
  { name: "四つ木2丁目", area: "葛飾区", lat: 35.7350, lng: 139.8395, risk: 52.3, arv: 2.43, tag: "三角州", desc: "6.6m/22m2" },
  { name: "南千住6丁目", area: "荒川区", lat: 35.7315, lng: 139.7970, risk: 51.5, arv: 2.34, tag: "三角州", desc: "3.7m/37m2" },
  { name: "向島5丁目", area: "墨田区", lat: 35.7195, lng: 139.8055, risk: 51.6, arv: 2.04, tag: "三角州", desc: "木造密集地帯" },
  { name: "東新小岩5丁目", area: "葛飾区", lat: 35.7195, lng: 139.8630, risk: 50.7, arv: 2.42, tag: "三角州", desc: "9.1m/58m2" },
  { name: "新小岩3丁目", area: "葛飾区", lat: 35.7135, lng: 139.8555, risk: 50.6, arv: 2.49, tag: "三角州", desc: "6.8m/70m2" },
  { name: "綾瀬4丁目", area: "足立区", lat: 35.7595, lng: 139.8310, risk: 45.0, arv: 2.31, tag: "旧河道", desc: "6.8m/50m2" },
  { name: "綾瀬6丁目", area: "足立区", lat: 35.7570, lng: 139.8345, risk: 48.2, arv: 2.29, tag: "旧河道", desc: "6.8m/47m2" },
  { name: "京島3丁目", area: "墨田区", lat: 35.7155, lng: 139.8165, risk: 49.8, arv: 2.48, tag: "三角州", desc: "木造密集地帯" },
  { name: "梅島1丁目", area: "足立区", lat: 35.7735, lng: 139.7935, risk: 49.7, arv: 2.57, tag: "三角州", desc: "ARV最高級" },
  { name: "大島5丁目", area: "江東区", lat: 35.6895, lng: 139.8360, risk: 49.8, arv: 2.36, tag: "干拓地", desc: "8.7m/155m2" },
  { name: "青戸3丁目", area: "葛飾区", lat: 35.7565, lng: 139.8485, risk: 48.1, arv: 2.33, tag: "三角州", desc: "6.4m/56m2" },
  { name: "金町4丁目", area: "葛飾区", lat: 35.7665, lng: 139.8740, risk: 46.6, arv: 1.68, tag: "自然堤防", desc: "6.5m/107m2" },
  { name: "小岩1丁目", area: "江戸川区", lat: 35.7295, lng: 139.8830, risk: 42.7, arv: 1.64, tag: "三角州", desc: "5.9m/68m2" },
];

// ステップの型定義
type Step = "area-select" | "building-select" | "result";

// エリアごとの中心座標とリスク概要
interface AreaInfo {
  name: string;
  center: [number, number];
  maxRisk: number;
  avgArv: number;
  count: number;
  spots: typeof HOTSPOTS;
}

// 建物選択用の状態
interface SelectedLocation {
  lat: number;
  lng: number;
  address?: string;
}

function groupByArea(): AreaInfo[] {
  const grouped: Record<string, typeof HOTSPOTS> = {};
  for (const h of HOTSPOTS) {
    const list = grouped[h.area] || [];
    list.push(h);
    grouped[h.area] = list;
  }
  const areas: AreaInfo[] = [];
  for (const [name, spots] of Object.entries(grouped)) {
    const lats = spots.map((s) => s.lat);
    const lngs = spots.map((s) => s.lng);
    areas.push({
      name,
      center: [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
      ],
      maxRisk: Math.max(...spots.map((s) => s.risk)),
      avgArv: +(spots.reduce((a, s) => a + s.arv, 0) / spots.length).toFixed(2),
      count: spots.length,
      spots: spots.sort((a, b) => b.risk - a.risk),
    });
  }
  return areas.sort((a, b) => b.maxRisk - a.maxRisk);
}

export default function Home() {
  const [center] = useState<[number, number]>(DEFAULT_CENTER);
  const [marker, setMarker] = useState<[number, number] | null>(null);
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnoseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  // 新しい状態: ステップ管理と建物選択
  const [step, setStep] = useState<Step>("area-select");
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);

  const areas = useMemo(() => groupByArea(), []);

  // 診断実行
  const runDiagnose = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    setMarker([lat, lng]);

    try {
      const data = await diagnose({ lat, lng });
      setResult(data);
      setStep("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "診断に失敗しました");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 住所検索 → 建物選択画面へ
  const handleSearch = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);

    try {
      const geo = await geocodeAddress(query);
      if (!geo) {
        setError("住所が見つかりませんでした");
        setLoading(false);
        return;
      }

      // 建物選択画面へ遷移
      setSelectedLocation({
        lat: geo.lat,
        lng: geo.lng,
        address: geo.displayName || query,
      });
      setMarker([geo.lat, geo.lng]);
      setFlyTo({ center: [geo.lat, geo.lng], zoom: 18 });
      setStep("building-select");
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  // 座標検索 → 建物選択画面へ
  const handleCoordinateSearch = useCallback((lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setMarker([lat, lng]);
    setFlyTo({ center: [lat, lng], zoom: 18 });
    setStep("building-select");
  }, []);

  // 地図クリック → 建物選択画面へ
  const handleMapClick = useCallback((lat: number, lng: number) => {
    setSelectedLocation({ lat, lng });
    setMarker([lat, lng]);
    setFlyTo({ center: [lat, lng], zoom: 18 });
    setStep("building-select");
    setError(null);
  }, []);

  // エリア選択
  const handleSelectArea = useCallback((area: AreaInfo) => {
    setSelectedArea(area.name);
    setResult(null);
    setMarker(null);
    setError(null);
    setFlyTo({ center: area.center, zoom: 15 });
  }, []);

  // ホットスポットから建物選択画面へ
  const handleSelectHotspot = useCallback((lat: number, lng: number, name: string) => {
    setSelectedLocation({ lat, lng, address: name });
    setMarker([lat, lng]);
    setFlyTo({ center: [lat, lng], zoom: 18 });
    setStep("building-select");
  }, []);

  // 戻るボタン
  const handleBack = useCallback(() => {
    if (step === "result") {
      // 結果画面から建物選択に戻る
      if (selectedLocation) {
        setStep("building-select");
        setResult(null);
      } else {
        setStep("area-select");
        setSelectedArea(null);
        setResult(null);
        setMarker(null);
        setFlyTo({ center: DEFAULT_CENTER, zoom: 12 });
      }
    } else if (step === "building-select") {
      // 建物選択からエリア選択に戻る
      setStep("area-select");
      setSelectedLocation(null);
      if (selectedArea) {
        const area = areas.find((a) => a.name === selectedArea);
        if (area) {
          setFlyTo({ center: area.center, zoom: 15 });
        }
      } else {
        setMarker(null);
        setFlyTo({ center: DEFAULT_CENTER, zoom: 12 });
      }
    } else {
      // エリア選択でエリアが選択されている場合
      setSelectedArea(null);
      setMarker(null);
      setFlyTo({ center: DEFAULT_CENTER, zoom: 12 });
    }
    setError(null);
  }, [step, selectedArea, selectedLocation, areas]);

  // 建物選択完了 → 診断実行
  const handleBuildingSelect = useCallback(
    (lat: number, lng: number) => {
      setSelectedLocation((prev) => (prev ? { ...prev, lat, lng } : { lat, lng }));
      runDiagnose(lat, lng);
    },
    [runDiagnose]
  );

  const currentAreaSpots = useMemo(() => {
    if (!selectedArea) return [];
    return areas.find((a) => a.name === selectedArea)?.spots || [];
  }, [selectedArea, areas]);

  return (
    <div className="flex flex-col h-screen">
      {/* ヘッダー */}
      <header className="flex items-center gap-4 px-4 py-3 border-b border-[var(--card-border)] bg-[var(--card-bg)]">
        <h1 className="text-lg font-bold whitespace-nowrap tracking-tight">
          <span className="text-[var(--accent)]">GOD&apos;S</span> EYE
        </h1>
        <div className="flex-1 max-w-2xl">
          <SearchBar
            onSearch={handleSearch}
            onCoordinateSearch={handleCoordinateSearch}
            loading={loading}
          />
        </div>
      </header>

      {/* メインコンテンツ */}
      <div className="flex flex-1 overflow-hidden">
        {/* 地図 */}
        <div className="flex-1 relative">
          <Map center={center} marker={marker} flyTo={flyTo} onMapClick={handleMapClick} />
          {loading && step !== "building-select" && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-[1000]">
              <div className="bg-[var(--card-bg)] px-6 py-4 rounded-xl border border-[var(--card-border)] flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">データ取得中...</span>
              </div>
            </div>
          )}
        </div>

        {/* サイドパネル */}
        <aside className="w-96 border-l border-[var(--card-border)] bg-[var(--background)] overflow-y-auto">
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 m-4 mb-0">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {step === "result" && result ? (
            /* Step 3: 診断結果 */
            <div>
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-white px-4 pt-3 pb-1 transition-colors"
              >
                <span>←</span> 建物選択に戻る
              </button>
              <div className="p-4 pt-2">
                <RiskPanel data={result} />
              </div>
            </div>
          ) : step === "building-select" && selectedLocation ? (
            /* Step 2: 建物選択（Street View） */
            <BuildingSelector
              lat={selectedLocation.lat}
              lng={selectedLocation.lng}
              address={selectedLocation.address}
              onSelect={handleBuildingSelect}
              onBack={handleBack}
              loading={loading}
            />
          ) : selectedArea ? (
            /* Step 1b: エリア内の建物一覧 */
            <div className="flex flex-col h-full">
              <div className="px-4 pt-4 pb-3 border-b border-[var(--card-border)]">
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
                >
                  <span>←</span> エリア一覧に戻る
                </button>
                <h2 className="text-base font-bold">{selectedArea}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  建物を選択してStreet Viewで確認
                </p>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3">
                <div className="space-y-2">
                  {currentAreaSpots.map((h) => (
                    <button
                      key={h.name}
                      onClick={() => handleSelectHotspot(h.lat, h.lng, `${h.area} ${h.name}`)}
                      disabled={loading}
                      className="w-full text-left px-3 py-3 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--accent)]/50 transition-all group disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium group-hover:text-white">{h.name}</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                          h.risk >= 50 ? "bg-red-900/50 text-red-400" : "bg-yellow-900/40 text-yellow-400"
                        }`}>
                          {h.risk}
                        </span>
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[11px] text-gray-500">
                        <span>ARV {h.arv.toFixed(2)}</span>
                        <span>{h.tag}</span>
                        <span>{h.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-lg border border-dashed border-[var(--card-border)] text-center">
                  <p className="text-xs text-gray-500">
                    地図をクリックして<br />任意の場所を選択することもできます
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* Step 1a: エリア選択 */
            <div className="flex flex-col h-full">
              <div className="text-center px-4 py-4 border-b border-[var(--card-border)]">
                <p className="text-sm font-medium mb-1">地震倒壊リスク診断</p>
                <p className="text-xs text-gray-500">
                  ① エリア選択 → ② Street Viewで建物確認 → ③ 診断
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="px-3 py-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
                    High Risk Areas
                  </h3>
                  <div className="space-y-2">
                    {areas.map((area) => (
                      <button
                        key={area.name}
                        onClick={() => handleSelectArea(area)}
                        className="w-full text-left px-4 py-3.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--accent)]/50 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold group-hover:text-white">{area.name}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            area.maxRisk >= 50 ? "bg-red-900/50 text-red-400" : "bg-yellow-900/40 text-yellow-400"
                          }`}>
                            最大 {area.maxRisk}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-500">
                          <span>{area.count}棟</span>
                          <span>平均ARV {area.avgArv}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {area.spots.slice(0, 3).map((s) => (
                            <span key={s.name} className="text-[10px] bg-[var(--background)] px-1.5 py-0.5 rounded text-gray-400">
                              {s.name}
                            </span>
                          ))}
                          {area.spots.length > 3 && (
                            <span className="text-[10px] text-gray-600">+{area.spots.length - 3}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-[var(--card-border)]">
                  <p className="text-[11px] text-gray-600 text-center">
                    住所検索や地図クリックでも建物を選択できます
                  </p>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
