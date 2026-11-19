"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const Engine=require("../public/js/brand-protection-engine.js");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("Brand Protection Monitor normalises names, official sites and multi-part suffixes",()=>{
 assert.equal(Engine.normalizeName("Team Peach"),"teampeach");
 assert.equal(Engine.normalizeHost("https://www.Example.com/path"),"example.com");
 assert.equal(Engine.getRegistrableLabel("store.example.co.uk"),"example");
 assert.equal(Engine.getRegistrableLabel("brand.com.ng"),"brand");
});

test("Brand Protection Monitor detects exact matches without claiming they are malicious",()=>{
 const brand=Engine.prepareBrand("Team Peach","teampeach.org");
 assert.deepEqual(Engine.analyseDomain("teampeach.org",[brand]),[]);
 const results=Engine.analyseDomain("teampeach.net",[brand]);
 assert.equal(results.length,1);
 assert.equal(results[0].matchType,"Exact brand-name match");
 assert.equal(results[0].priority,"Review");
 assert.match(results[0].reason,/authorised domain/i);
});

test("Brand Protection Monitor detects spelling variations and transposed characters",()=>{
 const brand=Engine.prepareBrand("Google","");
 const results=Engine.analyseDomain("googel.net",[brand]);
 assert.equal(results.length,1);
 assert.equal(results[0].matchType,"Possible spelling variation");
 assert.equal(results[0].priority,"High priority");
 assert.equal(Engine.damerauLevenshtein("googel","google",1),1);
});

test("Brand Protection Monitor detects lookalike digits and account-related wording",()=>{
 const brand=Engine.prepareBrand("TeamPeach","");
 const digit=Engine.analyseDomain("teamp3ach.net",[brand]);
 assert.equal(digit.length,1);
 assert.equal(digit[0].matchType,"Possible character substitution");
 const login=Engine.analyseDomain("teampeach-login.com",[brand]);
 assert.equal(login.length,1);
 assert.equal(login[0].priority,"High priority");
 assert.match(login[0].reason,/account access, verification or payments/i);
});

test("Brand Protection Monitor excludes the official domain and ignores unrelated domains",()=>{
 const brand=Engine.prepareBrand("Northstar Labs","northstarlabs.com");
 assert.deepEqual(Engine.analyseDomain("www.northstarlabs.com",[brand]),[]);
 assert.deepEqual(Engine.analyseDomain("unrelated-example.net",[brand]),[]);
});

test("Brand watchlist validates minimum names and official website inputs",()=>{
 assert.throws(()=>Engine.prepareBrand("AI",""),/at least four/i);
 assert.throws(()=>Engine.prepareBrand("Northstar","not a website"),/valid official website/i);
 assert.equal(Engine.prepareBrand("Northstar","northstar.io").officialDomain,"northstar.io");
});

test("Brand Protection Monitor page, local scripts and tool listings are present",()=>{
 const page=read("public/tools/brand-protection-monitor/index.html");
 const script=read("public/js/brand-protection-monitor.js");
 const engine=read("public/js/brand-protection-engine.js");
 const css=read("public/css/brand-protection-monitor.css");
 const catalogue=read("public/tools/index.html");
 const dashboard=read("public/dashboard/tools/index.html");
 for(const id of ["bp-brand-form","bp-brand-name","bp-official-domain","bp-watchlist","bp-run-scan","bp-results","bp-export","bp-priority-filter"])assert.ok(page.includes('id="'+id+'"'),"missing "+id);
 assert.match(page,/Your brand names stay in this browser/i);
 assert.match(page,/does not send email alerts/i);
 assert.match(script,/indexedDB\.open/);
 assert.match(script,/objectStoreNames\.contains\("siteChecks"\)/);
 assert.match(script,/localStorage/);
 assert.match(script,/\/v1\/new-domains/);
 assert.match(script,/Engine\.analyseDomain/);
 assert.doesNotMatch(script,/api\.deepseek\.com|DEEPSEEK_API_KEY|\/api\/tools\//);
 assert.match(engine,/damerauLevenshtein/);
 assert.match(css,/bp-result-card/);
 assert.match(catalogue,/numberOfItems":8/);
 assert.match(catalogue,/Brand Protection Monitor/);
 assert.match(dashboard,/\/tools\/brand-protection-monitor\//);
});

test("Brand Protection Monitor browser scripts parse successfully",()=>{
 new vm.Script(read("public/js/brand-protection-engine.js"));
 new vm.Script(read("public/js/brand-protection-monitor.js"));
});
