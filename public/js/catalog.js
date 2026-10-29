"use strict";
(function(){
 const $=s=>document.querySelector(s);
 const money=(minor,currency="USD")=>new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
 const empty=message=>node("div","commerce-empty",message);
 let signedIn=false;
 function actionLink(destination,signedInLabel,guestLabel){
  const a=node("a","commerce-btn primary",signedIn?signedInLabel:guestLabel);
  a.href=signedIn?destination:"/login/?next="+encodeURIComponent(destination);
  return a;
 }
 function renderPlans(plans){
  const root=$("#catalog-plans");root.replaceChildren();
  if(!plans.length){root.append(empty("Membership plans are not published yet. Please check back soon."));return;}
  plans.forEach(p=>{
   const c=node("article","commerce-catalog-card"),k=node("span","commerce-label","MONTHLY MEMBERSHIP"),h=node("h3","",p.name),
    desc=node("p","",p.description||"Hosted access with a defined monthly credit allowance."),
    price=node("div","commerce-price",money(p.priceMinor,p.currency)),per=node("small",""," / month"),
    credits=node("span","commerce-status-pill",Number(p.monthlyCredits).toLocaleString()+" credits per month"),
    a=actionLink("/dashboard/billing/#commerce-plans","Manage membership ↗","Sign in to purchase ↗");
   price.append(per);c.append(k,h,desc,price,credits,a);root.append(c);
  });
 }
 function renderProducts(products){
  const root=$("#catalog-products");root.replaceChildren();
  if(!products.length){root.append(empty("No products are published yet. The catalogue will show products once they have been reviewed and priced."));return;}
  products.forEach(p=>{
   const c=node("article","commerce-catalog-card"),category=node("span","commerce-label",String(p.category||"tool").replaceAll("_"," ").toUpperCase()),
    h=node("h3","",p.name),desc=node("p","",p.summary||p.description||"A practical TeamPeach tool.");
   c.append(category,h,desc);
   if(p.selfHostedEnabled){const price=node("div","commerce-price",money(p.priceMinor,p.currency)),kind=node("small",""," one-time licence");price.append(kind);c.append(price);}
   else if(p.hostedEnabled)c.append(node("div","commerce-price","Included with membership"));
   const flags=node("div","commerce-payment-methods");
   if(p.hostedEnabled)flags.append(node("span","commerce-status-pill good","Hosted runs available"));
   if(p.selfHostedEnabled)flags.append(node("span","commerce-status-pill","Source-code licence"));
   c.append(flags);
   if(p.features&&p.features.length){const ul=document.createElement("ul");ul.className="commerce-feature-list";p.features.slice(0,5).forEach(f=>ul.append(node("li","",f)));c.append(ul);}
   c.append(node("div","commerce-notice","Sample output is illustrative. Live processing requires sign-in, an active membership and sufficient usage credits."));
   const dest=p.selfHostedEnabled?"/dashboard/billing/#commerce-products":"/dashboard/tools/";
   const signedLabel=p.selfHostedEnabled?"Continue to purchase ↗":"Open in your workspace ↗";
   c.append(actionLink(dest,signedLabel,p.selfHostedEnabled?"Sign in to purchase licence ↗":"Sign in to use this tool ↗"));root.append(c);
  });
 }
 function renderPacks(packs){
  const root=$("#catalog-packs");root.replaceChildren();
  if(!packs.length){root.append(empty("Credit packs are not available yet. Membership plans include their own monthly allowance."));return;}
  packs.forEach(p=>{
   const c=node("article","commerce-catalog-card"),k=node("span","commerce-label","ONE-TIME TOP-UP"),h=node("h3","",p.name),
    desc=node("p","",p.description||"Additional hosted-tool usage credits."),price=node("div","commerce-price",money(p.priceMinor,p.currency)),
    credits=node("span","commerce-status-pill",Number(p.credits).toLocaleString()+" credits"),
    a=actionLink("/dashboard/billing/#commerce-topups","Buy credits ↗","Sign in to purchase ↗");
   c.append(k,h,desc,price,credits,a);root.append(c);
  });
 }
 async function load(){
  try{
   const [catalogResponse,sessionResponse]=await Promise.all([
    fetch("/api/commerce/catalog",{credentials:"same-origin",cache:"no-store"}),
    fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"})
   ]);
   const d=await catalogResponse.json().catch(()=>({}));
   const session=await sessionResponse.json().catch(()=>({}));
   signedIn=Boolean(sessionResponse.ok&&session.user);
   if(!catalogResponse.ok)throw new Error(d.message||"Catalogue is temporarily unavailable.");
   renderPlans(d.plans||[]);renderProducts(d.products||[]);renderPacks(d.creditPacks||[]);
  }catch(error){
   ["#catalog-plans","#catalog-products","#catalog-packs"].forEach(selector=>{const n=$(selector);if(n)n.replaceChildren(empty(error.message));});
   const fb=$("#catalog-feedback");if(fb)fb.textContent=error.message;
  }
 }
 load();
})();