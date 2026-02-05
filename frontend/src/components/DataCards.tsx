"use client";

import { useState, useEffect } from "react";
import type { DiagnoseResponse, RoboflowPrediction } from "@/lib/api";

interface DataCardsProps {
  data: DiagnoseResponse;
}

export default function DataCards({ data }: DataCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {/* 築年推定（航空写真解析） */}
      {data.building_age?.estimated && (
        <Card title="築年数推定（航空写真解析）" icon="築">
          <div className="mb-2">
            {data.building_age.year_built_min && data.building_age.year_built_max ? (
              <div className="text-lg font-bold text-[var(--accent)]">
                {data.building_age.year_built_min === data.building_age.year_built_max
                  ? `${data.building_age.year_built_min}年頃`
                  : `${data.building_age.year_built_min}〜${data.building_age.year_built_max}年`}
              </div>
            ) : (
              <div className="text-sm text-gray-400">推定不可</div>
            )}
          </div>
          <Row label="信頼度" value={getConfidenceLabel(data.building_age.confidence)} />
          {data.building_age.first_appearance_layer && (
            <Row
              label="初出レイヤー"
              value={`${data.building_age.first_appearance_layer} (${data.building_age.first_appearance_period || ""})`}
            />
          )}
          <Row label="解析手法" value={data.building_age.method || "航空写真比較"} />
          {data.building_age.available_layers.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] text-gray-500 mb-1">利用可能レイヤー:</p>
              <div className="flex flex-wrap gap-1">
                {data.building_age.available_layers.map((layer) => (
                  <span
                    key={layer}
                    className={`text-[9px] px-1.5 py-0.5 rounded ${
                      layer === data.building_age.first_appearance_layer
                        ? "bg-[var(--accent)] text-white"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {layer}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* J-SHIS */}
      <Card title="J-SHIS 地盤情報" icon="地">
        <Row label="表層地盤増幅率" value={fmt(data.jshis.amplification_factor)} />
        <Row label="Vs30" value={data.jshis.vs30 ? `${data.jshis.vs30} m/s` : "---"} />
        <Row label="微地形区分" value={data.jshis.micro_topography_name || "---"} />
        <Row
          label="30年震度6弱以上確率"
          value={data.jshis.prob_intensity_6lower_30yr != null
            ? `${(data.jshis.prob_intensity_6lower_30yr * 100).toFixed(1)}%`
            : "---"}
        />
        <Row
          label="30年震度6強以上確率"
          value={data.jshis.prob_intensity_6upper_30yr != null
            ? `${(data.jshis.prob_intensity_6upper_30yr * 100).toFixed(1)}%`
            : "---"}
        />
      </Card>

      {/* PLATEAU */}
      <Card title={`PLATEAU 建物情報${data.plateau.city_name ? ` (${data.plateau.city_name})` : ""}`} icon="建">
        {data.plateau.building_name && (
          <Row label="建物名" value={data.plateau.building_name} />
        )}
        {data.plateau.address && (
          <Row label="住所" value={data.plateau.address} />
        )}
        <Row
          label="築年"
          value={data.plateau.year_built?.toString() || "---"}
          highlight={!!data.plateau.year_built}
        />
        <Row label="構造種別" value={data.plateau.structure_type || "---"} />
        {data.plateau.fireproof_type && (
          <Row label="耐火構造" value={data.plateau.fireproof_type} />
        )}
        <Row label="高さ" value={data.plateau.height ? `${data.plateau.height} m` : "---"} />
        <Row label="階数" value={
          data.plateau.floors_above != null
            ? `地上${data.plateau.floors_above}F${data.plateau.floors_below ? ` / 地下${data.plateau.floors_below}F` : ""}`
            : "---"
        } />
        <Row
          label="面積"
          value={data.plateau.total_floor_area ? `${data.plateau.total_floor_area.toFixed(1)} m²` : "---"}
        />
        <Row label="用途" value={data.plateau.usage || "---"} />
        {data.plateau.distance_m != null && (
          <Row label="指定地点との距離" value={`${data.plateau.distance_m} m`} />
        )}
        {!data.plateau.building_id && (
          <p className="text-[10px] text-gray-500 mt-2">
            {data.plateau.city_name
              ? "この地点の建物データは未整備です"
              : "PLATEAUデータの対象外エリアです"}
          </p>
        )}
      </Card>

      {/* Roboflow AI解析（複数画像対応） */}
      {data.roboflow?.analyzed && (
        <RoboflowCard roboflow={data.roboflow} streetviewUrls={data.streetview?.image_urls || []} />
      )}

      {/* Tellus */}
      <Card title="Tellus SAR" icon="衛">
        <Row label="シーン数" value={data.tellus.scenes_found.toString()} />
        {data.tellus.observation_dates.length > 0 && (
          <Row label="観測日" value={data.tellus.observation_dates.slice(0, 3).join(", ")} />
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center text-white text-xs font-bold">
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className={`font-mono ${highlight ? "text-[var(--accent)]" : ""}`}>{value}</span>
    </div>
  );
}

function DamageBar({ score }: { score: number }) {
  const color = score >= 60 ? "bg-red-500" : score >= 30 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, score)}%` }}
      />
    </div>
  );
}

const DAMAGE_COLORS: Record<string, string> = {
  "損傷": "#ef4444",
  "ひび割れ": "#f59e0b",
  "コンクリート劣化": "#8b5cf6",
  default: "#6b7280",
};

const IMG_SIZE = 640;

function BoundingBoxOverlay({
  imageUrl,
  predictions,
  large,
}: {
  imageUrl: string;
  predictions: RoboflowPrediction[];
  large?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-lg ${large ? "max-w-[90vw] max-h-[85vh]" : "w-full"}`}>
      <img
        src={imageUrl}
        alt="AI解析画像"
        className={`block ${large ? "max-w-[90vw] max-h-[85vh] object-contain" : "w-full h-auto"}`}
        loading="lazy"
      />
      <svg
        viewBox={`0 0 ${IMG_SIZE} ${IMG_SIZE}`}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid slice"
      >
        {predictions.map((p, i) => {
          const color = DAMAGE_COLORS[p.model || ""] || DAMAGE_COLORS.default;
          const rx = p.x - p.width / 2;
          const ry = p.y - p.height / 2;
          const label = p.class_ja || p.class;
          const strokeWidth = large ? 3 : 2.5;
          const fontSize = large ? 14 : 12;
          const labelHeight = large ? 22 : 18;
          return (
            <g key={i}>
              <rect
                x={rx}
                y={ry}
                width={p.width}
                height={p.height}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                rx={3}
              />
              <rect
                x={rx}
                y={Math.max(0, ry - labelHeight)}
                width={Math.min(label.length * (fontSize - 1) + 10, p.width + 50)}
                height={labelHeight}
                fill={color}
                rx={2}
              />
              <text
                x={rx + 4}
                y={Math.max(0, ry - labelHeight) + fontSize + 2}
                fill="white"
                fontSize={fontSize}
                fontWeight="bold"
              >
                {label} {(p.confidence * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function fmt(v: number | null): string {
  if (v == null) return "---";
  return v.toFixed(3);
}

function getConfidenceLabel(confidence: string): string {
  const labels: Record<string, string> = {
    high: "高（複数レイヤー一致）",
    medium: "中（単一レイヤー確認）",
    low: "低（推定）",
  };
  return labels[confidence] || confidence;
}

// 複数画像対応のRoboflow解析カード
function RoboflowCard({
  roboflow,
  streetviewUrls,
}: {
  roboflow: DiagnoseResponse["roboflow"];
  streetviewUrls: string[];
}) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);

  // Escapeキーでモーダルを閉じる
  useEffect(() => {
    if (!isZoomed) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsZoomed(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isZoomed]);

  // 画像ごとの検出結果を集計
  const predictionsByImage: Map<number, typeof roboflow.predictions> = new Map();
  roboflow.predictions.forEach((p) => {
    const idx = p.image_index ?? 0;
    if (!predictionsByImage.has(idx)) {
      predictionsByImage.set(idx, []);
    }
    predictionsByImage.get(idx)!.push(p);
  });

  // 現在選択されている画像の検出結果
  const currentPredictions = predictionsByImage.get(selectedImageIndex) || [];

  // 解析画像数（4枚まで）
  const analyzedCount = roboflow.analyzed_image_count || Math.min(streetviewUrls.length, 4);
  const analyzedUrls = streetviewUrls.slice(0, analyzedCount);

  // 選択画像のURL
  const currentImageUrl = analyzedUrls[selectedImageIndex] || roboflow.image_url;

  return (
    <Card title="AI 外観損傷解析" icon="AI">
      {/* 解析サマリー */}
      <div className="flex items-center justify-between mb-2">
        <Row label="損傷検出" value={roboflow.damage_detected ? "あり" : "なし"} />
        <span className="text-[10px] text-gray-500">
          {analyzedCount}枚解析
        </span>
      </div>

      {roboflow.damage_detected && (
        <>
          <Row label="損傷スコア" value={`${roboflow.damage_score.toFixed(0)} / 100`} />
          <div className="mt-1.5">
            <DamageBar score={roboflow.damage_score} />
          </div>
        </>
      )}

      {/* 画像セレクター（複数画像ある場合） */}
      {analyzedUrls.length > 1 && (
        <div className="mt-3">
          <p className="text-[10px] text-gray-500 mb-2">解析画像を切り替え:</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {analyzedUrls.map((url, i) => {
              const detectionCount = predictionsByImage.get(i)?.length || 0;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedImageIndex(i)}
                  className={`relative flex-shrink-0 rounded-md overflow-hidden transition-all duration-200 ${
                    i === selectedImageIndex
                      ? "ring-2 ring-[var(--accent)] scale-105"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={url}
                    alt={`解析画像${i + 1}`}
                    className="w-14 h-10 object-cover"
                    loading="lazy"
                  />
                  {detectionCount > 0 && (
                    <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold px-1">
                      {detectionCount}
                    </span>
                  )}
                  {detectionCount === 0 && (
                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-[8px] text-green-400">OK</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 選択画像の検出結果（Bounding Box付き） */}
      {currentImageUrl && (
        <div className="mt-3">
          <div
            className="relative cursor-pointer group"
            onClick={() => setIsZoomed(true)}
          >
            <BoundingBoxOverlay
              imageUrl={currentImageUrl}
              predictions={currentPredictions}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center pointer-events-none">
              <span className="opacity-0 group-hover:opacity-100 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full transition-opacity">
                クリックで拡大
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-[10px] text-gray-500">
              画像{selectedImageIndex + 1}: {currentPredictions.length}件検出
            </span>
          </div>
        </div>
      )}

      {/* サマリー */}
      {roboflow.summary && (
        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
          {roboflow.summary}
        </p>
      )}

      {/* 全検出結果リスト（カテゴリ別） */}
      {roboflow.predictions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <p className="text-[10px] text-gray-500 mb-2">検出詳細:</p>
          <div className="space-y-1">
            {roboflow.predictions.slice(0, 10).map((p, i) => (
              <div
                key={i}
                className={`flex justify-between text-[10px] ${
                  p.image_index === selectedImageIndex ? "text-white" : "text-gray-500"
                }`}
              >
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-sm"
                    style={{ backgroundColor: DAMAGE_COLORS[p.model || ""] || DAMAGE_COLORS.default }}
                  />
                  {p.class_ja || p.class}
                  <span className="text-gray-600 text-[9px]">
                    [画像{(p.image_index ?? 0) + 1}]
                  </span>
                </span>
                <span className="font-mono text-yellow-400">
                  {(p.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {roboflow.predictions.length > 10 && (
              <p className="text-[9px] text-gray-600">
                他 {roboflow.predictions.length - 10}件...
              </p>
            )}
          </div>
        </div>
      )}

      {/* 拡大モーダル */}
      {isZoomed && currentImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center animate-fadeIn"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative max-w-[90vw] max-h-[85vh]">
            <BoundingBoxOverlay
              imageUrl={currentImageUrl}
              predictions={currentPredictions}
              large
            />
          </div>
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl transition-colors"
            onClick={() => setIsZoomed(false)}
            aria-label="閉じる"
          >
            ×
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
            <span className="bg-black/80 text-white text-sm px-4 py-2 rounded-full">
              画像{selectedImageIndex + 1} / {analyzedUrls.length} - {currentPredictions.length}件検出
            </span>
            {/* 画像切り替えボタン */}
            {analyzedUrls.length > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIndex((prev) => (prev - 1 + analyzedUrls.length) % analyzedUrls.length);
                  }}
                  className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center"
                >
                  ‹
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedImageIndex((prev) => (prev + 1) % analyzedUrls.length);
                  }}
                  className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
