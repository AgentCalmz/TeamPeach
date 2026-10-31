"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {renderMarkdown,renderJournalPage,slugifyJournalTitle}=require("../src/journal");

test("journal Markdown formats headings, lists, emphasis and safe links",()=>{
 const html=renderMarkdown("## A clear heading\n\nUse **bold** and *italic* text.\n\n- First item\n- Second item\n\n[Read more](https://example.com/guide)");
 assert.match(html,/<h2>A clear heading<\/h2>/);
 assert.match(html,/<strong>bold<\/strong>/);
 assert.match(html,/<em>italic<\/em>/);
 assert.match(html,/<ul><li>First item<\/li><li>Second item<\/li><\/ul>/);
 assert.match(html,/<a href="https:\/\/example\.com\/guide"/);
});

test("journal Markdown escapes raw HTML and rejects unsafe link schemes",()=>{
 const html=renderMarkdown('<script>alert("x")</script>\n\n[run this](javascript:alert(1))');
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>alert/);
 assert.doesNotMatch(html,/href="javascript:/i);
 assert.match(html,/run this/);
});

test("dynamic published journal pages include canonical metadata and structured data",()=>{
 const page=renderJournalPage({
  slug:"sample-journal-guide",title:"A Safe Journal Title",
  excerpt:"A clear and direct summary that answers the reader's main question in useful language.",
  meta_title:"A Safe Journal Title | TeamPeach",
  meta_description:"A practical guide explaining the topic, outlining useful steps and highlighting important limits for readers.",
  content_markdown:"## Quick answer\n\nThis is **formatted** content.",
  category:"Practical guide",author_name:"TeamPeach Editorial Team",
  status:"published",published_at:"2026-10-29T10:00:00.000Z",updated_at:"2026-10-29T10:00:00.000Z",
  cover_image_url:"https://images.example.com/cover.jpg"
 },"https://teampeach.org");
 assert.match(page,/rel="canonical" href="https:\/\/teampeach\.org\/journal\/sample-journal-guide\//);
 assert.match(page,/"@type":"BlogPosting"/);
 assert.match(page,/"@type":"BreadcrumbList"/);
 assert.match(page,/aria-label="Quick answer"/);
 assert.match(page,/<strong>formatted<\/strong>/);
 assert.match(page,/og:image/);
});

test("journal slug generation produces a clean URL-safe slug",()=>{
 assert.equal(slugifyJournalTitle("How to Choose AI Tools: A Guide!"),"how-to-choose-ai-tools-a-guide");
 assert.equal(slugifyJournalTitle("  "), "");
});


test("journal editor is administrator-only and keeps drafts out of the public API",()=>{
 const fs=require("node:fs");
 const path=require("node:path");
 const root=path.join(__dirname,"..");
 const server=fs.readFileSync(path.join(root,"server.js"),"utf8");
 const migration=fs.readFileSync(path.join(root,"supabase","migrations","007_journal_articles.sql"),"utf8");
 const editor=fs.readFileSync(path.join(root,"public","dashboard","journal","index.html"),"utf8");
 const client=fs.readFileSync(path.join(root,"public","js","journal-editor.js"),"utf8");
 assert.ok(server.includes('app.get("/api/admin/journal/articles",authenticated,isAdmin'));
 assert.ok(server.includes("function csrf(req,res,next)"));
 assert.ok(server.includes("app.use(csrf)"));
 assert.ok(server.includes('app.use("/api",lusca.csrf({'));
 
 assert.ok(server.includes('error.message==="CSRF token missing"||error.message==="CSRF token mismatch"'));
 assert.ok(server.includes("errorJson(res,403,\"CSRF_CHECK_FAILED\""));
 assert.ok(server.includes('app.get("/api/csrf",(q,r)=>r.json({token:q.csrfToken()}))'));
 assert.ok(server.includes('req.path.startsWith("/api/payments/webhooks/")'));
 assert.ok(server.includes('app.post("/api/admin/journal/articles",authLimit,csrf,authenticated,isAdmin'));
 assert.ok(server.includes('app.patch("/api/admin/journal/articles/:id",authLimit,csrf,authenticated,isAdmin'));
 assert.ok(server.includes('app.delete("/api/admin/journal/articles/:id",authLimit,csrf,authenticated,isAdmin'));
 assert.match(server,/\.eq\("status","published"\)/);
 assert.match(migration,/alter table public\.tp_journal_articles enable row level security/);
 assert.match(migration,/revoke all on public\.tp_journal_articles from public, anon, authenticated/);
 assert.match(editor,/name="robots" content="noindex,nofollow"/);
 assert.match(editor,/data-format="bold"/);
 assert.match(editor,/data-format="italic"/);
 assert.match(editor,/id="preview-body"/);
 assert.match(client,/\/api\/admin\/journal\/articles/);
 assert.ok(client.includes("parent.append(document.createTextNode(match[6]))"));
 assert.doesNotMatch(client,/document\.createElement\("a"\).*match\[6\]/);
 assert.doesNotMatch(client,/textContent=match\[/);
});


test("robots and sitemap explicitly expose public journal, tools and product pages",()=>{
 const fs=require("node:fs");
 const path=require("node:path");
 const root=path.join(__dirname,"..");
 const robotsFiles=["robots.txt",path.join("public","robots.txt")];
 for(const relative of robotsFiles){
  const robots=fs.readFileSync(path.join(root,relative),"utf8");
  for(const agent of ["*","Bingbot","OAI-SearchBot"]){
   const group=robots.split(/\n(?=User-agent:)/i).find(section=>section.split("\n",1)[0]==="User-agent: "+agent);
   assert.ok(group,"Missing robots group for "+agent+" in "+relative);
   for(const route of ["/journal/","/products/","/tools/"])assert.ok(group.includes("Allow: "+route),agent+" must allow "+route);
   for(const route of ["/api/","/admin/","/dashboard/","/account/","/login/","/register/","/verify-email/","/forgot-password/","/unsubscribe/"])assert.ok(group.includes("Disallow: "+route),agent+" must block "+route);
  }
  assert.ok(robots.includes("Sitemap: https://teampeach.org/sitemap.xml"));
 }
 const publicMap=fs.readFileSync(path.join(root,"public","sitemap.xml"),"utf8");
 const rootMap=fs.readFileSync(path.join(root,"sitemap.xml"),"utf8");
 assert.equal(publicMap,rootMap,"root and public sitemap copies must match");
 for(const route of ["/","/products/","/tools/seo-content-brief/","/journal/","/journal/business-tasks-worth-automating/","/journal/choosing-an-ai-tool/","/journal/what-is-an-ai-agent/"])assert.ok(publicMap.includes("<loc>https://teampeach.org"+route+"</loc>"),"Sitemap is missing "+route);
 assert.doesNotMatch(publicMap,/\/(?:api|admin|dashboard|account|login|register)\//);
 const tool=fs.readFileSync(path.join(root,"public","tools","seo-content-brief","index.html"),"utf8");
 assert.match(tool,/<meta name="robots" content="index,follow/);
 assert.doesNotMatch(tool,/<meta name="robots" content="noindex/i);
});

test("homepage mobile layout explicitly prevents horizontal page panning",()=>{
 const fs=require("node:fs");
 const path=require("node:path");
 const root=path.join(__dirname,"..");
 const html=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
 const css=fs.readFileSync(path.join(root,"public","css","styles.css"),"utf8");
 assert.match(html,/href="\/css\/styles\.css\?v=6"/);
 assert.match(css,/html,body\{width:100%;max-width:100%;overflow-x:clip!important\}/);
 assert.match(css,/@media\(max-width:760px\)[\s\S]*?overflow-x:clip!important/);
});
