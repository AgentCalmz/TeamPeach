"use strict";
(function(){
 const $=s=>document.querySelector(s);
 let csrfToken="",requests=[],selectedId=new URLSearchParams(location.search).get("id")||"",lastSignature="";
 const escText=(node,value)=>{if(node)node.textContent=value==null?"":String(value);};
 const statusLabel=status=>({"new":"New","discussion":"Discussion","in_progress":"In progress","completed":"Completed"}[status]||"New");
 const typeLabel=type=>({"custom_tool":"Custom AI tool","ai_agent":"AI agent or assistant","automation":"Workflow automation","chatbot":"Chatbot or messaging bot","web_app":"Website or web app","integration":"System integration","other":"Other / discuss"}[type]||"Custom project");
 const dateLabel=value=>{if(!value)return"Recently updated";const d=new Date(value);return Number.isNaN(d.getTime())?"Recently updated":d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});};
 const money=cents=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(cents||0)/100);
 const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n;};
 function feedback(n,message,state){if(!n)return;n.textContent=message||"";n.dataset.state=state||"";}
 async function token(){if(csrfToken)return csrfToken;const r=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw new Error("Secure request setup failed. Refresh and retry.");csrfToken=d.token;return csrfToken;}
 async function api(url,method="GET",body){
  const options={method,credentials:"same-origin",cache:"no-store",headers:{}};
  if(["POST","PATCH","DELETE"].includes(method))options.headers["X-CSRF-Token"]=await token();
  if(body!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(body);}
  const r=await fetch(url,options),d=await r.json().catch(()=>({}));
  if(r.status===401||d.error==="NOT_AUTHENTICATED"){const next=location.pathname+location.search+location.hash;location.replace("/admin/login/?next="+encodeURIComponent(next));throw new Error("Administrator sign-in is required.");}
  if(!r.ok){const e=new Error(d.message||"The request could not be completed.");e.code=d.error||"REQUEST_FAILED";throw e;}return d;
 }
 function visibleRequests(){const status=$("#admin-custom-request-filter")?.value||"all";return requests.filter(r=>status==="all"||r.status===status);}
 function renderList(){
  const root=$("#admin-custom-request-list");if(!root)return;root.replaceChildren();const visible=visibleRequests();
  if(!visible.length){root.append(node("div","custom-request-empty","No requests match this status filter."));return;}
  visible.forEach(request=>{
   const button=node("button","custom-admin-project-card"+(request.id===selectedId?" active":"" ));
   button.type="button";button.dataset.id=request.id;
   const top=node("div","custom-admin-project-card-top");top.append(node("strong","",request.title));
   const pill=node("span","custom-request-status",statusLabel(request.status));pill.dataset.status=request.status;top.append(pill);
   button.append(top,node("small","",(request.customer_name||"Customer")+" · "+(request.customer_email||"")),node("small","",typeLabel(request.project_type)+" · Updated "+dateLabel(request.updated_at)));
   if(request.quote_amount_cents!=null)button.append(node("p","",money(request.quote_amount_cents)+" · Quote "+String(request.quote_status||"draft").replaceAll("_"," ")));
   button.addEventListener("click",()=>selectRequest(request.id,true));root.append(button);
  });
 }
 async function loadList(){
  try{const result=await api("/api/admin/custom-requests");requests=result.requests||[];renderList();
   if(selectedId&&requests.some(r=>r.id===selectedId)){if($("#admin-custom-request-detail").hidden)await loadDetail(selectedId);}
   else if(!selectedId&&requests.length)await selectRequest(requests[0].id,false);
   else if(selectedId&&!requests.some(r=>r.id===selectedId)){selectedId="";showEmpty("That request could not be found in the current list.");}
  }catch(error){const root=$("#admin-custom-request-list");if(root)root.replaceChildren(node("div","custom-request-empty",error.message));}
 }
 function showEmpty(message){const n=$("#admin-custom-request-empty");if(n){n.hidden=false;n.replaceChildren(node("strong","",message));}const d=$("#admin-custom-request-detail");if(d)d.hidden=true;}
 async function selectRequest(id,changeUrl){
  selectedId=id;lastSignature="";renderList();if(changeUrl){const url=new URL(location.href);url.searchParams.set("id",id);history.replaceState(null,"",url.pathname+url.search);}
  await loadDetail(id);
 }
 async function loadDetail(id){
  if(!id)return showEmpty("Select a project request to review it.");
  const empty=$("#admin-custom-request-empty"),detail=$("#admin-custom-request-detail");
  try{
   const data=await api("/api/custom-requests/"+encodeURIComponent(id)+"/messages"),request=data.request;
   if(!request)return showEmpty("This project request could not be found.");
   if(empty)empty.hidden=true;if(detail)detail.hidden=false;
   const customer=requests.find(r=>r.id===id)||{};
   escText($("#admin-custom-request-title"),request.title);
   escText($("#admin-custom-request-customer"),(customer.customer_name||"Customer")+" · "+(customer.customer_email||""));
   escText($("#admin-custom-request-meta"),typeLabel(request.project_type)+" · "+(request.platform||"Not sure")+" · Budget: "+(request.budget_range||"Not provided")+" · Timeline: "+(request.timeline||"Flexible")+" · Submitted "+dateLabel(request.created_at));
   escText($("#admin-custom-request-description"),request.description);
   escText($("#admin-custom-request-outcome"),request.desired_outcome||"No separate outcome provided.");
   const wrap=$("#admin-custom-request-outcome-wrap");if(wrap)wrap.hidden=!request.desired_outcome;
   const status=$("#admin-custom-request-status");if(status)status.value=request.status;
   const price=$("#admin-custom-request-price");if(price)price.value=request.quoteAmountUsd==null?"":Number(request.quoteAmountUsd).toFixed(2);
   escText($("#admin-custom-request-quote-notes"),request.quote_notes||"");
   const quoteState=request.quote_amount_cents==null?"No quote saved.":money(request.quote_amount_cents)+" · "+String(request.quote_status||"draft").replaceAll("_"," ");
   escText($("#admin-custom-request-quote-state"),quoteState);
   const messages=data.messages||[],signature=JSON.stringify(messages.map(m=>[m.id,m.created_at,m.body,m.sender_role]));
   const messagesRoot=$("#admin-custom-request-messages");
   if(messagesRoot&&signature!==lastSignature){
    const nearBottom=messagesRoot.scrollHeight-messagesRoot.scrollTop-messagesRoot.clientHeight<70;messagesRoot.replaceChildren();
    if(!messages.length)messagesRoot.append(node("div","custom-request-empty","No project messages yet."));
    messages.forEach(message=>{const own=message.sender_role==="admin",bubble=node("article","custom-project-message "+(own?"own":"team")),head=node("div","custom-project-message-head");head.append(node("strong","",own?"You · TeamPeach":(message.sender_name||"Customer")),node("time","",dateLabel(message.created_at)));bubble.append(head,node("p","",message.body));messagesRoot.append(bubble);});
    lastSignature=signature;if(nearBottom||!messagesRoot.scrollTop)messagesRoot.scrollTop=messagesRoot.scrollHeight;
   }
  }catch(error){showEmpty(error.message);}
 }
 async function updateStatus(event){
  event.preventDefault();if(!selectedId)return;const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;feedback($("#admin-custom-request-status-feedback"),"Saving status…","");
  try{await api("/api/admin/custom-requests/"+encodeURIComponent(selectedId),"PATCH",{status:form.elements.status.value});feedback($("#admin-custom-request-status-feedback"),"Project status updated.","success");await loadList();await loadDetail(selectedId);}
  catch(error){feedback($("#admin-custom-request-status-feedback"),error.message,"error");}
  finally{button.disabled=false;}
 }
 async function submitQuote(event){
  event.preventDefault();if(!selectedId)return;const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),amount=Number(form.elements.quoteAmountUsd.value);
  if(!Number.isFinite(amount)||amount<=0)return feedback($("#admin-custom-request-quote-feedback"),"Enter a positive price in USD.","error");
  button.disabled=true;feedback($("#admin-custom-request-quote-feedback"),"Submitting quote…","");
  try{await api("/api/admin/custom-requests/"+encodeURIComponent(selectedId),"PATCH",{quoteAmountUsd:amount,quoteNotes:form.elements.quoteNotes.value.trim(),submitQuote:true});feedback($("#admin-custom-request-quote-feedback"),"Quote submitted and customer notified.","success");await loadList();await loadDetail(selectedId);}
  catch(error){feedback($("#admin-custom-request-quote-feedback"),error.message,"error");}
  finally{button.disabled=false;}
 }
 async function saveDraft(){
  if(!selectedId)return;const amount=$("#admin-custom-request-price")?.value||"",notes=$("#admin-custom-request-quote-notes")?.value||"";
  if(amount.trim()&&(!Number.isFinite(Number(amount))||Number(amount)<=0))return feedback($("#admin-custom-request-quote-feedback"),"Enter a valid positive USD amount, or leave it blank.","error");
  const button=$("#admin-custom-request-save-draft");if(button)button.disabled=true;
  try{await api("/api/admin/custom-requests/"+encodeURIComponent(selectedId),"PATCH",{quoteAmountUsd:amount.trim()?Number(amount):null,quoteNotes:notes});feedback($("#admin-custom-request-quote-feedback"),"Quote draft saved. It has not been sent to the customer.","success");await loadList();await loadDetail(selectedId);}
  catch(error){feedback($("#admin-custom-request-quote-feedback"),error.message,"error");}
  finally{if(button)button.disabled=false;}
 }
 async function sendMessage(event){
  event.preventDefault();if(!selectedId)return;const form=event.currentTarget,field=$("#admin-custom-request-reply-body"),button=form.querySelector('button[type="submit"]'),body=field.value.trim();
  if(!body)return;button.disabled=true;feedback($("#admin-custom-request-reply-feedback"),"Sending…","");
  try{await api("/api/custom-requests/"+encodeURIComponent(selectedId)+"/messages","POST",{body});field.value="";feedback($("#admin-custom-request-reply-feedback"),"Reply sent; customer notified.","success");lastSignature="";await loadDetail(selectedId);await loadList();}
  catch(error){feedback($("#admin-custom-request-reply-feedback"),error.message,"error");}
  finally{button.disabled=false;}
 }
 $("#admin-custom-request-status-form")?.addEventListener("submit",updateStatus);
 $("#admin-custom-request-quote-form")?.addEventListener("submit",submitQuote);
 $("#admin-custom-request-save-draft")?.addEventListener("click",saveDraft);
 $("#admin-custom-request-reply-form")?.addEventListener("submit",sendMessage);
 $("#admin-custom-request-filter")?.addEventListener("change",renderList);
 $("#admin-custom-request-refresh")?.addEventListener("click",loadList);
 loadList();setInterval(()=>{if(document.visibilityState==="visible"){loadList();if(selectedId)loadDetail(selectedId);}},15000);
})();