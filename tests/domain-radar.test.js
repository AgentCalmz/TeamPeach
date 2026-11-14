"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("Domain Intelligence exposes website evidence and Premium Business Radar controls",()=>{
 const page=read("public/tools/domain-intelligence/index.html");
 const script=read("public/js/domain-intelligence.js");
 const css=read("public/css/domain-intelligence.css");
 for(const id of ["di-site-filter","di-start-filter","di-ai-criteria","di-ai-search","di-ai-search-results","di-ai-run","di-ai-results","di-selection-count"])assert.ok(page.includes('id="'+id+'"'),"missing "+id);
 assert.match(page,/PREMIUM BUSINESS RADAR/i);
 assert.match(page,/active TeamPeach membership/i);
 assert.match(script,/\/v1\/site-check/);
 assert.match(script,/\/api\/tools\/domain-intelligence\/intent-search/);
 assert.match(script,/\/api\/tools\/domain-intelligence\/research/);
 assert.match(script,/indexedDB\.open/);
 assert.match(script,/scheduleVisibleSiteChecks\(pageItems\)/);
 assert.match(script,/SITE_CHECK_CONCURRENCY=2/);
 assert.match(script,/collectIntentCandidates/);
 assert.match(script,/selectedDomains\.size>=5/);
 assert.match(script,/Download CSV/);
 assert.match(css,/di-website-working/);
 assert.match(css,/di-ai-intent-select/);
 assert.match(css,/di-ai-result-card/);
});

test("Premium Business Radar requires membership and charges credits only after valid AI output",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.post("/api/tools/domain-intelligence/research"');
 const end=server.indexOf('app.post("/api/commerce/subscription/cancel"',start);
 assert.ok(start>=0&&end>start,"Premium research route should exist");
 const route=server.slice(start,end);
 assert.match(route,/chatbotMemberActive\(q\.user\.id\)/);
 assert.match(route,/tp_credit_balance/);
 assert.match(route,/api\.deepseek\.com\/chat\/completions/);
 assert.match(route,/tp_credit_apply/);
 assert.ok(route.indexOf("tp_credit_apply")>route.indexOf("output-validation"),"credits must be charged after output validation");
 assert.match(route,/rawDomains\.length>5/);
 assert.match(route,/untrusted public page content/);
 assert.match(server,/homepageContent:cleanText\(data\.page_content\|\|data\.text_excerpt,8000\)/);
 assert.match(route,/full-site crawl/);
 assert.match(route,/No credits were deducted/);
 assert.doesNotMatch(route,/insert\(|\.from\("tp_/,"research results should not require a new database table");
});


test("Premium intent search ranks a bounded browser-generated candidate set and charges after validation",()=>{
 const server=read("server.js");
 const start=server.indexOf('app.post("/api/tools/domain-intelligence/intent-search"');
 const end=server.indexOf('app.post("/api/tools/domain-intelligence/research"',start);
 assert.ok(start>=0&&end>start,"Premium intent-search route should exist before website research");
 const route=server.slice(start,end);
 assert.match(route,/chatbotMemberActive\(q\.user\.id\)/);
 assert.match(route,/rawCandidates\.length>80/);
 assert.match(route,/tp_credit_balance/);
 assert.match(route,/api\.deepseek\.com\/chat\/completions/);
 assert.match(route,/tp_credit_apply/);
 assert.ok(route.indexOf("tp_credit_apply")>route.indexOf("output-validation"),"intent-search credits must be charged after valid AI output");
 assert.doesNotMatch(route,/insert\(|\.from\("tp_/,"intent search must not require a new database table");
});

test("Domain Intelligence can load the compressed feed when the latest summary endpoint fails",()=>{
 const page=read("public/tools/domain-intelligence/index.html");
 const script=read("public/js/domain-intelligence.js");
 assert.match(page,/domain-intelligence\.js\?v=5/);
 assert.match(script,/return\{blob,cached:false,date:feedDate\}/);
 assert.match(script,/const requestedSnapshotDate=summary&&summary\.date\|\|""/);
 assert.match(script,/if\(!summary\|\|!summary\.date\)summary=\{date:snapshotDate\}/);
 assert.match(script,/The compressed domain feed can still be loaded separately/);
});
