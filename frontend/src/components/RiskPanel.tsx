"use client";

import type { DiagnoseResponse } from "@/lib/api";
import RiskGauge from "./RiskGauge";
import DataCards from "./DataCards";
import StreetView from "./StreetView";
import Plateau3DViewer from "./Plateau3DViewer";
import PhotoGallery from "./PhotoGallery";
import AerialPhotoViewer from "./AerialPhotoViewer";

interface RiskPanelProps {
  data: DiagnoseResponse;
}

export default function RiskPanel({ data }: RiskPanelProps) {
  const { risk } = data;

  // 過去のStreet View画像を変換
  const historicalImages = data.streetview_historical?.available
    ? data.streetview_historical.images.map((img, i) => ({
        url: img.url,
        label: `${i + 1}枚目`,
        date: img.date || "日付不明",
      }))
    : [];

  // 周辺施設写真を変換
  const placesImages = data.places?.available
    ? data.places.photos.map((photo) => ({
        url: photo.url,
        label: photo.place_name,
        date: photo.place_type,
      }))
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* 住所 */}
      {data.address && (
        <div className="text-sm text-gray-400 truncate">
          {data.address}
        </div>
      )}

      {/* リスクスコア */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">地震倒壊リスク診断</h2>
        <RiskGauge risk={risk} />
        <p className="mt-4 text-sm text-gray-300 leading-relaxed">
          {risk.description}
        </p>

        {/* ML倒壊確率 */}
        {risk.breakdown.ml_collapse_prob != null && (
          <div className="mt-4 p-3 bg-blue-900/30 border border-blue-800/50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs text-blue-300">ML倒壊確率 (能登地震データ学習)</span>
              <span className="text-lg font-bold text-blue-400">
                {(risk.breakdown.ml_collapse_prob * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        {/* スコア内訳 */}
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">スコア内訳</h3>
          <ScoreBar label="築年数" value={risk.breakdown.building_age_score} max={30} />
          <ScoreBar label="構造種別" value={risk.breakdown.structure_score} max={25} />
          <ScoreBar label="地盤" value={risk.breakdown.ground_score} max={25} />
          <ScoreBar label="地震確率" value={risk.breakdown.seismic_prob_score} max={20} />
          {risk.breakdown.visual_damage_score > 0 && (
            <ScoreBar label="外観損傷" value={risk.breakdown.visual_damage_score} max={15} />
          )}
        </div>
      </div>

      {/* Street View */}
      {data.streetview.available && (
        <StreetView data={data.streetview} />
      )}

      {/* 各データソース詳細 */}
      <DataCards data={data} />

      {/* 調整可能な航空写真ビューワー */}
      <AerialPhotoViewer lat={data.lat} lng={data.lng} initialZoom={18} />

      {/* 過去のStreet View（ギャラリー形式） */}
      {historicalImages.length > 0 && (
        <PhotoGallery
          images={historicalImages}
          title="過去のStreet View"
          icon="時"
        />
      )}

      {/* 周辺施設写真（ギャラリー形式） */}
      {placesImages.length > 0 && (
        <PhotoGallery
          images={placesImages}
          title="周辺施設の写真"
          icon="施"
        />
      )}

      {/* PLATEAU 3Dビューワー */}
      {data.plateau.tiles_url && (
        <Plateau3DViewer plateau={data.plateau} />
      )}
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-gray-400">{label}</span>
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 70 ? "var(--danger)" : pct > 40 ? "var(--warning)" : "var(--success)",
          }}
        />
      </div>
      <span className="w-12 text-right text-gray-400">
        {value}/{max}
      </span>
    </div>
  );
}
