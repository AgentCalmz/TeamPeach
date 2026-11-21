"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const API = "https://teampeach-domain-api.creatorletofficial.workers.dev";

async function getJson(path) {
  const response = await fetch(API + path, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
  const body = await response.text();
  assert.equal(
    response.status,
    200,
    path + " returned HTTP " + response.status + ": " + body.slice(0, 500)
  );
  assert.match(
    response.headers.get("content-type") || "",
    /application\/json/i,
    path + " did not return JSON"
  );
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "*",
    path + " is missing the public CORS header required by the browser"
  );
  let data;
  try { data = JSON.parse(body); }
  catch { assert.fail(path + " returned invalid JSON: " + body.slice(0, 500)); }
  return data;
}

test("PeachJobs public health, stats and default browser search request work", async () => {
  const [health, stats, search] = await Promise.all([
    getJson("/v1/jobs/health"),
    getJson("/v1/jobs/stats"),
    // Matches the initial request built by public/js/peachjobs.js with all default
    // filters selected: no role, location, remote or employment-type filters.
    getJson("/v1/jobs?days=30&page=1&limit=20")
  ]);

  assert.equal(health.ok, true, "Jobs health endpoint did not report ok");
  assert.equal(health.database, "ready", "Cloudflare D1 is not ready");
  assert.ok(Number(health.total) > 0, "D1 has no indexed job rows");

  assert.equal(stats.ok, true, "Jobs stats endpoint did not report ok");
  assert.ok(Number(stats.jobs) > 0, "Stats endpoint found no recent jobs");
  assert.ok(Number(stats.employers) > 0, "Stats endpoint found no employers");

  assert.equal(search.ok, true, "Jobs search endpoint did not report ok");
  assert.ok(Array.isArray(search.results), "Search results are not an array");
  assert.ok(search.results.length > 0, "Search returned no rows despite a populated index");
  assert.ok(search.results.length <= 20, "Search returned more than the requested page size");
  assert.ok(Number(search.total) > 0, "Search total is zero despite a populated index");
  for (const job of search.results) {
    assert.equal(typeof job.title, "string", "A job is missing its title");
    assert.equal(typeof job.company, "string", "A job is missing its employer");
    assert.ok(typeof job.job_url === "string" && job.job_url.startsWith("https://"), "A job is missing its employer listing URL");
  }
});
