FROM python:3.11-slim

# セキュリティ: 非rootユーザーを作成
RUN groupadd -r appuser && useradd -r -g appuser appuser

# システム依存関係（LightGBM用）とcurl（ヘルスチェック用）
RUN apt-get update && \
    apt-get install -y --no-install-recommends libgomp1 curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係を先にインストール（キャッシュ効率化）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコード
COPY app/ app/
COPY ml/model/ ml/model/

# 所有権を変更
RUN chown -R appuser:appuser /app

# 非rootユーザーに切り替え
USER appuser

EXPOSE 8080

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
