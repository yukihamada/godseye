"use client";

import type { DiagnoseResponse, RoboflowPrediction } from "@/lib/api";

interface DataCardsProps {
  data: DiagnoseResponse;
}

export default function DataCards({ data }: DataCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-3">
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
        <Row label="築年" value={data.plateau.year_built?.toString() || "---"} />
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

      {/* Roboflow AI解析 */}
      {data.roboflow?.analyzed && (
        <Card title="AI 外観損傷解析" icon="AI">
          <Row label="損傷検出" value={data.roboflow.damage_detected ? "あり" : "なし"} />
          {data.roboflow.damage_detected && (
            <>
              <Row label="損傷スコア" value={`${data.roboflow.damage_score.toFixed(0)} / 100`} />
              <div className="mt-1.5">
                <DamageBar score={data.roboflow.damage_score} />
              </div>
            </>
          )}
          {data.roboflow.image_url && data.roboflow.predictions.length > 0 && (
            <div className="mt-3">
              <BoundingBoxOverlay
                imageUrl={data.roboflow.image_url}
                predictions={data.roboflow.predictions}
              />
            </div>
          )}
          {data.roboflow.summary && (
            <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
              {data.roboflow.summary}
            </p>
          )}
          {data.roboflow.predictions.length > 0 && (
            <div className="mt-2 space-y-1">
              {data.roboflow.predictions.slice(0, 8).map((p, i) => (
                <div key={i} className="flex justify-between text-[10px]">
                  <span className="text-gray-500">
                    <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ backgroundColor: DAMAGE_COLORS[p.model || ""] || DAMAGE_COLORS.default }} />
                    {p.class_ja || p.class}
                  </span>
                  <span className="font-mono text-yellow-400">{(p.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-400">{label}</span>
      <span className="font-mono">{value}</span>
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
}: {
  imageUrl: string;
  predictions: RoboflowPrediction[];
}) {
  return (
    <div className="relative w-full overflow-hidden rounded-lg">
      <img
        src={imageUrl}
        alt="AI解析画像"
        className="w-full h-auto block"
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
          return (
            <g key={i}>
              <rect
                x={rx}
                y={ry}
                width={p.width}
                height={p.height}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                rx={3}
              />
              <rect
                x={rx}
                y={Math.max(0, ry - 18)}
                width={Math.min(label.length * 11 + 8, p.width + 40)}
                height={18}
                fill={color}
                rx={2}
              />
              <text
                x={rx + 4}
                y={Math.max(0, ry - 18) + 13}
                fill="white"
                fontSize={12}
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
