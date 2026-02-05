"use client";

import type { PlateauResult } from "@/lib/api";

interface Plateau3DViewerProps {
  plateau: PlateauResult;
}

export default function Plateau3DViewer({ plateau }: Plateau3DViewerProps) {
  if (!plateau.tiles_url || !plateau.building_lat || !plateau.building_lng) {
    return null;
  }

  // PLATEAU VIEW URL with coordinates
  const viewerUrl = `https://plateauview.mlit.go.jp/?lat=${plateau.building_lat}&lng=${plateau.building_lng}&zoom=18`;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-purple-600 flex items-center justify-center text-white text-xs font-bold">
          3D
        </span>
        <h3 className="text-sm font-semibold">PLATEAU 3Dモデル</h3>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-gray-400">
          この建物の3Dモデルが利用可能です。PLATEAU VIEWで詳細な3D表示を確認できます。
        </p>

        <a
          href={viewerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white text-center text-sm font-medium rounded-lg transition-colors"
        >
          PLATEAU VIEWで3D表示
        </a>

        <div className="text-[10px] text-gray-500 space-y-1">
          <p>3D Tiles URL:</p>
          <code className="block bg-gray-800 p-2 rounded text-[9px] break-all">
            {plateau.tiles_url}
          </code>
        </div>
      </div>
    </div>
  );
}
