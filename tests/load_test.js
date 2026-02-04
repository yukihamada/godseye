import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.API_URL || "http://localhost:8000";

export const options = {
  stages: [
    { duration: "10s", target: 5 },
    { duration: "20s", target: 5 },
    { duration: "5s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.5"],
    http_req_duration: ["p(95)<30000"],
  },
};

const LOCATIONS = [
  { lat: 35.6812, lng: 139.7671 },
  { lat: 34.7024, lng: 135.4959 },
  { lat: 35.1709, lng: 136.8815 },
  { lat: 35.717468, lng: 139.94455 },
  { lat: 35.6585, lng: 139.7454 },
];

export default function () {
  const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  const payload = JSON.stringify({ lat: loc.lat, lng: loc.lng });
  const params = { headers: { "Content-Type": "application/json" } };

  const res = http.post(`${BASE_URL}/api/diagnose`, payload, params);
  check(res, {
    "status 200": (r) => r.status === 200,
    "has risk score": (r) => {
      try {
        return r.json().risk.score >= 0;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
