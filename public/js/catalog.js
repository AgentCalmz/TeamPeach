"use strict";
(function(){
 const $=s=>document.querySelector(s);
 const money=(minor,currency="USD")=>new Intl.NumberFormat(undefined,{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
 const empty=message=>node("div","commerce-empty",message);
 let signedIn=false;
 function action(label,guestNext,signedHref,signedLabel){
  const a=node("a","commerce-btn primary",signedIn?signedLabel:label);
  a.href=signedIn?signedHref:"/login/?next="+encodeURIComponent(guestNext);
  if(!signedIn)a.textContent=label;
  return a;
 }
 function renderPlans(plans){
  const root=$("#catalog-plans");if(!root)return;root.replaceChildren();
  if(!plans.length){root.append(empty("Membership plans are not published yet. Please check back soon."));return;}
  plans.forEach(p=>{
   const c=node("article","commerce-catalog-card"),k=node("span","commerce-label","MONTHLY MEMBERSHIP"),h=node("h3","",p.name),desc=node("p","",p.description||"Hosted access with a defined monthly credit allowance."),price=node("div","commerce-price",money(p.priceMinor,p.currency)),per=node("small",""," / month"),credits=node("span","commerce-status-pill",Number(p.monthlyCredits).toLocaleString()+" credits per month");
   price.append(per);c.append(k,h,desc,price,credits,action("Sign in to continue ↗","/dashboard/billing/#commerce-plans","/dashboard/billing/#commerce-plans","Manage membership ↗"));root.append(c);
  });
 }
 function renderProducts(products){
  const root=$("#catalog-products");if(!root)return;root.replaceChildren();
  if(!products.length){root.append(empty("No products are published yet. The catalogue will show products once reviewed and priced."));return;}
  products.forEach(p=>{
   const c=node("article","commerce-catalog-card"),category=node("span","commerce-label",String(p.category||"tool").replaceAll("_"," ").toUpperCase()),h=node("h3","",p.name),desc=node("p","",p.summary||p.description||"A practical TeamPeach tool.");
   c.append(category,h,desc);
   if(p.selfHostedEnabled){const price=node("div","commerce-price",money(p.priceMinor,p.currency)),kind=node("small",""," one-time licence");price.append(kind);c.append(price);}
   else if(p.hostedEnabled)c.append(node("div","commerce-price","Included with membership"));
   const flags=node("div","commerce-payment-methods");
   if(p.hostedEnabled)flags.append(node("span","commerce-status-pill good","Hosted runs available"));
   if(p.selfHostedEnabled)flags.append(node("span","commerce-status-pill","Source-code licence"));
   c.append(flags);
   if(p.features&&p.features.length){const ul=document.createElement("ul");ul.className="commerce-feature-list";p.features.slice(0,5).forEach(f=>ul.append(node("li","",f)));c.append(ul);}
   const note=node("div","commerce-notice",p.hostedEnabled?"Hosted use requires sign-in, an eligible membership and usage credits.":"Review licence scope, delivery notes and supported payment options before purchase.");
   c.append(note);
   const actions=node("div","commerce-actions");
   if(p.hostedEnabled)actions.append(action("Sign in to open ↗","/dashboard/tools/","/dashboard/tools/","Open in workspace ↗"));
   if(p.selfHostedEnabled)actions.append(action("Sign in to purchase ↗","/dashboard/billing/#commerce-products","/dashboard/billing/#commerce-products","Manage licences ↗"));
   c.append(actions);root.append(c);
  });
 }
 function renderPacks(packs){
  const root=$("#catalog-packs");if(!root)return;root.replaceChildren();
  if(!packs.length){root.append(empty("Credit packs are not available yet. Membership plans include their own monthly allowance."));return;}
  packs.forEach(p=>{
   const c=node("article","commerce-catalog-card"),k=node("span","commerce-label","ONE-TIME TOP-UP"),h=node("h3","",p.name),desc=node("p","",p.description||"Additional hosted-tool usage credits."),price=node("div","commerce-price",money(p.priceMinor,p.currency)),credits=node("span","commerce-status-pill",Number(p.credits).toLocaleString()+" credits");
   c.append(k,h,desc,price,credits,action("Sign in to buy credits ↗","/dashboard/billing/#commerce-topups","/dashboard/billing/#commerce-topups","Buy credits ↗"));root.append(c);
  });
 }
 async function load(){
  try{
   const [catalogResponse,sessionResponse]=await Promise.all([
    fetch("/api/commerce/catalog",{credentials:"same-origin",cache:"no-store"}),
    fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"}).catch(()=>null)
   ]);
   const data=await catalogResponse.json().catch(()=>({}));
   if(!catalogResponse.ok)throw new Error(data.message||"Catalogue is temporarily unavailable.");
   const session=sessionResponse&&sessionResponse.ok?await sessionResponse.json().catch(()=>null):null;
   signedIn=Boolean(session&&session.user);
   renderPlans(data.plans||[]);renderProducts(data.products||[]);renderPacks(data.creditPacks||[]);
  }catch(error){
   ["#catalog-plans","#catalog-products","#catalog-packs"].forEach(selector=>{const root=$(selector);if(root)root.replaceChildren(empty(error.message));});
   const feedback=$("#catalog-feedback");if(feedback)feedback.textContent=error.message;
  }
 }
 load();
})();