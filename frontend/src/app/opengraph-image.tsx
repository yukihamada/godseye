import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "God's Eye - AIによる建物地震倒壊リスク診断システム";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        {/* Seismic wave background pattern */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.1,
          }}
        >
          {[200, 300, 400, 500].map((r) => (
            <div
              key={r}
              style={{
                position: "absolute",
                width: r * 2,
                height: r * 2,
                borderRadius: "50%",
                border: "2px solid #3b82f6",
              }}
            />
          ))}
        </div>

        {/* Eye icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 30,
          }}
        >
          <svg
            width="120"
            height="120"
            viewBox="0 0 64 64"
            fill="none"
          >
            <path
              d="M32 12C18 12 6 32 6 32s12 20 26 20 26-20 26-20S46 12 32 12z"
              fill="#1e3a5f"
              stroke="#3b82f6"
              strokeWidth="2"
            />
            <circle cx="32" cy="32" r="12" fill="#2563eb" />
            <circle cx="32" cy="32" r="5" fill="#0f172a" />
            <circle cx="29" cy="29" r="2" fill="#fff" opacity="0.8" />
            <circle cx="32" cy="32" r="2" fill="#ef4444" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "-0.02em",
            marginBottom: 16,
          }}
        >
          God&apos;s Eye
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 32,
            color: "#94a3b8",
            marginBottom: 40,
          }}
        >
          AIによる建物地震倒壊リスク診断
        </div>

        {/* Features */}
        <div
          style={{
            display: "flex",
            gap: 24,
          }}
        >
          {["PLATEAU", "J-SHIS", "Street View", "ML予測"].map((feature) => (
            <div
              key={feature}
              style={{
                background: "rgba(59, 130, 246, 0.2)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                borderRadius: 8,
                padding: "12px 24px",
                color: "#60a5fa",
                fontSize: 20,
              }}
            >
              {feature}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
