"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { StreetViewResult } from "@/lib/api";

const ModelViewer3D = dynamic(() => import("./ModelViewer3D"), { ssr: false });

interface StreetViewProps {
  data: StreetViewResult;
}

const CARDINAL_LABELS = ["北 (0°)", "東 (90°)", "南 (180°)", "西 (270°)"];
const BUILDING_LABELS = ["正面", "左30°", "右30°", "左60°", "右60°", "左90°", "右90°", "背面"];

export default function StreetView({ data }: StreetViewProps) {
  const [highRes, setHighRes] = useState(false);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [show3D, setShow3D] = useState<string | null>(null);

  if (!data.available || data.image_urls.length === 0) {
    return null;
  }

  // 建物向き最適化の場合は heading_to_building が設定される
  const isBuildingFacing = data.heading_to_building != null;
  const labels = isBuildingFacing ? BUILDING_LABELS : CARDINAL_LABELS;

  // 高解像度URLが利用可能か
  const hasHighRes = data.image_urls_high && data.image_urls_high.length > 0;
  const urls = highRes && hasHighRes ? data.image_urls_high : data.image_urls;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center text-white text-xs font-bold">
          SV
        </span>
        <h3 className="text-sm font-semibold">
          Street View {isBuildingFacing ? "建物向き" : "外観"}
        </h3>
        {isBuildingFacing && data.heading_to_building != null && (
          <span className="text-[10px] text-gray-500">
            方位 {data.heading_to_building.toFixed(0)}°
          </span>
        )}
        {hasHighRes && (
          <button
            onClick={() => setHighRes(!highRes)}
            className={`ml-auto text-[10px] px-2 py-0.5 rounded transition-colors ${
              highRes
                ? "bg-green-600 text-white"
                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
            }`}
          >
            {highRes ? "HD ON" : "HD OFF"}
          </button>
        )}
      </div>

      {/* 3Dモデル生成モーダル */}
      {show3D && (
        <ModelViewer3D imageUrl={show3D} onClose={() => setShow3D(null)} />
      )}

      {/* 拡大表示モーダル */}
      {selectedImage !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <img
            src={hasHighRes ? data.image_urls_high[selectedImage] : urls[selectedImage]}
            alt={labels[selectedImage] || `画像${selectedImage + 1}`}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <button
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300"
            onClick={() => setSelectedImage(null)}
          >
            ×
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <span className="text-white text-sm bg-black/60 px-3 py-1 rounded">
              {labels[selectedImage]} {highRes ? "(1280×1280)" : "(640×640)"}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShow3D(hasHighRes ? data.image_urls_high[selectedImage] : urls[selectedImage]);
                setSelectedImage(null);
              }}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors"
            >
              3D生成
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {urls.map((url, i) => (
          <div
            key={i}
            className="relative cursor-pointer group"
            onClick={() => setSelectedImage(i)}
          >
            <img
              src={url}
              alt={labels[i] || `画像${i + 1}`}
              className="w-full h-28 object-cover rounded-lg group-hover:opacity-80 transition-opacity"
              loading="lazy"
            />
            <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
              {labels[i] || `${i + 1}`}
            </span>
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="bg-black/60 text-white text-xs px-2 py-1 rounded">拡大</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
