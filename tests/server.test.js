"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const { once }=require("node:events");
const { app }=require("../server");

test("web service exposes clean public URLs and hides .html extensions",async t=>{
 const server=app.listen(0,"127.0.0.1");
 await once(server,"listening");
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base="http://127.0.0.1:"+server.address().port;
 for(const route of ["/","/journal/what-is-an-ai-agent/","/tools/seo-content-brief/","/register/","/verify-email/","/login/","/forgot-password/","/account/","/admin/","/unsubscribe/"]){
  const response=await fetch(base+route);
  assert.equal(response.status,200,"expected 200 for "+route);
  assert.match(response.headers.get("content-type")||"",/text\/html/);
  const html=await response.text();
  if(route==="/account/"||route==="/admin/")assert.match(html,/noindex,nofollow/);
 }
 const old=await fetch(base+"/register/index.html",{redirect:"manual"});
 assert.equal(old.status,301);
 assert.equal(old.headers.get("location"),"/register/");
 const health=await fetch(base+"/api/health");
 assert.ok([200,503].includes(health.status));
 assert.equal(health.headers.get("cache-control"),"no-store");
 const body=await health.json();
 assert.ok(["ready","degraded"].includes(body.status));
 assert.equal(Object.hasOwn(body,"SUPABASE_SERVICE_ROLE_KEY"),false);
 const missing=await fetch(base+"/does-not-exist/");
 assert.equal(missing.status,404);
});

test("CSP blocks inline executable scripts",async t=>{
 const server=app.listen(0,"127.0.0.1");
 await once(server,"listening");
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch("http://127.0.0.1:"+server.address().port+"/");
 const policy=response.headers.get("content-security-policy")||"";
 assert.match(policy,/script-src 'self'/);
 assert.doesNotMatch(policy,/script-src[^;]*unsafe-inline/);
});


test("Brevo webhook never accepts a token in the query string",async t=>{
 const server=app.listen(0,"127.0.0.1");
 await once(server,"listening");
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch("http://127.0.0.1:"+server.address().port+"/api/webhooks/brevo?token=not-a-real-secret",{
  method:"POST",headers:{"Content-Type":"application/json"},body:"{}"
 });
 assert.equal(response.status,401);
});
