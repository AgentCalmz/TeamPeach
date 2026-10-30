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
 assert.ok(server.includes("function csrfForMutations(req,res,next)"));
 assert.ok(server.includes("app.use(csrfForMutations)"));
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
 assert.ok(client.includes("el.append(document.createTextNode(match[6]))"));
 assert.doesNotMatch(client,/textContent=match\[/);
});


test("robots.txt explicitly allows Bingbot to crawl public pages and blocks private routes",()=>{
 const fs=require("node:fs");
 const path=require("node:path");
 const root=path.join(__dirname,"..");
 const files=["robots.txt",path.join("public","robots.txt")];
 for(const relative of files){
  const robots=fs.readFileSync(path.join(root,relative),"utf8");
  const group=robots.split(/\n(?=User-agent:)/i).find(section=>/^User-agent:\s*Bingbot\s*$/im.test(section));
  assert.ok(group,"Bingbot-specific group must exist in "+relative);
  assert.match(group,/^Allow:\s*\/$/im);
  for(const route of ["/api/","/admin/","/dashboard/","/account/","/login/","/register/","/verify-email/","/forgot-password/","/unsubscribe/"]) {
   assert.ok(group.includes("Disallow: "+route),"Bingbot group must block "+route);
  }
 }
});

test("homepage mobile layout explicitly prevents horizontal page panning",()=>{
 const fs=require("node:fs");
 const path=require("node:path");
 const root=path.join(__dirname,"..");
 const html=fs.readFileSync(path.join(root,"public","index.html"),"utf8");
 const css=fs.readFileSync(path.join(root,"public","css","styles.css"),"utf8");
 assert.match(html,/href="\/css\/styles\.css\?v=6"/);
 assert.match(css,/html,body\{width:100%;max-width:100%;overflow-x:hidden!important\}/);
 assert.match(css,/@media\(max-width:760px\)[\s\S]*?overflow-x:hidden!important/);
});
