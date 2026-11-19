"use strict";
(function(){
 const API="https://teampeach-domain-api.creatorletofficial.workers.dev";
 const $=id=>document.getElementById(id);
 const number=new Intl.NumberFormat();
 let page=1,hasMore=false;
 const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
 function ago(value){
  if(!value)return "Date not supplied";
  const days=Math.floor((Date.now()-new Date(value).getTime())/86400000);
  if(days<=0)return "Today";if(days===1)return "Yesterday";return days+" days ago";
 }
 function sourceName(ats){return ({ashby:"Ashby",greenhouse:"Greenhouse",lever:"Lever"})[ats]||"Employer career page";}
 function setText(id,value){const node=$(id);if(node)node.textContent=value;}
 async function api(path){
  const r=await fetch(API+path,{method:"GET",mode:"cors",credentials:"omit",cache:"no-store",headers:{Accept:"application/json"}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.ok===false)throw new Error(data.error||"The PeachJobs index is temporarily unavailable.");
  return data;
 }
 function makeParams(){
  const p=new URLSearchParams();
  const q=$("pj-q").value.trim(),location=$("pj-location").value.trim();
  if(q)p.set("q",q);if(location)p.set("location",location);
  p.set("remote",$("pj-remote").value);p.set("type",$("pj-type").value);p.set("days",$("pj-days").value);
  p.set("page",String(page));p.set("limit","20");return p;
 }
 function render(items,append){
  if(!append)$("pj-results").replaceChildren();
  if(!items.length&&!append){$("pj-results").innerHTML='<div class="pj-empty">No matching listings were found. Try a wider location or remove one of the filters.</div>';return;}
  for(const job of items){
   const card=document.createElement("article");card.className="pj-card";
   const first=(job.company||"?").trim().charAt(0).toUpperCase();
   const status=job.status==="stale"?'<small class="pj-stale">Last seen earlier</small>':'<small>Recently observed</small>';
   const apply=/^https:\/\//i.test(job.apply_url||"")?job.apply_url:job.job_url;
   const location=job.location||"Location not supplied";
   const work=job.remote_status==="unspecified"?"Work arrangement not specified":job.remote_status;
   const type=job.employment_type||"Employment type not specified";
   card.innerHTML='<div class="pj-card-top"><b class="pj-company-mark">'+esc(first)+'</b><span>'+esc(ago(job.published_at))+'</span>'+status+'</div>'+
    '<h3>'+esc(job.title)+'</h3><strong class="pj-company">'+esc(job.company)+'</strong>'+
    '<div class="pj-meta"><span>⌖ '+esc(location)+'</span><span>'+esc(work)+'</span><span>'+esc(type)+'</span></div>'+
    '<p class="pj-card-source">Source: '+esc(sourceName(job.ats))+'</p>'+
    '<div class="pj-card-bottom"><small>Last checked '+esc(ago(job.last_seen_at))+'</small><a href="'+esc(app||job.job_url)+'" target="_blank" rel="noopener noreferrer">View original listing ↗</a></div>';
   $("pj-results").appendChild(card);
  }
 }
 async function search(append){
  if(!append)page=1;
  const button=$("pj-search-button");button.disabled=true;button.textContent="Searching…";
  try{
   const data=await api("/v1/jobs?"+makeParams().toString());
   render(data.results||[],!!append);
   setText("pj-result-count",number.format(data.total||0)+" matching listings · last "+data.days+" days");
   hasMore=!!data.has_more;$("pj-load-more").hidden=!hasMore;
  }catch(error){
   if(!append)$("pj-results").innerHTML='<div class="pj-empty">'+esc(error.message)+'<br>The index may still need its first Cloudflare collection.</div>';
   setText("pj-result-count","Search unavailable");
  }finally{button.disabled=false;button.innerHTML='Search jobs <span>↗</span>';}
 }
 async function metrics(){
  try{
   const [health,stats]=await Promise.all([api("/v1/jobs/health"),api("/v1/jobs/stats")]);
   setText("pj-total-jobs",number.format(stats.jobs||0));setText("pj-employers",number.format(stats.employers||0));
   const date=stats.latest_collection&&stats.latest_collection.collected_at;
   setText("pj-last-run",date?new Date(date).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}):"Awaiting first collection");
   setText("pj-index-status",health.database==="ready"?"Connected":"Not ready");
  }catch{setText("pj-index-status","Not connected");}
 }
 $("pj-search-form").addEventListener("submit",event=>{event.preventDefault();search(false);});
 $("pj-load-more").addEventListener("click",()=>{if(hasMore){page++;search(true);}});
 metrics();search(false);
})();
