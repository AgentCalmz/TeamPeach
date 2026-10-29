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
 for(const route of ["/","/journal/","/journal/what-is-an-ai-agent/","/journal/choosing-an-ai-tool/","/journal/business-tasks-worth-automating/","/tools/seo-content-brief/","/register/","/verify-email/","/login/","/forgot-password/","/dashboard/","/dashboard/requests/","/dashboard/requests/view/","/dashboard/tools/","/dashboard/billing/","/dashboard/support/","/account/","/admin/","/admin/login/","/admin/requests/","/admin/support/","/admin/products/","/admin/memberships/","/admin/credits/","/admin/customers/","/admin/fulfilment/","/admin/payments/","/admin/communications/","/unsubscribe/","/products/"]){
  const response=await fetch(base+route);
  assert.equal(response.status,200,"expected 200 for "+route);
  assert.match(response.headers.get("content-type")||"",/text\/html/);
  const html=await response.text();
  if(route==="/account/"||route.startsWith("/admin/")||route.startsWith("/dashboard/"))assert.match(html,/noindex,nofollow/);
 }
 const old=await fetch(base+"/register/index.html",{redirect:"manual"});
 assert.equal(old.status,301);
 assert.equal(old.headers.get("location"),"/register/");
 const oldProjects=await fetch(base+"/dashboard/projects/",{redirect:"manual"});
 assert.equal(oldProjects.status,301);
 assert.equal(oldProjects.headers.get("location"),"/dashboard/requests/");
 const oldTasks=await fetch(base+"/dashboard/tasks/",{redirect:"manual"});
 assert.equal(oldTasks.status,301);
 assert.equal(oldTasks.headers.get("location"),"/dashboard/requests/");
 const oldBlog=await fetch(base+"/blog/",{redirect:"manual"});
 assert.equal(oldBlog.status,301);
 assert.equal(oldBlog.headers.get("location"),"/journal/");
 const health=await fetch(base+"/api/health");
 assert.ok([200,503].includes(health.status));
 assert.equal(health.headers.get("cache-control"),"no-store");
 const body=await health.json();
 assert.ok(["ready","degraded"].includes(body.status));
 assert.equal(Object.hasOwn(body,"SUPABASE_SERVICE_ROLE_KEY"),false);
 assert.equal(Object.hasOwn(body,"emailTransport"),true);
 assert.equal(Object.hasOwn(body,"legacyBriefStorageReady"),true);
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

