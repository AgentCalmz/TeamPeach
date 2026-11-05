"use strict";
(function(){
 const state=document.getElementById("preview-state");
 if(!state)return;
 const params=new URLSearchParams(window.location.search);
 const assistantId=params.get("assistant")||"";
 let finished=false,configTimer=null,widgetTimer=null;
 function show(kind,message){
  if(finished&&kind!=="ready")return;
  state.dataset.state=kind;
  state.textContent=message;
  if(kind==="ready")finished=true;
 }
 if(!/^[0-9a-f-]{36}$/i.test(assistantId)){
  show("error","No valid assistant was selected. Return to your dashboard and open Test assistant from an existing assistant.");
  return;
 }
 // The page is served with script-src 'self'; keep this bootstrap external,
 // because inline scripts are blocked by that security policy.
 const controller=new AbortController();
 configTimer=window.setTimeout(()=>controller.abort(),12000);
 fetch("/api/chatbots/"+encodeURIComponent(assistantId)+"/preview-config",{
  credentials:"same-origin",cache:"no-store",signal:controller.signal
 }).then(async response=>{
  const body=await response.json().catch(()=>({}));
  if(!response.ok){
   const message=body.message||(response.status===401
    ?"Sign in to the TeamPeach account that owns this assistant, then reopen the test page."
    :"The assistant could not be loaded. Return to your chatbot dashboard and check its status.");
   throw new Error(message);
  }
  return body;
 }).then(()=>{
  window.clearTimeout(configTimer);
  const script=document.createElement("script");
  script.src="/js/chatbot-widget.js?v=4";
  script.dataset.assistantId=assistantId;
  script.dataset.mode="preview";
  script.dataset.openOnLoad="1";
  widgetTimer=window.setTimeout(()=>{
   show("error","The chatbot script did not finish loading. Check your connection, refresh the page and try again.");
  },12000);
  script.addEventListener("error",()=>{
   window.clearTimeout(widgetTimer);
   show("error","The chatbot widget file could not be loaded. Refresh this page; if it continues, contact TeamPeach support.");
  },{once:true});
  script.addEventListener("load",()=>{
   window.clearTimeout(widgetTimer);
   // Verify that the isolated chat UI actually mounted and opened.
   window.setTimeout(()=>{
    const root=document.querySelector('[data-teampeach-chatbot="true"]');
    const panel=root&&root.shadowRoot&&root.shadowRoot.querySelector(".tp-panel");
    if(panel&&panel.classList.contains("tp-open")){
     show("ready","Your assistant is open. Send a test message in the chat window.");
    }else{
     show("error","The widget file loaded, but the chat window did not open. Refresh this page and try again.");
    }
   },900);
  },{once:true});
  document.head.appendChild(script);
 }).catch(error=>{
  window.clearTimeout(configTimer);
  const message=error&&error.name==="AbortError"
   ?"The assistant check timed out. Check your connection and refresh the page."
   :(error&&error.message)||"The assistant could not be reached. Refresh the page and sign in again.";
  show("error",message);
 });
})();