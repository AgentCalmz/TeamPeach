"use strict";
(function(){
  const API="https://teampeach-domain-api.creatorletofficial.workers.dev";
  const $=selector=>document.querySelector(selector);
  const nf=new Intl.NumberFormat(undefined,{maximumFractionDigits:0});
  const PAGE_SIZE=30;
  let summary=null;
  let domains=[];
  let filtered=[];
  let currentPage=1;
  let loaded=false;
  let filterTimer=null;

  const INDUSTRIES=[
    {label:"Technology",terms:["technology","tech","software","app","apps","cloud","digital","data","cyber","developer","code","systems","platform","ai"]},
    {label:"Retail & commerce",terms:["shop","shops","store","market","retail","fashion","boutique","commerce","mall","ecommerce"]},
    {label:"Finance",terms:["finance","fintech","bank","pay","payment","money","capital","credit","loan","invest","wallet","accounting"]},
    {label:"Health & care",terms:["health","clinic","medical","doctor","dental","pharma","pharmacy","care","wellness","fitness","hospital"]},
    {label:"Education",terms:["school","academy","college","university","learn","learning","education","training","course","tutor","classes"]},
    {label:"Property & construction",terms:["realty","property","properties","home","homes","estate","build","builder","construction","architect"]},
    {label:"Food & hospitality",terms:["food","cafe","coffee","restaurant","kitchen","bakery","catering","hotel","travel","tour","resort","stay"]},
    {label:"Logistics & transport",terms:["logistics","freight","cargo","shipping","delivery","dispatch","transport","moving","courier"]},
    {label:"Beauty & personal care",terms:["beauty","salon","spa","barber","hair","skincare","cosmetics","nails"]},
    {label:"Professional services",terms:["agency","studio","consult","consulting","legal","law","services","solutions","design","media"]}
  ];
  const BUSINESS_TERMS=["business","company","companies","group","groups","ventures","enterprise","enterprises","services","solutions","agency","agencies","shop","store","market","clinic","school","academy","studio","consult","logistics","restaurant","hotel","salon","property","realty","finance","software","technology","tech"];
  const CUSTOMER_TERMS=["support","help","contact","customer","customers","care","chat","booking","appointment","service","reservation","feedback"];
  const AUTOMATION_TERMS=["book","booking","order","orders","delivery","dispatch","manage","management","schedule","appointment","invoice","pay","payment","crm","workflow","automate","automation","operations","inventory","tracking"];

  function setText(selector,value){
    const item=$(selector);
    if(item)item.textContent=value==null?"—":String(value);
  }
  function number(value){
    const parsed=Number(value);
    return Number.isFinite(parsed)?nf.format(parsed):"—";
  }
  function feedback(message,state){
    const item=$("#di-explorer-feedback");
    if(!item)return;
    item.textContent=message||"";
    item.dataset.state=state||"";
  }
  function makeNode(tag,className,value){
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
      summary=await api("/v1/latest");
      setText("#di-new-count",number(summary.counts&&summary.counts.new_domains));
      setText("#di-indexed-domains",number(summary.lookup_index&&summary.lookup_index.unique_domains));
      setText("#di-removed-count",number(summary.counts&&summary.counts.removed_domains));
      setText("#di-expired-count",number(summary.counts&&summary.counts.whoisfreaks_expired));
      setText("#di-dropped-count",number(summary.counts&&summary.counts.whoisfreaks_dropped));
      setText("#di-snapshot-date",summary.date||"Unknown");
      setText("#di-data-status",summary.status==="complete"?"Up to date":summary.status==="partial"?"Partially updated":"Available");
      setText("#di-updated-note","Snapshot: "+(summary.date||"unknown")+" · fetched "+(summary.fetched_at||"time unavailable"));
      setText("#di-feed-caption",number(summary.counts&&summary.counts.new_domains)+" newly observed domains · snapshot "+(summary.date||"date unavailable"));
    }catch(error){
      setText("#di-snapshot-date","Unavailable");
      setText("#di-data-status","Connection issue");
      setText("#di-updated-note","The latest data summary could not be retrieved.");
      setText("#di-feed-caption","The latest snapshot summary is temporarily unavailable.");
    }
  }
  function domainWords(domain){
    const name=domain.slice(0,domain.lastIndexOf("."));
    return {name,words:name.split(/[.-]+/).filter(Boolean)};
  }
  function hasTerms(domain,terms){
    const parts=domainWords(domain);
    const set=new Set(parts.words);
    if(terms.some(term=>set.has(term)))return true;
    return terms.some(term=>term.length>=5&&parts.name.includes(term));
  }
  function classify(domain){
    const industry=INDUSTRIES.find(item=>hasTerms(domain,item.terms));
    const business=Boolean(industry)||hasTerms(domain,BUSINESS_TERMS);
    const customer=hasTerms(domain,CUSTOMER_TERMS);
    const automation=hasTerms(domain,AUTOMATION_TERMS);
    const fits=[];
    if(industry||business)fits.push("Website & content");
    if(customer)fits.push("Customer support");
    if(automation)fits.push("Workflow automation");
    return {industry:industry?industry.label:"",business,customer,automation,fits};
  }
  function matchesSignal(domain,signal){
    if(signal==="all")return true;
    if(signal==="business")return Boolean(INDUSTRIES.some(item=>hasTerms(domain,item.terms))||hasTerms(domain,BUSINESS_TERMS));
    if(signal==="customer")return hasTerms(domain,CUSTOMER_TERMS);
    if(signal==="automation")return hasTerms(domain,AUTOMATION_TERMS);
    return true;
  }
  function populateExtensions(){
    const select=$("#di-tld-filter");
    if(!select)return;
    const counts=new Map();
    domains.forEach(domain=>{
      const extension=domain.slice(domain.lastIndexOf(".")+1);
      counts.set(extension,(counts.get(extension)||0)+1);
    });
    const options=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    select.replaceChildren(makeNode("option","","All extensions ("+number(domains.length)+")"));
    select.firstChild.value="";
    options.forEach(([extension,count])=>{
      const option=makeNode("option","", "."+extension+" · "+number(count));
      option.value=extension;
      select.append(option);
    });
  }
  function updateFilters(){
    if(!loaded)return;
    const query=String($("#di-new-search")?.value||"").trim().toLowerCase().split(/\s+/).filter(Boolean);
    const extension=$("#di-tld-filter")?.value||"";
    const signal=$("#di-signal-filter")?.value||"all";
    filtered=domains.filter(domain=>{
      if(extension&&domain.slice(domain.lastIndexOf(".")+1)!==extension)return false;
      if(query.length&&!query.every(term=>domain.includes(term)))return false;
      return matchesSignal(domain,signal);
    });
    currentPage=1;
    renderResults();
  }
  function renderDomainCard(domain){
    const info=classify(domain);
    const card=makeNode("article","di-domain-card");
    const main=makeNode("div","di-domain-main");
    const heading=makeNode("div","di-domain-heading");
    const name=makeNode("h3","",domain);
    heading.append(name,makeNode("span","di-domain-extension","."+domain.slice(domain.lastIndexOf(".")+1)));
    main.append(heading);
    const tags=makeNode("div","di-domain-tags");
    if(info.industry)tags.append(makeNode("span","di-domain-tag",info.industry));
    else if(info.business)tags.append(makeNode("span","di-domain-tag","Business wording"));
    else tags.append(makeNode("span","di-domain-tag di-domain-tag-muted","No clear category clue"));
    info.fits.forEach(fit=>tags.append(makeNode("span","di-domain-fit", "Possible fit · "+fit)));
    main.append(tags);
    const explanation=info.industry
      ?"Name-based industry clue only. Verify the website and public evidence before treating this as a business."
      :info.fits.length
        ?"The name contains wording associated with a possible service area. This is a research hypothesis, not evidence of a service need."
        :"No obvious business or service phrase was identified in the name; it may still be worth reviewing.";
    main.append(makeNode("p","di-domain-note",explanation));
    const actions=makeNode("div","di-domain-actions");
    const visit=makeNode("a","di-domain-visit","Visit domain ↗");
    visit.href="https://"+domain;
    visit.target="_blank";
    visit.rel="noopener noreferrer";
    visit.setAttribute("aria-label","Open "+domain+" in a new tab");
    const copy=makeNode("button","di-domain-copy","Copy");
    copy.type="button";
    copy.addEventListener("click",async()=>{
      try{
        await navigator.clipboard.writeText(domain);
        copy.textContent="Copied";
        window.setTimeout(()=>{copy.textContent="Copy";},1400);
      }catch(_error){
        feedback("Your browser did not allow copying this domain. You can select the domain name instead.","error");
      }
    });
    actions.append(visit,copy);
    card.append(main,actions);
    return card;
  }
  function renderResults(){
    const list=$("#di-explorer-results");
    const pagination=$("#di-pagination");
    if(!list||!pagination)return;
    list.replaceChildren();
    const total=filtered.length;
    const pageCount=Math.max(1,Math.ceil(total/PAGE_SIZE));
    currentPage=Math.min(currentPage,pageCount);
    const start=(currentPage-1)*PAGE_SIZE;
    const pageItems=filtered.slice(start,start+PAGE_SIZE);
    if(!total){
      const empty=makeNode("div","di-empty-state");
      empty.append(makeNode("span","di-empty-icon","⌕"),makeNode("strong","","No domains match these filters."),makeNode("p","","Try a broader keyword, another extension or a different name-signal filter."));
      list.append(empty);
    }else{
      const fragment=document.createDocumentFragment();
      pageItems.forEach(domain=>fragment.append(renderDomainCard(domain)));
      list.append(fragment);
    }
    feedback(total
      ?("Showing "+number(start+1)+"–"+number(Math.min(start+PAGE_SIZE,total))+" of "+number(total)+" matching domains in the "+number(domains.length)+"-domain snapshot.")
      :"No matches in the current snapshot. Adjust the filters to broaden your search.","");
    pagination.hidden=total<=PAGE_SIZE;
    setText("#di-page-summary",number(total)+" matches");
    setText("#di-page-number","Page "+currentPage+" of "+pageCount);
    const previous=$("#di-prev-page"),next=$("#di-next-page");
    if(previous)previous.disabled=currentPage<=1;
    if(next)next.disabled=currentPage>=pageCount;
  }
  async function loadDomains(){
    const button=$("#di-load-domains");
    if(loaded||!button)return;
    if(!("DecompressionStream" in window)){
      feedback("This browser cannot unpack the compressed domain feed. Try a current version of Chrome, Edge, Firefox or Safari.","error");
      return;
    }
    button.disabled=true;
    button.textContent="Loading snapshot…";
    feedback("Downloading and preparing the latest new-domain list. The feed is processed in your browser.","");
    try{
      const response=await fetch(API+"/v1/new-domains",{method:"GET",mode:"cors",credentials:"omit",cache:"default",headers:{Accept:"application/gzip"}});
      if(!response.ok){
        const problem=await response.json().catch(()=>({}));
        throw new Error(problem.detail||problem.error||"The new-domain feed could not be downloaded.");
      }
      const reader=response.body.pipeThrough(new DecompressionStream("gzip")).getReader();
      const decoder=new TextDecoder();
      let remainder="";
      let count=0;
      while(true){
        const chunk=await reader.read();
        if(chunk.done)break;
        const text=decoder.decode(chunk.value,{stream:true});
        const combined=remainder+text;
        const lastBreak=combined.lastIndexOf("\n");
        if(lastBreak<0){remainder=combined;continue;}
        const lines=combined.slice(0,lastBreak).split("\n");
        for(const line of lines){
          const domain=line.trim();
          if(domain&&domain.length<=253&&domain.includes(".")){domains.push(domain);count++;}
        }
        remainder=combined.slice(lastBreak+1);
      }
      remainder+=decoder.decode();
      if(remainder.trim()){domains.push(remainder.trim());count++;}
      if(!count)throw new Error("The downloaded snapshot did not contain any valid domain rows.");
      const snapshotDate=response.headers.get("X-Snapshot-Date")|| (summary&&summary.date)||"latest";
      if(summary&&summary.date&&snapshotDate!==summary.date){
        domains=[];
        throw new Error("The feed date does not match the latest summary. Reload the page and try again.");
      }
      domains=domains.filter((domain,index,array)=>index===0||domain!==array[index-1]);
      loaded=true;
      populateExtensions();
      ["#di-new-search","#di-tld-filter","#di-signal-filter"].forEach(selector=>{const control=$(selector);if(control)control.disabled=false;});
      button.textContent="Snapshot loaded";
      setText("#di-feed-caption",number(domains.length)+" domain names loaded · snapshot "+snapshotDate);
      feedback(number(domains.length)+" newly observed domains are ready to explore.","success");
      updateFilters();
    }catch(error){
      domains=[];
      button.disabled=false;
      button.textContent="Try loading again";
      feedback(error.message||"The new-domain feed could not be loaded.","error");
    }
  }
  function changePage(direction){
    const count=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
    currentPage=Math.max(1,Math.min(count,currentPage+direction));
    renderResults();
    $("#di-explorer-title")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  const form=$("#di-search-form");
  const input=$("#di-domain-input");
  const lookupButton=$("#di-search-button");
  const result=$("#di-result");
  const lookupFeedback=$("#di-search-feedback");
  const lookupLabels={
    new_domains:{title:"Newly observed",description:"Appeared in Webamon's newly observed zone-file feed. This is not a confirmed registrar creation date."},
    removed_domains:{title:"Removed",description:"Appeared in Webamon's removed-domain feed. This does not confirm expiry or current availability."},
    whoisfreaks_expired:{title:"Expired",description:"Included in WhoisFreaks' public expired-domain feed. Coverage is limited."},
    whoisfreaks_dropped:{title:"Dropped",description:"Included in WhoisFreaks' public dropped-domain feed. This is not a current availability check."}
  };
  function lookupSay(message,state){
    if(!lookupFeedback)return;
    lookupFeedback.textContent=message||"";
    lookupFeedback.dataset.state=state||"";
  }
  function renderLookup(data){
    result.replaceChildren();
    result.hidden=false;
    result.dataset.found=String(Boolean(data.found));
    const top=makeNode("div","domain-intel-result-top");
    const heading=makeNode("div","");
    heading.append(makeNode("span","di-stat-label","EXACT DOMAIN CHECK"));
    heading.append(makeNode("h3","domain-intel-result-domain",data.domain));
    top.append(heading,makeNode("span","domain-intel-result-state",data.found?"Found in dataset":"No match in dataset"));
    result.append(top);
    result.append(makeNode("p","domain-intel-result-copy",data.found
      ?"This domain appears in one or more of the latest source feeds. Review the individual signals below before drawing conclusions."
      :"This exact domain was not found in the latest source feeds checked. That is not proof it is safe, unregistered or available."));
    if(data.snapshot_date)result.append(makeNode("p","domain-intel-result-copy","Dataset date: "+data.snapshot_date));
    if(data.found){
      const grid=makeNode("div","domain-intel-signal-list");
      (data.signals||[]).forEach(key=>{
        const info=lookupLabels[key];
        if(!info)return;
        const card=makeNode("article","domain-intel-signal");
        card.append(makeNode("strong","",info.title),makeNode("p","",info.description));
        grid.append(card);
      });
      result.append(grid);
    }
  }
  async function lookupDomain(value){
    const domain=String(value||"").trim().toLowerCase();
    if(!domain){lookupSay("Enter a domain name to check.","error");input.focus();return;}
    lookupButton.disabled=true;
    lookupButton.textContent="Checking…";
    lookupSay("Checking the latest domain dataset…","");
    result.hidden=true;
    try{
      const data=await api("/v1/domain?domain="+encodeURIComponent(domain));
      renderLookup(data);
      lookupSay(data.found?"Domain match found in the current dataset.":"No match in the current dataset.","success");
    }catch(error){
      lookupSay(error.message,"error");
    }finally{
      lookupButton.disabled=false;
      lookupButton.innerHTML='Check domain <span>↗</span>';
    }
  }

  $("#di-load-domains")?.addEventListener("click",loadDomains);
  $("#di-new-search")?.addEventListener("input",()=>{
    window.clearTimeout(filterTimer);
    filterTimer=window.setTimeout(updateFilters,120);
  });
  $("#di-tld-filter")?.addEventListener("change",updateFilters);
  $("#di-signal-filter")?.addEventListener("change",updateFilters);
  $("#di-prev-page")?.addEventListener("click",()=>changePage(-1));
  $("#di-next-page")?.addEventListener("click",()=>changePage(1));
  form?.addEventListener("submit",event=>{
    event.preventDefault();
    lookupDomain(input.value);
  });
  loadSummary();
})();