test("customer workspace replaces generic projects and tasks with private custom requests",function(){
 const fs=require("node:fs"),path=require("node:path"),root=path.join(__dirname,"..");
 const server=fs.readFileSync(path.join(root,"server.js"),"utf8");
 const legacyMigration=fs.readFileSync(path.join(root,"supabase","migrations","002_workspace_dashboard.sql"),"utf8");
 const migration=fs.readFileSync(path.join(root,"supabase","migrations","006_custom_project_requests.sql"),"utf8");
 const dashboard=fs.readFileSync(path.join(root,"public","dashboard","index.html"),"utf8");
 const requestPage=fs.readFileSync(path.join(root,"public","dashboard","requests","index.html"),"utf8");
 const detailPage=fs.readFileSync(path.join(root,"public","dashboard","requests","view","index.html"),"utf8");
 const adminPage=fs.readFileSync(path.join(root,"public","admin","requests","index.html"),"utf8");
 const dashboardClient=fs.readFileSync(path.join(root,"public","js","dashboard.js"),"utf8");
 const customerClient=fs.readFileSync(path.join(root,"public","js","custom-requests.js"),"utf8");
 const adminClient=fs.readFileSync(path.join(root,"public","js","admin-custom-requests.js"),"utf8");
 for(const route of [
  'app.get("/api/custom-requests"',
  'app.post("/api/custom-requests"',
  'app.get("/api/admin/custom-requests"',
  'app.get("/api/custom-requests/:id/messages"',
  'app.post("/api/custom-requests/:id/messages"',
  'app.patch("/api/custom-requests/:id/quote"',
  'app.patch("/api/admin/custom-requests/:id"'
 ])assert.ok(server.includes(route),"missing "+route);
 assert.ok(server.includes('"/dashboard/projects"'));
 assert.ok(server.includes('"/dashboard/tasks"'));
 assert.ok(server.includes('"/blog"'));
 assert.match(legacyMigration,/create table if not exists public\.tp_workspace_projects/);
 assert.match(legacyMigration,/create table if not exists public\.tp_workspace_tasks/);
 assert.match(legacyMigration,/alter table public\.tp_workspace_projects enable row level security/);
 assert.match(legacyMigration,/alter table public\.tp_workspace_tasks enable row level security/);
 assert.match(migration,/create table if not exists public\.tp_custom_requests/);
 assert.match(migration,/create table if not exists public\.tp_custom_request_messages/);
 assert.match(migration,/quote_currency text not null default 'USD' check \(quote_currency = 'USD'\)/);
 assert.match(migration,/alter table public\.tp_custom_requests enable row level security/);
 assert.match(migration,/grant select, insert, update, delete on public\.tp_custom_requests, public\.tp_custom_request_messages to service_role/);
 assert.doesNotMatch(dashboard,/href="\/dashboard\/(?:projects|tasks)\//);
 assert.match(dashboard,/href="\/dashboard\/requests\//);
 assert.match(dashboard,/id="welcome-title"/);
 assert.match(requestPage,/id="custom-request-form"/);
 assert.match(requestPage,/id="custom-request-list"/);
 assert.ok(requestPage.includes("custom-requests.js?v=1"));
 assert.ok(detailPage.includes("custom-requests.js?v=1"));
 assert.match(detailPage,/id="custom-project-messages"/);
 assert.match(detailPage,/id="custom-quote-accept"/);
 assert.match(adminPage,/id="admin-custom-request-quote-form"/);
 assert.match(adminPage,/id="admin-custom-request-reply-form"/);
 assert.ok(adminPage.includes("admin-custom-requests.js?v=1"));
 assert.match(adminPage,/href="\/admin\/requests\//);
 assert.match(customerClient,/setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"\)loadThread\(\);\},8000\)/);
 assert.match(customerClient,/location\.replace\("\/login\//);
 assert.match(adminClient,/location\.replace\("\/admin\/login\//);
 assert.match(dashboardClient,/json\("\/api\/auth\/me"\)/);
 assert.doesNotMatch(dashboardClient,/api\/workspace/);
 assert.ok(server.includes("customRequestsSchemaReady"));
 assert.ok(server.includes("usdPricingReady"));
 for(const source of [dashboardClient,customerClient,adminClient])assert.doesNotThrow(()=>new Function(source));
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
 assert.ok(client.includes("money(sub.plan.price_minor,sub.plan.currency)"));
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
 assert.ok(server.includes("LEGACY_PLAN_READ_ONLY"));
 assert.ok(adminClient.includes("priceUsd"));
 assert.ok(!adminClient.includes("priceNaira"));
 assert.ok(usdMigration.includes("v_ngn_per_usd numeric := 1341.62"));
 assert.ok(usdMigration.includes("currency in"));
 assert.ok(usdMigration.includes("tp_subscriptions"));
 assert.ok(billingPage.includes("commerce.js?v=3"));
 assert.ok(catalog.includes("catalog.js?v=3"));
 assert.ok(adminProducts.includes("admin-commerce.js?v=3"));
 const dashboardClient=fs.readFileSync(path.join(root,"public","js","dashboard.js"),"utf8");
 const adminShell=fs.readFileSync(path.join(root,"public","js","admin-shell.js"),"utf8");
 const supportClient=fs.readFileSync(path.join(root,"public","js","support-chat.js"),"utf8");
 const customClient=fs.readFileSync(path.join(root,"public","js","custom-requests.js"),"utf8");
 const adminCustomClient=fs.readFileSync(path.join(root,"public","js","admin-custom-requests.js"),"utf8");
 const catalogClient=fs.readFileSync(path.join(root,"public","js","catalog.js"),"utf8");
 const dashboardCommon=fs.readFileSync(path.join(root,"public","js","dashboard.js"),"utf8");
 for(const source of [server,client,adminClient,productClient,briefClient,dashboardClient,adminShell,supportClient,customClient,adminCustomClient,catalogClient,dashboardCommon])assert.doesNotThrow(()=>new Function(source));
});


test("public catalogue respects signed-in sessions and routes guests back to the chosen page",function(){
 const fs=require("node:fs"),path=require("node:path"),root=path.join(__dirname,"..");
 const client=fs.readFileSync(path.join(root,"public","js","catalog.js"),"utf8");
 const html=fs.readFileSync(path.join(root,"public","products","index.html"),"utf8");
 assert.ok(client.includes('fetch("/api/auth/me"'));
 assert.ok(client.includes('credentials:"same-origin"'));
 assert.ok(client.includes('signedIn?signedInLabel:guestLabel'));
 assert.ok(client.includes('"/dashboard/billing/#commerce-plans"'));
 assert.ok(client.includes('"/dashboard/billing/#commerce-topups"'));
 assert.ok(client.includes('"/dashboard/tools/"'));
 assert.ok(client.includes('"/login/?next="+encodeURIComponent(destination)'));
 assert.ok(html.includes('href="#membership-plans"'));
});

test("journal is a separate editorial destination rather than a tool catalogue",function(){
 const fs=require("node:fs"),path=require("node:path"),root=path.join(__dirname,"..");
 const home=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
 const journal=fs.readFileSync(path.join(root,"public","journal","index.html"),"utf8");
 const buyingGuide=fs.readFileSync(path.join(root,"public","journal","choosing-an-ai-tool","index.html"),"utf8");
 const automationGuide=fs.readFileSync(path.join(root,"public","journal","business-tasks-worth-automating","index.html"),"utf8");
 const products=fs.readFileSync(path.join(root,"public","products","index.html"),"utf8");
 assert.ok(home.includes('href="/journal/"'));
 assert.ok(journal.includes('class="journal-grid"'));
 assert.ok(journal.includes('href="/journal/choosing-an-ai-tool/"'));
 assert.ok(journal.includes('href="/journal/business-tasks-worth-automating/"'));
 assert.ok(buyingGuide.includes('class="journal-article-body"'));
 assert.ok(automationGuide.includes('class="journal-article-body"'));
 assert.match(products,/Tools and software licences/);
 assert.ok(!products.includes('class="journal-grid"'));
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
 assert.ok(sitemap.includes("<loc>https://teampeach.org/journal/</loc>"));
 assert.ok(sitemap.includes("<loc>https://teampeach.org/journal/choosing-an-ai-tool/</loc>"));
 assert.ok(sitemap.includes("<loc>https://teampeach.org/journal/business-tasks-worth-automating/</loc>"));
 assert.ok(!sitemap.includes("https://teampeach.org/admin/"));
 assert.ok(!sitemap.includes("https://teampeach.org/dashboard/"));
 const [robotsResponse,sitemapResponse]=await Promise.all([fetch(base+"/robots.txt"),fetch(base+"/sitemap.xml")]);
 assert.equal(robotsResponse.status,200);assert.ok((robotsResponse.headers.get("content-type")||"").includes("text/plain"));
 assert.equal(sitemapResponse.status,200);assert.ok((sitemapResponse.headers.get("content-type")||"").includes("xml"));
 assert.ok((await sitemapResponse.text()).includes("<loc>https://teampeach.org/products/</loc>"));
});

