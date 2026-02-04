"use client";

import { useState } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onCoordinateSearch: (lat: number, lng: number) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, onCoordinateSearch, loading }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    // 緯度経度の直接入力を検出 (例: "35.6812, 139.7671")
    const coordMatch = query.match(/^(-?\d+\.?\d*)\s*[,、\s]\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        onCoordinateSearch(lat, lng);
        return;
      }
    }

    onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="住所または緯度,経度を入力 (例: 東京駅 / 35.6812, 139.7671)"
        className="flex-1 px-4 py-3 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] text-sm"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="px-6 py-3 rounded-lg bg-[var(--accent)] text-white font-medium text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "診断中..." : "診断"}
      </button>
    </form>
  );
}
