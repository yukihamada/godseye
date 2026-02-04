import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";

// テスト座標（東京駅・新宿・渋谷・大阪・名古屋）
const LOCATIONS = [
  { lat: 35.6812, lng: 139.7671, name: "東京駅" },
  { lat: 35.6896, lng: 139.6922, name: "新宿" },
  { lat: 35.6580, lng: 139.7016, name: "渋谷" },
  { lat: 34.6937, lng: 135.5023, name: "大阪" },
  { lat: 35.1815, lng: 136.9066, name: "名古屋" },
];

export const options = {
  stages: [
    { duration: "10s", target: 3 },
    { duration: "30s", target: 3 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_duration: ["p(95)<30000"],
    http_req_failed: ["rate<0.3"],
  },
};

export default function () {
  const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];

  const res = http.post(
    `${BASE_URL}/api/diagnose`,
    JSON.stringify({ lat: loc.lat, lng: loc.lng }),
    { headers: { "Content-Type": "application/json" }, timeout: "60s" }
  );

  check(res, {
    "status is 200": (r) => r.status === 200,
    "has risk score": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.risk && typeof body.risk.score === "number";
      } catch {
        return false;
      }
    },
    "has plateau data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.plateau !== undefined;
      } catch {
        return false;
      }
    },
    "has jshis data": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.jshis !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(2);
}
