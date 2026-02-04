# God's Eye - 地震倒壊リスク診断システム

住所や座標を入力すると、5つのデータソースを統合して建物の地震倒壊リスクを自動診断するWebアプリケーション。

**Live:** https://godseye-web.fly.dev

## データソース

| ソース | 取得データ | 認証 |
|--------|-----------|------|
| **PLATEAU** 3D Tiles | 構造種別・高さ・階数・面積・用途 | 不要 |
| **J-SHIS** | 地盤増幅率・Vs30・微地形区分・地震発生確率 | 不要 |
| **Google Street View** | 4方向外観画像 (640x640px) | APIキー |
| **Roboflow AI** | 外壁損傷・ひび割れ・コンクリート劣化検出 | APIキー |
| **Tellus** | PALSAR-2 SARシーン検索 | APIトークン |

## リスクスコア (0-100)

| カテゴリ | 配点 | 根拠 |
|---------|------|------|
| 築年数 | 0-30 | 旧耐震(1981年以前)=30, 新耐震=15, 現行基準=5 |
| 構造種別 | 0-25 | 木造=25, S造=15, RC造=5, SRC造=3 |
| 地盤増幅率 | 0-25 | ARV * 12 (上限25) |
| 地震発生確率 | 0-20 | 30年震度6弱以上確率 * 40 (上限20) |
| AI外観損傷 | 0-15 | Roboflow損傷スコア * 0.15 |

レベル: 低(0-24) / 中(25-49) / 高(50-74) / 極高(75-100)

## アーキテクチャ

```
godseye/
├── backend/           Python FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/schemas.py
│   │   ├── services/
│   │   │   ├── jshis.py         J-SHIS地盤情報
│   │   │   ├── plateau.py       PLATEAU 3D Tiles (b3dm)
│   │   │   ├── streetview.py    Google SV画像取得
│   │   │   ├── roboflow.py      AI損傷解析 (3モデル並列)
│   │   │   ├── tellus.py        Tellus SAR検索
│   │   │   └── risk_engine.py   統合リスク計算
│   │   └── routers/
│   │       ├── diagnose.py      POST /api/diagnose
│   │       └── datasources.py   個別データソースAPI
│   └── k6/load-test.js
└── frontend/          Next.js + Tailwind CSS
    └── src/
        ├── app/page.tsx          地図 + 検索UI
        ├── components/
        │   ├── Map.tsx           Leaflet地図
        │   ├── SearchBar.tsx     住所検索
        │   ├── RiskPanel.tsx     診断結果パネル
        │   ├── RiskGauge.tsx     スコアゲージ
        │   ├── DataCards.tsx     データソース詳細 + BBox overlay
        │   └── StreetView.tsx    SV画像表示
        └── lib/api.ts            API型定義 + fetch
```

## セットアップ

### 環境変数

```bash
cp backend/.env.template backend/.env
```

```
GOOGLE_STREETVIEW_API_KEY=   # Google Cloud Console
TELLUS_API_TOKEN=            # Tellus XDP
ROBOFLOW_API_KEY=            # Roboflow
```

**Frontend (.env.local)**
- `NEXT_PUBLIC_API_URL` — バックエンドURL (デフォルト: `http://localhost:8000`)

### バックエンド

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### フロントエンド

```bash
cd frontend
npm install
npm run dev
```

### 負荷テスト

```bash
k6 run --env BASE_URL=http://localhost:8000 backend/k6/load-test.js
```

## デプロイ (Fly.io)

```bash
# バックエンド
cd backend
fly secrets set GOOGLE_STREETVIEW_API_KEY=... TELLUS_API_TOKEN=... ROBOFLOW_API_KEY=...
fly deploy

# フロントエンド
cd frontend
fly deploy
```

## API

- `POST /api/diagnose` — 統合診断 (`{ "lat": 35.68, "lng": 139.76 }`)
- `GET /api/jshis?lat=...&lng=...` — J-SHIS単体
- `GET /api/plateau?lat=...&lng=...` — PLATEAU単体
- `GET /api/streetview?lat=...&lng=...` — Street View単体
- `GET /api/tellus?lat=...&lng=...` — Tellus単体
- `GET /health` — ヘルスチェック

## 対応エリア

- **東京23区**: PLATEAU 3D Tiles完全対応（建物属性取得可能）
- **大阪・名古屋等**: GSI逆ジオコーディングによる住所推定 + J-SHIS地盤情報

## 技術スタック

- Backend: Python 3.11, FastAPI, httpx (async)
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, Leaflet
- AI: Roboflow (損傷検出 / ひび割れ検出 / コンクリート劣化検出)
- Infra: Fly.io (nrt region)
