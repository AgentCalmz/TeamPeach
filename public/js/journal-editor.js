"use strict";
(function(){
 const $=s=>document.querySelector(s);
 const form=$("#journal-form"),root=$("#journal-editor-app"),loading=$("#journal-loading"),fallback=$("#journal-access-error");
 if(!form)return;
 let csrf="",articles=[],activeId="",activeStatus="draft",slugTouched=false,metaTitleTouched=false,metaDescriptionTouched=false,excerptTouched=false;
 const fields={
  id:$("#journal-form [name='id']"),title:$("#journal-title"),slug:$("#journal-slug"),excerpt:$("#journal-excerpt"),
  category:$("#journal-category"),author:$("#journal-author"),cover:$("#journal-cover"),metaTitle:$("#journal-meta-title"),
  metaDescription:$("#journal-meta-description"),content:$("#journal-content")
 };
 function say(message,state){const node=$("#journal-feedback");if(!node)return;node.textContent=message||"";node.dataset.state=state||"";}
 function safeUrl(raw){const v=String(raw||"").trim();return /^https?:\/\//i.test(v)||(v.startsWith("/")&&!v.startsWith("//"))||v.startsWith("#")?v:"";}
 async function token(){if(csrf)return csrf;const r=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw new Error("Secure editing could not be prepared. Refresh the page and retry.");csrf=d.token;return csrf;}
 async function api(url,method,data){
  const m=String(method||"GET").toUpperCase(),options={method:m,credentials:"same-origin",cache:"no-store",headers:{}};
  if(["POST","PATCH","DELETE"].includes(m))options.headers["X-CSRF-Token"]=await token();
  if(data!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(data);}
  const r=await fetch(url,options),d=await r.json().catch(()=>({}));
  if(r.status===401){location.href="/login/?next="+encodeURIComponent(location.pathname);throw new Error("Your session has ended. Please sign in again.");}
  if(r.status===403)throw new Error("This journal editor is restricted to authorised administrators.");
  if(!r.ok){const e=new Error(d.message||"The request could not be completed.");e.code=d.error||"REQUEST_FAILED";throw e;}
  return d;
 }
 function slugify(v){return String(v||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90).replace(/-+$/g,"");}
 function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
 function appendInline(parent,source){
  const text=String(source||"");
  const re=/\*\*([^*]+)\*\*|\*([^*]+)\*|\x60([^\x60]+)\x60|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last=0,match;
  while((match=re.exec(text))){
   if(match.index>last)parent.append(document.createTextNode(text.slice(last,match.index)));
   let el;
   if(match[1]!==undefined){el=document.createElement("strong");el.textContent=match[1];}
   else if(match[2]!==undefined){el=document.createElement("em");el.textContent=match[2];}
   else if(match[3]!==undefined){el=document.createElement("code");el.textContent=match[3];}
   else if(match[4]!==undefined){
    const url=safeUrl(match[5]);
    if(url){el=document.createElement("img");el.src=url;el.alt=match[4];el.loading="lazy";}
    else{parent.append(document.createTextNode(match[4]));last=re.lastIndex;continue;}
   }else{
    const url=safeUrl(match[7]);
    if(url){el=document.createElement("a");el.href=url;el.textContent=match[6];el.rel="nofollow noopener noreferrer";}
    else{parent.append(document.createTextNode(match[6]));last=re.lastIndex;continue;}
   }
   parent.append(el);last=re.lastIndex;
  }
  if(last<text.length)parent.append(document.createTextNode(text.slice(last)));
 }
 function renderPreview(markdown){
  const target=$("#preview-body");target.replaceChildren();
  const lines=String(markdown||"").replace(/\r\n?/g,"\n").split("\n");let paragraph=[],list=null,quote=[],code=[],inCode=false;
  const flushParagraph=()=>{if(paragraph.length){const p=node("p","",paragraph.join(" "));p.replaceChildren();appendInline(p,paragraph.join(" "));target.append(p);paragraph=[];}};
  const flushList=()=>{if(list){target.append(list);list=null;}};
  const flushQuote=()=>{if(quote.length){const q=document.createElement("blockquote"),p=document.createElement("p");appendInline(p,quote.join(" "));q.append(p);target.append(q);quote=[];}};
  const flushCode=()=>{if(inCode){const pre=document.createElement("pre"),c=document.createElement("code");c.textContent=code.join("\n");pre.append(c);target.append(pre);code=[];inCode=false;}};
  const flush=()=>{flushParagraph();flushList();flushQuote();};
  for(const line of lines){
   if(/^\s*\x60{3}/.test(line)){flush();if(inCode)flushCode();else{inCode=true;code=[];}continue;}
   if(inCode){code.push(line);continue;}
   if(!line.trim()){flush();continue;}
   const h=line.match(/^\s*(#{1,4})\s+(.+?)\s*#*\s*$/);
   if(h){flush();const lvl=h[1].length<=2?2:h[1].length===3?3:4;const el=document.createElement("h"+lvl);appendInline(el,h[2]);target.append(el);continue;}
   if(/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)){flush();target.append(document.createElement("hr"));continue;}
   const q=line.match(/^\s*>\s?(.*)$/);if(q){flushParagraph();flushList();quote.push(q[1]);continue;}if(quote.length)flushQuote();
   const b=line.match(/^\s*[-*+]\s+(.+)$/),o=line.match(/^\s*\d+[.)]\s+(.+)$/);
   if(b||o){flushParagraph();if(!list)list=document.createElement(b?"ul":"ol");if(list.tagName.toLowerCase()!==(b?"ul":"ol"))flushList(),list=document.createElement(b?"ul":"ol");const li=document.createElement("li");appendInline(li,(b||o)[1]);list.append(li);continue;}
   flushList();paragraph.push(line.trim());
  }
  flush();flushCode();
  if(!target.childNodes.length)target.append(node("p","","Your formatted article body will appear here as you write."));
 }
 function updatePreview(){
  $("#preview-heading").textContent=fields.title.value.trim()||"Your article title appears here";
  $("#preview-category").textContent=(fields.category.value.trim()||"Practical guide").toUpperCase();
  $("#preview-excerpt").textContent=fields.excerpt.value.trim()||"Your answer-first summary will appear here.";
  $("#preview-meta-title").textContent=fields.metaTitle.value.trim()||"Your search title";
  $("#preview-meta-description").textContent=fields.metaDescription.value.trim()||"Your search description appears here.";
  $("#preview-slug").textContent=fields.slug.value.trim()||"article-slug";
  $("#excerpt-count").textContent=fields.excerpt.value.length;
  $("#meta-title-count").textContent=fields.metaTitle.value.length;
  $("#meta-description-count").textContent=fields.metaDescription.value.length;
  $("#content-count").textContent=fields.content.value.length.toLocaleString()+" characters";
  renderPreview(fields.content.value);
 }
 function statusLabel(status){return status==="published"?"Published":status==="archived"?"Archived":"Draft";}
 function renderList(){
  const list=$("#article-list"),filter=$("#article-filter").value.trim().toLowerCase();
  list.replaceChildren();
  const shown=articles.filter(a=>!filter||(a.title+" "+a.slug+" "+a.status).toLowerCase().includes(filter));
  $("#article-count").textContent=String(articles.length);
  if(!shown.length){list.append(node("div","journal-empty",articles.length?"No articles match that search.":"No saved articles yet. Start a new draft."));return;}
  shown.forEach(article=>{
   const b=node("button","journal-list-item"+(article.id===activeId?" active":""),"");b.type="button";
   const title=node("strong","journal-list-title",article.title);const slug=node("span","journal-list-slug","/journal/"+article.slug+"/");
   const meta=node("span","journal-list-meta",statusLabel(article.status)+" · "+new Date(article.updated_at||article.created_at).toLocaleDateString());
   b.append(title,slug,meta);b.addEventListener("click",()=>fillEditor(article));list.append(b);
  });
 }
 function setStatus(status){
  activeStatus=status;const badge=$("#editor-status");badge.textContent=activeId?statusLabel(status):"Unsaved";badge.className="journal-status "+status;
  $("#delete-article").hidden=!activeId;
  $("#unpublish-article").hidden=!activeId||status!=="published";
  $("#publish-article").textContent=status==="published"?"Save & publish ↗":"Publish article ↗";
 }
 function clearEditor(){
  form.reset();fields.id.value="";fields.category.value="Practical guide";fields.author.value="TeamPeach Editorial Team";
  fields.slug.value="";fields.metaTitle.value="";fields.metaDescription.value="";fields.excerpt.value="";fields.content.value="";
  activeId="";slugTouched=false;metaTitleTouched=false;metaDescriptionTouched=false;excerptTouched=false;
  $("#editor-heading").textContent="Create a journal article";setStatus("draft");say("","");updatePreview();renderList();
 }
 function fillEditor(a){
  activeId=a.id;fields.id.value=a.id;fields.title.value=a.title||"";fields.slug.value=a.slug||"";fields.excerpt.value=a.excerpt||"";
  fields.category.value=a.category||"Journal";fields.author.value=a.author_name||"TeamPeach Editorial Team";fields.cover.value=a.cover_image_url||"";
  fields.metaTitle.value=a.meta_title||a.title||"";fields.metaDescription.value=a.meta_description||a.excerpt||"";fields.content.value=a.content_markdown||"";
  slugTouched=true;metaTitleTouched=true;metaDescriptionTouched=true;excerptTouched=true;
  $("#editor-heading").textContent=a.title||"Edit article";setStatus(a.status||"draft");
  $("#editor-status").textContent=statusLabel(a.status)+" · Saved";say("Loaded article. Changes are not saved until you choose Save draft or Publish.","");
  updatePreview();renderList();window.scrollTo({top:0,behavior:"smooth"});
 }
 function collect(status){
  return {title:fields.title.value.trim(),slug:fields.slug.value.trim(),excerpt:fields.excerpt.value.trim(),category:fields.category.value.trim(),
   authorName:fields.author.value.trim(),coverImageUrl:fields.cover.value.trim(),metaTitle:fields.metaTitle.value.trim(),
   metaDescription:fields.metaDescription.value.trim(),contentMarkdown:fields.content.value,status};
 }
 async function save(status){
  if(!form.reportValidity())return;
  const button=status==="published"?$("#publish-article"):$("#save-draft");
  const idle=button.textContent;button.disabled=true;button.textContent=status==="published"?"Publishing…":"Saving…";
  say("Saving article…","");
  try{
   const payload=collect(status),url=activeId?"/api/admin/journal/articles/"+encodeURIComponent(activeId):"/api/admin/journal/articles";
   const d=await api(url,activeId?"PATCH":"POST",payload);activeId=d.article.id;fields.id.value=activeId;setStatus(d.article.status);$("#editor-heading").textContent=d.article.title;$("#editor-status").textContent=statusLabel(d.article.status)+" · Saved";
   await loadArticles(false);say(d.message+(status==="published"?" Public URL: /journal/"+d.article.slug+"/":""),"success");
  }catch(e){say(e.message,"error");}
  finally{button.disabled=false;button.textContent=idle;}
 }
 async function loadArticles(clearError){
  const d=await api("/api/admin/journal/articles","GET");articles=Array.isArray(d.articles)?d.articles:[];
  renderList();if(activeId){const current=articles.find(a=>a.id===activeId);if(current)setStatus(current.status);}
  if(clearError)say("Journal library loaded.","success");
 }
 async function initialize(){
  try{
   const r=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));
   if(r.status===401){location.href="/login/?next="+encodeURIComponent(location.pathname);return;}
   if(!r.ok)throw new Error(d.message||"Unable to check account access.");
   if(!d.isAdmin){loading.hidden=true;fallback.hidden=false;fallback.textContent="The journal editor is available to authorised TeamPeach administrators only. Return to your workspace.";return;}
   const first=(String(d.user.fullName||"T").trim().split(/[ ]+/)[0]||"T").charAt(0).toUpperCase();
   $("#sidebar-name").textContent=d.user.fullName||"Administrator";$("#sidebar-email").textContent=d.user.email||"";
   $("#sidebar-avatar").textContent=first;$("#topbar-avatar").textContent=first;$("#workspace-admin-link").hidden=false;$("#workspace-journal-link").hidden=false;
   const menu=$("#mobile-sidebar-toggle"),shell=$("#journal-workspace");
   if(menu){menu.addEventListener("click",()=>{const isOpen=shell.classList.toggle("mobile-nav-open");menu.setAttribute("aria-expanded",String(isOpen));menu.setAttribute("aria-label",isOpen?"Close navigation":"Open navigation");});}
   $("#dashboard-logout")?.addEventListener("click",async()=>{try{await api("/api/auth/logout","POST",{});location.href="/login/";}catch(e){say(e.message,"error");}});
   loading.hidden=true;root.hidden=false;
   await loadArticles(false);clearEditor();
  }catch(e){
   loading.hidden=true;fallback.hidden=false;fallback.textContent=e.code==="JOURNAL_SCHEMA_NOT_READY"||/migration 007/i.test(e.message)?e.message+" Run supabase/migrations/007_journal_articles.sql in Supabase SQL Editor and retry.":e.message;
   say(e.message,"error");
  }
 }
 $("#new-article").addEventListener("click",clearEditor);
 $("#article-filter").addEventListener("input",renderList);
 fields.title.addEventListener("input",()=>{
  if(!slugTouched)fields.slug.value=slugify(fields.title.value);
  if(!metaTitleTouched)fields.metaTitle.value=fields.title.value;
  if(!metaDescriptionTouched&&fields.excerpt.value)fields.metaDescription.value=fields.excerpt.value.slice(0,320);
  updatePreview();
 });
 fields.slug.addEventListener("input",()=>{slugTouched=true;fields.slug.value=slugify(fields.slug.value);updatePreview();});
 fields.excerpt.addEventListener("input",()=>{if(!excerptTouched){excerptTouched=true;if(!metaDescriptionTouched)fields.metaDescription.value=fields.excerpt.value.slice(0,320);}updatePreview();});
 fields.metaTitle.addEventListener("input",()=>{metaTitleTouched=true;updatePreview();});
 fields.metaDescription.addEventListener("input",()=>{metaDescriptionTouched=true;updatePreview();});
 [fields.category,fields.content,fields.cover,fields.author].forEach(el=>el.addEventListener("input",updatePreview));
 function applyFormat(format){
  const input=fields.content,start=input.selectionStart,end=input.selectionEnd,value=input.value,selected=value.slice(start,end);
  let before="",after="",linePrefix="";
  if(format==="bold"){before="**";after="**";}
  else if(format==="italic"){before="*";after="*";}
  else if(format==="code"){before="\x60";after="\x60";}
  else if(format==="link"){before="[";after="](https://example.com)";}
  else if(format==="h2")linePrefix="## ";
  else if(format==="h3")linePrefix="### ";
  else if(format==="bullets")linePrefix="- ";
  else if(format==="numbered")linePrefix="1. ";
  else if(format==="quote")linePrefix="> ";
  else if(format==="rule"){before="\n\n---\n\n";after="";}
  if(linePrefix){
   const lineStart=value.lastIndexOf("\n",start-1)+1,lineEnd=value.indexOf("\n",end),realEnd=lineEnd<0?value.length:lineEnd;
   const chunk=value.slice(lineStart,realEnd).split("\n").map(line=>linePrefix+line.replace(/^\s*(#{1,3}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/,"")).join("\n");
   input.setRangeText(chunk,lineStart,realEnd,"end");
  }else if(format==="link"&&!selected){const replacement="[link text](https://example.com)";input.setRangeText(replacement,start,end,"end");input.setSelectionRange(start+1,start+10);}
  else{input.setRangeText(before+selected+after,start,end,"select");if(!selected)input.setSelectionRange(start+before.length,start+before.length);}
  input.focus();updatePreview();
 }
 document.querySelectorAll("[data-format]").forEach(b=>b.addEventListener("click",()=>applyFormat(b.dataset.format)));
 $("#save-draft").addEventListener("click",()=>save("draft"));
 $("#publish-article").addEventListener("click",()=>save("published"));
 $("#unpublish-article").addEventListener("click",()=>save("draft"));
 $("#delete-article").addEventListener("click",async()=>{
  if(!activeId||!confirm("Delete this saved journal article? This cannot be undone."))return;
  const b=$("#delete-article");b.disabled=true;
  try{await api("/api/admin/journal/articles/"+encodeURIComponent(activeId),"DELETE");articles=articles.filter(a=>a.id!==activeId);clearEditor();say("Article deleted.","success");}
  catch(e){say(e.message,"error");}finally{b.disabled=false;}
 });
 initialize();
})();