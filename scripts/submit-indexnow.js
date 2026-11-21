"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const SITE_ORIGIN = "https://teampeach.org";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const SITEMAP_PATH = path.join(PUBLIC_DIR, "sitemap.xml");
const PRIVATE_ROOTS = new Set(["account","admin","assistant","chatbot-preview","dashboard","forgot-password","login","register","unsubscribe","verify-email"]);

function decodeXml(value) {
 const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
 return value.replace(/&(amp|lt|gt|quot|apos);/g, entity => entities[entity] || entity);
}
function parseSitemapUrls(xml) {
 const urls=[];
 for(const match of String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)){
  const value=decodeXml(match[1].trim());
  try { const url=new URL(value); if(url.origin===SITE_ORIGIN)urls.push(url.toString()); } catch {}
 }
 return [...new Set(urls)];
}
function pageUrlFromFile(filePath) {
 const file=String(filePath||"").replace(/\\/g,"/").replace(/^\.\/+/,"");
 if(!file.startsWith("public/")||!file.toLowerCase().endsWith(".html"))return null;
 const relative=file.slice("public/".length);
 let route;
 if(relative==="index.html")route="/";
 else if(relative.endsWith("/index.html"))route="/"+relative.slice(0,-"index.html".length);
 else route="/"+relative;
 const firstSegment=route.split("/").filter(Boolean)[0];
 if(PRIVATE_ROOTS.has(firstSegment))return null;
 return new URL(route,SITE_ORIGIN).toString();
}
function urlsForChanges(changedFiles,sitemapXml,forceSitemap=false) {
 const files=Array.isArray(changedFiles)?changedFiles:[];
 const refreshSitemap=forceSitemap||files.some(file=>["public/sitemap.xml","sitemap.xml","public/robots.txt","scripts/generate-sitemap.js","scripts/submit-indexnow.js",".github/workflows/indexnow.yml"].includes(String(file).replace(/\\/g,"/")));
 const urls=new Set(refreshSitemap?parseSitemapUrls(sitemapXml):[]);
 for(const file of files){
  const url=pageUrlFromFile(file);
  if(!url)continue;
  urls.add(url);
  const pathname=new URL(url).pathname;
  if(pathname.startsWith("/tools/"))urls.add(new URL("/tools/",SITE_ORIGIN).toString());
  if(pathname.startsWith("/journal/"))urls.add(new URL("/journal/",SITE_ORIGIN).toString());
  if(pathname.startsWith("/products/"))urls.add(new URL("/products/",SITE_ORIGIN).toString());
 }
 return [...urls];
}
function getIndexNowKey() {
 const candidates=fs.readdirSync(PUBLIC_DIR).filter(name=>/^[A-Za-z0-9-]{8,128}\.txt$/.test(name));
 const valid=candidates.filter(name=>fs.readFileSync(path.join(PUBLIC_DIR,name),"utf8").trim()===name.slice(0,-4));
 if(valid.length!==1)throw new Error("Expected exactly one valid IndexNow key file in public/.");
 return valid[0].slice(0,-4);
}
function readChangedFiles() {
 const before=process.env.INDEXNOW_BASE_SHA||"",head=process.env.INDEXNOW_HEAD_SHA||"";
 if(process.env.INDEXNOW_FULL_SITEMAP==="true"||!before||!head||/^0+$/.test(before))return {files:[],forceSitemap:true};
 const output=execFileSync("git",["diff","--name-only",before,head],{encoding:"utf8"});
 return {files:output.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),forceSitemap:false};
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitForKeyFile(key) {
 const keyUrl=new URL("/"+key+".txt",SITE_ORIGIN).toString(),attempts=20;
 for(let attempt=1;attempt<=attempts;attempt++){
  try{
   const response=await fetch(keyUrl,{signal:AbortSignal.timeout(10000),cache:"no-store"});
   if(response.ok&&(await response.text()).trim()===key){console.log("IndexNow key file is live on TeamPeach.");return keyUrl;}
   console.log("Waiting for the TeamPeach deployment to publish the IndexNow key file ("+attempt+"/"+attempts+").");
  }catch(error){console.log("Waiting for the TeamPeach deployment ("+attempt+"/"+attempts+"): "+error.message);}
  if(attempt<attempts)await sleep(15000);
 }
 throw new Error("The IndexNow key file did not become publicly available. Check the TeamPeach deployment.");
}
function isAcceptedIndexNowStatus(status) { return status===200 || status===202; }
async function submitUrls(urls,key,keyLocation) {
 const batchSize=10000;
 for(let offset=0;offset<urls.length;offset+=batchSize){
  const batch=urls.slice(offset,offset+batchSize);
  const response=await fetch(INDEXNOW_ENDPOINT,{
   method:"POST",
   headers:{"content-type":"application/json; charset=utf-8"},
   body:JSON.stringify({host:new URL(SITE_ORIGIN).host,key,keyLocation,urlList:batch}),
   signal:AbortSignal.timeout(30000)
  });
  const responseText=await response.text();
  if(!isAcceptedIndexNowStatus(response.status))throw new Error("IndexNow rejected the URL batch (HTTP "+response.status+"): "+responseText.slice(0,500));
  if(response.status===202)console.log("IndexNow received "+batch.length+" URL(s); key verification is pending.");
  else console.log("IndexNow accepted "+batch.length+" URL(s).");
 }
}
async function main() {
 const key=getIndexNowKey(),{files,forceSitemap}=readChangedFiles();
 const sitemapXml=fs.readFileSync(SITEMAP_PATH,"utf8"),urls=urlsForChanges(files,sitemapXml,forceSitemap);
 if(!urls.length){console.log("No public landing pages changed; no IndexNow submission is needed.");return;}
 const keyLocation=await waitForKeyFile(key);
 console.log("Submitting "+urls.length+" TeamPeach URL(s) to IndexNow.");
 await submitUrls(urls,key,keyLocation);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={decodeXml,parseSitemapUrls,pageUrlFromFile,urlsForChanges,getIndexNowKey,isAcceptedIndexNowStatus};
