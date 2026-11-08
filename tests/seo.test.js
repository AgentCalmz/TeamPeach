"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=relative=>fs.readFileSync(path.join(root,relative),"utf8");

const indexablePages=[
 ["public/index.html","https://teampeach.org/"],
 ["public/tools/index.html","https://teampeach.org/tools/"],
 ["public/tools/peachchat/index.html","https://teampeach.org/tools/peachchat/"],
 ["public/tools/peachbrief/index.html","https://teampeach.org/tools/peachbrief/"],
 ["public/products/index.html","https://teampeach.org/products/"],
 ["public/journal/index.html","https://teampeach.org/journal/"],
 ["public/journal/what-is-an-ai-agent/index.html","https://teampeach.org/journal/what-is-an-ai-agent/"],
 ["public/journal/choosing-an-ai-tool/index.html","https://teampeach.org/journal/choosing-an-ai-tool/"],
 ["public/journal/business-tasks-worth-automating/index.html","https://teampeach.org/journal/business-tasks-worth-automating/"]
];

test("every static indexable landing page has canonical, descriptive and share metadata",()=>{
 for(const [file,canonical] of indexablePages){
  const html=read(file),head=(html.match(/<head[\s\S]*?<\/head>/i)||[])[0]||"";
  assert.match(head,/<title>[^<]{12,}<\/title>/i,file+" needs a descriptive title");
  assert.match(head,/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{50,200}["']/i,file+" needs a useful meta description");
  assert.ok(head.includes('<link rel="canonical" href="'+canonical+'">'),file+" canonical mismatch");
  assert.match(head,/<meta[^>]+name=["']robots["'][^>]+content=["']index,follow/i,file+" must remain indexable");
  assert.match(head,/property=["']og:title["']/i,file+" needs Open Graph title");
  assert.match(head,/property=["']og:description["']/i,file+" needs Open Graph description");
  assert.match(head,/property=["']og:url["']/i,file+" needs Open Graph URL");
  assert.match(head,/property=["']og:image["']/i,file+" needs Open Graph image");
  assert.match(head,/name=["']twitter:card["']/i,file+" needs Twitter card metadata");
  assert.match(head,/name=["']twitter:image["']/i,file+" needs Twitter image metadata");
  assert.equal([...html.matchAll(/<h1[ >]/gi)].length,1,file+" should have one primary H1");
  const schemas=[...head.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(schemas.length>0,file+" needs structured data");
  for(const match of schemas)assert.doesNotThrow(()=>JSON.parse(match[1]),file+" contains invalid JSON-LD");
 }
});

test("sitemap lists canonical public pages and omits legacy, private and noindex routes",()=>{
 const sitemap=read("public/sitemap.xml"),rootSitemap=read("sitemap.xml");
 assert.equal(sitemap,rootSitemap,"root and public sitemaps should stay in sync");
 for(const [,url] of indexablePages){
  const pathOnly=url.replace("https://teampeach.org","");
  assert.ok(sitemap.includes("<loc>"+url+"</loc>"),"missing "+pathOnly);
 }
 assert.doesNotMatch(sitemap,/seo-content-brief|ai-chatbot|\/(?:api|admin|dashboard|account|login|register|verify-email|forgot-password|unsubscribe)\//i);
});

test("robots rules expose the public site to Google, Bing and OpenAI search discovery",()=>{
 for(const file of ["robots.txt","public/robots.txt"]){
  const robots=read(file);
  for(const agent of ["*","Bingbot","OAI-SearchBot"]){
   const group=robots.split(/\n(?=User-agent:)/i).find(section=>section.split("\n",1)[0]==="User-agent: "+agent);
   assert.ok(group,"missing "+agent+" group in "+file);
   assert.match(group,/Allow: \//);
   for(const route of ["/tools/","/products/","/journal/"])assert.ok(group.includes("Allow: "+route),agent+" should be allowed to crawl "+route);
   for(const route of ["/api/","/admin/","/dashboard/","/account/","/login/","/register/","/verify-email/","/forgot-password/","/unsubscribe/"])assert.ok(group.includes("Disallow: "+route),agent+" should not crawl "+route);
  }
  assert.ok(robots.includes("Sitemap: https://teampeach.org/sitemap.xml"));
 }
});

test("private utility pages stay noindex and legacy product URLs consolidate to canonical pages",()=>{
 const privatePages=[
  "public/account/index.html","public/admin/index.html","public/admin/login/index.html",
  "public/dashboard/index.html","public/dashboard/tools/index.html","public/login/index.html",
  "public/register/index.html","public/forgot-password/index.html","public/verify-email/index.html",
  "public/unsubscribe/index.html","public/assistant/index.html","public/chatbot-preview/index.html"
 ];
 for(const file of privatePages)assert.match(read(file),/name=["']robots["'] content=["']noindex,nofollow["']/i,file+" should stay out of search");
 const peachchatOld=read("public/tools/ai-chatbot/index.html");
 const peachbriefOld=read("public/tools/seo-content-brief/index.html");
 assert.match(peachchatOld,/noindex,follow/);
 assert.match(peachbriefOld,/noindex,follow/);
 assert.ok(peachchatOld.includes('rel="canonical" href="https://teampeach.org/tools/peachchat/"'));
 assert.ok(peachbriefOld.includes('rel="canonical" href="https://teampeach.org/tools/peachbrief/"'));
 const server=read("server.js");
 assert.ok(server.includes('app.get(/^\\/tools\\/ai-chatbot'));
 assert.ok(server.includes('app.get(/^\\/tools\\/seo-content-brief'));
});
