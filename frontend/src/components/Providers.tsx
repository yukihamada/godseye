"use client";

import { ReactNode } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-8">
          <h1 className="text-2xl font-bold mb-4">アプリケーションエラー</h1>
          <p className="text-gray-400 mb-6">
            予期しないエラーが発生しました。ページを再読み込みしてください。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            再読み込み
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
