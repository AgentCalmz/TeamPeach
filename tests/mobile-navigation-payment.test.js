"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

test("mobile page-root overflow does not disable sticky public or workspace headers",()=>{
 const styles=read("public/css/styles.css");
 const dashboardCss=read("public/css/dashboard.css");
 const dashboardPages=read("public/css/dashboard-pages.css");
 assert.match(styles,/\.site-header\{position:sticky;top:0;/);
 assert.match(styles,/html,body\{[^}]*overflow-x:clip!important/);
 assert.doesNotMatch(styles,/html,body\{[^}]*overflow-x:hidden!important/);
 assert.match(dashboardPages,/\.workspace-topbar\{position:sticky;top:0;z-index:25\}/);
 assert.match(dashboardCss,/\.workspace-shell\.mobile-nav-open:before\{[^}]*z-index:20;/);
});

test("customer and administrator mobile navigation can close without navigating",()=>{
 const dashboard=read("public/js/dashboard.js");
 const account=read("public/js/auth.js");
 const admin=read("public/js/admin-shell.js");
 assert.match(dashboard,/event\.target===shell/);
 assert.match(dashboard,/event\.key==="Escape"/);
 assert.match(dashboard,/closeMobileNavigation/);
 assert.match(account,/event\.key==="Escape"/);
 assert.match(admin,/event\.target===wrap/);
 assert.match(admin,/event\.key==="Escape"/);
 for(const source of [dashboard,account,admin])assert.doesNotThrow(()=>new Function(source));
});

test("cancelled hosted checkout returns to billing and produces an accessible toast",()=>{
 const server=read("server.js");
 const commerce=read("public/js/commerce.js");
 const billing=read("public/dashboard/billing/index.html");
 assert.match(server,/callback_url:base\+"\/dashboard\/billing\/\?gateway=paystack"/);
 assert.match(server,/redirect_url:base\+"\/dashboard\/billing\/\?gateway=flutterwave"/);
 assert.match(commerce,/function notifyPayment\(message,state\)/);
 assert.match(commerce,/Payment was cancelled or not completed/);
 assert.match(commerce,/params\.get\("status"\)/);
 assert.match(commerce,/finally\{\s*cleanReturnUrl\(\)/);
 assert.match(billing,/id="workspace-toast"[^>]*role="status"/);
 assert.doesNotThrow(()=>new Function(commerce));
});
