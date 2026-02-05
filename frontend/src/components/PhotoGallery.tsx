"use client";

import { useState, useCallback, useEffect } from "react";

interface PhotoGalleryProps {
  images: Array<{
    url: string;
    label?: string;
    date?: string;
    detectionCount?: number;
  }>;
  title: string;
  icon: string;
  onImageSelect?: (index: number) => void;
}

export default function PhotoGallery({ images, title, icon, onImageSelect }: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // キーボード操作
  useEffect(() => {
    if (!isZoomed) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsZoomed(false);
      if (e.key === "ArrowLeft") navigateImage(-1);
      if (e.key === "ArrowRight") navigateImage(1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isZoomed, selectedIndex, images.length]);

  const navigateImage = useCallback((delta: number) => {
    setIsAnimating(true);
    setSelectedIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return images.length - 1;
      if (next >= images.length) return 0;
      return next;
    });
    setTimeout(() => setIsAnimating(false), 200);
  }, [images.length]);

  const handleImageClick = useCallback((index: number) => {
    setSelectedIndex(index);
    onImageSelect?.(index);
  }, [onImageSelect]);

  if (images.length === 0) return null;

  const currentImage = images[selectedIndex];

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center text-white text-xs font-bold">
          {icon}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-[10px] text-gray-500">
          {selectedIndex + 1} / {images.length}
        </span>
      </div>

      {/* メイン画像（クリックで拡大） */}
      <div
        className="relative cursor-pointer group mb-3"
        onClick={() => setIsZoomed(true)}
      >
        <div className={`relative overflow-hidden rounded-lg transition-transform duration-200 ${isAnimating ? 'scale-[0.98]' : 'scale-100'}`}>
          <img
            src={currentImage.url}
            alt={currentImage.label || `画像${selectedIndex + 1}`}
            className="w-full aspect-video object-cover transition-all duration-300 group-hover:brightness-110"
            loading="lazy"
          />
          {/* オーバーレイ */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full transition-opacity">
              クリックで拡大
            </span>
          </div>
        </div>

        {/* ラベル */}
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          {currentImage.label && (
            <span className="text-[10px] bg-black/70 text-white px-2 py-0.5 rounded backdrop-blur-sm">
              {currentImage.label}
            </span>
          )}
          {currentImage.date && (
            <span className="text-[10px] bg-black/70 text-gray-300 px-2 py-0.5 rounded backdrop-blur-sm">
              {currentImage.date}
            </span>
          )}
          {currentImage.detectionCount !== undefined && currentImage.detectionCount > 0 && (
            <span className="text-[10px] bg-red-600/90 text-white px-2 py-0.5 rounded backdrop-blur-sm">
              {currentImage.detectionCount}件検出
            </span>
          )}
        </div>

        {/* ナビゲーションボタン */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); navigateImage(-1); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            >
              ‹
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigateImage(1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* サムネイル */}
      {images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-600">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => handleImageClick(i)}
              className={`relative flex-shrink-0 rounded-md overflow-hidden transition-all duration-200 ${
                i === selectedIndex
                  ? "ring-2 ring-[var(--accent)] scale-105"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <img
                src={img.url}
                alt={img.label || `サムネイル${i + 1}`}
                className="w-14 h-10 object-cover"
                loading="lazy"
              />
              {img.detectionCount !== undefined && img.detectionCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                  {img.detectionCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 拡大モーダル */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center animate-fadeIn"
          onClick={() => setIsZoomed(false)}
        >
          {/* 画像 */}
          <div
            className={`relative max-w-[90vw] max-h-[85vh] transition-all duration-200 ${isAnimating ? 'scale-[0.98] opacity-80' : 'scale-100 opacity-100'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentImage.url}
              alt={currentImage.label || `画像${selectedIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />

            {/* 画像情報 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/80 px-4 py-2 rounded-full backdrop-blur-sm">
              {currentImage.label && (
                <span className="text-white text-sm">{currentImage.label}</span>
              )}
              {currentImage.date && (
                <span className="text-gray-400 text-sm">{currentImage.date}</span>
              )}
              <span className="text-gray-500 text-xs">
                {selectedIndex + 1} / {images.length}
              </span>
            </div>
          </div>

          {/* 閉じるボタン */}
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl transition-colors"
            onClick={() => setIsZoomed(false)}
          >
            ×
          </button>

          {/* ナビゲーション */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigateImage(-1); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white text-2xl rounded-full flex items-center justify-center transition-all"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigateImage(1); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 text-white text-2xl rounded-full flex items-center justify-center transition-all"
              >
                ›
              </button>
            </>
          )}

          {/* サムネイルストリップ */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 translate-y-16 flex gap-2 bg-black/60 p-2 rounded-lg backdrop-blur-sm">
            {images.map((img, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); handleImageClick(i); }}
                className={`rounded overflow-hidden transition-all ${
                  i === selectedIndex ? "ring-2 ring-white scale-110" : "opacity-50 hover:opacity-80"
                }`}
              >
                <img
                  src={img.url}
                  alt={`サムネイル${i + 1}`}
                  className="w-12 h-8 object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
