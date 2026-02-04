"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import SearchBar from "@/components/SearchBar";
import RiskPanel from "@/components/RiskPanel";
import { diagnose, geocodeAddress, type DiagnoseResponse } from "@/lib/api";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

const DEFAULT_CENTER: [number, number] = [35.6812, 139.7671]; // 東京駅

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
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <p className="text-4xl mb-4">&#x1F50D;</p>
              <p className="text-sm">
                住所を検索するか、
                <br />
                地図をクリックして診断を開始
              </p>
              <p className="text-xs mt-2 text-gray-600">
                対象: 東京23区・大阪・名古屋
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
