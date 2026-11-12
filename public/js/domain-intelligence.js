"use strict";
(function(){
  const API="https://teampeach-domain-api.creatorletofficial.workers.dev";
  const $=selector=>document.querySelector(selector);
  const form=$("#di-search-form");
  const input=$("#di-domain-input");
  const button=$("#di-search-button");
  const result=$("#di-result");
  const feedback=$("#di-search-feedback");
  const nf=new Intl.NumberFormat(undefined,{maximumFractionDigits:0});
  const labels={
    new_domains:{title:"Newly observed",description:"Appeared in Webamon's newly observed zone-file feed. This is not a confirmed registrar creation date."},
    removed_domains:{title:"Removed",description:"Appeared in Webamon's removed-domain feed. This does not confirm expiry or current availability."},
    whoisfreaks_expired:{title:"Expired",description:"Included in WhoisFreaks' public expired-domain feed. Coverage is limited."},
    whoisfreaks_dropped:{title:"Dropped",description:"Included in WhoisFreaks' public dropped-domain feed. This is not a current availability check."}
  };
  function say(message,state){
    if(!feedback)return;
    feedback.textContent=message||"";
    feedback.dataset.state=state||"";
  }
  function setNumber(selector,value){
    const node=$(selector);
    if(node)node.textContent=Number.isFinite(Number(value))?nf.format(Number(value)):"—";
  }
  function node(tag,className,value){
    const item=document.createElement(tag);
    if(className)item.className=className;
    if(value!==undefined)item.textContent=String(value);
    return item;
  }
  async function api(path){
    const response=await fetch(API+path,{method:"GET",mode:"cors",credentials:"omit",cache:"no-store",headers:{Accept:"application/json"}});
    const body=await response.json().catch(()=>({}));
    if(!response.ok||body.ok===false)throw new Error(body.detail||body.error||"The domain data service is temporarily unavailable.");
    return body;
  }
  async function loadSummary(){
    try{
      const data=await api("/v1/latest");
      setNumber("#di-indexed-domains",data.lookup_index&&data.lookup_index.unique_domains);
      setNumber("#di-new-count",data.counts&&data.counts.new_domains);
      setNumber("#di-removed-count",data.counts&&data.counts.removed_domains);
      setNumber("#di-expired-count",data.counts&&data.counts.whoisfreaks_expired);
      setNumber("#di-dropped-count",data.counts&&data.counts.whoisfreaks_dropped);
      if($("#di-snapshot-date"))$("#di-snapshot-date").textContent=data.date||"Unknown";
      if($("#di-data-status"))$("#di-data-status").textContent=data.status==="complete"?"Up to date":data.status==="partial"?"Partially updated":"Available";
      if($("#di-updated-note"))$("#di-updated-note").textContent="Snapshot: "+(data.date||"unknown")+" · fetched "+(data.fetched_at||"time unavailable");
    }catch(error){
      if($("#di-snapshot-date"))$("#di-snapshot-date").textContent="Unavailable";
      if($("#di-data-status"))$("#di-data-status").textContent="Connection issue";
      if($("#di-updated-note"))$("#di-updated-note").textContent="The latest data summary could not be retrieved.";
    }
  }
  function renderResult(data){
    result.replaceChildren();
    result.hidden=false;
    result.dataset.found=String(Boolean(data.found));
    const top=node("div","domain-intel-result-top");
    const heading=node("div","");
    heading.append(node("span","di-stat-label","DOMAIN CHECK"));
    heading.append(node("h3","domain-intel-result-domain",data.domain));
    top.append(heading,node("span","domain-intel-result-state",data.found?"Found in dataset":"No match in dataset"));
    result.append(top);
    result.append(node("p","domain-intel-result-copy",data.found?
      "This domain appears in one or more of the latest source feeds. Review the individual signals below before drawing conclusions.":
      "This exact domain was not found in the latest source feeds checked. That is not proof that it is safe, unregistered or available."));
    if(data.snapshot_date){
      result.append(node("p","domain-intel-result-copy","Dataset date: "+data.snapshot_date));
    }
    if(data.found){
      const grid=node("div","domain-intel-signal-list");
      (data.signals||[]).forEach(key=>{
        const info=labels[key];
        if(!info)return;
        const card=node("article","domain-intel-signal");
        card.append(node("strong","",info.title),node("p","",info.description));
        grid.append(card);
      });
      result.append(grid);
    }
  }
  async function lookup(value){
    const domain=String(value||"").trim().toLowerCase();
    if(!domain){say("Enter a domain name to check.","error");input.focus();return;}
    button.disabled=true;
    button.textContent="Checking…";
    say("Checking the latest domain dataset…","");
    result.hidden=true;
    try{
      const data=await api("/v1/domain?domain="+encodeURIComponent(domain));
      renderResult(data);
      say(data.found?"Domain match found in the current dataset.":"No match in the current dataset.","success");
    }catch(error){
      say(error.message,"error");
    }finally{
      button.disabled=false;
      button.innerHTML='Check domain <span>↗</span>';
    }
  }
  form?.addEventListener("submit",event=>{
    event.preventDefault();
    lookup(input.value);
  });
  document.querySelectorAll("[data-domain-example]").forEach(item=>{
    item.addEventListener("click",()=>{
      input.value=item.getAttribute("data-domain-example")||"";
      lookup(input.value);
    });
  });
  loadSummary();
})();
