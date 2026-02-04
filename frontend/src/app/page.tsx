"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import SearchBar from "@/components/SearchBar";
import RiskPanel from "@/components/RiskPanel";
import { diagnose, geocodeAddress, type DiagnoseResponse } from "@/lib/api";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

const DEFAULT_CENTER: [number, number] = [35.7100, 139.8300]; // 東京東部

const HOTSPOTS = [
  { name: "足立区綾瀬", lat: 35.7620, lng: 139.8270, risk: 54.1, arv: 2.45, tag: "旧河道" },
  { name: "葛飾区新小岩", lat: 35.7161, lng: 139.8581, risk: 54.1, arv: 2.51, tag: "三角州" },
  { name: "墨田区京島", lat: 35.7170, lng: 139.8180, risk: 53.6, arv: 2.55, tag: "三角州" },
  { name: "足立区梅島", lat: 35.7750, lng: 139.7950, risk: 52.8, arv: 2.55, tag: "三角州" },
  { name: "江東区大島", lat: 35.6870, lng: 139.8340, risk: 52.7, arv: 2.32, tag: "干拓地" },
  { name: "江東区北砂", lat: 35.6760, lng: 139.8350, risk: 51.9, arv: 2.04, tag: "干拓地" },
  { name: "葛飾区青戸", lat: 35.7540, lng: 139.8510, risk: 51.6, arv: 1.94, tag: "三角州" },
  { name: "足立区西新井", lat: 35.7810, lng: 139.7810, risk: 51.3, arv: 2.49, tag: "自然堤防" },
  { name: "葛飾区金町", lat: 35.7680, lng: 139.8710, risk: 50.8, arv: 1.84, tag: "自然堤防" },
  { name: "墨田区向島", lat: 35.7220, lng: 139.8090, risk: 50.0, arv: 2.22, tag: "三角州" },
  { name: "荒川区町屋", lat: 35.7430, lng: 139.7810, risk: 49.5, arv: 2.56, tag: "三角州" },
  { name: "江戸川区葛西", lat: 35.6590, lng: 139.8710, risk: 47.5, arv: 2.72, tag: "干拓地" },
  { name: "中央区月島", lat: 35.6622, lng: 139.7833, risk: 54.0, arv: 1.65, tag: "埋立地" },
  { name: "千代田区丸の内", lat: 35.6812, lng: 139.7671, risk: 43.4, arv: 1.27, tag: "干拓地" },
  { name: "大阪市中之島", lat: 34.6937, lng: 135.5023, risk: 32.6, arv: 1.44, tag: "砂州" },
  { name: "名古屋市三の丸", lat: 35.1815, lng: 136.9066, risk: 37.4, arv: 1.30, tag: "砂礫質台地" },
];

export default function Home() {
  const [center] = useState<[number, number]>(DEFAULT_CENTER);
  const [marker, setMarker] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnoseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnose = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    setMarker([lat, lng]);

    try {
      const data = await diagnose({ lat, lng });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "診断に失敗しました");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);

    try {
      const coords = await geocodeAddress(query);
      if (!coords) {
        setError("住所が見つかりませんでした");
        setLoading(false);
        return;
      }
      await runDiagnose(coords.lat, coords.lng);
    } catch {
      setError("住所検索に失敗しました");
      setLoading(false);
    }
  }, [runDiagnose]);

  const handleCoordinateSearch = useCallback((lat: number, lng: number) => {
    runDiagnose(lat, lng);
  }, [runDiagnose]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    runDiagnose(lat, lng);
  }, [runDiagnose]);

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
          <Map center={center} marker={marker} onMapClick={handleMapClick} />
          {loading && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-[1000]">
              <div className="bg-[var(--card-bg)] px-6 py-4 rounded-xl border border-[var(--card-border)] flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">データ取得中...</span>
              </div>
            </div>
          )}
        </div>

        {/* サイドパネル */}
        <aside className="w-96 border-l border-[var(--card-border)] bg-[var(--background)] p-4 overflow-y-auto">
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {result ? (
            <RiskPanel data={result} />
          ) : (
            <div className="flex flex-col h-full">
              <div className="text-center py-4 border-b border-[var(--card-border)]">
                <p className="text-sm text-gray-400">
                  住所を検索 / 地図をクリック / 下のリストから選択
                </p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="px-1 py-3">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-2">
                    High Risk Locations
                  </h3>
                  <div className="space-y-1.5">
                    {HOTSPOTS.map((h) => (
                      <button
                        key={h.name}
                        onClick={() => runDiagnose(h.lat, h.lng)}
                        disabled={loading}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[var(--card-bg)] border border-transparent hover:border-[var(--card-border)] transition-all group disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium group-hover:text-white">{h.name}</span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            h.risk >= 50 ? "bg-red-900/50 text-red-400" : "bg-yellow-900/40 text-yellow-400"
                          }`}>
                            {h.risk}
                          </span>
                        </div>
                        <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                          <span>ARV {h.arv.toFixed(2)}</span>
                          <span>{h.tag}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
