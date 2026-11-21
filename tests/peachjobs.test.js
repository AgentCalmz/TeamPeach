"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("PeachJobs page is discoverable and declares the 30-day employer-sourced product", () => {
  const html = read("public/tools/peachjobs/index.html");
  assert.match(html, /<title>PeachJobs: Recent Employer-Posted Jobs \| TeamPeach/);
  assert.match(html, /rel="canonical" href="https:\/\/teampeach\.org\/tools\/peachjobs\//);
  assert.match(html, /"name":"PeachJobs"/);
  assert.match(html, /public job-posting APIs used by employer career pages/);
  assert.match(html, /does not collect resumes or submit applications/i);
});

test("PeachJobs browser script is valid JavaScript and uses the existing Cloudflare Worker", () => {
  const js = read("public/js/peachjobs.js");
  assert.doesNotThrow(() => new vm.Script(js));
  assert.match(js, /teampeach-domain-api\.creatorletofficial\.workers\.dev/);
  assert.match(js, /\/v1\/jobs\?/);
  assert.match(js, /\/v1\/jobs\/stats/);
  assert.match(js, /attempt<2/);
  assert.match(js, /filters\.remote&&filters\.remote!=="any"/);
  assert.match(js, /if\(filters\.type\)params\.set\("type",filters\.type\)/);
  assert.match(js, /pj-search-diagnostic/);
  assert.match(js, /searchRequest/);
  assert.match(js, /pj-clear-filters/);
  assert.match(js, /pj-filter-chips/);
  assert.match(js, /addEventListener\("change"/);
  assert.match(js, /setTimeout\(\(\)=>search\(false\),450\)/);
  assert.match(read("public/tools/peachjobs/index.html"), /pj-filter-panel/);
  assert.match(read("public/tools/peachjobs/index.html"), /id="pj-result-count"/);
  assert.match(read("public/tools/peachjobs/index.html"), /peachjobs\.css\?v=3/);
  assert.doesNotMatch(js, /first Cloudflare collection/);
  assert.match(read("public/tools/peachjobs/index.html"), /peachjobs\.js\?v=4/);
  assert.doesNotMatch(js, /render\.com|supabase/i);
});

test("PeachJobs is linked from public and workspace tool directories and the sitemap", () => {
  const directory = read("public/tools/index.html");
  const workspace = read("public/dashboard/tools/index.html");
  const sitemap = read("public/sitemap.xml");
  assert.match(directory, /"numberOfItems"\s*:\s*8/);
  assert.match(directory, /href="\/tools\/peachjobs\//);
  assert.match(workspace, /href="\/tools\/peachjobs\//);
  assert.match(sitemap, /https:\/\/teampeach\.org\/tools\/peachjobs\//);
});
