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
