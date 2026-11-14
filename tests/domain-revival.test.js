"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const Engine=require("../public/js/domain-revival-engine.js");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("Domain Revival normalises domains and extracts common compound suffixes",()=>{
 assert.equal(Engine.normalizeDomain(" HTTPS://WWW.Example.com.ng/ "),"www.example.com.ng");
 assert.equal(Engine.getNameLabel("shop.example.com.ng"),"example");
 assert.equal(Engine.getTld("example.com.ng"),"ng");
 assert.equal(Engine.normalizeDomain("not a domain"),"");
 assert.equal(Engine.normalizeDomain("https://user:pass@example.com"),"");
});

test("Domain Revival parses and deduplicates domain feed rows",()=>{
 const rows=Engine.parseLines("example.com\nEXAMPLE.com\nother.net\ninvalid value\n","dropped","2026-11-14");
 assert.equal(rows.length,2);
 assert.equal(rows[0].source,"dropped");
 assert.equal(rows[0].date,"2026-11-14");
 assert.ok(rows[0].score>=0&&rows[0].score<=100);
});

test("Domain Revival name signals reward concise names without claiming market value",()=>{
 assert.ok(Engine.scoreDomain("bright.com")>Engine.scoreDomain("a-very-long-name-with-234-numbers.xyz"));
 assert.equal(Engine.scoreDomain("invalid value"),0);
});

test("Domain Revival filters by keyword, TLD, minimum score and sorting",()=>{
 const rows=Engine.parseLines("bright.com\nbright.co.uk\nbluecloud.io\nbright.net\n","dropped","2026-11-14");
 const filtered=Engine.filterRows(rows,{term:"bright",tld:"com",minimumScore:0,sort:"score"});
 assert.equal(filtered.length,1);
 assert.equal(filtered[0].domain,"bright.com");
 assert.equal(Engine.filterRows(rows,{tld:"io"}).length,1);
 assert.equal(Engine.filterRows(rows,{sort:"shortest"})[0].name.length<=Engine.filterRows(rows,{sort:"name"})[0].name.length,true);
});

test("Domain Revival page wires the lifecycle feeds, archive and RDAP research links",()=>{
 const page=read("public/tools/domain-revival/index.html");
 const script=read("public/js/domain-revival.js");
 const css=read("public/css/domain-revival.css");
 const catalogue=read("public/tools/index.html");
 const dashboard=read("public/dashboard/tools/index.html");
 for(const id of ["dr-source","dr-keyword","dr-tld","dr-min-score","dr-sort","dr-load","dr-export","dr-results","dr-status"])assert.ok(page.includes('id="'+id+'"'),"missing "+id);
 assert.match(page,/Wayback Machine/);
 assert.match(script,/\/v1\/revival-domains\?source=/);
 assert.match(script,/indexedDB\.open/);
 assert.match(script,/DecompressionStream\("gzip"\)/);
 assert.match(script,/web\.archive\.org/);
 assert.match(script,/rdap\.org\/domain/);
 assert.match(script,/filterRows/);
 assert.match(css,/dr-result-card/);
 assert.match(catalogue,/Domain Revival/);
 assert.match(catalogue,/numberOfItems":6/);
 assert.match(dashboard,/\/tools\/domain-revival\//);
});

test("Domain Revival browser scripts parse successfully",()=>{
 new vm.Script(read("public/js/domain-revival-engine.js"));
 new vm.Script(read("public/js/domain-revival.js"));
});