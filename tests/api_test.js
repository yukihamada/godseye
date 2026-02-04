import http from "k6/http";
import { check, group, sleep } from "k6";

const BASE_URL = __ENV.API_URL || "http://localhost:8000";

export const options = {
  thresholds: {
    http_req_failed: ["rate<0.3"],
    http_req_duration: ["p(95)<30000"],
  },
  scenarios: {
    api_tests: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "120s",
    },
  },
};

// テスト座標
const LOCATIONS = {
  tokyo: { lat: 35.6812, lng: 139.7671, name: "東京駅" },
  funabashi: { lat: 35.717468, lng: 139.94455, name: "船橋市本中山" },
  osaka: { lat: 34.7024, lng: 135.4959, name: "大阪駅" },
  nagoya: { lat: 35.1709, lng: 136.8815, name: "名古屋駅" },
};

export default function () {
  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, {
      "health status 200": (r) => r.status === 200,
      "health body ok": (r) => r.json().status === "ok",
    });
  });

  // 各都市でJ-SHIS個別テスト
  for (const [key, loc] of Object.entries(LOCATIONS)) {
    group(`J-SHIS: ${loc.name}`, () => {
      const res = http.get(
        `${BASE_URL}/api/jshis?lat=${loc.lat}&lng=${loc.lng}`
      );
      check(res, {
        [`jshis ${key} status 200`]: (r) => r.status === 200,
        [`jshis ${key} has amplification_factor`]: (r) =>
          r.json().amplification_factor !== null,
        [`jshis ${key} has vs30`]: (r) => r.json().vs30 !== null,
        [`jshis ${key} has micro_topography_name`]: (r) =>
          r.json().micro_topography_name !== null,
      });
      sleep(0.5);
    });
  }

  // PLATEAU個別テスト
  group("PLATEAU: 東京駅", () => {
    const res = http.get(
      `${BASE_URL}/api/plateau?lat=${LOCATIONS.tokyo.lat}&lng=${LOCATIONS.tokyo.lng}`
    );
    check(res, {
      "plateau status 200": (r) => r.status === 200,
      "plateau returns object": (r) => typeof r.json() === "object",
    });
    sleep(0.5);
  });

  // Street View個別テスト (APIキー未設定でも200を返す)
  group("Street View: 東京駅", () => {
    const res = http.get(
      `${BASE_URL}/api/streetview?lat=${LOCATIONS.tokyo.lat}&lng=${LOCATIONS.tokyo.lng}`
    );
    check(res, {
      "streetview status 200": (r) => r.status === 200,
      "streetview has available field": (r) =>
        r.json().available !== undefined,
    });
    sleep(0.5);
  });

  // Tellus個別テスト
  group("Tellus: 東京駅", () => {
    const res = http.get(
      `${BASE_URL}/api/tellus?lat=${LOCATIONS.tokyo.lat}&lng=${LOCATIONS.tokyo.lng}`
    );
    check(res, {
      "tellus status 200": (r) => r.status === 200,
      "tellus has scenes_found": (r) => r.json().scenes_found !== undefined,
    });
    sleep(0.5);
  });

  // 統合診断テスト (各都市)
  for (const [key, loc] of Object.entries(LOCATIONS)) {
    group(`Diagnose: ${loc.name}`, () => {
      const payload = JSON.stringify({ lat: loc.lat, lng: loc.lng });
      const params = { headers: { "Content-Type": "application/json" } };
      const res = http.post(`${BASE_URL}/api/diagnose`, payload, params);

      check(res, {
        [`diagnose ${key} status 200`]: (r) => r.status === 200,
        [`diagnose ${key} has risk`]: (r) => r.json().risk !== undefined,
        [`diagnose ${key} risk score 0-100`]: (r) => {
          const s = r.json().risk.score;
          return s >= 0 && s <= 100;
        },
        [`diagnose ${key} risk level exists`]: (r) =>
          ["低", "中", "高", "極高"].includes(r.json().risk.level),
        [`diagnose ${key} has jshis`]: (r) =>
          r.json().jshis.amplification_factor !== null,
        [`diagnose ${key} has breakdown`]: (r) =>
          r.json().risk.breakdown !== undefined,
      });
      sleep(1);
    });
  }

  // バリデーションテスト
  group("Validation: invalid coordinates", () => {
    const payload = JSON.stringify({ lat: 999, lng: 999 });
    const params = { headers: { "Content-Type": "application/json" } };
    const res = http.post(`${BASE_URL}/api/diagnose`, payload, params);
    check(res, {
      "invalid coords returns 422": (r) => r.status === 422,
    });
  });

  group("Validation: missing params", () => {
    const res = http.get(`${BASE_URL}/api/jshis`);
    check(res, {
      "missing params returns 422": (r) => r.status === 422,
    });
  });
}
