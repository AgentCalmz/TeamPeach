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
  assert.match(response.headers.get("content-type") || "", /application\/json/i, path + " did not return JSON");
  assert.equal(response.headers.get("access-control-allow-origin"), "*", path + " is missing the public CORS header required by the browser");
  let data;
  try { data = JSON.parse(body); }
  catch { assert.fail(path + " returned invalid JSON: " + body.slice(0, 500)); }
  const quotaError =
    (response.status === 429 && ["D1_DAILY_READ_LIMIT", "D1_DAILY_WRITE_LIMIT"].includes(data.code)) ||
    (response.status === 502 && /exceeded D1's free tier daily row (read|write) limit/i.test(data.detail || ""));
  if (quotaError) {
    const quotaDescription = [data.message, data.detail].filter(Boolean).join(" ");
    assert.match(quotaDescription, /D1's free tier daily row (read|write) limit/i);
    return { ...data, quotaExceeded: true };
  }
  assert.equal(response.status, 200, path + " returned HTTP " + response.status + ": " + body.slice(0, 500));
  return data;
}

test("PeachJobs public health, stats and default browser search request work", async (t) => {
  const [health, stats, search] = await Promise.all([
    getJson("/v1/jobs/health"),
    getJson("/v1/jobs/stats"),
    // Matches the initial request built by public/js/peachjobs.js with all default
    // filters selected: no role, location, remote or employment-type filters.
    getJson("/v1/jobs?days=30&page=1&limit=20")
  ]);

  if ([health, stats, search].some(item => item.quotaExceeded)) {
    t.skip("Cloudflare D1's daily free-tier row quota is exhausted; the Worker returned its explicit recoverable quota response.");
    return;
  }
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


test("PeachJobs live search filters work independently on indexed listings", async (t) => {
  const baseline = await getJson("/v1/jobs?days=30&page=1&limit=50");
  if (baseline.quotaExceeded) {
    t.skip("Cloudflare D1's daily free-tier row quota is exhausted; live filter checks resume when the daily quota resets.");
    return;
  }
  assert.ok(baseline.results.length > 0, "No indexed jobs available for live filter checks");

  const sameJob = (left, right) =>
    left.ats === right.ats &&
    left.board_key === right.board_key &&
    left.external_id === right.external_id;

  const textSample = baseline.results.find(job => job.title && job.company);
  assert.ok(textSample, "No title/company sample is available");
  const companyToken = (textSample.company.match(/[A-Za-z0-9]+/) || [])[0];
  const titleToken = (textSample.title.match(/[A-Za-z0-9]+/) || [])[0];
  assert.ok(companyToken && titleToken, "Could not build a text-search sample");
  const textParams = new URLSearchParams({
    q: companyToken + " " + titleToken,
    days: "30", page: "1", limit: "50"
  });
  const textResult = await getJson("/v1/jobs?" + textParams);
  if (textResult.quotaExceeded) { t.skip("D1's daily read allowance was exhausted during live filter tests."); return; }
  assert.ok(
    textResult.results.some(job => sameJob(job, textSample)),
    "Keyword search did not find the sampled job across employer and title fields"
  );

  const locationSample = baseline.results.find(job => job.location && job.location.includes(","));
  assert.ok(locationSample, "No comma-separated location sample is available");
  const locationParams = new URLSearchParams({
    location: locationSample.location.replace(/[,;]/g, " "),
    days: "30", page: "1", limit: "50"
  });
  const locationResult = await getJson("/v1/jobs?" + locationParams);
  if (locationResult.quotaExceeded) { t.skip("D1's daily read allowance was exhausted during live filter tests."); return; }
  assert.ok(
    locationResult.results.some(job => sameJob(job, locationSample)),
    "Location search did not match the words in a comma-separated indexed location"
  );

  const remoteValues = [...new Set(
    baseline.results.map(job => job.remote_status)
      .filter(value => ["remote", "hybrid", "onsite"].includes(value))
  )];
  for (const remote of remoteValues) {
    const data = await getJson("/v1/jobs?" + new URLSearchParams({
      remote, days: "30", page: "1", limit: "50"
    }));
    if (data.quotaExceeded) { t.skip("D1's daily read allowance was exhausted during live filter tests."); return; }
    assert.ok(data.total > 0, "Remote filter returned no jobs for " + remote);
    assert.ok(data.results.every(job => job.remote_status === remote),
      "Remote filter returned a different work arrangement for " + remote);
  }

  const typeAliases = {
    full: ["full"],
    part: ["part"],
    contract: ["contract"],
    intern: ["intern"],
    temporary: ["temporary", "temp"]
  };
  for (const [filter, aliases] of Object.entries(typeAliases)) {
    const expected = baseline.results.some(job =>
      aliases.some(alias => String(job.employment_type || "").toLowerCase().includes(alias))
    );
    if (!expected) continue;
    const data = await getJson("/v1/jobs?" + new URLSearchParams({
      type: filter, days: "30", page: "1", limit: "50"
    }));
    if (data.quotaExceeded) { t.skip("D1's daily read allowance was exhausted during live filter tests."); return; }
    assert.ok(data.total > 0, "Employment type filter returned no jobs for " + filter);
    assert.ok(data.results.every(job =>
      String(job.employment_type || "").toLowerCase().includes(filter === "temporary" ? "temp" : filter)
    ), "Employment type filter returned an unrelated type for " + filter);
  }
});
