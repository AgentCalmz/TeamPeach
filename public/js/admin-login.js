"use strict";
(function(){
 const $=selector=>document.querySelector(selector);
 const form=$("#admin-login-form"),feedback=$("#admin-login-feedback");
 let csrfToken="";
 function say(message,state){if(!feedback)return;feedback.textContent=message||"";feedback.dataset.state=state||"";}
 function nextAdminPath(){
  const value=new URLSearchParams(location.search).get("next")||"/admin/";
  return value.startsWith("/admin/")&&!value.startsWith("//")&&!value.startsWith("/admin/login")?value:"/admin/";
 }
 async function csrf(){
  if(csrfToken)return csrfToken;
  const response=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.token)throw new Error(body.message||"We couldn't prepare a secure sign-in. Refresh and try again.");
  csrfToken=body.token;return csrfToken;
 }
 async function currentUser(){
  const response=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});
  const body=await response.json().catch(()=>({}));
  if(response.status===401)return null;
  if(!response.ok)throw new Error(body.message||"Account services are temporarily unavailable.");
  return body;
 }
 async function inspectSession(){
  try{
   const account=await currentUser();
   if(account&&account.isAdmin){location.replace(nextAdminPath());return;}
   if(account&&!account.isAdmin)say("This signed-in account is not authorised for administration. Use the verified email listed in ADMIN_EMAILS, then sign in below.","error");
   else if(new URLSearchParams(location.search).get("denied")==="1")say("Administrator access is restricted. Sign in with an authorised administrator account.","error");
  }catch(error){
   say(error.message+" You can retry by refreshing this page.","error");
  }
 }
 form?.addEventListener("submit",async event=>{
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;say("Checking your administrator sign-in…","");
  try{
   const token=await csrf();
   const response=await fetch("/api/auth/login",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json","X-CSRF-Token":token},body:JSON.stringify({email:form.elements.email.value.trim().toLowerCase(),password:form.elements.password.value})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(body.message||"Email or password is incorrect.");
   const account=await currentUser();
   if(!account||!account.isAdmin){
    say("Your password was accepted, but this account is not authorised for the admin console. Check ADMIN_EMAILS in Render or use the correct administrator account.","error");
    return;
   }
   say("Administrator verified. Opening the console…","success");
   location.replace(nextAdminPath());
  }catch(error){say(error.message,"error");}
  finally{button.disabled=false;}
 });
 inspectSession();
})();