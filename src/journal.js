"use strict";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeJournalUrl(raw) {
  const value = String(raw || "").trim();
  if (!value || /[\u0000-\u0020"'<>\\]/.test(value)) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("#")) return value;
  return "";
}

function inlineMarkdown(source) {
  const tokens = [];
  const stash = html => {
    const index = tokens.push(html) - 1;
    return "\u0000" + index + "\u0000";
  };
  let value = String(source || "");
  value = value.replace(/\x60([^\x60\n]+)\x60/g, (_match, code) => stash("<code>" + escapeHtml(code) + "</code>"));
  value = value.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_match, alt, rawUrl) => {
    const url = safeJournalUrl(rawUrl);
    return url ? stash('<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async">') : stash(escapeHtml(alt));
  });
  value = value.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, rawUrl) => {
    const url = safeJournalUrl(rawUrl);
    return url ? stash('<a href="' + escapeHtml(url) + '" rel="nofollow noopener noreferrer">' + escapeHtml(label) + "</a>") : stash(escapeHtml(label));
  });
  value = escapeHtml(value);
  value = value.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>");
  return value.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || "");
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let paragraph = [], listType = "", listItems = [], quoteLines = [], codeLines = [], inCode = false;
  const flushParagraph = () => {
    if (paragraph.length) {
      html.push("<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>");
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      html.push("<" + listType + ">" + listItems.map(item => "<li>" + inlineMarkdown(item) + "</li>").join("") + "</" + listType + ">");
      listItems = []; listType = "";
    }
  };
  const flushQuote = () => {
    if (quoteLines.length) {
      html.push("<blockquote><p>" + quoteLines.map(inlineMarkdown).join("<br>") + "</p></blockquote>");
      quoteLines = [];
    }
  };
  const flushCode = () => {
    if (inCode) {
      html.push("<pre><code>" + escapeHtml(codeLines.join("\n")) + "</code></pre>");
      codeLines = []; inCode = false;
    }
  };
  const flushBlocks = () => { flushParagraph(); flushList(); flushQuote(); };
  for (const line of lines) {
    if (/^\s*\x60{3}/.test(line)) {
      flushBlocks();
      if (inCode) flushCode();
      else { inCode = true; codeLines = []; }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (!line.trim()) { flushBlocks(); continue; }
    const heading = line.match(/^\s*(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushBlocks();
      const level = heading[1].length <= 2 ? 2 : heading[1].length === 3 ? 3 : 4;
      html.push("<h" + level + ">" + inlineMarkdown(heading[2]) + "</h" + level + ">");
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { flushBlocks(); html.push("<hr>"); continue; }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) { flushParagraph(); flushList(); quoteLines.push(quote[1]); continue; }
    if (quoteLines.length) flushQuote();
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (bullet || ordered) {
      flushParagraph();
      const desired = bullet ? "ul" : "ol";
      if (listItems.length && listType !== desired) flushList();
      listType = desired;
      listItems.push((bullet || ordered)[1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushBlocks();
  flushCode();
  return html.join("\n");
}

function renderJournalPage(article, baseUrl) {
  const title = String(article.meta_title || article.title || "").trim();
  const description = String(article.meta_description || article.excerpt || "").trim();
  const base = baseUrl.replace(/\/+$/, "");
  const canonical = base + "/journal/" + article.slug + "/";
  const published = article.published_at || article.created_at;
  const modified = article.updated_at || published;
  const dateIso = value => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : "";
  };
  const dateLabel = value => {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en", {year:"numeric", month:"long", day:"numeric", timeZone:"UTC"}) : "";
  };
  const cover = safeJournalUrl(article.cover_image_url);
  const articleSchema = {
    "@context": "https://schema.org", "@type": "BlogPosting", "headline": String(article.title || ""),
    "description": description, "datePublished": dateIso(published), "dateModified": dateIso(modified),
    "author": {"@type":"Organization","name":String(article.author_name || "TeamPeach Editorial Team"),"url":base + "/"},
    "publisher": {"@type":"Organization","name":"TeamPeach","url":base,"logo":{"@type":"ImageObject","url":base + "/assets/favicon.svg"}},
    "mainEntityOfPage": {"@type":"WebPage","@id":canonical}, "articleSection": String(article.category || "Journal"), "inLanguage":"en"
  };
  if (cover) articleSchema.image = [cover];
  const breadcrumbSchema = {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {"@type":"ListItem","position":1,"name":"Home","item":base+"/"},
    {"@type":"ListItem","position":2,"name":"Journal","item":base+"/journal/"},
    {"@type":"ListItem","position":3,"name":String(article.title||""),"item":canonical}
  ]};
  const safeJson = obj => JSON.stringify(obj).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");
  const coverHtml = cover ? '<img class="article-cover" src="' + escapeHtml(cover) + '" alt="' + escapeHtml(article.title || "") + '" width="1500" height="850" loading="eager" decoding="async">' : "";
  return [
    "<!doctype html>",
    '<html lang="en"><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f8f4ee">',
    '<meta name="description" content="' + escapeHtml(description) + '"><meta name="robots" content="index,follow,max-image-preview:large">',
    '<link rel="canonical" href="' + escapeHtml(canonical) + '"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">',
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/styles.css?v=6">',
    "<title>" + escapeHtml(title) + "</title>",
    '<meta property="og:type" content="article"><meta property="og:site_name" content="TeamPeach"><meta property="og:title" content="' + escapeHtml(title) + '"><meta property="og:description" content="' + escapeHtml(description) + '"><meta property="og:url" content="' + escapeHtml(canonical) + '">',
    cover ? '<meta property="og:image" content="' + escapeHtml(cover) + '">' : "",
    '<meta name="twitter:card" content="' + (cover ? "summary_large_image" : "summary") + '">',
    '<meta property="article:published_time" content="' + escapeHtml(dateIso(published)) + '"><meta property="article:modified_time" content="' + escapeHtml(dateIso(modified)) + '">',
    '<script type="application/ld+json">' + safeJson(articleSchema) + "</script>",
    '<script type="application/ld+json">' + safeJson(breadcrumbSchema) + "</script>",
    "</head><body>",
    '<a class="skip-link" href="#main">Skip to content</a>',
    '<header class="site-header"><div class="nav-wrap"><a class="brand" href="/" aria-label="TeamPeach home"><span class="brand-mark"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 11h20c6 0 9 4 9 9s-3 9-9 9h-8v9M21 38V17h10c7 0 11 4 11 10s-4 10-11 10H21" fill="none" stroke="currentColor" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="31" cy="8" r="4" fill="#ff936f"/></svg></span><span class="brand-name">Team<span>Peach</span></span></a><button class="menu-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="site-navigation"><span></span><span></span></button><nav class="nav-links" id="site-navigation" aria-label="Main navigation"><a href="/">Home</a><a href="/products/">Tools & pricing</a><a href="/journal/" aria-current="page">Journal</a><a href="/#custom">Custom projects</a><a class="nav-auth-link" href="/login/">Sign in</a><a class="nav-auth-link nav-auth-create" href="/register/">Create account</a></nav></div></header>',
    '<main id="main"><article class="page-wrap long-article"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span> / </span><a href="/journal/">Journal</a><span> / </span><span>' + escapeHtml(article.title || "") + "</span></nav>",
    '<header class="article-header"><p class="eyebrow"><span></span> ' + escapeHtml(String(article.category || "JOURNAL").toUpperCase()) + "</p><h1>" + escapeHtml(article.title || "") + "</h1><p class=\"article-deck\">" + escapeHtml(article.excerpt || description) + "</p>",
    '<p class="article-meta">By ' + escapeHtml(article.author_name || "TeamPeach Editorial Team") + ' <span><time datetime="' + escapeHtml(dateIso(published)) + '">' + escapeHtml(dateLabel(published)) + "</time></span></p>" + coverHtml + "</header>",
    '<div class="article-layout"><div class="article-content"><section class="article-answer" aria-label="Quick answer"><h2>In brief</h2><p>' + escapeHtml(article.excerpt || description) + "</p></section>",
    renderMarkdown(article.content_markdown),
    '<div class="article-cta"><b>Want to put an idea into practice?</b><p>Start with the task you want to improve and the result you need. TeamPeach can help you scope the next step around your actual workflow.</p><a class="button button-dark" href="/#custom">Discuss a custom project <span>↗</span></a></div></div>',
    '<aside class="article-sidebar"><p class="eyebrow"><span></span> EXPLORE</p><a href="/journal/">All journal articles</a><a href="/journal/what-is-an-ai-agent/">What is an AI agent?</a><a href="/journal/choosing-an-ai-tool/">Choosing an AI tool</a><a href="/journal/business-tasks-worth-automating/">Business automation</a><p class="sidebar-note">Clear answers, useful evidence and practical next steps.</p></aside></div></article></main>',
    '<footer class="site-footer"><div class="page-wrap footer-bottom"><span>© TeamPeach. Built with intention.</span><a href="/">Home ↑</a><a href="/journal/">Journal</a></div></footer><script src="/js/main.js?v=5" defer></script></body></html>'
  ].join("\n");
}

function slugifyJournalTitle(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90).replace(/-+$/g, "");
}

module.exports = { escapeHtml, safeJournalUrl, renderMarkdown, renderJournalPage, slugifyJournalTitle };
