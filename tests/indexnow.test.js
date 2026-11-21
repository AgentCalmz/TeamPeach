"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {decodeXml,parseSitemapUrls,pageUrlFromFile,urlsForChanges,getIndexNowKey,isAcceptedIndexNowStatus}=require("../scripts/submit-indexnow");

test("IndexNow converts public HTML files to canonical TeamPeach URLs",()=>{
 assert.equal(pageUrlFromFile("public/index.html"),"https://teampeach.org/");
 assert.equal(pageUrlFromFile("public/tools/peachjobs/index.html"),"https://teampeach.org/tools/peachjobs/");
 assert.equal(pageUrlFromFile("public/journal/choosing-an-ai-tool/index.html"),"https://teampeach.org/journal/choosing-an-ai-tool/");
 assert.equal(pageUrlFromFile("public/dashboard/index.html"),null);
 assert.equal(pageUrlFromFile("public/js/main.js"),null);
});
test("IndexNow refreshes collection pages and preserves deleted public URLs",()=>{
 const urls=urlsForChanges(["public/tools/peachjobs/index.html","public/tools/retired-tool/index.html"],"",false);
 assert.deepEqual(urls,["https://teampeach.org/tools/peachjobs/","https://teampeach.org/tools/","https://teampeach.org/tools/retired-tool/"]);
});
test("XML entities are decoded once so nested entity text is not reinterpreted",()=>{
 assert.equal(decodeXml("&amp;lt;"),"&lt;");
 assert.equal(decodeXml("&lt;"),"<");
});
test("IndexNow uses only same-host URLs from the sitemap",()=>{
 const urls=parseSitemapUrls('<url><loc>https://teampeach.org/tools/</loc></url><url><loc>https://evil.example/spam</loc></url><url><loc>not-a-url</loc></url>');
 assert.deepEqual(urls,["https://teampeach.org/tools/"]);
});
test("IndexNow key file matches the public verification filename",()=>{
 const key=getIndexNowKey();
 const fs=require("node:fs"),path=require("node:path");
 const contents=fs.readFileSync(path.join(__dirname,"..","public",key+".txt"),"utf8").trim();
 assert.match(key,/^[A-Za-z0-9-]{8,128}$/);
 assert.equal(contents,key);
});
test("sitemap or robots updates trigger a full sitemap notification",()=>{
 const sitemap='<urlset><url><loc>https://teampeach.org/tools/</loc></url><url><loc>https://teampeach.org/products/</loc></url></urlset>';
 const urls=urlsForChanges(["public/robots.txt"],sitemap,false);
 assert.deepEqual(urls,["https://teampeach.org/tools/","https://teampeach.org/products/"]);
});

test("HTTP 202 is an accepted IndexNow response while key verification is pending",()=>{
 assert.equal(isAcceptedIndexNowStatus(200),true);
 assert.equal(isAcceptedIndexNowStatus(202),true);
 assert.equal(isAcceptedIndexNowStatus(400),false);
 assert.equal(isAcceptedIndexNowStatus(403),false);
});
