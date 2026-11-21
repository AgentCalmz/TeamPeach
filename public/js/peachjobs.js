"use strict";
(function(){
 const API="https://teampeach-domain-api.creatorletofficial.workers.dev";
 const $=id=>document.getElementById(id);
 const number=new Intl.NumberFormat();
 let page=1,hasMore=false,searchRequest=0,activeController=null,inputTimer=null;
 const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
 function setText(id,value){const node=$(id);if(node)node.textContent=value;}
 function ago(value){
  if(!value)return "Date not supplied";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return "Date not supplied";
  const days=Math.floor((Date.now()-date.getTime())/86400000);
  if(days<=0)return "Today";if(days===1)return "Yesterday";return days+" days ago";
 }
 function sourceName(ats){return ({ashby:"Ashby",greenhouse:"Greenhouse",lever:"Lever"})[ats]||"Employer career page";}
 function safeHttps(value){
  try{const url=new URL(String(value||""));return url.protocol==="https:"?url.href:"#";}
  catch{return "#";}
 }
 async function api(path,signal){
  let lastError;
  for(let attempt=0;attempt<2;attempt++){
   try{
    const response=await fetch(API+path,{method:"GET",mode:"cors",credentials:"omit",cache:"no-store",signal,headers:{Accept:"application/json"}});
    const body=await response.text();
    let data;
    try{data=JSON.parse(body);}catch{throw new Error("The job service returned an unexpected response (HTTP "+response.status+").");}
    if(!response.ok||data.ok===false){
     const reason=[data.error,data.detail].filter(Boolean).join(": ");
     throw new Error(reason||"The job service returned HTTP "+response.status+".");
    }
    return data;
   }catch(error){
    if(error&&error.name==="AbortError")throw error;
    lastError=error;
    if(attempt===0)await new Promise(resolve=>setTimeout(resolve,350));
   }
  }
  throw lastError||new Error("The job service is temporarily unavailable.");
 }
 function readFilters(){
  return {
   q:$("pj-q").value.trim(),
   location:$("pj-location").value.trim(),
   remote:$("pj-remote").value,
   type:$("pj-type").value,
   days:$("pj-days").value||"30"
  };
 }
 function makeParams(){
  const filters=readFilters(),params=new URLSearchParams();
  if(filters.q)params.set("q",filters.q);
  if(filters.location)params.set("location",filters.location);
  if(filters.remote&&filters.remote!=="any")params.set("remote",filters.remote);
  if(filters.type)params.set("type",filters.type);
  params.set("days",filters.days);
  params.set("page",String(page));
  params.set("limit","20");
  return params;
 }
 function activeFilterList(){
  const filters=readFilters(),items=[];
  if(filters.q)items.push(["q","Keywords",filters.q]);
  if(filters.location)items.push(["location","Location",filters.location]);
  if(filters.remote&&filters.remote!=="any")items.push(["remote","Work",({remote:"Remote",hybrid:"Hybrid",onsite:"On-site"})[filters.remote]||filters.remote]);
  if(filters.type)items.push(["type","Type",({full:"Full-time",part:"Part-time",contract:"Contract",intern:"Internship",temporary:"Temporary"})[filters.type]||filters.type]);
  if(filters.days!=="30")items.push(["days","Date",({1:"Last 24 hours",7:"Last 7 days",14:"Last 14 days"})[filters.days]||("Last "+filters.days+" days")]);
  return items;
 }
 function updateActiveFilters(){
  const container=$("pj-filter-chips"),items=activeFilterList();
  container.replaceChildren();
  $("pj-clear-filters").disabled=items.length===0;
  setText("pj-filter-summary",items.length?items.length+" filter"+(items.length===1?"":"s")+" selected":"Showing all recent opportunities");
  if(!items.length){
   const empty=document.createElement("span");empty.className="pj-no-filter";empty.textContent="No filters applied";container.appendChild(empty);return;
  }
  for(const [key,label,value] of items){
   const chip=document.createElement("button");chip.type="button";chip.className="pj-filter-chip";chip.dataset.filter=key;
   const name=document.createElement("span");name.textContent=label+": "+value;
   const close=document.createElement("b");close.setAttribute("aria-hidden","true");close.textContent="×";
   chip.append(name,close);container.appendChild(chip);
  }
 }
 function render(items,append){
  const target=$("pj-results");
  if(!append)target.replaceChildren();
  if(!items.length&&!append){
   const empty=document.createElement("div");empty.className="pj-empty";
   empty.textContent="No listings match these filters. Remove one filter or widen your search to see more opportunities.";
   target.appendChild(empty);return;
  }
  for(const job of items){
   const card=document.createElement("article");card.className="pj-card";
   const company=String(job.company||"Employer not supplied");
   const mark=document.createElement("div");mark.className="pj-card-top";
   const badge=document.createElement("b");badge.className="pj-company-mark";badge.textContent=company.trim().charAt(0).toUpperCase()||"?";
   const date=document.createElement("span");date.textContent=ago(job.published_at);
   const status=document.createElement("small");status.className=job.status==="stale"?"pj-stale":"";status.textContent=job.status==="stale"?"Last seen earlier":"Recently observed";
   mark.append(badge,date,status);
   const title=document.createElement("h3");title.textContent=String(job.title||"Untitled position");
   const employer=document.createElement("strong");employer.className="pj-company";employer.textContent=company;
   const meta=document.createElement("div");meta.className="pj-meta";
   const values=[
    "⌖ "+String(job.location||"Location not supplied"),
    job.remote_status==="unspecified"?"Work arrangement not specified":String(job.remote_status||"Work arrangement not specified"),
    String(job.employment_type||"Employment type not specified")
   ];
   for(const value of values){const span=document.createElement("span");span.textContent=value;meta.appendChild(span);}
   const source=document.createElement("p");source.className="pj-card-source";source.textContent="Source: "+sourceName(job.ats);
   const bottom=document.createElement("div");bottom.className="pj-card-bottom";
   const seen=document.createElement("small");seen.textContent="Last checked "+ago(job.last_seen_at);
   const link=document.createElement("a");const apply=safeHttps(job.apply_url);link.href=apply!=="#"?apply:safeHttps(job.job_url);link.target="_blank";link.rel="noopener noreferrer";link.textContent="View original listing ↗";
   if(link.href==="#")link.removeAttribute("target");
   bottom.append(seen,link);card.append(mark,title,employer,meta,source,bottom);target.appendChild(card);
  }
 }
 function clearOneFilter(key){
  const inputs={q:"pj-q",location:"pj-location",remote:"pj-remote",type:"pj-type",days:"pj-days"};
  if(!inputs[key])return;
  const node=$(inputs[key]);
  node.value=key==="remote"?"any":key==="days"?"30":"";
  updateActiveFilters();search(false);
 }
 async function search(append){
  if(!append)page=1;
  if(activeController)activeController.abort();
  const controller=new AbortController();activeController=controller;
  const request=++searchRequest,button=$("pj-search-button"),results=$("pj-results");
  button.disabled=true;button.textContent="Searching…";
  results.classList.add("pj-loading");
  if(!append)results.innerHTML='<div class="pj-empty">Applying your filters and finding matching listings…</div>';
  setText("pj-result-count","Searching the job index…");
  updateActiveFilters();
  try{
   const data=await api("/v1/jobs?"+makeParams().toString(),controller.signal);
   if(request!==searchRequest)return;
   if(!Array.isArray(data.results))throw new Error("The job service response is missing its results list.");
   render(data.results,!!append);
   const total=Number(data.total)||0;
   setText("pj-result-count",number.format(total)+" matching listing"+(total===1?"":"s")+" · newest first");
   setText("pj-filter-summary",activeFilterList().length?activeFilterList().length+" filter"+(activeFilterList().length===1?"":"s")+" applied · "+number.format(total)+" matches":"All recent opportunities · "+number.format(total)+" matches");
   hasMore=!!data.has_more;$("pj-load-more").hidden=!hasMore;
  }catch(error){
   if(request!==searchRequest||error&&error.name==="AbortError")return;
   console.error("[PeachJobs] Search failed",error);
   if(!append){
    const message=String(error&&error.message||"Unknown error").slice(0,180);
    results.innerHTML='<div class="pj-empty">We could not complete this search. Please try again.<small class="pj-search-diagnostic">Diagnostic: '+esc(message)+'</small><br><a href="'+API+'/v1/jobs/health" target="_blank" rel="noopener noreferrer">Check service status</a></div>';
   }
   setText("pj-result-count","Search unavailable");
  }finally{
   if(request===searchRequest){
    results.classList.remove("pj-loading");
    button.disabled=false;button.innerHTML='Search jobs <span>↗</span>';
    activeController=null;
   }
  }
 }
 async function metrics(){
  try{
   const [health,stats]=await Promise.all([api("/v1/jobs/health"),api("/v1/jobs/stats")]);
   setText("pj-total-jobs",number.format(stats.jobs||0));setText("pj-employers",number.format(stats.employers||0));
   const date=stats.latest_collection&&stats.latest_collection.collected_at;
   setText("pj-last-run",date?new Date(date).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):"Awaiting first collection");
   setText("pj-index-status",health.database==="ready"?"Connected":"Not ready");
  }catch(error){console.error("[PeachJobs] Index status failed",error);setText("pj-index-status","Not connected");}
 }
 const form=$("pj-search-form");
 form.addEventListener("submit",event=>{event.preventDefault();if(inputTimer)clearTimeout(inputTimer);search(false);});
 function applyChangedFilter(){if(inputTimer)clearTimeout(inputTimer);search(false);}
 $("pj-remote").addEventListener("change",applyChangedFilter);
 $("pj-type").addEventListener("change",applyChangedFilter);
 $("pj-days").addEventListener("change",applyChangedFilter);
 for(const id of ["pj-q","pj-location"]){
  $(id).addEventListener("input",()=>{
   if(inputTimer)clearTimeout(inputTimer);
   updateActiveFilters();
   inputTimer=setTimeout(()=>search(false),450);
  });
 }
 $("pj-clear-filters").addEventListener("click",()=>{
  $("pj-q").value="";$("pj-location").value="";$("pj-remote").value="any";$("pj-type").value="";$("pj-days").value="30";
  updateActiveFilters();search(false);
 });
 $("pj-filter-chips").addEventListener("click",event=>{
  const chip=event.target.closest("button[data-filter]");
  if(chip)clearOneFilter(chip.dataset.filter);
 });
 $("pj-load-more").addEventListener("click",()=>{if(hasMore){page++;search(true);}});
 updateActiveFilters();metrics();search(false);
})();