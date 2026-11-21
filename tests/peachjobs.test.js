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
  assert.match(html, /<title>PeachJobs \| Search Jobs Published in the Last 30 Days/);
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
  assert.match(js, /if\(remote&&remote!=="any"\)p\.set\("remote",remote\)/);
  assert.match(js, /if\(type\)p\.set\("type",type\)/);
  assert.match(js, /pj-search-diagnostic/);
  assert.match(js, /searchRequest/);
  assert.doesNotMatch(js, /first Cloudflare collection/);
  assert.match(read("public/tools/peachjobs/index.html"), /peachjobs\.js\?v=3/);
  assert.doesNotMatch(js, /render\.com|supabase/i);
});

test("PeachJobs is linked from public and workspace tool directories and the sitemap", () => {
  const directory = read("public/tools/index.html");
  const workspace = read("public/dashboard/tools/index.html");
  const sitemap = read("public/sitemap.xml");
  assert.match(directory, /"numberOfItems":8/);
  assert.match(directory, /href="\/tools\/peachjobs\//);
  assert.match(workspace, /href="\/tools\/peachjobs\//);
  assert.match(sitemap, /https:\/\/teampeach\.org\/tools\/peachjobs\//);
});
