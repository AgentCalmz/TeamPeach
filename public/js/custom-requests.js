"use strict";
(function(){
 const app=document.querySelector("#custom-requests-app");
 if(!app)return;
 const admin=app.dataset.mode==="admin";
 const $=s=>app.querySelector(s);
 const esc=html=>String(html==null?"":html).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const statusLabels={new:"New",discussion:"In discussion",in_progress:"In progress",completed:"Completed"};
 const budgetLabels={"under_500":"Under $500","500_1500":"$500–$1,500","1500_5000":"$1,500–$5,000","over_5000":"Over $5,000","not_sure":"Not sure yet"};
 const timelineLabels={"asap":"As soon as possible","2_4_weeks":"2–4 weeks","1_3_months":"1–3 months","flexible":"Flexible"};
 const money=minor=>new Intl.NumberFormat(undefined,{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const date=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});};
 const node=(tag,className,value)=>{const el=document.createElement(tag);if(className)el.className=className;if(value!==undefined)el.textContent=String(value);return el;};
 let csrf="",requests=[],selectedId="",busy=false;
 async function token(){
  if(csrf)return csrf;
  const response=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"}),body=await response.json().catch(()=>({}));
  if(!response.ok||!body.token)throw new Error(body.message||"Secure request setup failed. Refresh the page and retry.");
  csrf=body.token;return csrf;
 }
 async function api(url,method="GET",data){
  const options={method,credentials:"same-origin",cache:"no-store",headers:{}};
  if(["POST","PATCH","DELETE"].includes(method))options.headers["X-CSRF-Token"]=await token();
  if(data!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(data);}
  const response=await fetch(url,options),body=await response.json().catch(()=>({}));
  if(response.status===401||body.error==="NOT_AUTHENTICATED"){
   const next=location.pathname+location.search,login=admin?"/admin/login/?next=":"/login/?next=";
   location.href=login+encodeURIComponent(next);throw new Error("Your session has ended. Sign in again.");
  }
  if(!response.ok){const error=new Error(body.message||"The request could not be completed.");error.code=body.error||"REQUEST_FAILED";throw error;}
  return body;
 }
 function feedback(message,state){const el=$("#custom-request-feedback");if(el){el.textContent=message||"";el.dataset.state=state||"";}}
 function makeStatus(status){return node("span","custom-request-status "+(status||"new"),statusLabels[status]||"New");}
 function displayBudget(value){return budgetLabels[value]||"Not specified";}
 function displayTimeline(value){return timelineLabels[value]||"Flexible";}
 function selectedRequest(){return requests.find(item=>item.id===selectedId)||null;}
 function renderList(){
  const list=$("#custom-request-list");if(!list)return;list.replaceChildren();
  if(!requests.length){list.append(node("div","custom-request-empty",admin?"No customization requests match this view yet.":"Your submitted requests will appear here. Each request has its own private discussion."));return;}
  requests.forEach(item=>{
   const button=node("button","custom-request-list-item"+(item.id===selectedId?" selected":"" ));
   button.type="button";button.setAttribute("aria-pressed",String(item.id===selectedId));
   const top=node("div","custom-request-list-top");top.append(makeStatus(item.status));top.append(node("small","",date(item.updated_at||item.created_at)));
   button.append(top,node("strong","",item.title));
   const who=item.tp_users&&item.tp_users.full_name?item.tp_users.full_name:"";
   if(admin&&who)button.append(node("small","custom-request-customer",who+(item.tp_users.email?" · "+item.tp_users.email:"")));
   button.append(node("small","",item.request_type+(item.quoted_price_minor?" · "+money(item.quoted_price_minor):"")));
   button.addEventListener("click",()=>selectRequest(item.id));
   list.append(button);
  });
 }
 function renderEmptyDetail(){
  const detail=$("#custom-request-detail");if(!detail)return;detail.replaceChildren();
  const empty=node("div","custom-request-detail-empty"),mark=node("span","mark","✳");
  empty.append(mark,node("h2","",admin?"Choose a customer request":"Choose one of your requests"),node("p","",admin?"Review the requirements, set the proposed USD price, update progress and keep every conversation tied to its project.":"Select a request to follow its status, review the quote and discuss the work privately with TeamPeach."));
  detail.append(empty);
 }
 function block(title,copy){
  const wrap=node("section","custom-request-copy");wrap.append(node("div","", ""));
  wrap.firstChild.remove();
  wrap.append(node("h3","",title),node("p","",copy||"Not provided yet."));
  return wrap;
 }
 function renderMessages(messages){
  const list=node("div","custom-request-messages");list.setAttribute("role","log");list.setAttribute("aria-live","polite");list.setAttribute("aria-label","Messages for this customization request");
  if(!messages.length)list.append(node("div","custom-request-empty","No messages yet. Use this private thread to clarify requirements and next steps."));
  messages.forEach(message=>{
   const mine=admin?message.sender_role==="staff":message.sender_role==="user";
   const bubble=node("article","custom-request-message"+(message.sender_role==="system"?" system":mine?" mine":""));
   const meta=node("div","custom-request-message-meta");
   meta.append(node("strong","",message.sender_name|| (message.sender_role==="staff"?"TeamPeach":"Customer")));
   meta.append(node("span","",date(message.created_at)));
   bubble.append(meta,node("p","",message.body));list.append(bubble);
  });
  return list;
 }
 function renderDetail(payload){
  const detail=$("#custom-request-detail");if(!detail)return;detail.replaceChildren();
  const item=payload.request,messages=payload.messages||[];
  const head=node("div","custom-request-detail-head"),main=node("div",""),kicker=node("div","custom-request-kicker",admin?"CUSTOMER REQUEST":"YOUR CUSTOM REQUEST");
  main.append(kicker,node("h2","",item.title),node("p","",item.request_type+" · Submitted "+date(item.created_at)));
  if(admin&&item.tp_users)main.append(node("p","custom-request-customer",(item.tp_users.full_name||"Customer")+(item.tp_users.email?" · "+item.tp_users.email:"")));
  head.append(main,makeStatus(item.status));detail.append(head);
  const meta=node("div","custom-request-metadata");
  meta.append(node("span","custom-request-meta-chip","Budget: "+displayBudget(item.budget_range)));
  meta.append(node("span","custom-request-meta-chip","Timeline: "+displayTimeline(item.timeline)));
  if(item.quoted_price_minor)meta.append(node("span","custom-request-meta-chip","Quote: "+money(item.quoted_price_minor)));
  detail.append(meta);
  const copy=node("div","custom-request-copy");
  copy.append(block("Problem and requirements",item.description));
  if(item.desired_outcome)copy.append(block("Desired outcome",item.desired_outcome));
  detail.append(copy);
  if(!admin&&item.quoted_price_minor){
   const quote=node("section","custom-request-quote");
   quote.append(node("strong","", "PROJECT QUOTE · "+(item.quoted_at?"Updated "+date(item.quoted_at):"Shared by TeamPeach")),node("div","quote-amount",money(item.quoted_price_minor)));
   if(item.quote_notes)quote.append(node("p","",item.quote_notes));
   quote.append(node("p","","The quote is saved to this request. Use the private discussion below to ask questions or confirm the scope."));
   detail.append(quote);
  }
  if(admin){
   const form=node("form","custom-request-quote-form");form.noValidate=false;
   const title=node("h3","", "Update status and pricing");form.append(title);
   const fields=node("div","fields"),statusLabel=node("label","", "Project status"),statusSelect=node("select","");statusSelect.name="status";
   [["new","New"],["discussion","In discussion"],["in_progress","In progress"],["completed","Completed"]].forEach(([value,label])=>{const opt=node("option","",label);opt.value=value;statusSelect.append(opt);});
   statusSelect.value=item.status;statusLabel.append(statusSelect);
   const priceLabel=node("label","", "Quoted price (USD)"),priceInput=node("input","");priceInput.name="quotedPriceUsd";priceInput.type="number";priceInput.min="0.01";priceInput.max="1000000";priceInput.step="0.01";priceInput.placeholder="e.g. 350.00";priceInput.value=item.quoted_price_minor?(Number(item.quoted_price_minor)/100).toFixed(2):"";priceLabel.append(priceInput);
   fields.append(statusLabel,priceLabel);form.append(fields);
   const notesLabel=node("label","", "Quote notes for the customer"),notes=node("textarea","");notes.name="quoteNotes";notes.rows=3;notes.maxLength=2000;notes.placeholder="Clarify deliverables, what is included, exclusions, or assumptions.";notes.value=item.quote_notes||"";notesLabel.append(notes);form.append(notesLabel);
   const actions=node("div","custom-request-reply-actions"),save=node("button","custom-request-button","Save quote & updates");save.type="submit";actions.append(save);form.append(actions);
   form.addEventListener("submit",async event=>{
    event.preventDefault();save.disabled=true;feedback("Saving status and quote…","");
    try{
     await api("/api/admin/custom-requests/"+encodeURIComponent(item.id),"PATCH",{status:statusSelect.value,quotedPriceUsd:priceInput.value,quoteNotes:notes.value.trim()});
     feedback("The request and quote were saved.","success");await loadRequests(false);await loadThread(item.id);
    }catch(error){feedback(error.message,"error");}finally{save.disabled=false;}
   });
   detail.append(form);
  }
  const chat=node("section","custom-request-chat"),chatHead=node("div","custom-request-chat-heading"),chatHeading=node("div","");
  chatHeading.append(node("h3","","Project discussion"),node("p","",admin?"Messages are visible only to this customer and authorised TeamPeach staff.":"Messages stay attached to this request, so project details do not get mixed with general support."));
  chatHead.append(chatHeading);
  chat.append(chatHead,renderMessages(messages));
  const form=node("form","custom-request-reply"),label=node("label","",admin?"Reply to customer":"Send a message"),textarea=node("textarea","");textarea.name="body";textarea.rows=3;textarea.maxLength=4000;textarea.required=true;textarea.placeholder=admin?"Ask a question, clarify a deliverable or send an update…":"Ask a question or clarify something about this project…";label.append(textarea);
  const actions=node("div","custom-request-reply-actions"),note=node("p","custom-request-feedback","Keep messages specific to this project."),send=node("button","custom-request-button","Send message ↗");send.type="submit";actions.append(note,send);form.append(label,actions);
  form.addEventListener("submit",async event=>{
   event.preventDefault();const body=textarea.value.trim();if(!body)return;
   send.disabled=true;feedback("Sending message…","");
   try{await api("/api/custom-requests/"+encodeURIComponent(item.id)+"/messages","POST",{body});textarea.value="";feedback("Message sent.","success");await loadRequests(false);await loadThread(item.id);}
   catch(error){feedback(error.message,"error");}finally{send.disabled=false;}
  });
  chat.append(form);detail.append(chat);
 }
 async function loadThread(id){
  selectedId=id;renderList();const detail=$("#custom-request-detail");
  if(detail)detail.replaceChildren(node("div","custom-request-empty","Loading request and its private discussion…"));
  try{const data=await api("/api/custom-requests/"+encodeURIComponent(id)+"/messages");renderDetail(data);}
  catch(error){if(detail){detail.replaceChildren(node("div","custom-request-empty",error.message));}feedback(error.message,"error");}
 }
 async function selectRequest(id){feedback("","");await loadThread(id);}
 async function loadRequests(keepSelection=true){
  const url=admin?"/api/admin/custom-requests"+($("#custom-request-status-filter")&&$("#custom-request-status-filter").value!=="all"?"?status="+encodeURIComponent($("#custom-request-status-filter").value):""):"/api/custom-requests";
  const data=await api(url);requests=Array.isArray(data.requests)?data.requests:[];
  if(!keepSelection||!requests.some(item=>item.id===selectedId))selectedId=requests[0]?requests[0].id:"";
  renderList();
  const detail=$("#custom-request-detail"),active=document.activeElement;
  const editingDraft=Boolean(detail&&active&&detail.contains(active)&&active.matches("input,textarea,select"));
  if(selectedId&&(!keepSelection||!editingDraft))await loadThread(selectedId);else if(!selectedId)renderEmptyDetail();
 }
 if(!admin){
  $("#custom-request-form")?.addEventListener("submit",async event=>{
   event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
   if(button)button.disabled=true;feedback("Submitting your customization request…","");
   try{
    const data=await api("/api/custom-requests","POST",{
     title:form.elements.title.value.trim(),
     requestType:form.elements.requestType.value,
     description:form.elements.description.value.trim(),
     desiredOutcome:form.elements.desiredOutcome.value.trim(),
     budgetRange:form.elements.budgetRange.value,
     timeline:form.elements.timeline.value
    });
    form.reset();feedback(data.message||"Request submitted.","success");await loadRequests(false);
    if(data.request&&data.request.id)await loadThread(data.request.id);
   }catch(error){feedback(error.message,"error");}
   finally{if(button)button.disabled=false;}
  });
 }else $("#custom-request-status-filter")?.addEventListener("change",()=>loadRequests(false).catch(error=>feedback(error.message,"error")));
 loadRequests(false).catch(error=>{feedback(error.message,"error");const list=$("#custom-request-list");if(list)list.replaceChildren(node("div","custom-request-empty",error.message));renderEmptyDetail();});
 document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")loadRequests(true).catch(error=>feedback(error.message,"error"));
 });
 setInterval(()=>{
  if(document.visibilityState!=="visible"||busy)return;
  busy=true;loadRequests(true).catch(error=>feedback(error.message,"error")).finally(()=>{busy=false;});
 },30000);
})();
