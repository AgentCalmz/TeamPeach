"use strict";
(function(){
 const $=id=>document.getElementById(id);
 const form=$("chatbot-form"),list=$("chatbot-assistant-list"),editor=$("chatbot-editor"),empty=$("chatbot-empty-state");
 if(!form||!list)return;
 let csrfToken="",membershipActive=false,assistantLimit=1,credits=0,assistants=[],selected=null,usage=[],busy=false,deleteAllTimer=null;
 const number=value=>Number(value||0).toLocaleString();
 function feedback(message,state){const node=$("chatbot-feedback");if(!node)return;node.textContent=message||"";node.dataset.state=state||"";}
 async function csrf(){if(csrfToken)return csrfToken;const response=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error("We could not prepare a secure request. Refresh the page and try again.");const body=await response.json();csrfToken=body.token||"";if(!csrfToken)throw new Error("Secure request setup failed.");return csrfToken;}
 async function api(url,method,data){
  const verb=String(method||"GET").toUpperCase(),options={method:verb,credentials:"same-origin",cache:"no-store",headers:{}};
  if(["POST","PUT","PATCH","DELETE"].includes(verb))options.headers["X-CSRF-Token"]=await csrf();
  if(data!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(data);}
  const response=await fetch(url,options),body=await response.json().catch(()=>({}));
  if(response.status===401||body.error==="NOT_AUTHENTICATED"){location.href="/login/?next="+encodeURIComponent(location.pathname+location.search);throw new Error("Sign in to manage your assistant.");}
  if(!response.ok){const error=new Error(body.message||"That request could not be completed.");error.code=body.error||"REQUEST_FAILED";throw error;}
  return body;
 }
 function node(tag,className,value){const item=document.createElement(tag);if(className)item.className=className;if(value!==undefined)item.textContent=String(value);return item;}
 function date(value){if(!value)return"Recently";const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}):"Recently";}
 function setValue(id,value){const item=$(id);if(item)item.value=value==null?"":String(value);}
 function setCheck(id,value){const item=$(id);if(item)item.checked=value===true;}
 function setHidden(id,hidden){const item=$(id);if(item)item.hidden=Boolean(hidden);}
 function setButton(id,disabled){const item=$(id);if(item)item.disabled=Boolean(disabled);}
 function showEditor(value){setHidden("chatbot-empty-state",!value);setHidden("chatbot-editor",!value);}
 function paintUsage(rows){
  const totals=(rows||[]).reduce((a,row)=>{a.replies+=Number(row.request_count)||0;a.input+=Number(row.input_tokens)||0;a.output+=Number(row.output_tokens)||0;a.credits+=Number(row.credits_charged)||0;return a;},{replies:0,input:0,output:0,credits:0});
  $("chatbot-credit-balance").textContent=number(credits);
  $("chatbot-replies-total").textContent=number(totals.replies);
  $("chatbot-tokens-total").textContent=number(totals.input+totals.output);$("chatbot-credits-used").textContent=number(totals.credits);
 }
 function renderList(){
  list.replaceChildren();
  if(!assistants.length){list.append(node("div","chatbot-empty","No assistants yet. Create one to get started."));}
  assistants.forEach(assistant=>{
   const button=node("button","chatbot-assistant-item");button.type="button";button.setAttribute("aria-current",String(Boolean(selected&&selected.id===assistant.id)));
   button.append(node("span","chatbot-assistant-dot","✦"));
   const main=node("span","chatbot-assistant-main");main.append(node("strong","",assistant.assistantName||assistant.businessName),node("small","",assistant.businessName+" · Updated "+date(assistant.updatedAt)));
   main.append(node("span","chatbot-state-pill"+(assistant.isActive?" live":""),assistant.isActive?"Published":"Draft"));button.append(main);
   button.addEventListener("click",()=>loadAssistant(assistant.id));list.append(button);
  });
  $("chatbot-plan-limit").textContent=(membershipActive?"Premium membership":"Free account")+" · "+assistants.length+" of "+assistantLimit+" assistants";
  const canCreate=assistants.length<assistantLimit;
  setButton("chatbot-new",!canCreate);setButton("chatbot-empty-create",!canCreate);
  if(!canCreate){$("chatbot-new").title=membershipActive?"Your assistant limit has been reached.":"Free accounts can create one assistant. Membership unlocks more.";}
 }
 function setMembershipControls(){
  const note=$("chatbot-premium-note");
  note.textContent=membershipActive
   ?"Premium options are optional. Customer conversation saving and branding removal are both switched off until you enable them."
   :"These options require an active TeamPeach membership. The assistant still works normally with both options off.";
  ["chatbot-save-chats","chatbot-remove-branding","chatbot-widget-icon","chatbot-widget-color"].forEach(id=>{if($(id))$(id).disabled=!membershipActive;});
 }
 function fillForm(a){
  setValue("chatbot-id",a.id);setValue("chatbot-assistant-name",a.assistantName);setValue("chatbot-business-name",a.businessName);setValue("chatbot-business-description",a.businessDescription);
  setValue("chatbot-category",a.category);setValue("chatbot-location",a.businessLocation);setValue("chatbot-contact",a.businessContact);
  setValue("chatbot-products",a.productsServices);setValue("chatbot-faqs",a.faqs);setValue("chatbot-policies",a.policies);
  setValue("chatbot-instructions",a.instructions);setValue("chatbot-restrictions",a.restrictions);setValue("chatbot-welcome",a.welcomeMessage);
  setValue("chatbot-tone",a.tone||"friendly");setValue("chatbot-widget-icon",a.widgetIcon||"message");setValue("chatbot-widget-color",a.widgetColor||"#253047");
  setCheck("chatbot-domains-enabled",a.allowedDomainsEnabled);setValue("chatbot-domains",(a.allowedDomains||[]).join("\n"));
  setCheck("chatbot-save-chats",a.saveConversations);setCheck("chatbot-remove-branding",a.removeBranding);
  $("chatbot-domains-box").hidden=!a.allowedDomainsEnabled;
  $("chatbot-status").textContent=a.isActive?"Published":"Draft";$("chatbot-status").classList.toggle("live",a.isActive);
  $("chatbot-editor-title").textContent=a.assistantName||a.businessName+" Assistant";
  $("chatbot-editor-caption").textContent=a.isActive?"Your assistant is live. Changes are saved as soon as you choose Save assistant.":"This assistant is a draft. Test it, then publish when you are ready.";
  setButton("chatbot-test",false);setButton("chatbot-publish",!a.id||a.isActive);setHidden("chatbot-unpublish",!a.isActive);
  $("chatbot-save").textContent=a.isActive?"Update assistant":"Save draft";
  setHidden("chatbot-installation",!a.isActive);
  setHidden("chatbot-history-section",false);
  setMembershipControls();
 }
 function newAssistant(){
  selected=null;showEditor(true);form.reset();setValue("chatbot-id","");$("chatbot-save").textContent="Create assistant";
  setValue("chatbot-tone","friendly");setValue("chatbot-widget-icon","message");setValue("chatbot-widget-color","#253047");
  setCheck("chatbot-save-chats",false);setCheck("chatbot-remove-branding",false);setCheck("chatbot-domains-enabled",false);
  $("chatbot-domains-box").hidden=true;$("chatbot-status").textContent="Draft";$("chatbot-status").classList.remove("live");
  $("chatbot-editor-title").textContent="Create your assistant";$("chatbot-editor-caption").textContent="Start with the required business profile. Add optional information whenever you're ready.";
  setButton("chatbot-test",true);setButton("chatbot-publish",true);setHidden("chatbot-unpublish",true);setHidden("chatbot-installation",true);setHidden("chatbot-history-section",true);
  setMembershipControls();feedback("","");renderList();
 }
 async function loadAssistant(id){
  showEditor(true);
  try{
   feedback("Loading assistant…");
   const body=await api("/api/chatbots/"+encodeURIComponent(id),"GET");
   selected=body.assistant;membershipActive=body.membershipActive===true;credits=Number(body.credits)||credits;usage=body.usage||[];
   fillForm(selected);renderList();paintUsage(usage);
   if(selected.isActive){
    $("chatbot-embed-code").textContent=body.embedCode||"";
    $("chatbot-share-url").textContent=body.publicUrl||"";
    $("chatbot-open-preview").href="/chatbot-preview/?assistant="+encodeURIComponent(selected.id);
   }
   await loadConversations();
   feedback("Assistant loaded.","success");
  }catch(error){feedback(error.message,"error");}
 }
 async function loadConversations(){
  if(!selected)return;
  const box=$("chatbot-conversation-list");box.replaceChildren(node("div","chatbot-empty","Loading conversations…"));
  try{
   const data=await api("/api/chatbots/"+encodeURIComponent(selected.id)+"/conversations","GET");
   box.replaceChildren();
   const savedCount=Number(data.savedConversationCount)||0;
   setHidden("chatbot-delete-all-chats",savedCount===0);
   const note=!data.membershipActive
    ?"Your Premium membership is not active, so saved transcripts are hidden. You can still delete them below."
    :(!data.savingEnabled
      ?"Conversation saving is currently off. Existing transcripts remain available to you; no new visitor messages are being saved."
      :"Conversation saving is on for this assistant.");
   box.append(node("div","chatbot-history-note",note));
   if(!data.membershipActive){
    if(!savedCount)box.append(node("div","chatbot-empty","No saved customer conversations."));
    $("chatbot-conversation-detail").replaceChildren(node("div","chatbot-empty","An active Premium membership is required to view saved transcripts."));
    return;
   }
   if(!data.conversations.length){
    box.append(node("div","chatbot-empty",data.savingEnabled?"No saved customer conversations yet.":"No previous saved conversations."));
    $("chatbot-conversation-detail").replaceChildren(node("div","chatbot-empty","When customers have saved conversations, choose one here to read it."));
    return;
   }
   data.conversations.forEach(conversation=>{
    const button=node("button","chatbot-conversation-item");button.type="button";button.dataset.conversationId=conversation.id;
    button.append(node("strong","","Visitor conversation"),node("small","",date(conversation.last_message_at)+" · "+number(conversation.message_count)+" messages"));
    button.addEventListener("click",()=>loadConversation(conversation.id,button));box.append(button);
   });
   if(savedCount>data.conversations.length)box.append(node("div","chatbot-field-note",(savedCount-data.conversations.length)+" older conversations are outside the latest 50 shown here."));
  }catch(error){
   setHidden("chatbot-delete-all-chats",true);
   box.replaceChildren(node("div","chatbot-empty",error.message));
  }
 }
 async function deleteConversation(id){
  try{
   await api("/api/chatbots/"+encodeURIComponent(selected.id)+"/conversations/"+encodeURIComponent(id),"DELETE");
   $("chatbot-conversation-detail").replaceChildren(node("div","chatbot-empty","Conversation deleted."));
   feedback("The saved conversation was deleted.","success");await loadConversations();
  }catch(error){feedback(error.message,"error");}
 }
 async function deleteAllConversations(){
  const button=$("chatbot-delete-all-chats");
  if(button.dataset.armed!=="true"){
   button.dataset.armed="true";button.textContent="Confirm delete all";
   clearTimeout(deleteAllTimer);deleteAllTimer=setTimeout(()=>{button.dataset.armed="false";button.textContent="Delete saved chats";},6000);
   return;
  }
  button.disabled=true;
  try{
   const result=await api("/api/chatbots/"+encodeURIComponent(selected.id)+"/conversations","DELETE");
   feedback(number(result.deletedCount)+" saved conversations deleted.","success");
   $("chatbot-conversation-detail").replaceChildren(node("div","chatbot-empty","Saved conversations have been deleted."));
   button.dataset.armed="false";button.textContent="Delete saved chats";
   await loadConversations();
  }catch(error){feedback(error.message,"error");}
  finally{button.disabled=false;}
 }
 async function loadConversation(id,button){
  document.querySelectorAll(".chatbot-conversation-item").forEach(item=>item.setAttribute("aria-current",String(item===button)));
  const detail=$("chatbot-conversation-detail");detail.replaceChildren(node("div","chatbot-empty","Loading messages…"));
  try{
   const data=await api("/api/chatbots/"+encodeURIComponent(selected.id)+"/conversations/"+encodeURIComponent(id),"GET");detail.replaceChildren();
   if(!data.messages.length){detail.append(node("div","chatbot-empty","This conversation has no messages."));return;}
   data.messages.forEach(message=>{
    const line=node("div","chatbot-message-line"+(message.role==="user"?" user":""));
    line.append(node("span","",message.role==="user"?"Visitor":"Assistant"),node("p","",message.content));detail.append(line);
   });
   const remove=node("button","chatbot-delete-button","Delete this conversation");remove.type="button";remove.addEventListener("click",()=>deleteConversation(id));detail.append(remove);
  }catch(error){detail.replaceChildren(node("div","chatbot-empty",error.message));}
 }
 function formPayload(){
  const payload={
   businessName:$("chatbot-business-name").value.trim(),businessDescription:$("chatbot-business-description").value.trim(),
   assistantName:$("chatbot-assistant-name").value.trim()||$("chatbot-business-name").value.trim()+" Assistant",category:$("chatbot-category").value.trim(),
   businessLocation:$("chatbot-location").value.trim(),businessContact:$("chatbot-contact").value.trim(),
   productsServices:$("chatbot-products").value,faqs:$("chatbot-faqs").value,policies:$("chatbot-policies").value,
   instructions:$("chatbot-instructions").value,restrictions:$("chatbot-restrictions").value,welcomeMessage:$("chatbot-welcome").value,
   tone:$("chatbot-tone").value,allowedDomainsEnabled:$("chatbot-domains-enabled").checked,
   allowedDomains:$("chatbot-domains").value.split(/\n|,|;/).map(x=>x.trim()).filter(Boolean)
  };
  if(membershipActive){
   payload.widgetIcon=$("chatbot-widget-icon").value;payload.widgetColor=$("chatbot-widget-color").value;
   payload.saveConversations=$("chatbot-save-chats").checked;payload.removeBranding=$("chatbot-remove-branding").checked;
  }
  return payload;
 }
 async function saveAssistant(event){
  if(event)event.preventDefault();if(busy)return;
  if(!form.reportValidity())return;
  busy=true;setButton("chatbot-save",true);feedback("Saving assistant…");
  try{
   const id=$("chatbot-id").value,body=await api(id?"/api/chatbots/"+encodeURIComponent(id):"/api/chatbots",id?"PUT":"POST",formPayload());
   selected=body.assistant;membershipActive=body.membershipActive===true;setValue("chatbot-id",selected.id);
   const detail=await api("/api/chatbots/"+encodeURIComponent(selected.id),"GET");
   selected=detail.assistant;credits=Number(detail.credits)||credits;usage=detail.usage||[];
   fillForm(selected);renderList();paintUsage(usage);
   if(selected.isActive){$("chatbot-embed-code").textContent=detail.embedCode||"";$("chatbot-share-url").textContent=detail.publicUrl||"";$("chatbot-open-preview").href="/chatbot-preview/?assistant="+encodeURIComponent(selected.id);}
   else setHidden("chatbot-installation",true);
   await loadConversations();
   feedback(selected.isActive
    ?(selected.saveConversations?"Your published assistant has been updated. New customer conversations will now be saved.":"Your published assistant has been updated.")
    :(selected.saveConversations?"Your draft has been saved with conversation saving enabled.":"Your PeachChat draft has been saved. Test it before publishing."),"success");
  }catch(error){feedback(error.message,"error");}
  finally{busy=false;setButton("chatbot-save",false);}
 }
 async function setPublished(active){
  if(!selected)return;
  try{
   feedback(active?"Publishing assistant…":"Unpublishing assistant…");
   const body=await api("/api/chatbots/"+encodeURIComponent(selected.id),"PUT",{isActive:active});
   selected=body.assistant;membershipActive=body.membershipActive===true;fillForm(selected);renderList();
   const detail=await api("/api/chatbots/"+encodeURIComponent(selected.id),"GET");
   if(active){
    $("chatbot-embed-code").textContent=detail.embedCode||"";
    $("chatbot-share-url").textContent=detail.publicUrl||"";
    $("chatbot-open-preview").href="/chatbot-preview/?assistant="+encodeURIComponent(selected.id);
    feedback("PeachChat is published. Copy the installation snippet and add it to your website.","success");
   }else feedback("Your assistant is now unpublished. Existing embeds will stop responding.","success");
  }catch(error){feedback(error.message,"error");}
 }
 async function initialize(){
  try{
   const body=await api("/api/chatbots","GET");
   assistants=body.assistants||[];membershipActive=body.membershipActive===true;assistantLimit=Number(body.assistantLimit)||1;credits=Number(body.credits)||0;
   usage=body.usage||[];paintUsage(usage);renderList();
   if(assistants.length)await loadAssistant(assistants[0].id);else newAssistant();
  }catch(error){showEditor(false);$("chatbot-empty-state").replaceChildren(node("h2","", "Your chatbot workspace could not be loaded."),node("p","",error.message));}
 }
 $("chatbot-new").addEventListener("click",newAssistant);
 $("chatbot-empty-create").addEventListener("click",newAssistant);
 $("chatbot-form").addEventListener("submit",saveAssistant);
 $("chatbot-test").addEventListener("click",()=>{if(selected)window.open("/chatbot-preview/?assistant="+encodeURIComponent(selected.id),"_blank","noopener");});
 $("chatbot-publish").addEventListener("click",()=>setPublished(true));
 $("chatbot-unpublish").addEventListener("click",()=>setPublished(false));
 $("chatbot-domains-enabled").addEventListener("change",event=>{$("chatbot-domains-box").hidden=!event.target.checked;});
 $("chatbot-copy-code").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("chatbot-embed-code").textContent);feedback("HTML snippet copied.","success");}catch(_){feedback("Copy was blocked by your browser. Select the code and copy it manually.","error");}});
 $("chatbot-copy-share").addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("chatbot-share-url").textContent);feedback("Assistant link copied.","success");}catch(_){feedback("Copy was blocked by your browser. Select the link and copy it manually.","error");}});
 $("chatbot-refresh-chats").addEventListener("click",loadConversations);
 $("chatbot-delete-all-chats").addEventListener("click",deleteAllConversations);
 initialize();
})();