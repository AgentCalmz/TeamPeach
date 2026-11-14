"use strict";
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.TeamPeachDomainRevival=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  const MULTI_SUFFIXES=new Set(["com.ng","org.ng","net.ng","gov.ng","edu.ng","co.uk","org.uk","ac.uk","com.au","net.au","org.au","co.nz","co.za","co.ke","com.br","com.mx","co.in","co.jp","com.sg","com.tr","com.ar","com.pl"]);
  const TLD_POINTS={com:20,org:14,net:12,co:12,io:11,ai:11,app:9,dev:9,me:8,uk:7,ng:8};
  function normalizeDomain(input){
    let raw=String(input||"").trim().toLowerCase();
    if(!raw||raw.length>2048)return "";
    try{
      if(raw.includes("://")){
        const parsed=new URL(raw);
        if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password||parsed.port||
           (parsed.pathname!=="/"&&parsed.pathname!=="")||parsed.search||parsed.hash)return "";
        raw=parsed.hostname;
      }else{
        if(/[\s/:@?#%\\]/.test(raw))return "";
      }
      raw=raw.replace(/\.$/,"");
    }catch(_){return "";}
    if(raw.length>253||raw.split(".").length<2)return "";
    const labels=raw.split(".");
    const valid=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
    if(labels.some(label=>!valid.test(label))||labels[labels.length-1].length<2)return "";
    return raw;
  }
  function getTld(domain){
    const host=normalizeDomain(domain);
    return host?host.split(".").pop():"";
  }
  function getNameLabel(domain){
    const host=normalizeDomain(domain);
    if(!host)return "";
    const labels=host.split(".");
    const lastTwo=labels.slice(-2).join(".");
    return MULTI_SUFFIXES.has(lastTwo)?labels[labels.length-3]||"":labels[labels.length-2]||"";
  }
  function scoreDomain(domain){
    const host=normalizeDomain(domain);
    if(!host)return 0;
    const label=getNameLabel(host);
    if(!label)return 0;
    let score=30;
    if(label.length<=6)score+=24;
    else if(label.length<=10)score+=20;
    else if(label.length<=14)score+=14;
    else if(label.length<=20)score+=8;
    else score+=2;
    score+=TLD_POINTS[getTld(host)]||4;
    if(/^[a-z]+$/.test(label))score+=10;
    else score-=5;
    if(label.includes("-"))score-=8;
    if(/\d/.test(label))score-=6;
    return Math.max(0,Math.min(100,score));
  }
  function parseLines(text,source,date){
    const seen=new Set();
    const rows=[];
    String(text||"").split(/\r?\n/).forEach(line=>{
      const domain=normalizeDomain(line.split(",")[0]);
      if(!domain||seen.has(domain))return;
      seen.add(domain);
      rows.push({domain,source:String(source||"dropped"),date:String(date||""),tld:getTld(domain),name:getNameLabel(domain),score:scoreDomain(domain)});
    });
    return rows;
  }
  function filterRows(rows,options){
    const opts=options||{};
    const term=String(opts.term||"").trim().toLowerCase();
    const tld=String(opts.tld||"all").toLowerCase();
    const minimum=Math.max(0,Math.min(100,Number(opts.minimumScore)||0));
    const result=(Array.isArray(rows)?rows:[]).filter(row=>
      (!term||row.domain.includes(term))&&
      (tld==="all"||row.tld===tld)&&
      row.score>=minimum
    );
    const sort=opts.sort||"score";
    result.sort((a,b)=>{
      if(sort==="name")return a.domain.localeCompare(b.domain);
      if(sort==="shortest")return a.name.length-b.name.length||a.domain.localeCompare(b.domain);
      return b.score-a.score||a.domain.localeCompare(b.domain);
    });
    return result;
  }
  return {normalizeDomain,getTld,getNameLabel,scoreDomain,parseLines,filterRows};
});