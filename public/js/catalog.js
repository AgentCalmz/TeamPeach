"use strict";
(function(){
 const $=s=>document.querySelector(s);
 const money=(minor,currency="NGN")=>new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
 const empty=(message)=>{const n=node("div","commerce-empty",message);return n;};
 function loginLink(){const a=node("a","commerce-btn primary","Sign in to purchase ↗");a.href="/login/?next=%2Fdashboard%2F%23billing";return a;}
 function renderPlans(plans){
  const root=$("#catalog-plans");root.replaceChildren();
  if(!plans.length){root.append(empty("Membership plans are not published yet. Please check back soon."));return;}
  plans.forEach(p=>{const c=node("article","commerce-catalog-card"),k=node("span","commerce-label","MONTHLY MEMBERSHIP"),h=node("h3","",p.name),desc=node("p","",p.description||"Hosted access with a defined monthly credit allowance."),price=node("div","commerce-price",money(p.priceMinor,p.currency)),per=node("small",""," / month"),credits=node("span","commerce-status-pill",Number(p.monthlyCredits).toLocaleString()+" credits per month"),a=loginLink();price.append(per);c.append(k,h,desc,price,credits,a);root.append(c);});
 }
 function renderProducts(products){
  const root=$("#catalog-products");root.replaceChildren();
  if(!products.length){root.append(empty("No products are published yet. The catalogue will show products once they have been reviewed and priced."));return;}
  products.forEach(p=>{
   const c=node("article","commerce-catalog-card"),category=node("span","commerce-label",String(p.category||"tool").replaceAll("_"," ").toUpperCase()),h=node("h3","",p.name),desc=node("p","",p.summary||p.description||"A practical TeamPeach tool.");
   c.append(category,h,desc);
   if(p.selfHostedEnabled){const price=node("div","commerce-price",money(p.priceMinor,p.currency)),kind=node("small",""," one-time licence");price.append(kind);c.append(price);}
   else if(p.hostedEnabled)c.append(node("div","commerce-price","Included with membership"));
   const flags=node("div","commerce-payment-methods");if(p.hostedEnabled)flags.append(node("span","commerce-status-pill good","Hosted runs available"));if(p.selfHostedEnabled)flags.append(node("span","commerce-status-pill","Source-code licence"));c.append(flags);
   if(p.features&&p.features.length){const ul=document.createElement("ul");ul.className="commerce-feature-list";p.features.slice(0,5).forEach(f=>ul.append(node("li","",f)));c.append(ul);}
   const example=node("div","commerce-notice","Sample output is illustrative. Live processing requires sign-in, active membership and usage credits.");
   const a=loginLink();a.textContent=p.selfHostedEnabled?"Sign in to purchase licence ↗":"View in your workspace ↗";c.append(example,a);root.append(c);
  });
 }
 function renderPacks(packs){
  const root=$("#catalog-packs");root.replaceChildren();
  if(!packs.length){root.append(empty("Credit packs are not available yet. Membership plans include their own monthly allowance."));return;}
  packs.forEach(p=>{const c=node("article","commerce-catalog-card"),k=node("span","commerce-label","ONE-TIME TOP-UP"),h=node("h3","",p.name),desc=node("p","",p.description||"Additional hosted-tool usage credits."),price=node("div","commerce-price",money(p.priceMinor,p.currency)),credits=node("span","commerce-status-pill",Number(p.credits).toLocaleString()+" credits"),a=loginLink();c.append(k,h,desc,price,credits,a);root.append(c);});
 }
 async function load(){
  try{const r=await fetch("/api/commerce/catalog",{credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||"Catalogue is temporarily unavailable.");renderPlans(d.plans||[]);renderProducts(d.products||[]);renderPacks(d.creditPacks||[]);}
  catch(e){["#catalog-plans","#catalog-products","#catalog-packs"].forEach(s=>{const n=$(s);if(n)n.replaceChildren(empty(e.message));});const fb=$("#catalog-feedback");if(fb)fb.textContent=e.message;}
 }
 load();
})();