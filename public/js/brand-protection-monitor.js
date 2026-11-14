"use strict";
(function(){
  const API="https://teampeach-domain-api.creatorletofficial.workers.dev";
  const STORAGE_KEY="teampeach-brand-protection-watchlist-v1";
  const MAX_BRANDS=20;
  const MAX_STORED_MATCHES=2500;
  const MAX_VISIBLE_MATCHES=300;
  const $=selector=>document.querySelector(selector);
  const numberFormat=new Intl.NumberFormat(undefined,{maximumFractionDigits:0});
  const Engine=window.TeamPeachBrandProtection;
  let watchlist=[];
  let matches=[];
  let matchTotals={all:0,high:0,possible:0,review:0};
  let scannedCount=0;
  let latestDate="";
  let cacheDbPromise=null;
  let scanRunning=false;

  function number(value){return numberFormat.format(Number(value)||0);}
  function setText(selector,value){
    const node=$(selector);
    if(node)node.textContent=value==null?"—":String(value);
  }
  function showStatus(message,state){
    const node=$("#bp-status");
    if(!node)return;
    node.textContent=message||"";
    node.dataset.state=state||"";
  }
  function make(tag,className,value){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(value!==undefined)node.textContent=String(value);
    return node;
  }
  function saveWatchlist(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(watchlist));return true;}
    catch(_){showStatus("Your browser blocked local storage. The watchlist will only last until this page is closed.","error");return false;}
  }
  function loadWatchlist(){
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");
      if(!Array.isArray(saved))return [];
      return saved.slice(0,MAX_BRANDS).map(item=>Engine.prepareBrand(item.name,item.officialDomain||""));
    }catch(_){return [];}
  }
  function updateMetrics(){
    setText("#bp-watchlist-count",number(watchlist.length));
    setText("#bp-results-count",number(matchTotals.all));
    setText("#bp-high-count",number(matchTotals.high));
    setText("#bp-scanned-count",number(scannedCount));
    setText("#bp-latest-date",latestDate||"Not scanned");
    const exportButton=$("#bp-export");
    if(exportButton)exportButton.disabled=!matches.length||scanRunning;
    const runButton=$("#bp-run-scan");
    if(runButton)runButton.disabled=!watchlist.length||scanRunning;
  }
  function clearScanResults(){
    matches=[];
    matchTotals={all:0,high:0,possible:0,review:0};
    scannedCount=0;
    latestDate="";
    const root=$("#bp-results");
    if(root)root.replaceChildren();
    const empty=$("#bp-results-empty");
    if(empty){
      empty.hidden=false;
      empty.textContent="Your watchlist changed. Run a new scan to refresh the results.";
    }
    setText("#bp-results-note","");
    setText("#bp-progress","");
    updateMetrics();
  }
  function renderWatchlist(){
    const root=$("#bp-watchlist");
    if(!root)return;
    root.replaceChildren();
    if(!watchlist.length){
      root.append(make("div","bp-empty-inline","Your watchlist is empty. Add a brand name above to begin."));
    }else{
      watchlist.forEach((item,index)=>{
        const row=make("div","bp-brand-row");
        const copy=make("div","bp-brand-copy");
        copy.append(make("strong","",item.name));
        copy.append(make("span","",item.officialDomain?"Official site: "+item.officialDomain:"No official site recorded"));
        const remove=make("button","bp-remove-brand","Remove");
        remove.type="button";
        remove.setAttribute("aria-label","Remove "+item.name+" from the watchlist");
        remove.disabled=scanRunning;
        remove.addEventListener("click",()=>{
          if(scanRunning)return;
          watchlist.splice(index,1);
          saveWatchlist();
          clearScanResults();
          renderWatchlist();
          updateMetrics();
          showStatus("Brand removed from this browser's watchlist.","success");
        });
        row.append(copy,remove);
        root.append(row);
      });
    }
    setText("#bp-watchlist-caption",watchlist.length+" of "+MAX_BRANDS+" protected names");
    const form=$("#bp-brand-form");
    if(form)form.querySelectorAll("input,button").forEach(control=>control.disabled=scanRunning);
    updateMetrics();
  }

  function openCache(){
    if(!("indexedDB" in window))return Promise.reject(new Error("Browser storage is unavailable."));
    if(cacheDbPromise)return cacheDbPromise;
    cacheDbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open("teampeach-domain-intelligence",1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains("snapshots"))db.createObjectStore("snapshots",{keyPath:"date"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("Could not open the local domain cache."));
      request.onblocked=()=>reject(new Error("The local domain cache is busy."));
    });
    return cacheDbPromise;
  }
  async function cacheGet(date){
    try{
      const db=await openCache();
      return await new Promise((resolve,reject)=>{
        const request=db.transaction("snapshots","readonly").objectStore("snapshots").get(date);
        request.onsuccess=()=>resolve(request.result||null);
        request.onerror=()=>reject(request.error||new Error("Local cache read failed."));
      });
    }catch(_){return null;}
  }
  async function cachePut(value){
    try{
      const db=await openCache();
      await new Promise((resolve,reject)=>{
        const transaction=db.transaction("snapshots","readwrite");
        transaction.objectStore("snapshots").put(value);
        transaction.oncomplete=()=>resolve(true);
        transaction.onerror=()=>reject(transaction.error||new Error("Local cache write failed."));
        transaction.onabort=()=>reject(transaction.error||new Error("Local cache write aborted."));
      });
    }catch(_){}
  }
  async function loadLatestSnapshot(){
    const response=await fetch(API+"/v1/new-domains",{
      method:"GET",mode:"cors",credentials:"omit",cache:"no-store",
      headers:{Accept:"application/gzip"}
    });
    if(!response.ok){
      const problem=await response.json().catch(()=>({}));
      throw new Error(problem.detail||problem.error||"The latest domain snapshot could not be downloaded.");
    }
    const date=response.headers.get("X-Snapshot-Date")||"";
    if(!date)throw new Error("The domain data service did not provide a snapshot date.");
    const cached=await cacheGet(date);
    if(cached&&cached.blob instanceof Blob){
      if(response.body)response.body.cancel().catch(()=>{});
      return{blob:cached.blob,date,cached:true};
    }
    const blob=await response.blob();
    await cachePut({date,blob,savedAt:Date.now()});
    return{blob,date,cached:false};
  }
  function addMatch(match){
    matchTotals.all++;
    if(match.priority==="High priority")matchTotals.high++;
    else if(match.priority==="Possible")matchTotals.possible++;
    else matchTotals.review++;
    if(matches.length<MAX_STORED_MATCHES)matches.push(match);
    else{
      let worstIndex=0;
      for(let i=1;i<matches.length;i++)if(matches[i].score<matches[worstIndex].score)worstIndex=i;
      if(match.score>matches[worstIndex].score)matches[worstIndex]=match;
    }
  }
  function yieldToBrowser(){return new Promise(resolve=>window.setTimeout(resolve,0));}
  async function scanBlob(blob,brands){
    const reader=blob.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
    const decoder=new TextDecoder();
    let remainder="";
    scannedCount=0;
    matches=[];
    matchTotals={all:0,high:0,possible:0,review:0};
    const processLine=line=>{
      const domain=String(line||"").trim().toLowerCase();
      if(!domain||domain.length>253||!domain.includes("."))return;
      scannedCount++;
      const found=Engine.analyseDomain(domain,brands);
      found.forEach(addMatch);
    };
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      const combined=remainder+decoder.decode(chunk.value,{stream:true});
      const lastBreak=combined.lastIndexOf("\n");
      if(lastBreak<0){remainder=combined;continue;}
      const lines=combined.slice(0,lastBreak).split("\n");
      lines.forEach(processLine);
      remainder=combined.slice(lastBreak+1);
      if(scannedCount&&scannedCount%10000<lines.length){
        setText("#bp-progress","Scanned "+number(scannedCount)+" domain names…");
        setText("#bp-scanned-count",number(scannedCount));
        await yieldToBrowser();
      }
    }
    remainder+=decoder.decode();
    if(remainder.trim())processLine(remainder);
    matches.sort((a,b)=>b.score-a.score||a.domain.localeCompare(b.domain));
    updateMetrics();
  }

  function priorityClass(priority){
    return priority==="High priority"?"bp-priority-high":priority==="Possible"?"bp-priority-possible":"bp-priority-review";
  }
  function renderResults(){
    const root=$("#bp-results");
    const empty=$("#bp-results-empty");
    if(!root||!empty)return;
    root.replaceChildren();
    const filter=$("#bp-priority-filter")?.value||"all";
    const list=matches.filter(item=>filter==="all"||
      (filter==="high"&&item.priority==="High priority")||
      (filter==="possible"&&item.priority==="Possible")||
      (filter==="review"&&item.priority==="Review"));
    empty.hidden=list.length>0;
    if(!list.length){
      empty.textContent=matches.length
        ?"No matches in this priority group."
        :"No close matches were found in the latest snapshot. This does not prove that no impersonating domain exists.";
    }
    list.slice(0,MAX_VISIBLE_MATCHES).forEach(item=>{
      const card=make("article","bp-result-card");
      const heading=make("div","bp-result-heading");
      const domainLink=make("a","bp-result-domain",item.domain);
      domainLink.href="https://"+item.domain+"/";
      domainLink.target="_blank";
      domainLink.rel="noopener noreferrer";
      const priority=make("span","bp-priority "+priorityClass(item.priority),item.priority);
      heading.append(domainLink,priority);
      const meta=make("div","bp-result-meta");
      meta.append(make("span","bp-result-brand","Brand: "+item.brand));
      meta.append(make("span","bp-result-type",item.matchType));
      card.append(heading,meta,make("p","bp-result-reason",item.reason));
      root.append(card);
    });
    const note=$("#bp-results-note");
    if(note)note.textContent=matchTotals.all>MAX_STORED_MATCHES
      ?"Showing the strongest "+number(MAX_STORED_MATCHES)+" matches from "+number(matchTotals.all)+" detections."
      :matchTotals.all>MAX_VISIBLE_MATCHES
        ?"Showing the first "+number(MAX_VISIBLE_MATCHES)+" matches. Export the full stored result set for review."
        :"Showing "+number(list.length)+" matches.";
    updateMetrics();
  }
  function csvCell(value){return '"'+String(value??"").replace(/"/g,'""')+'"';}
  function exportCsv(){
    if(!matches.length)return;
    const columns=["Domain","Protected brand","Priority","Match type","Match score","Reason","Snapshot date"];
    const rows=matches.map(item=>[
      item.domain,item.brand,item.priority,item.matchType,item.score,item.reason,latestDate
    ]);
    const content=[columns,...rows].map(row=>row.map(csvCell).join(",")).join("\r\n");
    const blob=new Blob(["\uFEFF"+content],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=make("a","");
    link.href=url;
    link.download="teampeach-brand-protection-"+(latestDate||"latest")+".csv";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  async function runScan(){
    if(scanRunning||!watchlist.length)return;
    if(!Engine||!("DecompressionStream" in window)){
      showStatus("This browser cannot run the local domain scan. Please use a current version of Chrome, Edge, Firefox or Safari.","error");
      return;
    }
    scanRunning=true;
    matches=[];
    matchTotals={all:0,high:0,possible:0,review:0};
    scannedCount=0;
    const button=$("#bp-run-scan");
    if(button){button.disabled=true;button.textContent="Scanning locally…";}
    renderWatchlist();
    const progress=$("#bp-progress");
    if(progress)progress.textContent="Retrieving the latest compressed domain snapshot…";
    showStatus("Your protected brand names stay in this browser. The public domain feed is downloaded directly for local analysis.","");
    updateMetrics();
    try{
      const snapshot=await loadLatestSnapshot();
      latestDate=snapshot.date;
      setText("#bp-latest-date",latestDate);
      setText("#bp-progress","Scanning the latest snapshot in your browser…");
      await yieldToBrowser();
      await scanBlob(snapshot.blob,watchlist);
      renderResults();
      const source=snapshot.cached?"the local browser cache":"the latest published feed";
      showStatus(
        number(scannedCount)+" domain names scanned from "+latestDate+" using "+source+". "+
        number(matchTotals.all)+" possible matches found for "+number(watchlist.length)+" protected brand(s).",
        "success"
      );
      setText("#bp-progress","Scan complete · "+number(scannedCount)+" domains checked");
    }catch(error){
      showStatus(error.message||"The brand scan could not be completed.","error");
      setText("#bp-progress","The scan stopped before completion.");
    }finally{
      scanRunning=false;
      if(button){button.disabled=!watchlist.length;button.textContent="Scan latest snapshot";}
      updateMetrics();
    }
  }

  $("#bp-brand-form")?.addEventListener("submit",event=>{
    event.preventDefault();
    const name=$("#bp-brand-name")?.value||"";
    const official=$("#bp-official-domain")?.value||"";
    try{
      if(scanRunning)throw new Error("Wait for the current scan to finish before changing the watchlist.");
      const item=Engine.prepareBrand(name,official);
      if(watchlist.length>=MAX_BRANDS)throw new Error("Your browser watchlist can contain up to "+MAX_BRANDS+" brands.");
      if(watchlist.some(saved=>saved.normalized===item.normalized))throw new Error("That brand is already in your watchlist.");
      watchlist.push(item);
      saveWatchlist();
      clearScanResults();
      renderWatchlist();
      $("#bp-brand-name").value="";
      $("#bp-official-domain").value="";
      $("#bp-brand-name").focus();
      showStatus(item.officialDomain
        ?"Added "+item.name+". The official domain will be excluded from matches."
        :"Added "+item.name+" to your local watchlist.","success");
    }catch(error){showStatus(error.message,"error");}
  });
  $("#bp-run-scan")?.addEventListener("click",runScan);
  $("#bp-export")?.addEventListener("click",exportCsv);
  $("#bp-priority-filter")?.addEventListener("change",renderResults);

  watchlist=loadWatchlist();
  renderWatchlist();
  updateMetrics();
  if(!watchlist.length){
    showStatus("Add at least one brand name to create your local protection watchlist.","");
  }
})();
