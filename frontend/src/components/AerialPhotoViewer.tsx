"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";

interface AerialPhotoViewerProps {
  lat: number;
  lng: number;
  initialZoom?: number;
}

// GSI航空写真のタイルURL生成
function getGsiTileUrl(lat: number, lng: number, zoom: number): string {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  );
  return `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${zoom}/${x}/${y}.jpg`;
}

// 過去の航空写真レイヤー
const AERIAL_LAYERS = [
  { id: "seamlessphoto", name: "最新", period: "2015年〜" },
  { id: "ort", name: "オルソ", period: "2008-2012年" },
  { id: "ort_old10", name: "過去10年", period: "2004-2007年" },
  { id: "gazo4", name: "1988-90年", period: "1988-1990年" },
  { id: "gazo3", name: "1984-86年", period: "1984-1986年" },
  { id: "gazo2", name: "1979-83年", period: "1979-1983年" },
  { id: "gazo1", name: "1974-78年", period: "1974-1978年" },
];

function getLayerTileUrl(layer: string, lat: number, lng: number, zoom: number): string {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n
  );
  return `https://cyberjapandata.gsi.go.jp/xyz/${layer}/${zoom}/${x}/${y}.jpg`;
}

export default function AerialPhotoViewer({ lat, lng, initialZoom = 18 }: AerialPhotoViewerProps) {
  const [zoom, setZoom] = useState(initialZoom);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [selectedLayer, setSelectedLayer] = useState("seamlessphoto");
  const [availableLayers, setAvailableLayers] = useState<string[]>(["seamlessphoto"]);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const hasDraggedRef = useRef(false);

  // オフセットから実際の座標を計算（1ピクセル = 約0.00001度 at zoom 18）
  const pixelToDeg = useMemo(() => 0.00001 * Math.pow(2, 18 - zoom), [zoom]);
  const adjustedLat = lat - offset.y * pixelToDeg;
  const adjustedLng = lng + offset.x * pixelToDeg;

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

  // 利用可能なレイヤーをチェック
  useEffect(() => {
    const abortController = new AbortController();
    const checkLayers = async () => {
      const available: string[] = [];
      for (const layer of AERIAL_LAYERS) {
        const url = getLayerTileUrl(layer.id, lat, lng, zoom);
        try {
          const response = await fetch(url, { method: "HEAD", signal: abortController.signal });
          if (response.ok) {
            available.push(layer.id);
          }
        } catch (e) {
          // レイヤーが利用不可またはリクエストがキャンセルされた
          if (e instanceof Error && e.name === "AbortError") {
            return; // コンポーネントがアンマウントされた
          }
        }
      }
      if (!abortController.signal.aborted) {
        setAvailableLayers(available.length > 0 ? available : ["seamlessphoto"]);
      }
    };
    checkLayers();
    return () => abortController.abort();
  }, [lat, lng, zoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    hasDraggedRef.current = false;
    dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    hasDraggedRef.current = true;
    const newX = e.clientX - dragStartRef.current.x;
    const newY = e.clientY - dragStartRef.current.y;
    // 移動量を制限
    setOffset({
      x: Math.max(-100, Math.min(100, newX)),
      y: Math.max(-100, Math.min(100, newY)),
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoomChange = useCallback((delta: number) => {
    setZoom((prev) => Math.max(14, Math.min(18, prev + delta)));
  }, []);

  const resetPosition = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  const tileUrl = getLayerTileUrl(selectedLayer, adjustedLat, adjustedLng, zoom);
  const currentLayer = AERIAL_LAYERS.find((l) => l.id === selectedLayer);

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center text-white text-xs font-bold">
          空
        </span>
        <h3 className="text-sm font-semibold">航空写真</h3>
        <span className="ml-auto text-[10px] text-gray-500">
          GSI {currentLayer?.period}
        </span>
      </div>

      {/* レイヤー選択 */}
      <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
        {AERIAL_LAYERS.filter((l) => availableLayers.includes(l.id)).map((layer) => (
          <button
            key={layer.id}
            onClick={() => setSelectedLayer(layer.id)}
            className={`flex-shrink-0 px-2 py-1 text-[10px] rounded transition-colors ${
              selectedLayer === layer.id
                ? "bg-[var(--accent)] text-white"
                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
            }`}
          >
            {layer.name}
          </button>
        ))}
      </div>

      {/* 航空写真 */}
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-lg cursor-move select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={() => !hasDraggedRef.current && setIsZoomed(true)}
      >
        <img
          src={tileUrl}
          alt="航空写真"
          className="w-full aspect-square object-cover transition-transform duration-100"
          style={{
            transform: `translate(${offset.x * 0.5}px, ${offset.y * 0.5}px)`,
          }}
          draggable={false}
        />

        {/* 中心マーカー */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-red-500 rounded-full animate-pulse" />
          <div className="absolute w-0.5 h-4 bg-red-500" />
          <div className="absolute w-4 h-0.5 bg-red-500" />
        </div>

        {/* 座標表示 */}
        <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">
          {adjustedLat.toFixed(6)}, {adjustedLng.toFixed(6)}
        </div>

        {/* ドラッグヒント */}
        {offset.x === 0 && offset.y === 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">
            ドラッグで中心移動
          </div>
        )}
      </div>

      {/* コントロール */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleZoomChange(-1)}
            disabled={zoom <= 14}
            className="w-7 h-7 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded flex items-center justify-center text-sm transition-colors"
          >
            −
          </button>
          <span className="text-[10px] text-gray-400 w-8 text-center">z{zoom}</span>
          <button
            onClick={() => handleZoomChange(1)}
            disabled={zoom >= 18}
            className="w-7 h-7 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded flex items-center justify-center text-sm transition-colors"
          >
            +
          </button>
        </div>

        {(offset.x !== 0 || offset.y !== 0) && (
          <button
            onClick={resetPosition}
            className="text-[10px] text-gray-400 hover:text-white transition-colors"
          >
            中心にリセット
          </button>
        )}
      </div>

      {/* 拡大モーダル */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center animate-fadeIn"
          onClick={() => setIsZoomed(false)}
        >
          <img
            src={tileUrl}
            alt="航空写真（拡大）"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl transition-colors"
            onClick={() => setIsZoomed(false)}
            aria-label="閉じる"
          >
            ×
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-sm px-4 py-2 rounded-full">
            {currentLayer?.name} ({currentLayer?.period}) - ズーム {zoom}
          </div>
        </div>
      )}
    </div>
  );
}
