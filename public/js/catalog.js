"use strict";
(function(){
 const $=s=>document.querySelector(s);
 const money=(minor,currency="USD")=>new Intl.NumberFormat(undefined,{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
 const empty=message=>node("div","commerce-empty",message);
 let signedIn=false, overview=null, catalogGateways={}, csrf="";
 function say(message,state){const el=$("#catalog-feedback");if(el){el.textContent=message||"";el.dataset.state=state||"";}}
 async function token(){
  if(csrf)return csrf;
  const response=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"}),body=await response.json().catch(()=>({}));
  if(!response.ok||!body.token)throw new Error(body.message||"Secure checkout could not be prepared. Refresh the page and retry.");
  csrf=body.token;return csrf;
 }
 async function checkout(type,slug,gateway,button){
  if(button)button.disabled=true;say("Preparing secure "+gateway+" checkout…","");
  try{
   const body={type,gateway};
   if(type==="membership")body.planSlug=slug;
   if(type==="credit_topup")body.packSlug=slug;
   if(type==="tool_license")body.productSlug=slug;
   const response=await fetch("/api/commerce/checkout",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json","X-CSRF-Token":await token()},body:JSON.stringify(body)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.message||"Checkout could not be started.");
   if(typeof result.checkoutUrl!=="string"||!/^https:\/\//i.test(result.checkoutUrl))throw new Error("The payment provider returned an invalid checkout address.");
   location.assign(result.checkoutUrl);
  }catch(error){say(error.message,"error");if(button)button.disabled=false;}
 }
 function checkoutButtons(type,slug,available){
  const wrap=node("div","commerce-actions");
  const gateways=catalogGateways;
  const options=[["paystack","Paystack"],["flutterwave","Flutterwave"]].filter(([key])=>Boolean(gateways[key]&&available[key]));
  if(!options.length){
   const info=node("p","commerce-notice","Online checkout for this item is not fully configured yet. You can still review membership and billing in your workspace.");
   wrap.append(info);
   const a=node("a","commerce-btn primary","Open billing ↗");a.href="/dashboard/billing/";wrap.append(a);return wrap;
  }
  options.forEach(([key,label])=>{
   const button=node("button","commerce-btn primary","Pay with "+label+" ↗");button.type="button";button.addEventListener("click",()=>checkout(type,slug,key,button));wrap.append(button);
  });
  return wrap;
 }
 function signedInLink(label,destination){
  const a=node("a","commerce-btn primary",label);a.href=destination;return a;
 }
 function guestLink(label,destination){
  const a=node("a","commerce-btn primary",label);a.href="/login/?next="+encodeURIComponent(destination);return a;
 }
 function renderPlans(plans){
  const root=$("#catalog-plans");if(!root)return;root.replaceChildren();
  if(!plans.length){root.append(empty("Membership plans are not published yet. Please check back soon."));return;}
  plans.forEach(p=>{
   const c=node("article","commerce-catalog-card"),k=node("span","commerce-label","MONTHLY MEMBERSHIP"),h=node("h3","",p.name),desc=node("p","",p.description||"Hosted access with a defined monthly credit allowance."),price=node("div","commerce-price",money(p.priceMinor,p.currency)),per=node("small",""," / month"),credits=node("span","commerce-status-pill",Number(p.monthlyCredits).toLocaleString()+" credits per month");
   price.append(per);c.append(k,h,desc,price,credits);
   if(!signedIn)c.append(guestLink("Sign in to continue ↗","/dashboard/billing/#commerce-plans"));
   else if(overview&&overview.membershipActive)c.append(signedInLink("View membership ↗","/dashboard/billing/#commerce-membership"));
   else c.append(checkoutButtons("membership",p.slug,p.availableGateways||{}));
   root.append(c);
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
   c.append(node("div","commerce-notice",p.hostedEnabled?"Hosted use requires sign-in, an eligible membership and usage credits.":"Review licence scope, delivery notes and supported payment options before purchase."));
   if(p.hostedEnabled)c.append(signedIn?signedInLink("Open in workspace ↗","/dashboard/tools/"):guestLink("Sign in to open ↗","/dashboard/tools/"));
   if(p.selfHostedEnabled){
    if(signedIn)c.append(checkoutButtons("tool_license",p.slug,catalogGateways));
    else c.append(guestLink("Sign in to purchase ↗","/dashboard/billing/#commerce-products"));
   }
   root.append(c);
  });
 }
 function renderPacks(packs){
  const root=$("#catalog-packs");if(!root)return;root.replaceChildren();
  if(!packs.length){root.append(empty("Credit packs are not available yet. Membership plans include their own monthly allowance."));return;}
  packs.forEach(p=>{
   const c=node("article","commerce-catalog-card"),k=node("span","commerce-label","ONE-TIME TOP-UP"),h=node("h3","",p.name),desc=node("p","",p.description||"Additional hosted-tool usage credits."),price=node("div","commerce-price",money(p.priceMinor,p.currency)),credits=node("span","commerce-status-pill",Number(p.credits).toLocaleString()+" credits");
   c.append(k,h,desc,price,credits);
   if(signedIn)c.append(checkoutButtons("credit_topup",p.slug,catalogGateways));
   else c.append(guestLink("Sign in to buy credits ↗","/dashboard/billing/#commerce-topups"));
   root.append(c);
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
   catalogGateways=data.gateways||{};
   const session=sessionResponse&&sessionResponse.ok?await sessionResponse.json().catch(()=>null):null;
   signedIn=Boolean(session&&session.user);
   if(signedIn){
    try{
     const response=await fetch("/api/commerce/overview",{credentials:"same-origin",cache:"no-store"});
     overview=response.ok?await response.json().catch(()=>null):null;
    }catch(_){overview=null;}
   }
   renderPlans(data.plans||[]);renderProducts(data.products||[]);renderPacks(data.creditPacks||[]);
  }catch(error){
   ["#catalog-plans","#catalog-products","#catalog-packs"].forEach(selector=>{const root=$(selector);if(root)root.replaceChildren(empty(error.message));});
   say(error.message,"error");
  }
 }
 load();
})();