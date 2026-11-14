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
  let csrfToken="";
  const siteChecks=new Map();
  const selectedDomains=new Set();
  let lastResearchResults=[];
  let lastIntentResults=[];
  const siteCheckQueue=[];
  const siteCheckQueued=new Set();
  let siteCheckActive=0;
  const SITE_CHECK_CONCURRENCY=2;
  const SITE_CHECK_TTL_MS=4*60*60*1000;

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
  const INTENT_ALIASES=[
    ["oil","gas","petroleum","petro","oilfield","oilfields","energy","crude","refinery","refining","drilling","rig","rigs","offshore","pipeline","fuel","lubricant","hydrocarbon","lng","lpg"],
    ["agriculture","agricultural","farm","farms","farming","agribusiness","crop","crops","livestock","poultry","dairy","irrigation","seed","tractor"],
    ["construction","contractor","contractors","building","builder","builders","civil","engineering","cement","concrete","architect","architecture"],
    ["bank","banking","finance","financial","fintech","payment","payments","wallet","credit","loan","lending","insurance","investment","capital","accounting"],
    ["health","healthcare","medical","clinic","clinics","hospital","doctor","dental","dentist","pharma","pharmacy","wellness","diagnostic","laboratory"],
    ["education","school","schools","academy","academies","college","university","learning","training","tutor","course","courses"],
    ["logistics","transport","transportation","freight","cargo","shipping","delivery","courier","dispatch","warehouse","warehousing","haulage"],
    ["property","realty","realestate","estate","estates","housing","rental","rentals","mortgage","propertymanagement"],
    ["telecom","telecommunications","internet","broadband","network","networks","fiber","fibre","mobile","wireless"],
    ["automotive","auto","vehicle","vehicles","car","cars","motor","motors","garage","mechanic","spare","parts","electricvehicle","ev"],
    ["hospitality","hotel","hotels","restaurant","restaurants","food","catering","tourism","travel","resort","resorts"],
    ["manufacturing","factory","factories","industrial","industry","production","fabrication","machinery","equipment"]
  ];
  const INTENT_STOP_WORDS=new Set(["i","we","a","an","the","and","or","for","of","in","on","to","with","that","are","is","am","want","looking","find","search","business","businesses","company","companies","sector","industry","industries","likely","operating","based","services","service"]);


  let cacheDbPromise=null;
  function openDomainCache(){
    if(!("indexedDB" in window))return Promise.reject(new Error("IndexedDB is not available"));
    if(cacheDbPromise)return cacheDbPromise;
    cacheDbPromise=new Promise((resolve,reject)=>{
      const request=window.indexedDB.open("teampeach-domain-intelligence",1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains("snapshots"))db.createObjectStore("snapshots",{keyPath:"date"});
        if(!db.objectStoreNames.contains("siteChecks"))db.createObjectStore("siteChecks",{keyPath:"key"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("Could not open browser cache"));
      request.onblocked=()=>reject(new Error("Browser cache is busy"));
    });
    return cacheDbPromise;
  }
  async function cacheGet(storeName,key){
    try{
      const db=await openDomainCache();
      return await new Promise((resolve,reject)=>{
        const request=db.transaction(storeName,"readonly").objectStore(storeName).get(key);
        request.onsuccess=()=>resolve(request.result||null);
        request.onerror=()=>reject(request.error||new Error("Cache read failed"));
      });
    }catch(_){return null;}
  }
  async function cachePut(storeName,value){
    try{
      const db=await openDomainCache();
      await new Promise((resolve,reject)=>{
        const transaction=db.transaction(storeName,"readwrite");
        transaction.objectStore(storeName).put(value);
        transaction.oncomplete=()=>resolve(true);
        transaction.onerror=()=>reject(transaction.error||new Error("Cache write failed"));
        transaction.onabort=()=>reject(transaction.error||new Error("Cache write aborted"));
      });
      return true;
    }catch(_){return false;}
  }
  async function parseCompressedDomainBlob(blob){
    const reader=blob.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
    const decoder=new TextDecoder();
    let remainder="",count=0;
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      const combined=remainder+decoder.decode(chunk.value,{stream:true});
      const lastBreak=combined.lastIndexOf("\n");
      if(lastBreak<0){remainder=combined;continue;}
      const lines=combined.slice(0,lastBreak).split("\n");
      for(const line of lines){
        const domain=line.trim().toLowerCase();
        if(domain&&domain.length<=253&&domain.includes(".")){domains.push(domain);count++;}
      }
      remainder=combined.slice(lastBreak+1);
    }
    remainder+=decoder.decode();
    if(remainder.trim()){
      const domain=remainder.trim().toLowerCase();
      if(domain&&domain.length<=253&&domain.includes(".")){domains.push(domain);count++;}
    }
    return count;
  }
  async function loadSnapshotBlob(snapshotDate){
    const cached=await cacheGet("snapshots",snapshotDate);
    if(cached&&cached.blob instanceof Blob)return{blob:cached.blob,cached:true};
    const response=await fetch(API+"/v1/new-domains",{method:"GET",mode:"cors",credentials:"omit",cache:"no-store",headers:{Accept:"application/gzip"}});
    if(!response.ok){
      const problem=await response.json().catch(()=>({}));
      throw new Error(problem.detail||problem.error||"The new-domain feed could not be downloaded.");
    }
    const feedDate=response.headers.get("X-Snapshot-Date")||snapshotDate||"latest";
    if(snapshotDate&&feedDate!==snapshotDate)throw new Error("The feed date does not match the latest summary. Reload the page and try again.");
    const blob=await response.blob();
    await cachePut("snapshots",{date:feedDate,blob,savedAt:Date.now()});
    return{blob,cached:false};
  }
  function currentSnapshotDate(){return summary&&summary.date||"latest";}
  function siteCacheKey(domain){return currentSnapshotDate()+":"+domain;}
  function scheduleVisibleSiteChecks(items){
    if(!loaded)return;
    items.forEach(domain=>scheduleSiteCheck(domain));
  }
  async function scheduleSiteCheck(domain){
    if(siteChecks.has(domain)||siteCheckQueued.has(domain))return;
    const cached=await cacheGet("siteChecks",siteCacheKey(domain));
    if(siteChecks.has(domain)||siteCheckQueued.has(domain))return;
    if(cached&&cached.data&&Date.now()-Number(cached.checkedAtMs||0)<SITE_CHECK_TTL_MS){
      siteChecks.set(domain,cached.data);
      updateFilters();
      return;
    }
    enqueueSiteCheck(domain,false);
  }
  function enqueueSiteCheck(domain,force){
    if(siteCheckQueued.has(domain))return;
    const existing=siteChecks.get(domain);
    if(existing&&existing.status==="checking")return;
    if(existing&&!force)return;
    siteCheckQueued.add(domain);
    siteChecks.set(domain,{status:"checking",status_label:"Checking website…"});
    siteCheckQueue.push({domain,force:Boolean(force)});
    updateFilters();
    pumpSiteCheckQueue();
  }
  function pumpSiteCheckQueue(){
    while(siteCheckActive<SITE_CHECK_CONCURRENCY&&siteCheckQueue.length){
      const task=siteCheckQueue.shift();
      siteCheckActive++;
      (async()=>{
        try{
          const data=await api("/v1/site-check?domain="+encodeURIComponent(task.domain));
          siteChecks.set(task.domain,data);
          await cachePut("siteChecks",{key:siteCacheKey(task.domain),checkedAtMs:Date.now(),data});
        }catch(error){
          siteChecks.set(task.domain,{status:"check_error",status_label:"Check unavailable",note:error.message||""});
        }finally{
          siteCheckActive=Math.max(0,siteCheckActive-1);
          siteCheckQueued.delete(task.domain);
          updateFilters();
          pumpSiteCheckQueue();
        }
      })();
    }
  }
  function setDomainSelected(domain,checked){
    if(checked){
      if(selectedDomains.size>=5&&!selectedDomains.has(domain)){
        feedback("Premium research is limited to five selected domains per run.","error");
        return false;
      }
      selectedDomains.add(domain);
    }else selectedDomains.delete(domain);
    updateSelectionUI();
    return true;
  }
  function intentTerms(criteria){
    const lower=String(criteria||"").toLowerCase();
    const direct=(lower.match(/[a-z0-9]+/g)||[]).filter(term=>term.length>=2&&!INTENT_STOP_WORDS.has(term));
    const terms=new Set(direct);
    INTENT_ALIASES.forEach(group=>{
      if(group.some(term=>lower.includes(term)))group.forEach(term=>terms.add(term));
    });
    return Array.from(terms).slice(0,100);
  }
  function collectIntentCandidates(criteria){
    const terms=intentTerms(criteria);
    if(!terms.length)return[];
    const direct=new Set((String(criteria||"").toLowerCase().match(/[a-z0-9]+/g)||[]));
    const ranked=[];
    for(const domain of domains){
      const name=domain.slice(0,domain.lastIndexOf("."));
      const parts=name.split(/[.-]+/).filter(Boolean);
      let score=0,matched=0;
      for(const term of terms){
        const hit=parts.some(part=>part===term||(term.length>=4&&part.includes(term))||(part.length>=4&&term.length>=5&&term.includes(part)));
        if(hit){score+=direct.has(term)?5:(term.length>=6?3:2);matched++;}
      }
      if(score)ranked.push({domain,score,matched});
    }
    ranked.sort((a,b)=>b.score-a.score||b.matched-a.matched||a.domain.localeCompare(b.domain));
    return ranked.slice(0,80).map(item=>item.domain);
  }

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
  function matchesSiteFilter(domain,filter) {
    if(filter==="all")return true;
    const check=siteChecks.get(domain);
    if(filter==="unchecked")return !check||check.status==="check_error";
    if(!check)return false;
    if(filter==="working")return check.status==="working";
    if(filter==="possibly_parked")return check.status==="possibly_parked";
    if(filter==="redirect")return check.status==="redirect";
    if(filter==="unreachable")return check.status==="unreachable";
    if(filter==="other")return ["http_only","access_restricted","page_error","server_error","check_error"].includes(check.status);
    return true;
  }
  function updateSelectionUI() {
    setText("#di-selection-count",selectedDomains.size+" of 5 domains selected for website research");
    const button=$("#di-ai-run");
    if(button)button.disabled=selectedDomains.size===0||button.dataset.loading==="true";
    const search=$("#di-ai-search");
    if(search)search.disabled=!loaded||search.dataset.loading==="true";
  }
  function updateFilters(){
    if(!loaded)return;
    const query=String($("#di-new-search")?.value||"").trim().toLowerCase().split(/\s+/).filter(Boolean);
    const extension=$("#di-tld-filter")?.value||"";
    const startsWith=$("#di-start-filter")?.value||"";
    const signal=$("#di-signal-filter")?.value||"all";
    const websiteFilter=$("#di-site-filter")?.value||"all";
    filtered=domains.filter(domain=>{
      if(extension&&domain.slice(domain.lastIndexOf(".")+1)!==extension)return false;
      if(startsWith==="0-9"&&!/^[0-9]/.test(domain))return false;
      if(startsWith&&startsWith!=="0-9"&&!domain.startsWith(startsWith))return false;
      if(query.length&&!query.every(term=>domain.includes(term)))return false;
      if(!matchesSignal(domain,signal))return false;
      return matchesSiteFilter(domain,websiteFilter);
    });
    currentPage=1;
    renderResults();
  }
  async function checkWebsite(domain) {
    enqueueSiteCheck(domain,true);
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
    info.fits.forEach(fit=>tags.append(makeNode("span","di-domain-fit","Possible fit · "+fit)));
    main.append(tags);
    const check=siteChecks.get(domain);
    const status=check?check.status:"unchecked";
    const statusRow=makeNode("div","di-website-row");
    const statusBadge=makeNode("span","di-website-status di-website-"+status,check?(check.status_label||"Website checked"):"Website not checked");
    statusRow.append(statusBadge);
    if(check&&check.http_status)statusRow.append(makeNode("span","di-website-code","HTTP "+check.http_status));
    if(check&&check.title)statusRow.append(makeNode("span","di-website-title",check.title));
    main.append(statusRow);
    const explanation=info.industry
      ?"Name-based industry clue only. Verify the website and public evidence before treating this as a business."
      :info.fits.length
        ?"The name contains wording associated with a possible service area. This is a research hypothesis, not evidence of a service need."
        :"No obvious business or service phrase was identified in the name; it may still be worth reviewing.";
    main.append(makeNode("p","di-domain-note",explanation));
    const actions=makeNode("div","di-domain-actions");
    const selectLabel=makeNode("label","di-domain-select");
    const selectBox=document.createElement("input");
    selectBox.type="checkbox";
    selectBox.checked=selectedDomains.has(domain);
    selectBox.disabled=!selectBox.checked&&selectedDomains.size>=5;
    selectBox.setAttribute("aria-label","Select "+domain+" for Premium AI research");
    selectBox.addEventListener("change",()=>{
      if(!setDomainSelected(domain,selectBox.checked))selectBox.checked=false;
      const visible=domains.filter(item=>selectedDomains.has(item));
      if(visible.length)feedback(visible.length+" domain"+(visible.length===1?"":"s")+" selected for AI research.","");
    });
    selectLabel.append(selectBox,document.createTextNode("Select for AI"));
    actions.append(selectLabel);
    const checkButton=makeNode("button","di-domain-check",check&&check.status!=="checking"?"Check again":check?"Checking…":"Check website");
    checkButton.type="button";
    checkButton.disabled=Boolean(check&&check.status==="checking");
    checkButton.addEventListener("click",()=>checkWebsite(domain));
    actions.append(checkButton);
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
    scheduleVisibleSiteChecks(pageItems);
    setText("#di-page-summary",number(total)+" matches");
    setText("#di-page-number","Page "+currentPage+" of "+pageCount);
    const previous=$("#di-prev-page"),next=$("#di-next-page");
    if(previous)previous.disabled=currentPage<=1;
    if(next)next.disabled=currentPage>=pageCount;
  }
  async function ensureCsrf(){
    if(csrfToken)return csrfToken;
    const response=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok)throw new Error("Secure request setup failed. Refresh the page and try again.");
    const data=await response.json();
    csrfToken=data.token||"";
    if(!csrfToken)throw new Error("Could not establish a secure request. Refresh the page and try again.");
    return csrfToken;
  }
  function renderIntentSearch(data){
    const root=$("#di-ai-search-results");
    if(!root)return;
    root.replaceChildren();
    root.hidden=false;
    const header=makeNode("div","di-ai-results-heading");
    const intro=makeNode("div","");
    intro.append(makeNode("span","di-ai-kicker","AI INTENT MATCHES"));
    intro.append(makeNode("h4","","Domains matching your business intent"));
    intro.append(makeNode("p","",data.summary||"AI ranked the strongest candidates from the locally scanned domain names."));
    header.append(intro);
    root.append(header);
    const results=Array.isArray(data.results)?data.results:[];
    if(!results.length){
      const empty=makeNode("div","di-empty-state");
      empty.append(makeNode("strong","","No strong matches were returned."),makeNode("p","","Try a broader business description or include related industry terms."));
      root.append(empty);
      return;
    }
    results.forEach(item=>{
      const card=makeNode("article","di-ai-result-card di-ai-intent-card");
      const top=makeNode("div","di-ai-result-top");
      const title=makeNode("div","");
      title.append(makeNode("h4","",item.domain),makeNode("span","di-ai-result-industry",item.industry||item.likelyBusinessType||"Possible business match"));
      const badges=makeNode("div","di-ai-result-badges");
      badges.append(makeNode("span","di-ai-score","Intent fit "+Number(item.fitScore||0)+"/100"));
      top.append(title,badges);
      card.append(top);
      if(item.reason)card.append(makeNode("p","di-ai-result-why",item.reason));
      const selectLabel=makeNode("label","di-ai-intent-select");
      const checkbox=document.createElement("input");
      checkbox.type="checkbox";
      checkbox.checked=selectedDomains.has(item.domain);
      checkbox.disabled=!checkbox.checked&&selectedDomains.size>=5;
      checkbox.dataset.domain=item.domain;
      checkbox.addEventListener("change",()=>{
        if(!setDomainSelected(item.domain,checkbox.checked))checkbox.checked=false;
        root.querySelectorAll('input[type="checkbox"]').forEach(control=>{
          const domain=control.dataset.domain||"";
          control.checked=selectedDomains.has(domain);
          control.disabled=!control.checked&&selectedDomains.size>=5;
        });
      });
      selectLabel.append(checkbox,document.createTextNode("Select for homepage research"));
      card.append(selectLabel);
      root.append(card);
    });
  }
  async function runAiIntentSearch(){
    const button=$("#di-ai-search");
    const criteria=String($("#di-ai-criteria")?.value||"").trim();
    if(!loaded){sayAiSearch("Load the latest domain snapshot before using Premium intent search.","error");return;}
    if(criteria.length<8){sayAiSearch("Describe the sector or type of business you want to discover.","error");$("#di-ai-criteria")?.focus();return;}
    const candidates=collectIntentCandidates(criteria);
    if(!candidates.length){
      selectedDomains.clear();
      updateSelectionUI();
      renderIntentSearch({summary:"The local scan did not find candidate names containing the requested terms or related industry wording.",results:[]});
      sayAiSearch("No name-based candidates were found. Try a sector synonym or a broader description.","error");
      return;
    }
    if(!button)return;
    selectedDomains.clear();
    updateSelectionUI();
    button.disabled=true;
    button.dataset.loading="true";
    button.textContent="Searching…";
    sayAiSearch("Scanning "+number(domains.length)+" domain names locally and asking AI to rank up to "+candidates.length+" relevant candidates…","");
    $("#di-ai-search-results").hidden=true;
    try{
      const requestId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():("di-search-"+Date.now()+"-"+Math.random().toString(16).slice(2));
      const csrf=await ensureCsrf();
      const response=await fetch("/api/tools/domain-intelligence/intent-search",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","X-CSRF-Token":csrf,"X-Idempotency-Key":requestId},
        body:JSON.stringify({criteria,candidates,requestId})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false){
        const error=new Error(data.message||"AI intent search could not be completed.");
        error.code=data.error||"DOMAIN_INTENT_SEARCH_FAILED";
        error.balance=data.balance;
        error.estimatedCredits=data.estimatedCredits;
        throw error;
      }
      lastIntentResults=data.results||[];
      renderIntentSearch(data);
      const usage=data.usage||{};
      sayAiSearch("AI search complete. "+number(lastIntentResults.length)+" likely matches found from "+number(candidates.length)+" candidates · "+number(usage.creditsCharged||0)+" credits used · "+number(usage.creditsRemaining||0)+" remaining.","success");
    }catch(error){
      let message=error.message||"AI intent search could not be completed.";
      if(error.code==="AUTH_REQUIRED"||error.code==="UNAUTHENTICATED")message="Sign in to use Premium Business Radar.";
      if(error.code==="PREMIUM_MEMBERSHIP_REQUIRED")message="An active TeamPeach membership is required for AI intent search.";
      if(error.code==="INSUFFICIENT_CREDITS")message=message+" Balance: "+number(error.balance)+" credits; estimated requirement: "+number(error.estimatedCredits)+" credits.";
      sayAiSearch(message,"error");
    }finally{
      button.dataset.loading="false";
      button.innerHTML='Search with AI <span>↗</span>';
      updateSelectionUI();
    }
  }
  function sayAiSearch(message,state){
    const item=$("#di-ai-search-feedback");
    if(!item)return;
    item.textContent=message||"";
    item.dataset.state=state||"";
  }
  async function runAiResearch(){
    const button=$("#di-ai-run");
    const criteria=String($("#di-ai-criteria")?.value||"").trim();
    const domainsToResearch=[...selectedDomains];
    const output=$("#di-ai-results");
    if(domainsToResearch.length<1){sayAi("Select at least one domain from the results first.","error");return;}
    if(criteria.length<12){sayAi("Describe what kind of business or opportunity you want to find.","error");$("#di-ai-criteria")?.focus();return;}
    if(!button)return;
    button.disabled=true;
    button.dataset.loading="true";
    button.textContent="Researching…";
    sayAi("Checking available website evidence and comparing the selected listings against your specification…","");
    output.hidden=true;
    try{
      const requestId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():("di-"+Date.now()+"-"+Math.random().toString(16).slice(2));
      const csrf=await ensureCsrf();
      const response=await fetch("/api/tools/domain-intelligence/research",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","X-CSRF-Token":csrf,"X-Idempotency-Key":requestId},
        body:JSON.stringify({criteria,domains:domainsToResearch,requestId})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false){
        const error=new Error(data.message||"Business Radar could not complete the research request.");
        error.code=data.error||"DOMAIN_RADAR_FAILED";
        error.balance=data.balance;
        error.estimatedCredits=data.estimatedCredits;
        throw error;
      }
      lastResearchResults=data.results||[];
      renderAiResearch(data);
      const usage=data.usage||{};
      sayAi("Research complete. "+number(usage.creditsCharged||0)+" credits used · "+number(usage.creditsRemaining||0)+" credits remaining. Website and industry conclusions remain evidence-led hypotheses.","success");
    }catch(error){
      let message=error.message||"Research could not be completed.";
      if(error.code==="AUTH_REQUIRED"||error.code==="UNAUTHENTICATED")message="Sign in to use Premium Business Radar research.";
      if(error.code==="PREMIUM_MEMBERSHIP_REQUIRED")message="An active TeamPeach membership is required for Premium AI research. Ordinary browsing and website checks remain available.";
      if(error.code==="INSUFFICIENT_CREDITS")message=message+" Current balance: "+number(error.balance)+" credits; estimated requirement: "+number(error.estimatedCredits)+" credits.";
      sayAi(message,"error");
    }finally{
      button.dataset.loading="false";
      button.innerHTML='Research selected domains <span>↗</span>';
      updateSelectionUI();
    }
  }
  function sayAi(message,state){
    const item=$("#di-ai-feedback");
    if(!item)return;
    item.textContent=message||"";
    item.dataset.state=state||"";
  }
  function csvCell(value){
    const textValue=String(value==null?"":value);
    return '"'+textValue.replace(/"/g,'""')+'"';
  }
  function downloadAiCsv(){
    if(!lastResearchResults.length)return;
    const rows=[["Domain","Matches specification","Fit score","Industry","Likely business type","Website status","Website title","Website summary","Why it matches","Confidence","Opportunities","Recommended next step"]];
    lastResearchResults.forEach(item=>rows.push([
      item.domain,item.matchesSpecification?"Yes":"No",item.fitScore,item.industry,item.likelyBusinessType,
      item.website&&item.website.statusLabel,item.website&&item.website.title,item.websiteSummary,item.whyItMatches,
      item.confidence,(item.opportunities||[]).map(o=>o.service+": "+o.rationale).join(" | "),item.recommendedNextStep
    ]));
    const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url;link.download="teampeach-business-radar-research.csv";
    document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
  }
  function renderAiResearch(data){
    const root=$("#di-ai-results");
    if(!root)return;
    root.replaceChildren();
    root.hidden=false;
    const header=makeNode("div","di-ai-results-heading");
    const headText=makeNode("div","");
    headText.append(makeNode("span","di-ai-kicker","RESEARCH RESULTS"),makeNode("h4","","AI comparison against your specification"));
    headText.append(makeNode("p","",data.summary||"The selected listings have been reviewed against your criteria."));
    const download=makeNode("button","di-domain-copy","Download CSV");
    download.type="button";download.addEventListener("click",downloadAiCsv);
    header.append(headText,download);
    root.append(header);
    (data.results||[]).forEach(item=>{
      const card=makeNode("article","di-ai-result-card");
      const top=makeNode("div","di-ai-result-top");
      const title=makeNode("div","");
      title.append(makeNode("h4","",item.domain),makeNode("span","di-ai-result-industry",item.industry||item.likelyBusinessType||"Business type unclear"));
      top.append(title);
      const status=makeNode("div","di-ai-result-badges");
      status.append(makeNode("span",item.matchesSpecification?"di-ai-match di-ai-match-yes":"di-ai-match di-ai-match-no",item.matchesSpecification?"Matches your specification":"Weak or uncertain match"));
      status.append(makeNode("span","di-ai-confidence","Confidence: "+(item.confidence||"low")));
      status.append(makeNode("span","di-ai-score","Fit "+Number(item.fitScore||0)+"/100"));
      top.append(status);
      card.append(top);
      if(item.website&&item.website.statusLabel){
        const line=makeNode("p","di-ai-website-line","Website: "+item.website.statusLabel+(item.website.httpStatus?" · HTTP "+item.website.httpStatus:""));
        card.append(line);
      }
      if(item.websiteSummary)card.append(makeNode("p","di-ai-result-summary",item.websiteSummary));
      if(item.whyItMatches)card.append(makeNode("p","di-ai-result-why",item.whyItMatches));
      if(item.evidence&&item.evidence.length){
        const evidence=makeNode("div","di-ai-evidence");
        evidence.append(makeNode("strong","","Evidence reviewed"));
        const list=makeNode("ul","");
        item.evidence.forEach(entry=>list.append(makeNode("li","",(entry.source?entry.source+": ":"")+entry.detail)));
        evidence.append(list);card.append(evidence);
      }
      if(item.opportunities&&item.opportunities.length){
        const opportunities=makeNode("div","di-ai-opportunities");
        opportunities.append(makeNode("strong","","Possible TeamPeach opportunities"));
        const list=makeNode("ul","");
        item.opportunities.forEach(entry=>list.append(makeNode("li","",entry.service+" — "+entry.rationale+" ("+entry.priority+" priority)")));
        opportunities.append(list);card.append(opportunities);
      }
      if(item.recommendedNextStep)card.append(makeNode("p","di-ai-next-step","Suggested next step: "+item.recommendedNextStep));
      if(item.confidenceReason)card.append(makeNode("p","di-ai-caveat","Confidence note: "+item.confidenceReason));
      root.append(card);
    });
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
    feedback("Checking the browser cache and preparing the latest domain snapshot locally.","");
    try{
      domains=[];
      const snapshotDate=summary&&summary.date||"";
      const stored=await loadSnapshotBlob(snapshotDate);
      const count=await parseCompressedDomainBlob(stored.blob);
      if(!count)throw new Error("The downloaded snapshot did not contain any valid domain rows.");
      domains=domains.filter((domain,index,array)=>index===0||domain!==array[index-1]);
      loaded=true;
      populateExtensions();
      ["#di-new-search","#di-start-filter","#di-tld-filter","#di-signal-filter","#di-site-filter"].forEach(selector=>{const control=$(selector);if(control)control.disabled=false;});
      button.textContent=stored.cached?"Snapshot ready from this browser":"Snapshot downloaded and cached";
      setText("#di-feed-caption",number(domains.length)+" domain names loaded · snapshot "+snapshotDate);
      feedback(number(domains.length)+" newly observed domains are ready. "+(stored.cached?"The browser reused its local dataset cache.":"The dataset has been cached in this browser for next time."),"success");
      updateFilters();
      updateSelectionUI();
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
  $("#di-start-filter")?.addEventListener("change",updateFilters);
  $("#di-tld-filter")?.addEventListener("change",updateFilters);
  $("#di-signal-filter")?.addEventListener("change",updateFilters);
  $("#di-site-filter")?.addEventListener("change",updateFilters);
  $("#di-ai-search")?.addEventListener("click",runAiIntentSearch);
  $("#di-ai-run")?.addEventListener("click",runAiResearch);
  $("#di-prev-page")?.addEventListener("click",()=>changePage(-1));
  $("#di-next-page")?.addEventListener("click",()=>changePage(1));
  updateSelectionUI();
  form?.addEventListener("submit",event=>{
    event.preventDefault();
    lookupDomain(input.value);
  });
  loadSummary();
})();