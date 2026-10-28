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
 for(const route of ["/","/journal/what-is-an-ai-agent/","/tools/seo-content-brief/","/register/","/verify-email/","/login/","/forgot-password/","/dashboard/","/dashboard/projects/","/dashboard/tasks/","/dashboard/tools/","/dashboard/billing/","/dashboard/support/","/account/","/admin/","/admin/login/","/admin/support/","/admin/products/","/admin/memberships/","/admin/credits/","/admin/customers/","/admin/fulfilment/","/admin/payments/","/admin/communications/","/unsubscribe/","/products/"]){
  const response=await fetch(base+route);
  assert.equal(response.status,200,"expected 200 for "+route);
  assert.match(response.headers.get("content-type")||"",/text\/html/);
  const html=await response.text();
  if(route==="/account/"||route.startsWith("/admin/")||route.startsWith("/dashboard/"))assert.match(html,/noindex,nofollow/);
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

test("administrator sign-in has a dedicated page and checks the allowlist",function(){
 const fs=require("node:fs"),path=require("node:path"),root=path.join(__dirname,"..");
 const html=fs.readFileSync(path.join(root,"public","admin","login","index.html"),"utf8");
 const client=fs.readFileSync(path.join(root,"public","js","admin-login.js"),"utf8");
 const shell=fs.readFileSync(path.join(root,"public","js","admin-shell.js"),"utf8");
 const customerLogin=fs.readFileSync(path.join(root,"public","login","index.html"),"utf8");
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(html,/id="admin-login-form"/);
 assert.ok(html.includes("/js/admin-login.js?v=1"));
 assert.ok(customerLogin.includes('href="/admin/login/"'));
 assert.ok(shell.includes("/admin/login/?next="));
 assert.ok(shell.includes("/admin/login/?denied=1&next="));
 assert.ok(client.includes('fetch("/api/auth/login"'));
 assert.ok(client.includes("account.isAdmin"));
 assert.ok(client.includes("ADMIN_EMAILS"));
 assert.doesNotThrow(()=>new Function(client));
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
 const projectsPage=fs.readFileSync(path.join(__dirname,"..","public","dashboard","projects","index.html"),"utf8");
 const tasksPage=fs.readFileSync(path.join(__dirname,"..","public","dashboard","tasks","index.html"),"utf8");
 const dashboardClient=fs.readFileSync(path.join(__dirname,"..","public","js","dashboard.js"),"utf8");
 const adminShell=fs.readFileSync(path.join(__dirname,"..","public","js","admin-shell.js"),"utf8");
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
 assert.ok(dashboard.includes('href="/dashboard/projects/"'));
 assert.ok(dashboard.includes('href="/dashboard/tasks/"'));
 assert.match(projectsPage,/id="projects-list"/);
 assert.match(projectsPage,/id="new-project-form"/);
 assert.match(tasksPage,/id="tasks-list"/);
 assert.match(tasksPage,/id="new-task-form"/);
 assert.match(dashboard,/id="workspace-admin-link"/);
 assert.ok(server.includes("isAdmin:q.isAdmin"));
 assert.ok(dashboardClient.includes("workspace.user&&workspace.user.isAdmin"));
 assert.ok(adminShell.includes("/api/auth/me"));
 assert.ok(dashboardClient.includes('request("/api/auth/me","GET")'));
 assert.ok(dashboardClient.indexOf('request("/api/auth/me","GET")')<dashboardClient.indexOf('request("/api/workspace","GET")'));
 assert.ok(dashboardClient.includes("const needsWorkspaceData=Boolean("));
 assert.ok(dashboardClient.includes("002_workspace_dashboard.sql"));
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
 assert.match(html,/id="copy-brief"/);
 assert.match(builder,/#copy-brief/);
 assert.match(builder,/navigator\.clipboard\.writeText\(toMarkdown\(currentBrief\)\)/);
});


test("in-dashboard support chat connects private user conversations to the admin inbox",function(){
 const fs=require("node:fs");
 const path=require("node:path");
 const root=path.join(__dirname,"..");
 const server=fs.readFileSync(path.join(root,"server.js"),"utf8");
 const migration=fs.readFileSync(path.join(root,"supabase","migrations","003_support_chat.sql"),"utf8");
 const dashboard=fs.readFileSync(path.join(root,"public","dashboard","index.html"),"utf8");
 const billingPage=fs.readFileSync(path.join(root,"public","dashboard","billing","index.html"),"utf8");
 const supportPage=fs.readFileSync(path.join(root,"public","dashboard","support","index.html"),"utf8");
 const admin=fs.readFileSync(path.join(root,"public","admin","index.html"),"utf8");
 const adminSupport=fs.readFileSync(path.join(root,"public","admin","support","index.html"),"utf8");
 const adminProducts=fs.readFileSync(path.join(root,"public","admin","products","index.html"),"utf8");
 const client=fs.readFileSync(path.join(root,"public","js","support-chat.js"),"utf8");
 for(const route of [
  'app.get("/api/support/conversations"',
  'app.post("/api/support/conversations"',
  'app.get("/api/support/conversations/:id/messages"',
  'app.post("/api/support/conversations/:id/messages"',
  'app.get("/api/admin/support/conversations"',
  'app.patch("/api/admin/support/conversations/:id/status"'
 ])assert.ok(server.includes(route),"missing "+route);
 assert.match(server,/conversationQuery=conversationQuery\.eq\("user_id",q\.user\.id\)/);
 assert.match(server,/app\.get\("\/api\/admin\/support\/conversations",authenticated,isAdmin/);
 assert.match(migration,/create table if not exists public\.tp_support_conversations/);
 assert.match(migration,/create table if not exists public\.tp_support_messages/);
 assert.match(migration,/alter table public\.tp_support_conversations enable row level security/);
 assert.match(migration,/alter table public\.tp_support_messages enable row level security/);
 assert.match(migration,/revoke all on public\.tp_support_conversations, public\.tp_support_messages from anon, authenticated/);
 assert.match(supportPage,/id="support-conversations"/);
 assert.match(supportPage,/id="support-reply-form"/);
 assert.match(supportPage,/id="support-unread-count"/);
 assert.match(adminSupport,/id="support-admin-list"/);
 assert.match(adminSupport,/id="support-admin-reply-form"/);
 assert.match(client,/bubble\.textContent=message\.body/);
 assert.match(client,/setInterval\(async\(\)=>/);
});


test("commerce schema, checkout verification, credit expiry, and dashboard UI are wired together",function(){
 const fs=require("node:fs"),path=require("node:path");
 const root=path.join(__dirname,"..");
 const server=fs.readFileSync(path.join(root,"server.js"),"utf8");
 const sql=fs.readFileSync(path.join(root,"supabase","migrations","004_commerce.sql"),"utf8");
 const usdMigration=fs.readFileSync(path.join(root,"supabase","migrations","005_usd_pricing.sql"),"utf8");
 const env=fs.readFileSync(path.join(root,".env.example"),"utf8");
 const dashboard=fs.readFileSync(path.join(root,"public","dashboard","index.html"),"utf8");
  const billingPage=fs.readFileSync(path.join(root,"public","dashboard","billing","index.html"),"utf8");
  const supportPage=fs.readFileSync(path.join(root,"public","dashboard","support","index.html"),"utf8");
  const adminSupport=fs.readFileSync(path.join(root,"public","admin","support","index.html"),"utf8");
  const adminProducts=fs.readFileSync(path.join(root,"public","admin","products","index.html"),"utf8");
 const admin=fs.readFileSync(path.join(root,"public","admin","index.html"),"utf8");
 const catalog=fs.readFileSync(path.join(root,"public","products","index.html"),"utf8");
 const client=fs.readFileSync(path.join(root,"public","js","commerce.js"),"utf8");
 const adminClient=fs.readFileSync(path.join(root,"public","js","admin-commerce.js"),"utf8");
 const productClient=fs.readFileSync(path.join(root,"public","js","catalog.js"),"utf8");
 const briefClient=fs.readFileSync(path.join(root,"public","js","brief-builder.js"),"utf8");
 for(const route of [
  'app.get("/api/commerce/catalog"',
  'app.get("/api/commerce/overview"',
  'app.post("/api/commerce/checkout"',
  'app.post("/api/commerce/verify-payment"',
  'app.post("/api/commerce/subscription/cancel"',
  'app.post("/api/commerce/tool-runs"',
  'app.post("/api/payments/webhooks/paystack"',
  'app.post("/api/payments/webhooks/flutterwave"',
  'app.get("/api/admin/commerce/catalog",authenticated,isAdmin',
  'app.post("/api/admin/commerce/users/:id/credits",csrf,authLimit,authenticated,isAdmin'
 ])assert.ok(server.includes(route),"missing commerce route");
 assert.ok(server.includes('String(data.status||"").toLowerCase()'));
 assert.ok(server.includes('String(data.tx_ref||"")'));
 assert.ok(server.includes("x-paystack-signature"));
 assert.ok(server.includes("flutterwave-signature"));
 assert.ok(server.includes("PAYMENT_MODE"));
 assert.ok(sql.includes("create table if not exists public.tp_credit_ledger"));
 assert.ok(sql.includes("create table if not exists public.tp_credit_buckets"));
 assert.ok(sql.includes("create table if not exists public.tp_credit_consumptions"));
 assert.ok(sql.includes("expires_at>now()"));
 assert.ok(sql.includes("order by (expires_at is null) asc,expires_at asc nulls last"));
 assert.ok(sql.includes("alter table public.tp_payments enable row level security"));
 assert.ok(sql.includes("revoke all on public.tp_products,public.tp_subscription_plans"));
 assert.ok(dashboard.includes('href="/dashboard/billing/"'));
 assert.ok(billingPage.includes('id="billing"'));
 assert.ok(billingPage.includes('id="commerce-runs"'));
 assert.ok(billingPage.includes("commerce.js?v=3"));
 assert.ok(supportPage.includes('id="support-chat"'));
 assert.ok(supportPage.includes("support-chat.js?v=2"));
 assert.ok(admin.includes('href="/admin/support/"'));
 assert.ok(admin.includes('href="/admin/products/"'));
 assert.ok(adminSupport.includes('id="support-admin-list"'));
 assert.ok(adminProducts.includes("admin-commerce.js?v=3"));
 assert.ok(catalog.includes('id="catalog-products"'));
 assert.ok(client.includes('api("/api/commerce/checkout","POST"'));
 assert.ok(adminClient.includes('api("/api/admin/commerce/plans","POST"'));
 assert.ok(productClient.includes('fetch("/api/commerce/catalog"'));
 assert.ok(briefClient.includes('api("/api/commerce/tool-runs","POST"'));
 assert.ok(env.includes("PAYMENT_MODE=test"));
 assert.ok(env.includes("PAYSTACK_SECRET_KEY="));
 assert.ok(env.includes("FLW_SECRET_KEY="));
 assert.ok(env.includes("FLW_SECRET_HASH="));
 assert.match(server,/let amountMinor=0,currency="USD"/);
 assert.ok(server.includes('currency:"USD"'));
 assert.ok(server.includes('currency!=="USD"'));
 assert.ok(server.includes("priceUsd"));
 assert.ok(!server.includes("priceNaira"));
 assert.ok(server.includes("amountMinor<200"));
 assert.ok(adminClient.includes("priceUsd"));
 assert.ok(!adminClient.includes("priceNaira"));
 assert.ok(usdMigration.includes("v_ngn_per_usd numeric := 1341.62"));
 assert.ok(usdMigration.includes("currency in"));
 assert.ok(usdMigration.includes("tp_subscriptions"));
 assert.ok(billingPage.includes("commerce.js?v=3"));
 assert.ok(catalog.includes("catalog.js?v=2"));
 assert.ok(adminProducts.includes("admin-commerce.js?v=3"));
 const dashboardClient=fs.readFileSync(path.join(root,"public","js","dashboard.js"),"utf8");
 const adminShell=fs.readFileSync(path.join(root,"public","js","admin-shell.js"),"utf8");
 const supportClient=fs.readFileSync(path.join(root,"public","js","support-chat.js"),"utf8");
 for(const source of [server,client,adminClient,productClient,briefClient,dashboardClient,adminShell,supportClient])assert.doesNotThrow(()=>new Function(source));
});


test("robots and sitemap expose the product catalogue but not private routes",async function(t){
 const fs=require("node:fs"),path=require("node:path"),root=path.join(__dirname,"..");
 const server=app.listen(0,"127.0.0.1");await once(server,"listening");t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base="http://127.0.0.1:"+server.address().port;
 const robots=fs.readFileSync(path.join(root,"public","robots.txt"),"utf8");
 const sitemap=fs.readFileSync(path.join(root,"public","sitemap.xml"),"utf8");
 const rootSitemap=fs.readFileSync(path.join(root,"sitemap.xml"),"utf8");
 assert.equal(rootSitemap,sitemap);
 assert.ok(robots.includes("Disallow: /api/"));
 assert.ok(robots.includes("Disallow: /admin/"));
 assert.ok(robots.includes("Disallow: /dashboard/"));
 assert.ok(robots.includes("Sitemap: https://teampeach.org/sitemap.xml"));
 assert.ok(sitemap.includes("<loc>https://teampeach.org/products/</loc>"));
 assert.ok(!sitemap.includes("https://teampeach.org/admin/"));
 assert.ok(!sitemap.includes("https://teampeach.org/dashboard/"));
 const [robotsResponse,sitemapResponse]=await Promise.all([fetch(base+"/robots.txt"),fetch(base+"/sitemap.xml")]);
 assert.equal(robotsResponse.status,200);assert.ok((robotsResponse.headers.get("content-type")||"").includes("text/plain"));
 assert.equal(sitemapResponse.status,200);assert.ok((sitemapResponse.headers.get("content-type")||"").includes("xml"));
 assert.ok((await sitemapResponse.text()).includes("<loc>https://teampeach.org/products/</loc>"));
});

