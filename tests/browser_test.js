import { browser } from "k6/browser";
import { check } from "k6";

const FRONTEND_URL = __ENV.FRONTEND_URL || "http://localhost:3000";

export const options = {
  scenarios: {
    browser_test: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "180s",
      options: {
        browser: {
          type: "chromium",
        },
      },
    },
  },
  thresholds: {
    checks: ["rate>0.8"],
  },
};

export default async function () {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. ページ読み込み — load で待つ (networkidleはSSRなしだと不安定)
    await page.goto(FRONTEND_URL, { waitUntil: "load" });
    await page.waitForTimeout(3000); // クライアント水和を待つ

    const title = await page.title();
    check(null, {
      "page title contains Gods Eye": () => title.includes("God's Eye"),
    });

    // ヘッダーの確認
    await page.waitForSelector("header", { timeout: 10000 });
    const headerText = await page.evaluate(() =>
      document.querySelector("header")?.textContent || ""
    );
    check(null, {
      "header shows GOD'S EYE": () =>
        headerText.includes("GOD") && headerText.includes("EYE"),
    });

    // 検索バー・ボタンの確認
    await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    const inputVisible = await page.evaluate(() => {
      const el = document.querySelector('input[type="text"]');
      return el !== null && el.offsetParent !== null;
    });
    check(null, {
      "search input visible": () => inputVisible,
    });

    await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
    const btnText = await page.evaluate(() =>
      document.querySelector('button[type="submit"]')?.textContent || ""
    );
    check(null, {
      "diagnose button exists": () => btnText.includes("診断"),
    });

    // 地図の確認
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });
    check(null, {
      "map container visible": () => true,
    });

    // 2. 座標で検索テスト
    await page.evaluate(() => {
      const input = document.querySelector('input[type="text"]');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, '35.6812, 139.7671');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.locator('button[type="submit"]').click();

    // 結果表示を待つ
    await page.waitForTimeout(10000);

    const panelText = await page.evaluate(() =>
      document.querySelector("aside")?.textContent || ""
    );
    check(null, {
      "risk panel appears after coord search": () =>
        panelText.includes("地震倒壊リスク診断"),
      "risk level shown": () =>
        panelText.includes("リスク: 低") ||
        panelText.includes("リスク: 中") ||
        panelText.includes("リスク: 高") ||
        panelText.includes("リスク: 極高"),
      "score breakdown visible": () => panelText.includes("築年数"),
      "J-SHIS data visible": () => panelText.includes("J-SHIS"),
      "PLATEAU card visible": () => panelText.includes("PLATEAU"),
    });

    // 3. 住所検索テスト
    await page.evaluate(() => {
      const input = document.querySelector('input[type="text"]');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, '千葉県船橋市本中山1-15-13');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(10000);

    const panelText2 = await page.evaluate(() =>
      document.querySelector("aside")?.textContent || ""
    );
    check(null, {
      "address search shows result": () =>
        panelText2.includes("地震倒壊リスク診断"),
      "address search shows risk level": () =>
        panelText2.includes("リスク: 低") ||
        panelText2.includes("リスク: 中") ||
        panelText2.includes("リスク: 高") ||
        panelText2.includes("リスク: 極高"),
    });

    // 4. 大阪テスト
    await page.evaluate(() => {
      const input = document.querySelector('input[type="text"]');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeInputValueSetter.call(input, '大阪駅');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(10000);

    const panelText3 = await page.evaluate(() =>
      document.querySelector("aside")?.textContent || ""
    );
    check(null, {
      "osaka search shows result": () =>
        panelText3.includes("地震倒壊リスク診断"),
    });
  } finally {
    await page.close();
    await context.close();
  }
}
