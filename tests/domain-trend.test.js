"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

test("Domain Trend Analyzer public page exposes snapshot trends and local naming analysis",()=>{
 const page=read("public/tools/domain-trend-analyzer/index.html");
 const script=read("public/js/domain-trend-analyzer.js");
 const css=read("public/css/domain-trend-analyzer.css");
 for(const id of ["dt-period","dt-total-new","dt-total-removed","dt-top-tld","dt-top-category","dt-volume-chart","dt-tld-chart","dt-movement-table","dt-category-chart","dt-category-movement","dt-history-table","dt-analyse-names","dt-pattern-results","dt-keyword-chart","dt-industry-chart"])assert.ok(page.includes('id="'+id+'"'),"missing "+id);
 assert.match(page,/applicationCategory/);
 assert.match(page,/no AI credits/i);
 assert.match(script,/\/v1\/trends\?days=/);
 assert.match(script,/indexedDB\.open/);
 assert.match(script,/DecompressionStream\("gzip"\)/);
 assert.match(script,/addDomainToPatterns/);
 assert.match(script,/aggregateCategories/);
 assert.match(script,/renderCategoryMovement/);
 assert.match(script,/AI & machine learning/);
 assert.match(script,/Nonprofit & community/);
 assert.doesNotMatch(script,/api\.deepseek\.com|DEEPSEEK_API_KEY/);
 assert.match(css,/dt-volume-chart/);
 assert.match(css,/dt-pattern-grid/);
});

test("Public and workspace tool catalogues include Domain Trend Analyzer",()=>{
 const publicTools=read("public/tools/index.html");
 const dashboardTools=read("public/dashboard/tools/index.html");
 assert.match(publicTools,/Domain Trend Analyzer/);
 assert.match(publicTools,/numberOfItems":8/);
 assert.match(dashboardTools,/Domain Trend Analyzer/);
});
