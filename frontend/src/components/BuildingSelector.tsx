"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface BuildingSelectorProps {
  lat: number;
  lng: number;
  address?: string;
  onSelect: (lat: number, lng: number) => void;
  onBack: () => void;
  loading?: boolean;
}

export default function BuildingSelector({
  lat,
  lng,
  address,
  onSelect,
  onBack,
  loading,
}: BuildingSelectorProps) {
  // 位置・方向
  const [currentLat, setCurrentLat] = useState(lat);
  const [currentLng, setCurrentLng] = useState(lng);
  const [heading, setHeading] = useState(0);

  // UI状態
  const [isDragging, setIsDragging] = useState(false);
  const [sensitivity, setSensitivity] = useState(1); // 1=標準, 0.5=細かい, 2=粗い
  const dragStartRef = useRef({ x: 0, y: 0, heading: 0, lat: 0, lng: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const keyPressedRef = useRef<Set<string>>(new Set());
  const animationFrameRef = useRef<number | null>(null);

  // 移動量（sensitivity調整）
  const moveDelta = 0.00005 * sensitivity; // 約5m * sensitivity
  const rotateDelta = 15 * sensitivity; // 15度 * sensitivity

  // 画像URL用の丸め値（2度単位、位置は6桁）
  const roundedHeading = Math.round(heading / 2) * 2;
  const roundedLat = Math.round(currentLat * 1000000) / 1000000;
  const roundedLng = Math.round(currentLng * 1000000) / 1000000;

  // キーボード操作
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 入力フィールドでは無効
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      keyPressedRef.current.add(e.key.toLowerCase());

      // Enterで診断
      if (e.key === "Enter" && !loading) {
        onSelect(currentLat, currentLng);
        return;
      }

      // Escapeで戻る
      if (e.key === "Escape") {
        onBack();
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keyPressedRef.current.delete(e.key.toLowerCase());
    };

    // 連続キー入力処理
    const processKeys = () => {
      const keys = keyPressedRef.current;
      const rad = (heading * Math.PI) / 180;

      // WASD / 矢印キーで移動
      if (keys.has("w") || keys.has("arrowup")) {
        setCurrentLat((prev) => prev + Math.cos(rad) * moveDelta);
        setCurrentLng((prev) => prev + Math.sin(rad) * moveDelta);
      }
      if (keys.has("s") || keys.has("arrowdown")) {
        setCurrentLat((prev) => prev - Math.cos(rad) * moveDelta);
        setCurrentLng((prev) => prev - Math.sin(rad) * moveDelta);
      }
      if (keys.has("a")) {
        // 左へ横移動
        setCurrentLat((prev) => prev + Math.cos(rad - Math.PI / 2) * moveDelta);
        setCurrentLng((prev) => prev + Math.sin(rad - Math.PI / 2) * moveDelta);
      }
      if (keys.has("d")) {
        // 右へ横移動
        setCurrentLat((prev) => prev + Math.cos(rad + Math.PI / 2) * moveDelta);
        setCurrentLng((prev) => prev + Math.sin(rad + Math.PI / 2) * moveDelta);
      }

      // Q/E または左右矢印で回転
      if (keys.has("q") || keys.has("arrowleft")) {
        setHeading((prev) => (prev - rotateDelta + 360) % 360);
      }
      if (keys.has("e") || keys.has("arrowright")) {
        setHeading((prev) => (prev + rotateDelta) % 360);
      }

      animationFrameRef.current = requestAnimationFrame(processKeys);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    animationFrameRef.current = requestAnimationFrame(processKeys);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [heading, moveDelta, rotateDelta, currentLat, currentLng, loading, onSelect, onBack]);

  // マウスドラッグ
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      heading,
      lat: currentLat,
      lng: currentLng,
    };
    e.preventDefault();
  }, [heading, currentLat, currentLng]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    // 左右 = 回転（感度調整）
    const newHeading = (dragStartRef.current.heading + deltaX * 0.2 * sensitivity + 360) % 360;
    setHeading(newHeading);

    // 上下 = 前後移動
    const moveAmount = deltaY * 0.000001 * sensitivity;
    const rad = (dragStartRef.current.heading * Math.PI) / 180;
    setCurrentLat(dragStartRef.current.lat - Math.cos(rad) * moveAmount);
    setCurrentLng(dragStartRef.current.lng - Math.sin(rad) * moveAmount);
  }, [isDragging, sensitivity]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // タッチ操作（1本指=ドラッグ、2本指=ピンチ回転）
  const touchStartRef = useRef<{
    points: Array<{ x: number; y: number }>;
    heading: number;
    lat: number;
    lng: number;
  } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const points = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
    touchStartRef.current = {
      points,
      heading,
      lat: currentLat,
      lng: currentLng,
    };
    setIsDragging(true);
  }, [heading, currentLat, currentLng]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    e.preventDefault();

    const currentPoints = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
    const startPoints = touchStartRef.current.points;

    if (currentPoints.length === 1 && startPoints.length === 1) {
      // 1本指: ドラッグ（回転+移動）
      const deltaX = currentPoints[0].x - startPoints[0].x;
      const deltaY = currentPoints[0].y - startPoints[0].y;

      const newHeading = (touchStartRef.current.heading + deltaX * 0.3 * sensitivity + 360) % 360;
      setHeading(newHeading);

      const moveAmount = deltaY * 0.0000015 * sensitivity;
      const rad = (touchStartRef.current.heading * Math.PI) / 180;
      setCurrentLat(touchStartRef.current.lat - Math.cos(rad) * moveAmount);
      setCurrentLng(touchStartRef.current.lng - Math.sin(rad) * moveAmount);
    } else if (currentPoints.length === 2 && startPoints.length === 2) {
      // 2本指: 回転のみ（ツイスト）
      const startAngle = Math.atan2(
        startPoints[1].y - startPoints[0].y,
        startPoints[1].x - startPoints[0].x
      );
      const currentAngle = Math.atan2(
        currentPoints[1].y - currentPoints[0].y,
        currentPoints[1].x - currentPoints[0].x
      );
      const angleDiff = ((currentAngle - startAngle) * 180) / Math.PI;
      setHeading((touchStartRef.current.heading + angleDiff + 360) % 360);
    }
  }, [sensitivity]);

  const handleTouchEnd = useCallback(() => {
    touchStartRef.current = null;
    setIsDragging(false);
  }, []);

  // ボタン操作
  const moveForward = useCallback(() => {
    const rad = (heading * Math.PI) / 180;
    setCurrentLat((prev) => prev + Math.cos(rad) * moveDelta * 2);
    setCurrentLng((prev) => prev + Math.sin(rad) * moveDelta * 2);
  }, [heading, moveDelta]);

  const moveBackward = useCallback(() => {
    const rad = (heading * Math.PI) / 180;
    setCurrentLat((prev) => prev - Math.cos(rad) * moveDelta * 2);
    setCurrentLng((prev) => prev - Math.sin(rad) * moveDelta * 2);
  }, [heading, moveDelta]);

  const moveLeft = useCallback(() => {
    const rad = (heading * Math.PI) / 180;
    setCurrentLat((prev) => prev + Math.cos(rad - Math.PI / 2) * moveDelta * 2);
    setCurrentLng((prev) => prev + Math.sin(rad - Math.PI / 2) * moveDelta * 2);
  }, [heading, moveDelta]);

  const moveRight = useCallback(() => {
    const rad = (heading * Math.PI) / 180;
    setCurrentLat((prev) => prev + Math.cos(rad + Math.PI / 2) * moveDelta * 2);
    setCurrentLng((prev) => prev + Math.sin(rad + Math.PI / 2) * moveDelta * 2);
  }, [heading, moveDelta]);

  const rotateLeft = useCallback(() => {
    setHeading((prev) => (prev - rotateDelta + 360) % 360);
  }, [rotateDelta]);

  const rotateRight = useCallback(() => {
    setHeading((prev) => (prev + rotateDelta) % 360);
  }, [rotateDelta]);

  const handleDiagnose = useCallback(() => {
    onSelect(currentLat, currentLng);
  }, [currentLat, currentLng, onSelect]);

  // Street View URL
  const getStaticUrl = useCallback((h: number, size: string = "200x150") => {
    return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${roundedLat},${roundedLng}&heading=${h}&fov=90&pitch=5&key=AIzaSyCphrzW-o323Ypju5eOiJws2vwYmE5pIkI`;
  }, [roundedLat, roundedLng]);

  return (
    <div className="flex flex-col h-full" tabIndex={0}>
      {/* ヘッダー */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--card-border)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
        >
          <span>←</span> 戻る <span className="text-gray-600 ml-1">(Esc)</span>
        </button>
        <h2 className="text-base font-bold">建物を選択</h2>
        {address && (
          <p className="text-xs text-gray-500 mt-1 truncate">{address}</p>
        )}
      </div>

      {/* メインビュー */}
      <div
        ref={containerRef}
        className={`relative select-none touch-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Street View画像 */}
        <div className="relative overflow-hidden">
          <img
            key={`${roundedLat}-${roundedLng}-${roundedHeading}`}
            src={getStaticUrl(roundedHeading, "640x400")}
            alt="Street View"
            className="w-full aspect-[16/10] object-cover"
            draggable={false}
          />
          {isDragging && (
            <div className="absolute inset-0 bg-black/10 pointer-events-none" />
          )}
        </div>

        {/* 回転ボタン */}
        <button
          onClick={(e) => { e.stopPropagation(); rotateLeft(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-1/2 left-2 -translate-y-1/2 w-10 h-10 bg-black/70 hover:bg-black/90 active:scale-95 text-white rounded-full flex items-center justify-center text-lg backdrop-blur-sm transition-all"
        >
          ◀
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); rotateRight(); }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-1/2 right-2 -translate-y-1/2 w-10 h-10 bg-black/70 hover:bg-black/90 active:scale-95 text-white rounded-full flex items-center justify-center text-lg backdrop-blur-sm transition-all"
        >
          ▶
        </button>

        {/* 操作ヒント */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
          ドラッグ or WASD/矢印キー
        </div>

        {/* 移動コントロール */}
        <div
          className="absolute top-2 right-2 bg-black/80 rounded-lg p-1.5 backdrop-blur-sm"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-3 gap-0.5">
            <div />
            <button onClick={moveForward} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 rounded transition-all text-sm">▲</button>
            <div />
            <button onClick={moveLeft} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 rounded transition-all text-sm">◀</button>
            <div className="w-8 h-8 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full" />
            </div>
            <button onClick={moveRight} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 rounded transition-all text-sm">▶</button>
            <div />
            <button onClick={moveBackward} className="w-8 h-8 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 rounded transition-all text-sm">▼</button>
            <div />
          </div>
        </div>

        {/* 感度切り替え */}
        <div
          className="absolute bottom-2 right-2 bg-black/80 rounded-lg p-1 backdrop-blur-sm flex gap-1"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {[
            { v: 0.5, label: "細" },
            { v: 1, label: "中" },
            { v: 2, label: "粗" },
          ].map((s) => (
            <button
              key={s.v}
              onClick={() => setSensitivity(s.v)}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                sensitivity === s.v
                  ? "bg-[var(--accent)] text-white"
                  : "text-gray-400 hover:bg-white/10"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* コンパス */}
        <div className="absolute bottom-2 left-2 bg-black/80 rounded-lg p-2 backdrop-blur-sm flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full border border-gray-500 relative transition-transform duration-100"
            style={{ transform: `rotate(${-heading}deg)` }}
          >
            <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-red-500" />
          </div>
          <div className="text-white text-xs">
            <div className="font-mono">{Math.round(heading)}°</div>
            <div className="text-[9px] text-gray-400">{currentLat.toFixed(6)}, {currentLng.toFixed(6)}</div>
          </div>
        </div>
      </div>

      {/* 8方向サムネイル */}
      <div className="p-3 border-b border-[var(--card-border)]">
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { h: 0, label: "北" },
            { h: 45, label: "北東" },
            { h: 90, label: "東" },
            { h: 135, label: "南東" },
            { h: 180, label: "南" },
            { h: 225, label: "南西" },
            { h: 270, label: "西" },
            { h: 315, label: "北西" },
          ].map((dir) => {
            const diff = Math.abs(roundedHeading - dir.h);
            const isSelected = diff < 23 || diff > 337;
            return (
              <button
                key={dir.h}
                onClick={() => setHeading(dir.h)}
                className={`relative rounded overflow-hidden border-2 transition-all duration-150 ${
                  isSelected
                    ? "border-[var(--accent)] ring-1 ring-[var(--accent)] scale-105"
                    : "border-transparent hover:border-gray-600"
                }`}
              >
                <img
                  src={getStaticUrl(dir.h, "100x75")}
                  alt={dir.label}
                  className="w-full aspect-[4/3] object-cover"
                  draggable={false}
                />
                <span className="absolute bottom-0 inset-x-0 bg-black/80 text-white text-[9px] text-center py-0.5">
                  {dir.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* キーボードショートカット */}
      <div className="px-4 py-2 border-b border-[var(--card-border)] bg-gray-900/50">
        <p className="text-[9px] text-gray-500 text-center">
          <span className="text-gray-400">W/↑</span> 前進
          <span className="text-gray-400 ml-2">S/↓</span> 後退
          <span className="text-gray-400 ml-2">A</span> 左移動
          <span className="text-gray-400 ml-2">D</span> 右移動
          <span className="text-gray-400 ml-2">Q/←</span> 左回転
          <span className="text-gray-400 ml-2">E/→</span> 右回転
        </p>
      </div>

      {/* 診断ボタン */}
      <div className="p-4 mt-auto">
        <button
          onClick={handleDiagnose}
          disabled={loading}
          className="w-full py-3 bg-[var(--accent)] hover:bg-[var(--accent)]/80 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              診断中...
            </>
          ) : (
            <>この場所を診断する <span className="text-sm opacity-70">(Enter)</span></>
          )}
        </button>
      </div>
    </div>
  );
}
