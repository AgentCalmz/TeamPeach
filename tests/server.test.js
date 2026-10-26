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
 for(const route of ["/","/journal/what-is-an-ai-agent/","/tools/seo-content-brief/","/register/","/verify-email/","/login/","/forgot-password/","/dashboard/","/account/","/admin/","/unsubscribe/"]){
  const response=await fetch(base+route);
  assert.equal(response.status,200,"expected 200 for "+route);
  assert.match(response.headers.get("content-type")||"",/text\/html/);
  const html=await response.text();
  if(route==="/account/"||route==="/admin/"||route==="/dashboard/")assert.match(html,/noindex,nofollow/);
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
 assert.equal(Object.hasOwn(body,"emailTransport"),true);
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


test("email delivery prefers Brevo HTTPS API when configured and retains SMTP fallback",function(){
 const fs=require("node:fs");
 const path=require("node:path");
 const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
 const env=fs.readFileSync(path.join(__dirname,"..",".env.example"),"utf8");
 assert.match(server,/require\("nodemailer"\)/);
 assert.match(server,/BREVO_API_KEY/);
 assert.match(server,/function emailTransportMode\(\)/);
 assert.match(server,/requested==="smtp"\|\|requested==="brevo-api"/);
 assert.match(server,/emailTransportMode\(\)==="brevo-api"/);
 assert.match(server,/https:\/\/api\.brevo\.com\/v3\/smtp\/email/);
 assert.match(server,/"api-key":/);
 assert.match(server,/function smtpReady\(\)/);
 assert.match(server,/SMTP_HOST/);
 assert.match(server,/SMTP_PORT/);
 assert.match(server,/SMTP_USER/);
 assert.match(server,/SMTP_PASS/);
 assert.match(env,/BREVO_API_KEY=/);
 assert.match(env,/EMAIL_TRANSPORT=smtp/);
 assert.match(env,/SMTP_PORT=2525/);
 assert.match(env,/SMTP_HOST=smtp-relay\.brevo\.com/);
 assert.match(env,/SMTP_PASS=REPLACE_WITH_YOUR_BREVO_SMTP_KEY/);
 assert.doesNotMatch(env,/BREVO_MARKETING_LIST_ID|BREVO_WEBHOOK_TOKEN/);
});

test("email broadcasts include signed unsubscribe handling and re-check opt-in",function(){
 const fs=require("node:fs");
 const path=require("node:path");
 const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
 const sql=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","001_teampeach.sql"),"utf8");
 assert.match(server,/unsubscribeSignature/);
 assert.match(server,/List-Unsubscribe/);
 assert.match(server,/preference\.data\.marketing_opt_in!==true/);
 assert.match(server,/app\.post\("\/api\/unsubscribe"/);
 assert.match(sql,/j\.mode in\('single','system','broadcast'\)/);
});

test("workspace dashboard has scoped project/task APIs and a protected storage migration",function(){
 const fs=require("node:fs");
 const path=require("node:path");
 const server=fs.readFileSync(path.join(__dirname,"..","server.js"),"utf8");
 const migration=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","002_workspace_dashboard.sql"),"utf8");
 const dashboard=fs.readFileSync(path.join(__dirname,"..","public","dashboard","index.html"),"utf8");
 for(const route of [
  'app.get("/api/workspace"',
  'app.post("/api/workspace/projects"',
  'app.patch("/api/workspace/projects/:id"',
  'app.delete("/api/workspace/projects/:id"',
  'app.post("/api/workspace/tasks"',
  'app.patch("/api/workspace/tasks/:id"',
  'app.delete("/api/workspace/tasks/:id"'
 ])assert.ok(server.includes(route),"missing "+route);
 assert.match(server,/\.eq\("user_id",q\.user\.id\)/);
 assert.match(migration,/create table if not exists public\.tp_workspace_projects/);
 assert.match(migration,/create table if not exists public\.tp_workspace_tasks/);
 assert.match(migration,/alter table public\.tp_workspace_projects enable row level security/);
 assert.match(migration,/alter table public\.tp_workspace_tasks enable row level security/);
 assert.match(migration,/grant select, insert, update, delete on public\.tp_workspace_projects, public\.tp_workspace_tasks to service_role/);
 assert.match(dashboard,/id="projects-list"/);
 assert.match(dashboard,/id="tasks-list"/);
 assert.match(dashboard,/id="new-project-form"/);
 assert.match(dashboard,/id="new-task-form"/);
});

test("SEO content brief builder is interactive and states its current data limitations",function(){
 const fs=require("node:fs");
 const path=require("node:path");
 const html=fs.readFileSync(path.join(__dirname,"..","public","tools","seo-content-brief","index.html"),"utf8");
 const builder=fs.readFileSync(path.join(__dirname,"..","public","js","brief-builder.js"),"utf8");
 assert.match(html,/id="brief-form"/);
 assert.match(html,/id="brief-output"/);
 assert.match(html,/does not call an AI model or fetch live Google results yet/);
 assert.match(builder,/function buildBrief\(values\)/);
 assert.match(builder,/api\("\/api\/workspace\/projects","POST"/);
 assert.match(builder,/api\("\/api\/workspace\/projects\/"/);
 assert.match(builder,/Copy as Markdown/);
});
