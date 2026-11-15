"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("Business Radar has a dedicated, indexable public page with direct-answer metadata",()=>{
 const page=read("public/tools/business-radar/index.html");
 assert.match(page,/<title>Business Radar \| Discover and Research Business Opportunities \| TeamPeach<\/title>/);
 assert.match(page,/rel="canonical" href="https:\/\/teampeach\.org\/tools\/business-radar\//);
 assert.match(page,/name="robots" content="index,follow/);
 assert.match(page,/"@type":"WebApplication"/);
 assert.match(page,/"@type":"FAQPage"/);
 assert.match(page,/What is TeamPeach Business Radar\?/);
 assert.match(page,/does not prove a company has launched/);
 assert.match(page,/Webamon public newly observed domain dataset/);
});

test("Standalone Business Radar reuses the existing browser feed and bounded AI research flow",()=>{
 const page=read("public/tools/business-radar/index.html");
 const script=read("public/js/domain-intelligence.js");
 for(const id of ["di-load-domains","di-ai-criteria","di-ai-search","di-ai-search-results","di-ai-run","di-ai-results","di-explorer-results","di-pagination"])assert.ok(page.includes('id="'+id+'"'),"missing "+id);
 assert.match(page,/domain-intelligence\.js\?v=5/);
 assert.match(script,/\/v1\/new-domains/);
 assert.match(script,/indexedDB\.open/);
 assert.match(script,/collectIntentCandidates/);
 assert.match(script,/slice\(0,80\)/);
 assert.match(script,/\/api\/tools\/domain-intelligence\/intent-search/);
 assert.match(script,/\/api\/tools\/domain-intelligence\/research/);
 assert.match(script,/selectedDomains\.size>=5/);
 assert.match(script,/teampeach-business-radar-research\.csv/);
});

test("Business Radar is discoverable from public and signed-in tool catalogues",()=>{
 const publicTools=read("public/tools/index.html");
 const workspace=read("public/dashboard/tools/index.html");
 assert.match(publicTools,/Business Radar/);
 assert.match(publicTools,/href="\/tools\/business-radar\//);
 assert.match(publicTools,/numberOfItems":7/);
 assert.match(workspace,/Business Radar/);
 assert.match(workspace,/href="\/tools\/business-radar\//);
});

test("Business Radar is included in both checked-in sitemaps",()=>{
 for(const file of ["public/sitemap.xml","sitemap.xml"])assert.match(read(file),/https:\/\/teampeach\.org\/tools\/business-radar\//);
});
