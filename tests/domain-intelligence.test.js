"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("Domain Intelligence is limited to public domain discovery and lifecycle research",()=>{
 const page=read("public/tools/domain-intelligence/index.html");
 const script=read("public/js/domain-intelligence.js");
 for(const id of ["di-load-domains","di-new-search","di-start-filter","di-tld-filter","di-signal-filter","di-site-filter","di-explorer-results","di-search-form","di-result"])assert.ok(page.includes('id="'+id+'"'),"missing "+id);
 for(const id of ["di-ai-criteria","di-ai-search","di-ai-run","di-ai-search-results","di-ai-results"])assert.ok(!page.includes('id="'+id+'"'),"AI control remains: "+id);
 assert.doesNotMatch(page,/PREMIUM BUSINESS RADAR|Research selected websites|Select for AI|AI intent search and website research/i);
 assert.match(page,/Business Radar/);
 assert.match(page,/applicationCategory/);
 assert.match(page,/FAQPage/);
 assert.match(page,/AI-led business discovery/i);
 assert.match(script,/business-radar-ai-panel/);
 assert.doesNotMatch(page,/business-radar\.css/);
});

test("Business Radar retains AI intent search and selected-website research",()=>{
 const page=read("public/tools/business-radar/index.html");
 for(const id of ["di-ai-criteria","di-ai-search","di-ai-search-results","di-ai-run","di-ai-results"])assert.ok(page.includes('id="'+id+'"'),"Business Radar is missing "+id);
 assert.match(page,/Find relevant businesses by intent/);
 assert.match(page,/Research selected websites/);
 assert.match(page,/membership and available credits/i);
});

test("Domain Intelligence shared browser script parses successfully",()=>{
 new vm.Script(read("public/js/domain-intelligence.js"));
});
