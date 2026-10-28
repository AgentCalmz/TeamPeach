"use strict";
(function(){
 const $=s=>document.querySelector(s), shell=$("#admin-app"), fallback=$("#admin-access-fallback");
 const path=location.pathname+location.search;
 $("#mobile-sidebar-toggle")?.addEventListener("click",()=>{
  const wrap=$(".workspace-shell"),button=$("#mobile-sidebar-toggle");
  const open=wrap.classList.toggle("mobile-nav-open");
  button.setAttribute("aria-expanded",String(open));
  button.setAttribute("aria-label",open?"Close navigation":"Open navigation");
 });
 document.querySelectorAll(".workspace-nav-link").forEach(link=>link.addEventListener("click",()=>$(".workspace-shell")?.classList.remove("mobile-nav-open")));
 $("#admin-logout")?.addEventListener("click",async()=>{
  const button=$("#admin-logout");button.disabled=true;
  try{const r=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"}),d=await r.json().catch(()=>({}));if(!r.ok||!d.token)throw new Error("Could not prepare secure sign-out.");
   const out=await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-CSRF-Token":d.token},body:"{}"});
   if(!out.ok)throw new Error("Could not sign out. Try again.");location.href="/login/";
  }catch(e){const note=$("#admin-shell-feedback");if(note){note.textContent=e.message;note.hidden=false;}button.disabled=false;}
 });
 async function verify(){
  try{
   const response=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});
   const body=await response.json().catch(()=>({}));
   if(response.status===401){location.replace("/admin/login/?next="+encodeURIComponent(path));return;}
   if(!response.ok)throw new Error(body.message||"Administrator access could not be verified.");
   if(!body.isAdmin){location.replace("/admin/login/?denied=1&next="+encodeURIComponent(path));return;}
   const name=(body.user&&body.user.fullName||"Administrator").trim();
   const email=body.user&&body.user.email||"";
   if($("#admin-name"))$("#admin-name").textContent=name;
   if($("#admin-email"))$("#admin-email").textContent=email;
   if($("#admin-avatar"))$("#admin-avatar").textContent=(name.split(/\s+/)[0]||"A").charAt(0).toUpperCase();
   if(fallback)fallback.hidden=true;if(shell)shell.hidden=false;
  }catch(error){
   if(fallback){fallback.hidden=false;fallback.innerHTML="";const h=document.createElement("h1");h.textContent="Administration is temporarily unavailable";const p=document.createElement("p");p.textContent=error.message+" Refresh this page to try again.";const a=document.createElement("a");a.href=path;a.className="button button-dark";a.textContent="Retry";fallback.append(h,p,a);}
  }
 }
 verify();
})();
