"use client";

import { useEffect, useState, useRef } from "react";

interface ModelViewer3DProps {
  imageUrl: string;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Status = "idle" | "generating" | "polling" | "completed" | "error";

export default function ModelViewer3D({ imageUrl, onClose }: ModelViewer3DProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && !customElements.get("model-viewer")) {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js";
      document.head.appendChild(script);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startGeneration = async () => {
    setStatus("generating");
    setError(null);
    setProgress(0);

    try {
      const res = await fetch(`${API_BASE}/api/generate-3d`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to start 3D generation");
      }

      const data = await res.json();
      setStatus("polling");
      startPolling(data.task_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  };

  const startPolling = (id: string) => {
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 5;
      setProgress(Math.min(95, (elapsed / 180) * 100));

      if (elapsed > 180) {
        if (pollRef.current) clearInterval(pollRef.current);
        setError("Timeout");
        setStatus("error");
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/mesh3d-status/${id}`);
        const data = await res.json();

        if (data.status === "SUCCEEDED" && data.model_url) {
          if (pollRef.current) clearInterval(pollRef.current);
          setModelUrl(data.model_url);
          setProgress(100);
          setStatus("completed");
        } else if (data.status === "FAILED") {
          if (pollRef.current) clearInterval(pollRef.current);
          setError(data.error || "Generation failed");
          setStatus("error");
        }
      } catch { /* continue polling */ }
    }, 5000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-lg font-bold">AI 3Dモデル生成</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        {status === "idle" && (
          <div className="text-center space-y-6">
            <img src={imageUrl} alt="Source" className="max-w-md max-h-64 mx-auto rounded-lg" />
            <button
              onClick={startGeneration}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg"
            >
              3Dモデルを生成
            </button>
            <p className="text-xs text-gray-500">生成には1〜3分かかります</p>
          </div>
        )}

        {(status === "generating" || status === "polling") && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p>生成中... {Math.round(progress)}%</p>
          </div>
        )}

        {status === "completed" && modelUrl && (
          <div className="w-full h-full flex flex-col">
            {/* @ts-expect-error model-viewer is a web component */}
            <model-viewer
              src={modelUrl}
              auto-rotate
              camera-controls
              shadow-intensity="1"
              style={{ width: "100%", height: "100%", minHeight: "400px", backgroundColor: "#1a1a2e" }}
            />
            <div className="flex justify-center gap-4 py-4">
              <a href={modelUrl} download className="px-4 py-2 bg-green-600 text-white rounded-lg">
                ダウンロード
              </a>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="text-center space-y-4">
            <p className="text-red-400">{error}</p>
            <button onClick={() => setStatus("idle")} className="px-4 py-2 bg-gray-700 text-white rounded-lg">
              やり直す
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
