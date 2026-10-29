"use strict";
(function(){
 const $=s=>document.querySelector(s);
 let csrfToken="",lastThreadSignature="";
 const escText=(node,value)=>{if(node)node.textContent=value==null?"":String(value);};
 const statusLabel=status=>({"new":"New","discussion":"Discussion","in_progress":"In progress","completed":"Completed"}[status]||"New");
 const typeLabel=type=>({"custom_tool":"Custom AI tool","ai_agent":"AI agent or assistant","automation":"Workflow automation","chatbot":"Chatbot or messaging bot","web_app":"Website or web app","integration":"System integration","other":"Other / discuss"}[type]||"Custom project");
 const dateLabel=value=>{if(!value)return"Just submitted";const date=new Date(value);return Number.isNaN(date.getTime())?"Recently updated":date.toLocaleString(undefined,{year:date.getFullYear()!==new Date().getFullYear()?"numeric":undefined,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});};
 const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(cents||0)/100);
 function feedback(node,message,state){if(!node)return;node.textContent=message||"";node.dataset.state=state||"";}
 async function token(){if(csrfToken)return csrfToken;const r=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw new Error("Secure request setup failed. Refresh this page and try again.");csrfToken=d.token;return csrfToken;}
 async function api(url,method="GET",body){
  const options={method,credentials:"same-origin",cache:"no-store",headers:{}};
  if(["POST","PATCH","DELETE"].includes(method))options.headers["X-CSRF-Token"]=await token();
  if(body!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(body);}
  const r=await fetch(url,options),d=await r.json().catch(()=>({}));
  if(r.status===401||d.error==="NOT_AUTHENTICATED"){const next=location.pathname+location.search+location.hash;location.replace("/login/?next="+encodeURIComponent(next));throw new Error("Please sign in to continue.");}
  if(!r.ok){const e=new Error(d.message||"The request could not be completed.");e.code=d.error||"REQUEST_FAILED";throw e;}
  return d;
 }
 const createNode=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
 function statusPill(status){const pill=createNode("span","custom-request-status",statusLabel(status));pill.dataset.status=status||"new";return pill;}
 function renderList(requests){
  const root=$("#custom-request-list");if(!root)return;root.replaceChildren();
  if(!requests.length){const empty=createNode("div","custom-request-empty");empty.append(createNode("strong","","No custom projects yet"),createNode("span","","Use the form to describe a tool, assistant or automation you would like TeamPeach to build."));root.append(empty);return;}
  requests.forEach(request=>{
   const card=createNode("article","custom-request-card"),top=createNode("div","custom-request-card-top");
   top.append(statusPill(request.status),createNode("span","custom-request-card-meta",dateLabel(request.updated_at||request.created_at)));
   const title=createNode("h3","",request.title),desc=createNode("p","",(request.description||"").slice(0,190)+((request.description||"").length>190?"…":""));
   const bottom=createNode("div","custom-request-card-bottom"),meta=createNode("span","custom-request-card-meta",typeLabel(request.project_type));
   if(request.quote_amount_cents&&request.quote_status!=="draft")bottom.append(createNode("strong","custom-request-card-quote",money(request.quote_amount_cents)+" · Quote "+(request.quote_status||"").replaceAll("_"," ")));
   const link=createNode("a","custom-request-open-link","Open project discussion ↗");link.href="/dashboard/requests/view/?id="+encodeURIComponent(request.id);
   bottom.append(meta,link);card.append(top,title,desc,bottom);root.append(card);
  });
 }
 async function loadList(){
  const root=$("#custom-request-list");if(!root)return;
  try{const result=await api("/api/custom-requests");renderList(result.requests||[]);}
  catch(error){root.replaceChildren(createNode("div","custom-request-empty",error.message));}
 }
 const requestForm=$("#custom-request-form");
 requestForm?.addEventListener("submit",async event=>{
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;feedback($("#custom-request-feedback"),"Submitting your request securely…","");
  try{
   const result=await api("/api/custom-requests","POST",{
    title:form.elements.title.value.trim(),projectType:form.elements.projectType.value,
    description:form.elements.description.value.trim(),desiredOutcome:form.elements.desiredOutcome.value.trim(),
    platform:form.elements.platform.value,budgetRange:form.elements.budgetRange.value,timeline:form.elements.timeline.value
   });
   form.reset();feedback($("#custom-request-feedback"),result.message||"Your project request has been submitted.","success");await loadList();
  }catch(error){feedback($("#custom-request-feedback"),error.message,"error");}
  finally{button.disabled=false;}
 });
 $("#custom-request-refresh")?.addEventListener("click",loadList);
 if($("#custom-request-list"))loadList();

 async function loadThread(){
  const root=$("#custom-project-thread");if(!root)return;
  const id=new URLSearchParams(location.search).get("id")||"",loading=$("#custom-project-loading");
  if(!/^[0-9a-f-]{36}$/i.test(id)){escText(loading,"This project link is incomplete. Return to Custom projects and open a request.");return;}
  try{
   const result=await api("/api/custom-requests/"+encodeURIComponent(id)+"/messages"),request=result.request,messages=result.messages||[];
   if(!request){escText(loading,"This project request could not be found.");return;}
   if(loading)loading.hidden=true;root.hidden=false;
   escText($("#custom-project-title"),request.title);escText($("#custom-project-meta"),"Created "+dateLabel(request.created_at)+" · Updated "+dateLabel(request.updated_at));
   const status=$("#custom-project-status");escText(status,statusLabel(request.status));if(status)status.dataset.status=request.status;
   escText($("#custom-project-type"),typeLabel(request.project_type));escText($("#custom-project-platform"),request.platform||"Not sure");
   escText($("#custom-project-budget"),request.budget_range||"Not provided");escText($("#custom-project-timeline"),request.timeline||"Flexible");
   escText($("#custom-project-description"),request.description);escText($("#custom-project-outcome"),request.desired_outcome||"No separate outcome was provided.");
   const outcomeWrap=$("#custom-project-outcome-wrap");if(outcomeWrap)outcomeWrap.hidden=!request.desired_outcome;
   const quoteAmount=$("#custom-quote-price"),quoteStatus=$("#custom-quote-status"),quoteNotes=$("#custom-quote-notes"),quoteActions=$("#custom-quote-actions");
   if(request.quote_amount_cents!=null){escText(quoteAmount,money(request.quote_amount_cents));}
   else escText(quoteAmount,"Quote pending");
   const quoteMessage={"draft":"TeamPeach will review the scope and submit a quote here.","sent":"A quote has been submitted. Accept or decline it, or ask a question in the project chat.","accepted":"You accepted this quote. TeamPeach will coordinate the next steps in this project discussion.","declined":"You declined this quote. You can continue discussing the project scope here."}[request.quote_status]||"Quote status unavailable.";
   escText(quoteStatus,quoteMessage);escText(quoteNotes,request.quote_notes||"");
   if(quoteActions)quoteActions.hidden=!(request.quote_status==="sent"&&request.quote_amount_cents);
   const messagesRoot=$("#custom-project-messages"),signature=JSON.stringify(messages.map(m=>[m.id,m.created_at,m.body,m.sender_role]));
   if(messagesRoot&&signature!==lastThreadSignature){
    const nearBottom=messagesRoot.scrollHeight-messagesRoot.scrollTop-messagesRoot.clientHeight<70;
    messagesRoot.replaceChildren();
    if(!messages.length)messagesRoot.append(createNode("div","custom-request-empty","No messages yet. Use this private thread to clarify the project with TeamPeach."));
    messages.forEach(message=>{
     const own=message.sender_role==="user",bubble=createNode("article","custom-project-message "+(own?"own":"team")),head=createNode("div","custom-project-message-head");
     head.append(createNode("strong","",own?"You":(message.sender_name||"TeamPeach")),createNode("time","",dateLabel(message.created_at)));
     bubble.append(head,createNode("p","",message.body));messagesRoot.append(bubble);
    });
    lastThreadSignature=signature;if(nearBottom||!messagesRoot.scrollTop)messagesRoot.scrollTop=messagesRoot.scrollHeight;
   }
  }catch(error){if(loading)escText(loading,error.message);}
 }
 const replyForm=$("#custom-project-reply-form");
 replyForm?.addEventListener("submit",async event=>{
  event.preventDefault();const form=event.currentTarget,field=$("#custom-project-reply-body"),button=form.querySelector('button[type="submit"]'),id=new URLSearchParams(location.search).get("id")||"",body=field.value.trim();
  if(!body)return;button.disabled=true;feedback($("#custom-project-reply-feedback"),"Sending…","");
  try{await api("/api/custom-requests/"+encodeURIComponent(id)+"/messages","POST",{body});field.value="";feedback($("#custom-project-reply-feedback"),"Message sent.","success");lastThreadSignature="";await loadThread();}
  catch(error){feedback($("#custom-project-reply-feedback"),error.message,"error");}
  finally{button.disabled=false;}
 });
 async function quoteDecision(decision){
  const id=new URLSearchParams(location.search).get("id")||"",feedbackNode=$("#custom-quote-feedback");
  const buttons=[$("#custom-quote-accept"),$("#custom-quote-decline")].filter(Boolean);buttons.forEach(button=>button.disabled=true);
  try{await api("/api/custom-requests/"+encodeURIComponent(id)+"/quote","PATCH",{decision});feedback(feedbackNode,decision==="accepted"?"Quote accepted. TeamPeach will reply here with next steps.":"Quote declined. You can continue discussing scope below.","success");lastThreadSignature="";await loadThread();}
  catch(error){feedback(feedbackNode,error.message,"error");}
  finally{buttons.forEach(button=>button.disabled=false);}
 }
 $("#custom-quote-accept")?.addEventListener("click",()=>quoteDecision("accepted"));
 $("#custom-quote-decline")?.addEventListener("click",()=>quoteDecision("declined"));
 if($("#custom-project-thread")){loadThread();setInterval(()=>{if(document.visibilityState==="visible")loadThread();},8000);}
})();