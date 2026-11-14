"use strict";
(function(){
  const API="https://teampeach-domain-api.creatorletofficial.workers.dev";
  const $=selector=>document.querySelector(selector);
  const numberFormat=new Intl.NumberFormat(undefined,{maximumFractionDigits:0});
  let history=[];
  let cacheDbPromise=null;
  let currentDate="";
  let patternResults=null;

  const STOP_WORDS=new Set([
    "the","and","for","with","from","this","that","your","our","their","they","you","are","was","has","have","get","try","use","new","best","top","one","two","all",
    "online","global","world","worldwide","official","home","homeof","my","me","we","us","co","inc","ltd","limited","group","holdings","international","company","companies",
    "business","businesses","services","service","solutions","solution","enterprise","enterprises","digital","tech","technology","network","networks","systems","system",
    "info","site","web","website","app","apps","hub","pro","plus","now","go","the","to","in","of","on","at","by","as","is","it","a","an"
  ]);
  const INDUSTRIES=[
    {label:"Oil, gas & energy",terms:["petroleum","oilfield","oilfields","drilling","offshore","pipeline","refinery","refining","hydrocarbon","energy","lng","lpg","crude","lubricant","fuel","oil","gas"]},
    {label:"Agriculture",terms:["agriculture","agricultural","agribusiness","farming","farm","farms","livestock","poultry","dairy","irrigation","crops","agro","seeds","tractor"]},
    {label:"Technology",terms:["software","saas","cybersecurity","cyber","cloud","developer","coding","programming","artificialintelligence","machinelearning","data","tech","digital","app","apps","ai"]},
    {label:"Finance & insurance",terms:["fintech","banking","bank","finance","financial","payment","payments","wallet","credit","loan","lending","insurance","investment","capital","accounting"]},
    {label:"Healthcare",terms:["healthcare","health","medical","clinic","clinics","hospital","doctor","dental","dentist","pharma","pharmacy","wellness","diagnostic","laboratory"]},
    {label:"Education",terms:["education","school","schools","academy","academies","college","university","learning","training","tutor","course","courses"]},
    {label:"Construction & property",terms:["construction","contractor","building","builder","civil","engineering","cement","concrete","architect","property","realty","realestate","estate","housing"]},
    {label:"Logistics & transport",terms:["logistics","transport","transportation","freight","cargo","shipping","delivery","courier","dispatch","warehouse","warehousing","haulage"]},
    {label:"Retail & commerce",terms:["ecommerce","ecom","retail","shopping","shop","shops","store","stores","market","marketplace","fashion","boutique","commerce"]},
    {label:"Food & hospitality",terms:["hospitality","hotel","hotels","restaurant","restaurants","food","catering","tourism","travel","resort","resorts","cafe","coffee","bakery"]},
    {label:"Automotive",terms:["automotive","vehicle","vehicles","motor","motors","garage","mechanic","auto","car","cars","spareparts"]},
    {label:"Manufacturing",terms:["manufacturing","factory","factories","industrial","industry","production","fabrication","machinery","equipment"]}
  ];

  function setText(selector,value){
    const node=$(selector);
    if(node)node.textContent=value==null?"—":String(value);
  }
  function number(value){return numberFormat.format(Number(value)||0);}
  function showFeedback(message,state){
    const node=$("#dt-feedback");
    if(!node)return;
    node.textContent=message||"";
    node.dataset.state=state||"";
  }
  function make(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);
    return node;
  }
  async function api(path){
    const response=await fetch(API+path,{method:"GET",mode:"cors",credentials:"omit",cache:"no-store",headers:{Accept:"application/json"}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.detail||data.error||"The public domain data service is temporarily unavailable.");
    return data;
  }
  function aggregateTlds(rows,field){
    const totals=new Map();
    rows.forEach(row=>{
      const counts=row.by_tld&&row.by_tld[field]||{};
      Object.entries(counts).forEach(([tld,count])=>totals.set(tld,(totals.get(tld)||0)+Number(count||0)));
    });
    return totals;
  }
  function renderMetrics(rows){
    const newTotal=rows.reduce((sum,row)=>sum+Number(row.counts.new_domains||0),0);
    const removedTotal=rows.reduce((sum,row)=>sum+Number(row.counts.removed_domains||0),0);
    const tlds=aggregateTlds(rows,"new_domains");
    const top=[...tlds.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];
    setText("#dt-total-new",number(newTotal));
    setText("#dt-total-removed",number(removedTotal));
    setText("#dt-top-tld",top?"."+top[0]:"—");
    setText("#dt-top-tld-count",top?number(top[1])+" observations in selected snapshots":"No extension counts available");
    setText("#dt-total-days",number(rows.length));
    setText("#dt-days-caption",rows.length===1?"One published snapshot":"Published snapshots");
    setText("#dt-new-caption",rows.length===1?"Latest available daily snapshot":"Across "+rows.length+" available snapshots");
  }
  function shortDate(value){
    const date=new Date(value+"T00:00:00Z");
    return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{month:"short",day:"numeric",timeZone:"UTC"});
  }
  function renderVolume(rows){
    const root=$("#dt-volume-chart");
    if(!root)return;
    root.replaceChildren();
    const max=Math.max(1,...rows.map(row=>Number(row.counts.new_domains||0)));
    rows.forEach((row,index)=>{
      const col=make("div","dt-volume-column");
      const val=Number(row.counts.new_domains||0);
      col.title=row.date+": "+number(val)+" newly observed domains";
      col.append(make("span","dt-volume-value",rows.length<=14?number(val):""));
      const track=make("div","dt-volume-bar-track");
      const bar=make("div","dt-volume-bar");
      bar.style.height=Math.max(3,(val/max)*100)+"%";
      track.append(bar);
      col.append(track);
      const label=make("span","dt-volume-date",rows.length<=14?shortDate(row.date):(index%Math.ceil(rows.length/10)===0||index===rows.length-1?shortDate(row.date):""));
      col.append(label);
      root.append(col);
    });
    if(!rows.length)root.append(make("div","dt-placeholder","No daily snapshots are available for this period."));
  }
  function renderRankChart(rootSelector,entries,limit){
    const root=$(rootSelector);
    if(!root)return;
    root.replaceChildren();
    const max=Math.max(1,...entries.slice(0,limit).map(item=>Number(item[1]||0)));
    entries.slice(0,limit).forEach(([label,count])=>{
      const row=make("div","dt-rank-row");
      row.append(make("span","dt-rank-label",label.startsWith(".")?label:"."+label));
      const track=make("div","dt-rank-track");
      const fill=make("div","dt-rank-fill");
      fill.style.width=Math.max(1,(Number(count||0)/max)*100)+"%";
      track.append(fill);
      row.append(track,make("span","dt-rank-value",number(count)));
      root.append(row);
    });
    if(!entries.length)root.append(make("div","dt-placeholder","No extension data is available."));
  }
  function renderMovement(rows){
    const root=$("#dt-movement-table");
    if(!root)return;
    root.replaceChildren();
    if(rows.length<2){
      root.append(make("div","dt-placeholder","At least two published snapshots are needed for comparison."));
      return;
    }
    const previous=rows[rows.length-2].by_tld?.new_domains||{};
    const current=rows[rows.length-1].by_tld?.new_domains||{};
    const tlds=new Set([...Object.keys(previous),...Object.keys(current)]);
    const changes=[...tlds].map(tld=>{
      const before=Number(previous[tld]||0),after=Number(current[tld]||0);
      return{tld,before,after,change:after-before};
    }).sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,9);
    const table=make("table","dt-table");
    const head=make("thead","");
    const header=make("tr","");
    ["TLD","Previous","Latest","Change"].forEach(label=>header.append(make("th","",label)));
    head.append(header);table.append(head);
    const body=make("tbody","");
    changes.forEach(item=>{
      const row=make("tr","");
      row.append(make("td","", "."+item.tld),make("td","",number(item.before)),make("td","",number(item.after)));
      const delta=make("td",item.change>0?"dt-change-up":item.change<0?"dt-change-down":"dt-change-flat",
        (item.change>0?"+":"")+number(item.change));
      row.append(delta);body.append(row);
    });
    table.append(body);root.append(table);
  }
  function renderComparison(rows){
    const root=$("#dt-comparison-chart");
    if(!root)return;
    root.replaceChildren();
    const sums=[
      ["Newly observed",rows.reduce((n,row)=>n+Number(row.counts.new_domains||0),0),"new"],
      ["Removed",rows.reduce((n,row)=>n+Number(row.counts.removed_domains||0),0),"removed"]
    ];
    const max=Math.max(1,...sums.map(item=>item[1]));
    sums.forEach(([label,value,type])=>{
      const row=make("div","dt-compare-row");
      row.append(make("span","dt-compare-label",label));
      const track=make("div","dt-compare-track");
      const fill=make("div","dt-compare-fill"+(type==="removed"?" removed":""));
      fill.style.width=Math.max(1,(value/max)*100)+"%";
      track.append(fill);row.append(track,make("span","dt-compare-value",number(value)));
      root.append(row);
    });
    const legend=make("div","dt-compare-legend");
    legend.append(make("span","", "Published source counts across the selected period"));
    root.append(legend);
  }
  function renderHistoryTable(rows){
    const root=$("#dt-history-table");
    if(!root)return;
    root.replaceChildren();
    const table=make("table","dt-table");
    const head=make("thead","");
    const hrow=make("tr","");
    ["Snapshot","New domains","Removed","Expired feed","Dropped feed","Status"].forEach(label=>hrow.append(make("th","",label)));
    head.append(hrow);table.append(head);
    const body=make("tbody","");
    [...rows].reverse().forEach(item=>{
      const row=make("tr","");
      row.append(
        make("td","",item.date),
        make("td","",number(item.counts.new_domains)),
        make("td","",number(item.counts.removed_domains)),
        make("td","",number(item.counts.whoisfreaks_expired)),
        make("td","",number(item.counts.whoisfreaks_dropped)),
        make("td","",item.status==="complete"?"Complete":item.status==="partial"?"Partial":item.status)
      );
      body.append(row);
    });
    table.append(body);root.append(table);
  }
  function renderAll(){
    const rows=history;
    renderMetrics(rows);
    renderVolume(rows);
    const tlds=aggregateTlds(rows,"new_domains");
    renderRankChart("#dt-tld-chart",[...tlds.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])),10);
    renderMovement(rows);
    renderComparison(rows);
    renderHistoryTable(rows);
  }
  async function loadTrends(){
    const period=Number($("#dt-period")?.value||30);
    showFeedback("Retrieving published daily snapshots…","");
    ["#dt-volume-chart","#dt-tld-chart","#dt-movement-table","#dt-comparison-chart","#dt-history-table"].forEach(selector=>{
      const node=$(selector);
      if(node)node.setAttribute("aria-busy","true");
    });
    try{
      const data=await api("/v1/trends?days="+period);
      history=Array.isArray(data.history)?data.history:[];
      currentDate=data.latest_date||"";
      setText("#dt-latest-date",currentDate||"Unavailable");
      setText("#dt-history-count",number(data.available_days));
      setText("#dt-hero-status",data.note||"Historical snapshots are ready.");
      if(!history.length)throw new Error("No domain snapshots are available for this period.");
      renderAll();
      showFeedback(history.length<period
        ?"Showing "+number(history.length)+" published snapshots. More historical data will appear as daily snapshots accumulate."
        :"Showing "+number(history.length)+" daily snapshots.","success");
    }catch(error){
      showFeedback(error.message||"Historical domain trends could not be loaded.","error");
      setText("#dt-latest-date","Unavailable");
      setText("#dt-hero-status","The daily trend service could not be reached.");
      ["#dt-volume-chart","#dt-tld-chart","#dt-movement-table","#dt-comparison-chart","#dt-history-table"].forEach(selector=>{
        const node=$(selector);if(node)node.setAttribute("aria-busy","false");
      });
    }finally{
      ["#dt-volume-chart","#dt-tld-chart","#dt-movement-table","#dt-comparison-chart","#dt-history-table"].forEach(selector=>{
        const node=$(selector);if(node)node.setAttribute("aria-busy","false");
      });
    }
  }

  function openCache(){
    if(!("indexedDB" in window))return Promise.reject(new Error("Your browser does not support local dataset caching."));
    if(cacheDbPromise)return cacheDbPromise;
    cacheDbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open("teampeach-domain-intelligence",1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains("snapshots"))db.createObjectStore("snapshots",{keyPath:"date"});
        if(!db.objectStoreNames.contains("siteChecks"))db.createObjectStore("siteChecks",{keyPath:"key"});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error("Could not open the browser cache."));
      request.onblocked=()=>reject(new Error("The browser cache is currently busy."));
    });
    return cacheDbPromise;
  }
  async function cacheGet(date){
    try{
      const db=await openCache();
      return await new Promise((resolve,reject)=>{
        const request=db.transaction("snapshots","readonly").objectStore("snapshots").get(date);
        request.onsuccess=()=>resolve(request.result||null);
        request.onerror=()=>reject(request.error||new Error("Cache read failed."));
      });
    }catch(_){return null;}
  }
  async function cachePut(value){
    try{
      const db=await openCache();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction("snapshots","readwrite");
        tx.objectStore("snapshots").put(value);
        tx.oncomplete=()=>resolve(true);
        tx.onerror=()=>reject(tx.error||new Error("Cache write failed."));
        tx.onabort=()=>reject(tx.error||new Error("Cache write aborted."));
      });
    }catch(_){}
  }
  async function getLatestSnapshotBlob(){
    const snapshotDate=currentDate;
    if(!snapshotDate)throw new Error("The latest snapshot date is not available.");
    const cached=await cacheGet(snapshotDate);
    if(cached&&cached.blob instanceof Blob)return{blob:cached.blob,cached:true};
    const response=await fetch(API+"/v1/new-domains",{method:"GET",mode:"cors",credentials:"omit",cache:"no-store",headers:{Accept:"application/gzip"}});
    if(!response.ok)throw new Error("The latest domain-name dataset could not be downloaded.");
    const feedDate=response.headers.get("X-Snapshot-Date")||"";
    if(feedDate!==snapshotDate)throw new Error("The dataset date changed. Reload the trend page and try again.");
    const blob=await response.blob();
    await cachePut({date:snapshotDate,blob,savedAt:Date.now()});
    return{blob,cached:false};
  }
  function addDomainToPatterns(domain,tokenCounts,industryCounts){
    const root=domain.slice(0,domain.lastIndexOf("."));
    const parts=root.split(/[.-]+/).filter(Boolean);
    const seen=new Set();
    parts.forEach(word=>{
      if(word.length<3||word.length>24||STOP_WORDS.has(word))return;
      seen.add(word);
    });
    seen.forEach(word=>tokenCounts.set(word,(tokenCounts.get(word)||0)+1));
    const searchable=root.replace(/[^a-z0-9]/g,"");
    INDUSTRIES.forEach(group=>{
      if(group.terms.some(term=>parts.includes(term)||(term.length>=5&&searchable.includes(term)))){
        industryCounts.set(group.label,(industryCounts.get(group.label)||0)+1);
      }
    });
  }
  async function analyseNamingPatterns(){
    const button=$("#dt-analyse-names");
    const feedback=$("#dt-pattern-feedback");
    const results=$("#dt-pattern-results");
    if(!button||!results)return;
    button.disabled=true;
    button.textContent="Preparing local analysis…";
    feedback.textContent="Checking the visitor's browser cache for the latest dataset.";
    feedback.dataset.state="";
    results.hidden=true;
    try{
      const stored=await getLatestSnapshotBlob();
      const reader=stored.blob.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
      const decoder=new TextDecoder();
      const tokens=new Map(),industries=new Map();
      let remainder="",scanned=0,valid=0;
      while(true){
        const chunk=await reader.read();
        if(chunk.done)break;
        const combined=remainder+decoder.decode(chunk.value,{stream:true});
        const lastBreak=combined.lastIndexOf("\n");
        if(lastBreak<0){remainder=combined;continue;}
        const lines=combined.slice(0,lastBreak).split("\n");
        for(const line of lines){
          const domain=line.trim().toLowerCase();
          if(!domain)continue;
          scanned++;
          if(domain.length<=253&&domain.includes(".")){
            valid++;
            addDomainToPatterns(domain,tokens,industries);
          }
        }
        remainder=combined.slice(lastBreak+1);
        if(scanned%50000<lines.length)feedback.textContent="Scanning "+number(scanned)+" domain names locally…";
      }
      remainder+=decoder.decode();
      if(remainder.trim()){
        const domain=remainder.trim().toLowerCase();
        scanned++;
        if(domain.length<=253&&domain.includes(".")){valid++;addDomainToPatterns(domain,tokens,industries);}
      }
      patternResults={
        scanned:valid,
        tokens:[...tokens.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,14),
        industries:[...industries.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,12),
        cached:stored.cached
      };
      renderRankChart("#dt-keyword-chart",patternResults.tokens,14);
      renderRankChart("#dt-industry-chart",patternResults.industries,12);
      results.hidden=false;
      feedback.textContent=number(patternResults.scanned)+" domain names scanned in your browser. "+(patternResults.cached?"The existing local dataset cache was reused.":"The dataset was downloaded and saved in the browser cache.");
      feedback.dataset.state="success";
    }catch(error){
      feedback.textContent=error.message||"Local naming-pattern analysis could not be completed.";
      feedback.dataset.state="error";
    }finally{
      button.disabled=false;
      button.innerHTML='Analyse latest naming patterns <span>↗</span>';
    }
  }

  $("#dt-period")?.addEventListener("change",loadTrends);
  $("#dt-analyse-names")?.addEventListener("click",analyseNamingPatterns);
  loadTrends();
})();