"use strict";
(function(){
  const $=selector=>document.querySelector(selector);
  const shell=$(".workspace-shell");
  let csrfToken="";
  function text(node,value){if(node)node.textContent=value==null?"":String(value);}
  function setFeedback(message){const node=$("#workspace-load-feedback");if(node)node.textContent=message||"";}
  async function json(url,options){
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...(options||{})});
    const body=await response.json().catch(()=>({}));
    if(response.status===401||body.error==="NOT_AUTHENTICATED"){
      const next=location.pathname+location.search+location.hash;
      location.replace("/login/?next="+encodeURIComponent(next));
      throw new Error("Please sign in to continue.");
    }
    if(!response.ok)throw new Error(body.message||"The request could not be completed.");
    return body;
  }
  async function csrf(){
    if(csrfToken)return csrfToken;
    const data=await json("/api/csrf");
    csrfToken=data.token||"";
    if(!csrfToken)throw new Error("Secure request setup failed. Refresh and try again.");
    return csrfToken;
  }
  async function signOut(){
    const button=$("#dashboard-logout");if(button)button.disabled=true;
    try{
      const token=await csrf();
      await json("/api/auth/logout",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":token},body:"{}"});
      location.replace("/login/");
    }catch(error){setFeedback(error.message);if(button)button.disabled=false;}
  }
  function updateAccount(profile){
    const user=profile.user||{},name=String(user.fullName||"there").trim()||"there";
    const first=name.split(/\s+/)[0]||"there",hour=new Date().getHours();
    const greeting=hour<12?"Good morning":hour<18?"Good afternoon":"Good evening";
    text($("#welcome-title"),greeting+", "+first+".");
    text($("#welcome-subtitle"),"Your account, tools and custom project requests are organised here.");
    text($("#sidebar-name"),name);text($("#sidebar-email"),user.email||"");
    text($("#sidebar-avatar"),first.charAt(0).toUpperCase());text($("#topbar-avatar"),first.charAt(0).toUpperCase());
    const adminLink=$("#workspace-admin-link");if(adminLink)adminLink.hidden=!Boolean(profile.isAdmin);
  }
  async function loadProfile(){
    try{const profile=await json("/api/auth/me");updateAccount(profile);setFeedback("");}
    catch(error){if(!/sign in/i.test(error.message))setFeedback(error.message+" Refresh this page to retry.");}
  }
  async function loadSupportUnreadCount(){
    const badge=$("#support-unread-count");
    if(!badge||$("#support-conversations"))return;
    try{
      const data=await json("/api/support/conversations");
      const count=(Array.isArray(data.conversations)?data.conversations:[]).filter(item=>item.unread===true).length;
      text(badge,count);badge.hidden=count===0;
    }catch(_){badge.hidden=true;}
  }
  $("#mobile-sidebar-toggle")?.addEventListener("click",()=>{
    const open=shell.classList.toggle("mobile-nav-open");
    $("#mobile-sidebar-toggle").setAttribute("aria-expanded",String(open));
    $("#mobile-sidebar-toggle").setAttribute("aria-label",open?"Close navigation":"Open navigation");
  });
  document.querySelectorAll(".workspace-nav-link").forEach(link=>link.addEventListener("click",()=>shell?.classList.remove("mobile-nav-open")));
  $("#dashboard-logout")?.addEventListener("click",signOut);
  loadProfile();loadSupportUnreadCount();
})();