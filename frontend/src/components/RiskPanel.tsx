"use client";

import type { DiagnoseResponse } from "@/lib/api";
import RiskGauge from "./RiskGauge";
import DataCards from "./DataCards";
import StreetView from "./StreetView";

interface RiskPanelProps {
  data: DiagnoseResponse;
}

export default function RiskPanel({ data }: RiskPanelProps) {
  const { risk } = data;

  return (
    <div className="flex flex-col gap-4">
      {/* リスクスコア */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">地震倒壊リスク診断</h2>
        <RiskGauge risk={risk} />
        <p className="mt-4 text-sm text-gray-300 leading-relaxed">
          {risk.description}
        </p>

        {/* スコア内訳 */}
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-400">スコア内訳</h3>
          <ScoreBar label="築年数" value={risk.breakdown.building_age_score} max={30} />
          <ScoreBar label="構造種別" value={risk.breakdown.structure_score} max={25} />
          <ScoreBar label="地盤" value={risk.breakdown.ground_score} max={25} />
          <ScoreBar label="地震確率" value={risk.breakdown.seismic_prob_score} max={20} />
        </div>
      </div>

      {/* Street View */}
      {data.streetview.available && (
        <StreetView data={data.streetview} />
      )}

      {/* 各データソース詳細 */}
      <DataCards data={data} />
    </div>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-gray-400">{label}</span>
      <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            backgroundColor: pct > 70 ? "var(--danger)" : pct > 40 ? "var(--warning)" : "var(--success)",
          }}
        />
      </div>
      <span className="w-12 text-right text-gray-400">
        {value}/{max}
      </span>
    </div>
  );
}
