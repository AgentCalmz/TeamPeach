"use strict";
(function(){
 const grid=document.querySelector(".insight-grid");
 if(!grid)return;
 const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
 function dateLabel(value){const d=new Date(value||"");return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"TeamPeach journal";}
 async function load(){
  try{
   const response=await fetch("/api/journal/articles",{credentials:"same-origin",cache:"no-store"});
   if(!response.ok)return;
   const body=await response.json().catch(()=>({}));
   const articles=Array.isArray(body.articles)?body.articles:[];
   const existing=new Set(Array.from(grid.querySelectorAll("a[href^='/journal/']")).map(a=>a.getAttribute("href").split("/").filter(Boolean)[1]).filter(Boolean));
   articles.forEach(article=>{
    if(!article.slug||existing.has(article.slug))return;
    existing.add(article.slug);
    const url="/journal/"+encodeURIComponent(article.slug)+"/";
    const card=make("article","insight-card reveal");
    const imageLink=make("a","insight-image");imageLink.href=url;
    if(article.cover_image_url&&/^https:\/\//i.test(article.cover_image_url)){
     const img=document.createElement("img");img.src=article.cover_image_url;img.alt=article.title||"Journal article cover";img.width=900;img.height=600;img.loading="lazy";img.decoding="async";imageLink.append(img);
    }else{
     const placeholder=make("span","journal-cover-placeholder","TP");placeholder.setAttribute("aria-hidden","true");imageLink.append(placeholder);
    }
    imageLink.append(make("span","","FIELD NOTE"));
    const category=make("p","article-meta",String(article.category||"JOURNAL").toUpperCase());
    const date=make("span","",dateLabel(article.published_at));category.append(date);
    const h=make("h3","");const title=make("a","",article.title);title.href=url;h.append(title);
    card.append(imageLink,category,h,make("p","",article.excerpt||article.meta_description||"Read the latest TeamPeach journal article."));
    const link=make("a","quiet-link","Read the guide");link.href=url;const arrow=make("span","","→");link.append(" ",arrow);card.append(link);
    grid.append(card);
   });
  }catch(_){}
 }
 load();
})();