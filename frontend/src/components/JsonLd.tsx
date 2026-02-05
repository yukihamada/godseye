export function JsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "God's Eye",
    alternateName: "神の目 地震倒壊リスク診断",
    description:
      "AIと政府オープンデータを活用した建物地震倒壊リスク診断システム。PLATEAU 3D都市モデル、J-SHIS地盤情報、Google Street View、衛星画像を統合し、機械学習で倒壊確率を予測します。",
    url: "https://godseye-web.fly.dev",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "JPY",
    },
    featureList: [
      "PLATEAU 3D都市モデルによる建物情報取得",
      "J-SHIS地盤データによる地震ハザード評価",
      "Google Street Viewによる外観AI解析",
      "機械学習による倒壊確率予測",
      "Tellus衛星画像連携",
    ],
    screenshot: "https://godseye-web.fly.dev/og-image.png",
    softwareVersion: "1.0.0",
    author: {
      "@type": "Organization",
      name: "God's Eye Team",
    },
    inLanguage: "ja",
    isAccessibleForFree: true,
    keywords:
      "地震,倒壊リスク,建物診断,PLATEAU,J-SHIS,AI,機械学習,防災,耐震",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
