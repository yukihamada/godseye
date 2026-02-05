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
  // 現在の表示値
  const [currentLat, setCurrentLat] = useState(lat);
  const [currentLng, setCurrentLng] = useState(lng);
  const [heading, setHeading] = useState(0);

  // ターゲット値（スムーズアニメーション用）
  const [targetLat, setTargetLat] = useState(lat);
  const [targetLng, setTargetLng] = useState(lng);
  const [targetHeading, setTargetHeading] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, heading: 0, lat: 0, lng: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // スムーズなアニメーション（回転＋位置）
  useEffect(() => {
    const needsHeadingAnimation = Math.abs(heading - targetHeading) > 0.5 ||
      (heading > 350 && targetHeading < 10) || (heading < 10 && targetHeading > 350);
    const needsPositionAnimation =
      Math.abs(currentLat - targetLat) > 0.000001 ||
      Math.abs(currentLng - targetLng) > 0.000001;

    if (!needsHeadingAnimation && !needsPositionAnimation) {
      setIsTransitioning(false);
      return;
    }

    const animate = () => {
      let stillAnimating = false;

      // 方向のアニメーション
      setHeading((prev) => {
        let diff = targetHeading - prev;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        if (Math.abs(diff) < 1) {
          return targetHeading;
        }
        stillAnimating = true;
        return (prev + diff * 0.15 + 360) % 360;
      });

      // 位置のアニメーション
      setCurrentLat((prev) => {
        const diff = targetLat - prev;
        if (Math.abs(diff) < 0.000001) return targetLat;
        stillAnimating = true;
        return prev + diff * 0.2;
      });

      setCurrentLng((prev) => {
        const diff = targetLng - prev;
        if (Math.abs(diff) < 0.000001) return targetLng;
        stillAnimating = true;
        return prev + diff * 0.2;
      });

      if (stillAnimating) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsTransitioning(false);
      }
    };

    setIsTransitioning(true);
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetHeading, targetLat, targetLng]);

  // 位置を移動（スムーズ）
  const movePosition = useCallback((direction: "up" | "down" | "left" | "right" | "forward" | "backward") => {
    const delta = 0.0001; // 約10m

    if (direction === "forward" || direction === "backward") {
      // 現在向いている方向に移動
      const rad = (targetHeading * Math.PI) / 180;
      const sign = direction === "forward" ? 1 : -1;
      setTargetLat((prev) => prev + Math.cos(rad) * delta * sign);
      setTargetLng((prev) => prev + Math.sin(rad) * delta * sign);
    } else {
      switch (direction) {
        case "up": setTargetLat((prev) => prev + delta); break;
        case "down": setTargetLat((prev) => prev - delta); break;
        case "left": setTargetLng((prev) => prev - delta); break;
        case "right": setTargetLng((prev) => prev + delta); break;
      }
    }
  }, [targetHeading]);

  // 方向を回転（スムーズ）
  const rotateHeading = useCallback((delta: number) => {
    setTargetHeading((prev) => (prev + delta + 360) % 360);
  }, []);

  // 直接方向を設定（スムーズ）
  const setHeadingSmooth = useCallback((newHeading: number) => {
    setTargetHeading(newHeading);
  }, []);

  // ドラッグで回転＋移動（グリグリ）
  // 左右ドラッグ = 回転、上下ドラッグ = 前後移動
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      heading: targetHeading,
      lat: targetLat,
      lng: targetLng,
    };
    e.preventDefault();
  }, [targetHeading, targetLat, targetLng]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    // 左右ドラッグ = 回転
    const newHeading = (dragStartRef.current.heading + deltaX * 0.3 + 360) % 360;
    setTargetHeading(newHeading);

    // 上下ドラッグ = 前後移動（向いている方向に）
    const moveDelta = deltaY * 0.000002; // 感度調整
    const rad = (dragStartRef.current.heading * Math.PI) / 180;
    setTargetLat(dragStartRef.current.lat - Math.cos(rad) * moveDelta);
    setTargetLng(dragStartRef.current.lng - Math.sin(rad) * moveDelta);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // タッチ対応
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        heading: targetHeading,
        lat: targetLat,
        lng: targetLng,
      };
    }
  }, [targetHeading, targetLat, targetLng]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - dragStartRef.current.x;
    const deltaY = e.touches[0].clientY - dragStartRef.current.y;

    // 左右 = 回転
    const newHeading = (dragStartRef.current.heading + deltaX * 0.3 + 360) % 360;
    setTargetHeading(newHeading);

    // 上下 = 前後移動
    const moveDelta = deltaY * 0.000002;
    const rad = (dragStartRef.current.heading * Math.PI) / 180;
    setTargetLat(dragStartRef.current.lat - Math.cos(rad) * moveDelta);
    setTargetLng(dragStartRef.current.lng - Math.sin(rad) * moveDelta);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDiagnose = useCallback(() => {
    onSelect(currentLat, currentLng);
  }, [currentLat, currentLng, onSelect]);

  // Google Maps Embed API URL (APIキー不要で動作)
  const embedUrl = `https://www.google.com/maps/embed?pb=!4v0!6m8!1m7!1s!2m2!1d${currentLat}!2d${currentLng}!3f${heading}!4f0!5f0.7820865974627469&output=embed`;

  // Street View Static API URL (サムネイル用)
  const getStaticUrl = (h: number, size: string = "200x150") => {
    return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${currentLat},${currentLng}&heading=${h}&fov=90&pitch=5&key=AIzaSyCphrzW-o323Ypju5eOiJws2vwYmE5pIkI`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--card-border)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-white mb-2 transition-colors"
        >
          <span>←</span> 戻る
        </button>
        <h2 className="text-base font-bold">建物を選択</h2>
        {address && (
          <p className="text-xs text-gray-500 mt-1 truncate">{address}</p>
        )}
      </div>

      {/* メインビュー（ドラッグ可能） */}
      <div
        ref={containerRef}
        className={`relative select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 大きなStreet View画像（スムーズアニメーション） */}
        <div className={`relative overflow-hidden ${isTransitioning ? "transition-opacity duration-100" : ""}`}>
          <img
            src={getStaticUrl(Math.round(heading), "640x400")}
            alt="Street View"
            className="w-full aspect-[16/10] object-cover"
            draggable={false}
          />
          {/* ドラッグ中のオーバーレイ */}
          {isDragging && (
            <div className="absolute inset-0 bg-black/10 pointer-events-none" />
          )}
        </div>

        {/* 回転コントロール */}
        <div className="absolute top-1/2 left-2 -translate-y-1/2">
          <button
            onClick={(e) => { e.stopPropagation(); rotateHeading(-45); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-10 h-10 bg-black/70 hover:bg-black/90 active:scale-95 text-white rounded-full flex items-center justify-center text-lg backdrop-blur-sm transition-all"
            title="左に回転"
          >
            ◀
          </button>
        </div>
        <div className="absolute top-1/2 right-2 -translate-y-1/2">
          <button
            onClick={(e) => { e.stopPropagation(); rotateHeading(45); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-10 h-10 bg-black/70 hover:bg-black/90 active:scale-95 text-white rounded-full flex items-center justify-center text-lg backdrop-blur-sm transition-all"
            title="右に回転"
          >
            ▶
          </button>
        </div>

        {/* ドラッグヒント */}
        {!isDragging && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
            ↔ 左右:回転 ↕ 上下:移動
          </div>
        )}

        {/* 位置移動コントロール */}
        <div
          className="absolute top-2 right-2 bg-black/80 rounded-lg p-1.5 backdrop-blur-sm"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="text-[10px] text-gray-400 text-center mb-1">移動</p>
          <div className="grid grid-cols-3 gap-0.5">
            {/* 前進 */}
            <div />
            <button
              onClick={() => movePosition("forward")}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 active:scale-90 rounded transition-all text-sm"
              title="前進"
            >
              ▲
            </button>
            <div />
            {/* 左・中心・右 */}
            <button
              onClick={() => movePosition("left")}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 active:scale-90 rounded transition-all text-[10px]"
              title="左へ"
            >
              ◀
            </button>
            <div className="w-7 h-7 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            </div>
            <button
              onClick={() => movePosition("right")}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 active:scale-90 rounded transition-all text-[10px]"
              title="右へ"
            >
              ▶
            </button>
            {/* 後退 */}
            <div />
            <button
              onClick={() => movePosition("backward")}
              className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 active:bg-white/30 active:scale-90 rounded transition-all text-sm"
              title="後退"
            >
              ▼
            </button>
            <div />
          </div>
        </div>

        {/* コンパスインジケーター */}
        <div className="absolute bottom-2 left-2 bg-black/80 rounded-lg p-2 backdrop-blur-sm flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full border border-gray-500 relative"
            style={{ transform: `rotate(${-heading}deg)` }}
          >
            <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-red-500" />
          </div>
          <div className="text-white text-xs">
            <div className="font-mono">{Math.round(heading)}°</div>
            <div className="text-[9px] text-gray-400">{currentLat.toFixed(5)}, {currentLng.toFixed(5)}</div>
          </div>
        </div>
      </div>

      {/* 8方向サムネイル */}
      <div className="p-3 border-b border-[var(--card-border)]">
        <p className="text-[10px] text-gray-500 mb-2">クリックで方向を変更（スムーズ回転）</p>
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
            const isSelected = Math.abs(Math.round(heading) - dir.h) < 23 ||
              Math.abs(Math.round(heading) - dir.h) > 337;
            return (
              <button
                key={dir.h}
                onClick={() => setHeadingSmooth(dir.h)}
                className={`relative rounded overflow-hidden border-2 transition-all duration-200 ${
                  isSelected
                    ? "border-[var(--accent)] ring-1 ring-[var(--accent)] scale-105"
                    : "border-transparent hover:border-gray-600 hover:scale-102"
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

      {/* 診断ボタン */}
      <div className="p-4 mt-auto">
        <p className="text-xs text-gray-500 mb-3 text-center">
          診断したい建物の方向を選んでボタンを押してください
        </p>
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
            "この場所を診断する"
          )}
        </button>
      </div>
    </div>
  );
}
