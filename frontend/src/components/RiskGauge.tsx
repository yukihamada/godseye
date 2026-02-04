"use client";

import type { RiskResult } from "@/lib/api";

interface RiskGaugeProps {
  risk: RiskResult;
}

function getLevelColor(level: string): string {
  switch (level) {
    case "低":
      return "var(--success)";
    case "中":
      return "var(--warning)";
    case "高":
      return "var(--danger)";
    case "極高":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

export default function RiskGauge({ risk }: RiskGaugeProps) {
  const color = getLevelColor(risk.level);
  const circumference = 2 * Math.PI * 54;
  const filled = (risk.score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="var(--card-border)"
            strokeWidth="8"
          />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>
            {risk.score}
          </span>
          <span className="text-xs text-gray-400">/ 100</span>
        </div>
      </div>
      <div
        className="px-4 py-1 rounded-full text-sm font-bold text-white"
        style={{ backgroundColor: color }}
      >
        リスク: {risk.level}
      </div>
    </div>
  );
}
