import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const RealDate = Date;
const fixedNow = RealDate.parse("2026-11-01T12:00:00.000Z");
class FixedDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}

const record = (visitors, covered = true) => JSON.stringify({
  totalEvents: Object.keys(visitors).length,
  events: { "page:view": Object.keys(visitors).length },
  monthlyVisitors: {},
  selahWeeklyActiveVisitorCoverage: covered,
  selahWeeklyActiveVisitors: visitors,
});
const store = new Map([
  ["analytics:selah:2026-11-01", record({ returning: { country: "US", region: "CA" } })],
  ["analytics:selah:2026-10-30", record({ returning: { country: "KR", region: "11" } })],
  ["analytics:selah:2026-10-26", record({ recent: { country: "KR", region: "44" } })],
  ["analytics:selah:2026-10-25", record({ stale: { country: "JP", region: "13" } })],
]);

try {
  globalThis.Date = FixedDate;
  const source = await readFile(new URL("./worker.js", import.meta.url), "utf8");
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const env = { CLOUD_ACCOUNT_KV: { get: async key => store.get(key) ?? null } };
  const summarize = async () => {
    const response = await worker.fetch(new Request("https://worker.test/analytics/summary?appId=selah&period=month"), env);
    assert.equal(response.status, 200);
    return response.json();
  };

  let summary = await summarize();
  assert.equal(summary.weeklyActiveVisitorCoverage, true);
  assert.equal(summary.weeklyActiveVisitors, 2);
  assert.deepEqual(summary.weeklyActiveVisitorsByCountry, { US: 1, KR: 1 });
  assert.deepEqual(summary.weeklyActiveVisitorsByRegion, { "US-CA": 1, "KR-44": 1 });

  store.set("analytics:selah:2026-10-28", record({ legacy: { country: "US", region: "OK" } }, false));
  summary = await summarize();
  assert.equal(summary.weeklyActiveVisitorCoverage, false);
  assert.equal(summary.weeklyActiveVisitors, null);
} finally {
  globalThis.Date = RealDate;
}

console.log("weekly active rollup: latest 7 UTC days, month boundary, stale exclusion, and incomplete coverage passed");
