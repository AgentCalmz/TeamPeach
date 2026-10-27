"use strict";
(function(){
  const $=selector=>document.querySelector(selector);
  const adminMode=!!$("#support-admin-list");
  const newForm=$("#support-new-form");
  const replyForm=$("#support-reply-form");
  const adminReplyForm=$("#support-admin-reply-form");
  const state={activeId:null,conversations:[],messages:[],loading:false,csrf:"",poll:null};
  const text=(node,value)=>{if(node)node.textContent=value==null?"":String(value);};
  const feedback=(node,message,kind)=>{if(node){node.textContent=message||"";node.dataset.state=kind||"";}};
  const dateLabel=value=>{if(!value)return "Just now";const d=new Date(value);return Number.isNaN(d.getTime())?"Recently":d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});};
  const statusLabel=value=>({"open":"Open","waiting_for_staff":"Waiting for support","waiting_for_user":"Reply sent","closed":"Closed"}[value]||"Open");
  const statusClass=value=>String(value||"open").replace(/[^a-z_]/g,"");
  const preview=conversation=>conversation.last_message&&conversation.last_message.body?conversation.last_message.body:"Conversation started";
  async function ensureCsrf(){
    if(state.csrf)return state.csrf;
    const response=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok)throw new Error("We could not prepare a secure message. Refresh and retry.");
    const body=await response.json().catch(()=>({}));
    if(!body.token)throw new Error("Secure request setup did not return a token.");
    state.csrf=body.token;return state.csrf;
  }
  async function request(url,method,data){
    const verb=String(method||"GET").toUpperCase(),options={method:verb,credentials:"same-origin",cache:"no-store",headers:{}};
    if(["POST","PATCH","DELETE"].includes(verb))options.headers["X-CSRF-Token"]=await ensureCsrf();
    if(data!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(data);}
    const response=await fetch(url,options),body=await response.json().catch(()=>({}));
    if(response.status===401||body.error==="NOT_AUTHENTICATED"){
      if(!adminMode)location.href="/login/?next=%2Fdashboard%2F";
      throw new Error("Your session has ended. Please sign in again.");
    }
    if(!response.ok){const error=new Error(body.message||"This support request could not be completed.");error.code=body.error||"REQUEST_FAILED";error.status=response.status;throw error;}
    return body;
  }
  function addEmpty(container,title,details){
    if(!container)return;const box=document.createElement("div");box.className="support-chat-empty-inline";
    const strong=document.createElement("strong");strong.textContent=title;
    const p=document.createElement("div");p.textContent=details||"";
    box.append(strong,p);container.replaceChildren(box);
  }
  function renderList(){
    const list=$(adminMode?"#support-admin-list":"#support-conversations");
    const unreadNode=$("#support-unread-count");
    if(!list)return;
    list.replaceChildren();
    if(!state.conversations.length){
      addEmpty(list,adminMode?"No support conversations yet.":"No messages yet.","Start a conversation and our team will reply here.");
      if(unreadNode){unreadNode.hidden=true;text(unreadNode,"0");}
      return;
    }
    let unread=0;
    state.conversations.forEach(conversation=>{
      if(conversation.unread)unread++;
      const button=document.createElement("button");button.type="button";
      button.className="support-conversation-item"+(conversation.id===state.activeId?" active":"");
      const top=document.createElement("span");top.className="support-conversation-top";
      const title=document.createElement("strong");title.textContent=conversation.subject||"Support request";
      top.append(title);
      if(conversation.unread){const badge=document.createElement("span");badge.className="support-chat-badge";badge.textContent="New";top.append(badge);}
      const meta=document.createElement("span");meta.className="support-conversation-meta";
      const status=document.createElement("span");status.className="support-chat-status "+statusClass(conversation.status);status.textContent=statusLabel(conversation.status);meta.append(status);
      const date=document.createElement("span");date.textContent=dateLabel(conversation.last_message_at||conversation.updated_at);meta.append(date);
      const snippet=document.createElement("span");snippet.className="support-conversation-preview";snippet.textContent=preview(conversation);
      button.append(top);
      if(adminMode){const customer=document.createElement("span");customer.className="support-admin-customer";customer.textContent=(conversation.user_name||"Customer")+" · "+(conversation.user_email||"");button.append(customer);}
      button.append(meta,snippet);
      button.addEventListener("click",()=>openConversation(conversation.id));
      list.append(button);
    });
    if(unreadNode){unreadNode.hidden=unread===0;text(unreadNode,String(unread));}
  }
  function renderMessages(){
    const messagesNode=$(adminMode?"#support-admin-messages":"#support-messages");
    if(!messagesNode)return;
    messagesNode.replaceChildren();
    if(!state.messages.length){addEmpty(messagesNode,"No messages yet.","Send a message to begin this conversation.");return;}
    state.messages.forEach(message=>{
      const article=document.createElement("article");article.className="support-message "+(message.sender_role||"system");
      const meta=document.createElement("div");meta.className="support-message-meta";
      const sender=document.createElement("strong");sender.textContent=message.sender_name||({user:"You",staff:"TeamPeach Support",system:"System"}[message.sender_role]||"Support");
      const time=document.createElement("span");time.textContent=dateLabel(message.created_at);meta.append(sender,time);
      const bubble=document.createElement("div");bubble.className="support-message-bubble";bubble.textContent=message.body||"";
      article.append(meta,bubble);messagesNode.append(article);
    });
    messagesNode.scrollTop=messagesNode.scrollHeight;
  }
  function activeConversation(){
    return state.conversations.find(conversation=>conversation.id===state.activeId)||null;
  }
  function renderActive(){
    const conversation=activeConversation();
    const empty=$(adminMode?"#support-admin-empty":"#support-thread-empty");
    const thread=$(adminMode?"#support-admin-thread":"#support-thread");
    if(!conversation){if(empty)empty.hidden=false;if(thread)thread.hidden=true;return;}
    if(empty)empty.hidden=true;if(thread)thread.hidden=false;
    text($(adminMode?"#support-admin-title":"#support-thread-title"),conversation.subject||"Support request");
    text($(adminMode?"#support-admin-customer-detail":"#support-thread-detail"),adminMode?((conversation.user_name||"Customer")+" · "+(conversation.user_email||"")):"Messages are private to you and the TeamPeach support team.");
    const badge=$(adminMode?"#support-admin-status-badge":"#support-thread-status");
    if(badge){badge.className="support-chat-status "+statusClass(conversation.status);badge.textContent=statusLabel(conversation.status);}
    if(adminMode){const select=$("#support-admin-status");if(select)select.value=conversation.status||"open";}
    renderMessages();
  }
  async function loadMessages(id,silent){
    if(!id)return;
    try{
      const result=await request("/api/support/conversations/"+encodeURIComponent(id)+"/messages","GET");
      if(state.activeId!==id)return;
      state.messages=Array.isArray(result.messages)?result.messages:[];
      renderActive();
      if(!silent)feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),"",""); 
    }catch(error){
      if(!silent)feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),error.message,"error");
    }
  }
  async function loadList(silent){
    try{
      const endpoint=adminMode?"/api/admin/support/conversations":"/api/support/conversations";
      const result=await request(endpoint,"GET");
      state.conversations=Array.isArray(result.conversations)?result.conversations:[];
      renderList();
      if(state.activeId&&!state.conversations.some(item=>item.id===state.activeId)){state.activeId=null;state.messages=[];renderActive();}
      if(!state.activeId&&state.conversations.length){state.activeId=state.conversations[0].id;renderList();renderActive();await loadMessages(state.activeId,true);}
      else if(state.activeId){renderActive();}
      if(!silent)feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),"",""); 
    }catch(error){
      const list=$(adminMode?"#support-admin-list":"#support-conversations");
      addEmpty(list,"Support chat could not load.",error.message);
      if(!adminMode&&error.status===503)feedback($("#support-feedback"),"Support chat is not ready yet. Confirm the support migration has been applied in Supabase.","error");
      else if(adminMode&&error.status===403)addEmpty(list,"Admin access required.","Use an account listed in ADMIN_EMAILS to manage customer conversations.");
      else if(!silent)feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),error.message,"error");
    }
  }
  async function openConversation(id){
    state.activeId=id;state.messages=[];renderList();renderActive();
    await loadMessages(id,false);
  }
  async function sendReply(event){
    event.preventDefault();
    const form=adminMode?adminReplyForm:replyForm;
    const field=form&&form.elements.body;
    const body=String(field&&field.value||"").trim();
    if(!state.activeId){feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),"Choose a conversation first.","error");return;}
    if(body.length<1||body.length>4000){feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),"Write a message of 1–4,000 characters.","error");return;}
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),"Sending message…","");
    try{
      await request("/api/support/conversations/"+encodeURIComponent(state.activeId)+"/messages","POST",{body});
      field.value="";
      await loadList(true);await loadMessages(state.activeId,true);
      feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),"Message sent.","success");
    }catch(error){feedback($(adminMode?"#support-admin-feedback":"#support-feedback"),error.message,"error");}
    finally{button.disabled=false;}
  }
  if(newForm&&!adminMode){
    $("#support-new-toggle")?.addEventListener("click",()=>{
      newForm.hidden=!newForm.hidden;
      if(!newForm.hidden)newForm.elements.subject.focus();
    });
    $("#support-new-cancel")?.addEventListener("click",()=>{newForm.hidden=true;newForm.reset();});
    newForm.addEventListener("submit",async event=>{
      event.preventDefault();
      const subject=String(newForm.elements.subject.value||"").trim(),body=String(newForm.elements.body.value||"").trim(),button=newForm.querySelector('button[type="submit"]');
      if(subject.length<3||subject.length>120||body.length<1||body.length>4000){feedback($("#support-new-feedback"),"Add a subject (3–120 characters) and message (up to 4,000 characters).","error");return;}
      button.disabled=true;feedback($("#support-new-feedback"),"Sending your message…","");
      try{
        const result=await request("/api/support/conversations","POST",{subject,body});
        newForm.reset();newForm.hidden=true;await loadList(true);
        if(result.conversation&&result.conversation.id)await openConversation(result.conversation.id);
        feedback($("#support-feedback"),"Conversation started. Your message is saved here.","success");
      }catch(error){feedback($("#support-new-feedback"),error.message,"error");}
      finally{button.disabled=false;}
    });
  }
  replyForm?.addEventListener("submit",sendReply);
  adminReplyForm?.addEventListener("submit",sendReply);
  $("#support-admin-status")?.addEventListener("change",async event=>{
    const conversation=activeConversation();if(!conversation)return;
    const select=event.currentTarget;select.disabled=true;
    try{
      const result=await request("/api/admin/support/conversations/"+encodeURIComponent(conversation.id)+"/status","PATCH",{status:select.value});
      state.conversations=state.conversations.map(item=>item.id===conversation.id?result.conversation:item);
      renderList();renderActive();feedback($("#support-admin-feedback"),"Conversation status updated.","success");
    }catch(error){feedback($("#support-admin-feedback"),error.message,"error");select.value=conversation.status;}
    finally{select.disabled=false;}
  });
  const refresh=$("#support-refresh")||$("#support-admin-refresh");
  refresh?.addEventListener("click",()=>loadList(false));
  loadList(false);
  state.poll=setInterval(async()=>{
    await loadList(true);
    if(state.activeId)await loadMessages(state.activeId,true);
  },20000);
})();
