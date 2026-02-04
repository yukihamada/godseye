"use client";

import type { StreetViewResult } from "@/lib/api";

interface StreetViewProps {
  data: StreetViewResult;
}

const DIRECTION_LABELS = ["北 (0°)", "東 (90°)", "南 (180°)", "西 (270°)"];

export default function StreetView({ data }: StreetViewProps) {
  if (!data.available || data.image_urls.length === 0) {
    return null;
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center text-white text-xs font-bold">
          SV
        </span>
        <h3 className="text-sm font-semibold">Street View 外観</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {data.image_urls.map((url, i) => (
          <div key={i} className="relative">
            <img
              src={url}
              alt={DIRECTION_LABELS[i]}
              className="w-full h-28 object-cover rounded-lg"
              loading="lazy"
            />
            <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
              {DIRECTION_LABELS[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
