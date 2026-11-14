"use strict";
(function(){
 const API="https://teampeach-domain-api.creatorletofficial.workers.dev";
 const $=selector=>document.querySelector(selector);
 const SOURCE_LABELS={dropped:"WhoisFreaks dropped-domain feed",expired:"WhoisFreaks expired-domain feed",removed:"Webamon removed-from-zone feed"};
 const CACHE_DB="teampeach-domain-revival";
 const CACHE_STORE="feeds";
 const MAX_VISIBLE=120;
 let loadedRows=[];
 let filteredRows=[];
 let loadedSource="";
 let loadedDate="";
 let busy=false;
 let dbPromise=null;
 const numberFormat=new Intl.NumberFormat(undefined,{maximumFractionDigits:0});
 const number=value=>numberFormat.format(Number(value)||0);
 function text(selector,value){const node=$(selector);if(node)node.textContent=value==null?"—":String(value);}
 function status(message,state){const node=$("#dr-status");if(node){node.textContent=message||"";node.dataset.state=state||"";}}
 function make(tag,className,value){const node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=String(value);return node;}
 function openDb(){
  if(!("indexedDB" in window))return Promise.reject(new Error("Browser storage is unavailable."));
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open(CACHE_DB,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(CACHE_STORE))request.result.createObjectStore(CACHE_STORE,{keyPath:"key"});};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||new Error("Could not open the local feed cache."));
   request.onblocked=()=>reject(new Error("The local feed cache is busy."));
  });
  return dbPromise;
 }
 async function cacheGet(key){
  try{const db=await openDb();return await new Promise((resolve,reject)=>{
   const request=db.transaction(CACHE_STORE,"readonly").objectStore(CACHE_STORE).get(key);
   request.onsuccess=()=>resolve(request.result||null);
   request.onerror=()=>reject(request.error||new Error("Cache read failed."));
  });}catch(_){return null;}
 }
 async function cachePut(value){
  try{const db=await openDb();await new Promise((resolve,reject)=>{
   const transaction=db.transaction(CACHE_STORE,"readwrite");
   transaction.objectStore(CACHE_STORE).put(value);
   transaction.oncomplete=()=>resolve(true);
   transaction.onerror=()=>reject(transaction.error||new Error("Cache write failed."));
   transaction.onabort=()=>reject(transaction.error||new Error("Cache write aborted."));
  });}catch(_){}
 }
 async function decompress(blob){
  if(!("DecompressionStream" in window))throw new Error("This browser does not support local compressed-feed processing. Use a current Chrome, Edge, Firefox or Safari browser.");
  const stream=blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
 }
 function updateTldOptions(){
  const select=$("#dr-tld");
  if(!select)return;
  const current=select.value;
  const values=[...new Set(loadedRows.map(row=>row.tld))].sort();
  select.replaceChildren(new Option("All extensions","all"));
  values.forEach(value=>select.add(new Option("."+value,value)));
  select.value=values.includes(current)?current:"all";
 }
 function getFiltered(){
  return window.TeamPeachDomainRevival.filterRows(loadedRows,{
   term:$("#dr-keyword")?.value||"",
   tld:$("#dr-tld")?.value||"all",
   minimumScore:$("#dr-min-score")?.value||0,
   sort:$("#dr-sort")?.value||"score"
  });
 }
 function updateMetrics(){
  text("#dr-loaded-count",loadedRows.length?number(loadedRows.length):"—");
  text("#dr-match-count",number(filteredRows.length));
  text("#dr-top-score",filteredRows.length?number(filteredRows[0].score)+"/100":"—");
  const exportButton=$("#dr-export");if(exportButton)exportButton.disabled=!filteredRows.length||busy;
  const loadButton=$("#dr-load");if(loadButton)loadButton.disabled=busy;
 }
 function render(){
  filteredRows=getFiltered();
  const root=$("#dr-results"),empty=$("#dr-empty");
  if(!root||!empty)return;
  root.replaceChildren();
  empty.hidden=filteredRows.length>0;
  empty.textContent=loadedRows.length
   ?"No domains match these filters. Try a shorter keyword, another extension or a lower minimum score."
   :"Your candidate list will appear here after a dataset has loaded.";
  filteredRows.slice(0,MAX_VISIBLE).forEach(row=>{
   const card=make("article","dr-result-card");
   const head=make("div","dr-result-head");
   const main=make("div","dr-result-main");
   const link=make("a","dr-domain",row.domain);
   link.href="https://"+row.domain+"/";link.target="_blank";link.rel="noopener noreferrer";
   main.append(link,make("span","dr-source-tag",SOURCE_LABELS[row.source]||"Public domain feed"));
   const score=make("span","dr-score",row.score+"/100");
   head.append(main,score);
   const meta=make("div","dr-result-meta");
   meta.append(make("span","","Name: "+row.name),make("span","","Extension: ."+row.tld),make("span","","Snapshot: "+row.date));
   const actions=make("div","dr-result-actions");
   const archive=make("a","", "View archive history ↗");
   archive.href="https://web.archive.org/web/*/"+row.domain;archive.target="_blank";archive.rel="noopener noreferrer";
   const rdap=make("a","", "Check RDAP record ↗");
   rdap.href="https://rdap.org/domain/"+encodeURIComponent(row.domain);rdap.target="_blank";rdap.rel="noopener noreferrer";
   actions.append(archive,rdap);
   card.append(head,meta,actions);
   root.append(card);
  });
  text("#dr-results-context",filteredRows.length?number(filteredRows.length)+" matching candidates":"No matching candidates");
  text("#dr-results-note",filteredRows.length>MAX_VISIBLE
   ?"Showing the first "+number(MAX_VISIBLE)+" results. Export CSV to review the full filtered set."
   :filteredRows.length?"Showing "+number(filteredRows.length)+" filtered candidate(s).":"");
  updateMetrics();
 }
 async function loadFeed(){
  if(busy)return;
  const source=$("#dr-source")?.value||"dropped";
  busy=true;
  const button=$("#dr-load");if(button)button.textContent="Loading snapshot…";
  status("Retrieving the latest "+(SOURCE_LABELS[source]||"domain")+" snapshot…","");
  try{
   const response=await fetch(API+"/v1/revival-domains?source="+encodeURIComponent(source),{
    method:"GET",mode:"cors",credentials:"omit",cache:"no-store",headers:{Accept:"application/gzip"}
   });
   if(!response.ok){
    const problem=await response.json().catch(()=>({}));
    throw new Error(problem.detail||problem.error||"The selected lifecycle dataset is not available in the latest snapshot.");
   }
   const date=response.headers.get("X-Snapshot-Date")||"";
   if(!date)throw new Error("The data service did not provide a snapshot date.");
   const cacheKey=source+":"+date;
   const cached=await cacheGet(cacheKey);
   let blob;
   if(cached&&cached.blob instanceof Blob){
    blob=cached.blob;if(response.body)response.body.cancel().catch(()=>{});
   }else{
    blob=await response.blob();
    await cachePut({key:cacheKey,source,date,blob,savedAt:Date.now()});
   }
   const raw=await decompress(blob);
   const rows=window.TeamPeachDomainRevival.parseLines(raw,source,date);
   loadedRows=rows;loadedSource=source;loadedDate=date;
   updateTldOptions();
   text("#dr-date",date);
   text("#dr-feed-count",number(rows.length));
   text("#dr-source-label",SOURCE_LABELS[source]||source);
   render();
   status(number(rows.length)+" unique domain names loaded from the "+source+" feed dated "+date+". Filtering and name scoring ran in this browser.", "success");
  }catch(error){
   loadedRows=[];loadedSource="";loadedDate="";
   filteredRows=[];render();
   status(error.message||"The domain snapshot could not be loaded.","error");
   text("#dr-date","Not loaded");text("#dr-feed-count","—");text("#dr-source-label","No dataset available");
  }finally{
   busy=false;
   if(button)button.textContent="Load latest snapshot ↗";
   updateMetrics();
  }
 }
 function csvCell(value){return '"'+String(value??"").replace(/"/g,'""')+'"';}
 function exportCsv(){
  if(!filteredRows.length)return;
  const columns=["Domain","Source","Snapshot date","Name label","TLD","Name signal score"];
  const data=filteredRows.map(row=>[row.domain,row.source,row.date,row.name,row.tld,row.score]);
  const content=[columns,...data].map(row=>row.map(csvCell).join(",")).join("\r\n");
  const blob=new Blob(["\uFEFF"+content],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=make("a","");
  anchor.href=url;anchor.download="teampeach-domain-revival-"+(loadedSource||"candidates")+"-"+(loadedDate||"latest")+".csv";
  document.body.append(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
 }
 $("#dr-load")?.addEventListener("click",loadFeed);
 $("#dr-export")?.addEventListener("click",exportCsv);
 ["#dr-keyword","#dr-tld","#dr-min-score","#dr-sort"].forEach(selector=>{
  $(selector)?.addEventListener(selector==="#dr-keyword"?"input":"change",()=>{if(loadedRows.length)render();});
 });
 $("#dr-source")?.addEventListener("change",()=>{
  loadedRows=[];filteredRows=[];loadedSource="";loadedDate="";
  render();text("#dr-date","Not loaded");text("#dr-feed-count","—");
  text("#dr-source-label","Load the selected lifecycle dataset.");
  status("Dataset changed. Load its latest snapshot to continue.","");
 });
 render();updateMetrics();
})();