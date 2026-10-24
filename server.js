"use strict";
require("dotenv").config();
const path=require("node:path"),crypto=require("node:crypto"),express=require("express"),helmet=require("helmet"),cookieParser=require("cookie-parser"),rateLimit=require("express-rate-limit");
const{createClient}=require("@supabase/supabase-js");
const{normalizeEmail,isValidEmail,cleanText,otpHash,hashPassword,verifyPassword,generateOtp,hashSessionToken,adminEmailsFromEnv,normalizePersonName,safeStringEqual}=require("./src/security");
const{otpEmail,plainNotificationEmail}=require("./src/email-templates");
const app=express(),PUBLIC_DIR=path.join(__dirname,"public"),isProd=process.env.NODE_ENV==="production";
const OTP_MINS=Math.max(5,Math.min(15,Number(process.env.OTP_TTL_MINUTES||10))),SESSION_DAYS=Math.max(1,Math.min(30,Number(process.env.SESSION_TTL_DAYS||7))),DAILY_LIMIT=Math.max(1,Math.min(250,Number(process.env.EMAIL_DAILY_SOFT_LIMIT||250)));
const origins=new Set([process.env.APP_BASE_URL,process.env.SITE_URL,process.env.RENDER_EXTERNAL_URL,...String(process.env.TRUSTED_ORIGINS||"").split(",")].filter(Boolean).map(v=>{try{return new URL(v.trim()).origin;}catch(_){return"";}}).filter(Boolean));
if(!isProd){origins.add("http://localhost:3000");origins.add("http://127.0.0.1:3000");}
const db=process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null;
app.disable("x-powered-by");app.set("trust proxy",1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],baseUri:["'self'"],formAction:["'self'"],frameAncestors:["'none'"],objectSrc:["'none'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com","data:"],imgSrc:["'self'","data:","https://images.unsplash.com"],connectSrc:["'self'"]}},crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:"32kb",strict:true}));app.use(cookieParser());
app.use("/api",rateLimit({windowMs:15*60*1000,limit:150,standardHeaders:true,legacyHeaders:false,message:{error:"RATE_LIMITED",message:"Too many requests. Please wait a little and try again."}}));
const authLimit=rateLimit({windowMs:60*60*1000,limit:30,standardHeaders:true,legacyHeaders:false,message:{error:"AUTH_RATE_LIMITED",message:"Too many account attempts. Wait before trying again."}});
function errorJson(res,status,error,message){return res.status(status).json({error,message});}
function asyncRoute(fn){return(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);}

function persistentRateLimit(scope,limit,windowSeconds,materialForRequest){
 return asyncRoute(async function(req,res,next){
  if(!db||!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)return next();
  const material=String((typeof materialForRequest==="function"?materialForRequest(req):req.ip)||"unknown").trim().slice(0,512)||"unknown";
  const bucketHash=crypto.createHmac("sha256",process.env.SESSION_SECRET).update("teampeach-rate:"+scope+":"+material).digest("hex");
  const result=await db.rpc("tp_consume_rate_limit",{p_bucket_hash:bucketHash,p_limit:limit,p_window_seconds:windowSeconds});
  if(result.error){logFailure("persistent-rate-limit",result.error);return errorJson(res,503,"RATE_LIMIT_UNAVAILABLE","A security check is temporarily unavailable. Please try again shortly.");}
  if(!result.data||result.data.allowed!==true){
   const seconds=Math.max(1,Math.min(604800,Number(result.data&&result.data.retry_after)||60));
   res.setHeader("Retry-After",String(seconds));
   return errorJson(res,429,"PERSISTENT_RATE_LIMITED","Too many attempts. Please wait before trying again.");
  }
  next();
 });
}
const persistentAuthIpLimit=persistentRateLimit("auth-ip-hour",30,3600,req=>req.ip);
const persistentRegistrationEmailLimit=persistentRateLimit("registration-email-day",6,86400,req=>normalizeEmail(req.body&&req.body.email)||req.ip);
const persistentResetEmailLimit=persistentRateLimit("password-reset-email-day",5,86400,req=>normalizeEmail(req.body&&req.body.email)||req.ip);
const persistentLoginEmailLimit=persistentRateLimit("login-email-hour",10,3600,req=>normalizeEmail(req.body&&req.body.email)||req.ip);
const persistentInquiryIpLimit=persistentRateLimit("project-inquiry-ip-hour",10,3600,req=>req.ip);
const persistentInquiryEmailLimit=persistentRateLimit("project-inquiry-email-day",5,86400,req=>normalizeEmail(req.body&&req.body.email)||req.ip);

function authReady(){return Boolean(db&&process.env.OTP_PEPPER&&process.env.OTP_PEPPER.length>=32&&process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32);}
function emailReady(){return Boolean(process.env.BREVO_API_KEY&&isValidEmail(process.env.BREVO_SENDER_EMAIL));}
function backendReady(res,needEmail){if(!authReady()){errorJson(res,503,"SERVICE_NOT_CONFIGURED","Account services are being configured. Your information has not been submitted.");return false;}if(needEmail&&!emailReady()){errorJson(res,503,"EMAIL_NOT_CONFIGURED","Email delivery is not configured yet. Your information has not been submitted.");return false;}return true;}
function cookies(){return{httpOnly:true,secure:isProd,sameSite:"lax",path:"/",maxAge:SESSION_DAYS*86400000};}
function logFailure(area,e){console.error("["+area+"] operation failed ("+String(e&&(e.code||e.status||e.name)||"unknown").slice(0,40)+").");}
function trusted(req){const o=req.get("origin");if(!o)return true;try{return origins.has(new URL(o).origin);}catch(_){return false;}}
function csrf(req,res,next){const c=Buffer.from(String(req.cookies.tp_csrf||"")),h=Buffer.from(String(req.get("x-csrf-token")||""));if(!trusted(req)||c.length<24||h.length<24||c.length!==h.length||!crypto.timingSafeEqual(c,h))return errorJson(res,403,"CSRF_CHECK_FAILED","Refresh the page and try again.");next();}
function baseUrl(){return cleanText(process.env.APP_BASE_URL||process.env.SITE_URL||process.env.RENDER_EXTERNAL_URL||"https://teampeach.org",300);}
async function reserveEmailUsage(to,category){
 const result=await db.rpc("tp_reserve_email_usage",{p_recipient_email:normalizeEmail(to),p_category:category,p_daily_limit:DAILY_LIMIT});
 if(result.error)throw result.error;
 const data=result.data||{};
 if(data.status!=="reserved"){const code=data.status==="limit_reached"?"EMAIL_DAILY_LIMIT":"EMAIL_USAGE_RESERVATION_FAILED";const error=new Error(code==="EMAIL_DAILY_LIMIT"?"The daily email allowance has been reached. Please try again tomorrow.":"Email capacity could not be reserved.");error.code=code;throw error;}
 return data.usage_id;
}
async function completeEmailUsage(usageId,status,messageId){
 const result=await db.rpc("tp_complete_email_usage",{p_usage_id:usageId,p_status:status,p_provider_message_id:messageId||null});
 if(result.error)throw result.error;
 if(!result.data||!["ok","already_finalized"].includes(result.data.status))throw new Error("EMAIL_USAGE_FINALIZATION_FAILED");
}
async function sendBrevo(to,name,message,tags,usageId,category){
 if(!emailReady())throw new Error("EMAIL_NOT_CONFIGURED");
 const id=usageId||await reserveEmailUsage(to,category||"single");
 const payload={sender:{name:cleanText(process.env.BREVO_SENDER_NAME||"TeamPeach",70),email:normalizeEmail(process.env.BREVO_SENDER_EMAIL)},to:[{email:normalizeEmail(to),name:cleanText(name||"",100)||normalizeEmail(to)}],subject:cleanText(message.subject,150),htmlContent:message.html,textContent:cleanText(message.text,15000),tags:(tags||["teampeach"]).slice(0,5)};
 let response,data;
 try{response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":process.env.BREVO_API_KEY,"accept":"application/json","content-type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});data=await response.json().catch(()=>({}));}
 catch(error){error.code="EMAIL_DELIVERY_UNCERTAIN";throw error;}
 if(!response.ok){const error=new Error("BREVO_HTTP_"+response.status);error.code=response.status>=500?"EMAIL_DELIVERY_UNCERTAIN":response.status===429?"EMAIL_PROVIDER_RATE_LIMIT":"BREVO_HTTP_"+response.status;if(response.status<500){try{await completeEmailUsage(id,"failed",null);}catch(markError){logFailure("email-usage-release",markError);}}throw error;}
 const messageId=cleanText(data.messageId||"",200);
 // If delivery was accepted but quota accounting fails, keep the reservation rather than release the slot.
 await completeEmailUsage(id,"sent",messageId);
 return{messageId};
}
async function findUser(email){const r=await db.from("tp_users").select("id,email,full_name,password_hash,marketing_opt_in").eq("email",email).maybeSingle();if(r.error)throw r.error;return r.data;}
async function createSession(userId,res){const token=crypto.randomBytes(32).toString("base64url"),r=await db.from("tp_sessions").insert({user_id:userId,token_hash:hashSessionToken(token,process.env.SESSION_SECRET),expires_at:new Date(Date.now()+SESSION_DAYS*86400000).toISOString()});if(r.error)throw r.error;res.cookie("tp_session",token,cookies());}
async function authenticated(req,res,next){if(!authReady())return errorJson(res,503,"SERVICE_NOT_CONFIGURED","Account services are not configured yet.");const raw=req.cookies.tp_session||"";if(raw.length<40||raw.length>100)return errorJson(res,401,"NOT_AUTHENTICATED","Please sign in to continue.");try{const s=await db.from("tp_sessions").select("id,user_id").eq("token_hash",hashSessionToken(raw,process.env.SESSION_SECRET)).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();if(s.error)throw s.error;if(!s.data)return errorJson(res,401,"NOT_AUTHENTICATED","Your session has expired. Please sign in again.");const u=await db.from("tp_users").select("id,email,full_name,marketing_opt_in").eq("id",s.data.user_id).maybeSingle();if(u.error)throw u.error;if(!u.data)return errorJson(res,401,"NOT_AUTHENTICATED","Please sign in to continue.");req.user=u.data;req.isAdmin=adminEmailsFromEnv(process.env.ADMIN_EMAILS).includes(u.data.email);next();}catch(e){logFailure("session",e);errorJson(res,503,"SESSION_FAILED","We could not check your session. Please try again.");}}
function isAdmin(req,res,next){if(!req.isAdmin)return errorJson(res,403,"ADMIN_ONLY","This action is restricted to TeamPeach administrators.");next();}
function validPassword(p){return typeof p==="string"&&p.length>=12&&p.length<=128;}
function validOtp(c){return typeof c==="string"&&/^\d{6}$/.test(c);}
async function queueJob(userId,mode,subject,body,recipients){const r=await db.rpc("tp_enqueue_email_job",{p_requested_by:userId||null,p_mode:mode,p_subject:cleanText(subject,150),p_body_text:cleanText(body,15000),p_recipients:recipients});if(r.error)throw r.error;return r.data;}
async function refreshJob(id){const r=await db.rpc("tp_refresh_email_job_status",{p_job_id:id});if(r.error)logFailure("email-job-status",r.error);}
let workerBusy=false,marketingWorkerBusy=false,emailCoordinatorBusy=false;
async function runTransactionalQueue(){
 if(workerBusy||!db||!emailReady())return;
 workerBusy=true;
 try{
  for(let round=0;round<60;round++){
   const claim=await db.rpc("tp_claim_email_queue",{p_limit:5,p_daily_limit:DAILY_LIMIT});
   if(claim.error){logFailure("queue-claim",claim.error);break;}
   const rows=Array.isArray(claim.data)?claim.data:[];
   if(!rows.length)break;
   const jobs=new Set();let capacityReached=false;
   await Promise.all(rows.map(async item=>{
    jobs.add(item.job_id);
    try{
     const message=plainNotificationEmail(item.subject,item.body_text,baseUrl(),null);
     const sent=await sendBrevo(item.recipient_email,item.recipient_name,message,["teampeach",String(item.job_id).slice(0,20)],item.usage_id,item.mode==="system"?"system":"single");
     const update=await db.from("tp_email_queue").update({status:"sent",brevo_message_id:sent.messageId||null,sent_at:new Date().toISOString(),last_error:null,claimed_at:null}).eq("id",item.queue_id);
     if(update.error)throw update.error;
    }catch(e){
     logFailure("email-delivery",e);
     if(e.code==="EMAIL_DAILY_LIMIT"){
      const retryAfter=Math.max(60,Math.min(86400,Number(e.retryAfter)||3600));
      const update=await db.from("tp_email_queue").update({status:"pending",last_error:"daily_limit_wait",completed_at:null,claimed_at:null,next_attempt_at:new Date(Date.now()+retryAfter*1000).toISOString()}).eq("id",item.queue_id);
      if(update.error)logFailure("delivery-defer",update.error);
      capacityReached=true;
      return;
     }
     const update=await db.from("tp_email_queue").update({status:"failed",last_error:cleanText(e.code||e.name||"delivery_failed",80),completed_at:new Date().toISOString(),claimed_at:null}).eq("id",item.queue_id);
     if(update.error)logFailure("delivery-status",update.error);
    }
   }));
   await Promise.all(Array.from(jobs).map(refreshJob));
   if(capacityReached||rows.length<5)break;
  }
 }catch(e){logFailure("transactional-worker",e);}finally{workerBusy=false;}
}
async function claimableUsers(){
 const users=[];const pageSize=500;
 for(let offset=0;offset<=10000;offset+=pageSize){
  const result=await db.from("tp_users").select("email,full_name,marketing_opt_in").order("created_at",{ascending:true}).range(offset,offset+pageSize-1);
  if(result.error)throw result.error;
  users.push(...(result.data||[]));
  if(!result.data||result.data.length<pageSize)break;
 }
 if(users.length>10000)throw Object.assign(new Error("AUDIENCE_TOO_LARGE"),{code:"AUDIENCE_TOO_LARGE"});
 return users;
}
async function failBroadcastJob(job,error){
 const code=cleanText(error&& (error.code||error.name)||"broadcast_failed",80);
 const now=new Date().toISOString();
 const q=await db.from("tp_email_queue").update({status:"failed",last_error:code,completed_at:now,claimed_at:null}).eq("job_id",job.job_id).in("status",["pending","processing"]);
 if(q.error)logFailure("broadcast-failure-rows",q.error);
 const refresh=await refreshJob(job.job_id);
 if(!refresh){
  const j=await db.from("tp_email_jobs").update({status:"failed",fail_count:job.total_count||0,completed_at:now}).eq("id",job.job_id);
  if(j.error)logFailure("broadcast-failure-job",j.error);
 }
}
async function runMarketingQueue(){
 if(marketingWorkerBusy||!db||!emailReady())return;
 marketingWorkerBusy=true;
 try{
  for(let round=0;round<2;round++){
   const claim=await db.rpc("tp_claim_broadcast_jobs",{p_limit:1});
   if(claim.error){logFailure("broadcast-claim",claim.error);break;}
   const jobs=Array.isArray(claim.data)?claim.data:[];
   if(!jobs.length)break;
   const job=jobs[0];let campaignId=null,reservationMade=false,sendAttempted=false;
   try{
    const listId=marketingListId();
    const users=await claimableUsers();
    const audience=users.filter(user=>user.marketing_opt_in);
    if(!audience.length)throw Object.assign(new Error("NO_MARKETING_RECIPIENTS"),{code:"NO_MARKETING_RECIPIENTS"});
    if(audience.length>DAILY_LIMIT)throw Object.assign(new Error("BROADCAST_EXCEEDS_DAILY_CAP"),{code:"BROADCAST_EXCEEDS_DAILY_CAP"});
    const quota=await db.rpc("tp_reserve_campaign_email_usage",{p_job_id:job.job_id,p_recipients:audience.map(user=>({email:user.email,name:user.full_name})),p_daily_limit:DAILY_LIMIT});
    if(quota.error)throw quota.error;
    if(quota.data&&quota.data.status==="limit_reached"){
     const parked=await db.from("tp_email_jobs").update({status:"queued",claimed_at:new Date().toISOString(),completed_at:null}).eq("id",job.job_id);
     if(parked.error)throw parked.error;
     break;
    }
    if(!quota.data||quota.data.status!=="reserved")throw Object.assign(new Error("CAMPAIGN_QUOTA_RESERVATION_FAILED"),{code:quota.data&&quota.data.status||"CAMPAIGN_QUOTA_RESERVATION_FAILED"});
    reservationMade=true;
    await mapLimit(users,4,user=>syncMarketingContact(user,listId));
    const wiped=await db.from("tp_email_queue").delete().eq("job_id",job.job_id);if(wiped.error)throw wiped.error;
    const inserts=audience.map(user=>({job_id:job.job_id,recipient_email:user.email,recipient_name:user.full_name,status:"pending"}));
    const saved=await db.from("tp_email_queue").insert(inserts);if(saved.error)throw saved.error;
    const countUpdate=await db.from("tp_email_jobs").update({total_count:audience.length,success_count:0,fail_count:0,skipped_count:0}).eq("id",job.job_id);if(countUpdate.error)throw countUpdate.error;
    campaignId=await createMarketingCampaign(job,listId);
    const idUpdate=await db.from("tp_email_jobs").update({provider_campaign_id:String(campaignId)}).eq("id",job.job_id);if(idUpdate.error)throw idUpdate.error;
    // An ambiguous sendNow network failure keeps its quota reservation so an accepted campaign can't be duplicated.
    sendAttempted=true;
    await brevoApi("POST","/emailCampaigns/"+campaignId+"/sendNow",{});
    const completed=await db.rpc("tp_complete_campaign_email_usage",{p_job_id:job.job_id,p_status:"sent",p_provider_campaign_id:String(campaignId)});
    if(completed.error)throw completed.error;
    const sentAt=new Date().toISOString();
    const queueUpdate=await db.from("tp_email_queue").update({status:"sent",brevo_message_id:"campaign:"+campaignId,sent_at:sentAt,last_error:null,claimed_at:null}).eq("job_id",job.job_id);
    if(queueUpdate.error)throw queueUpdate.error;
    await refreshJob(job.job_id);
   }catch(error){
    logFailure("broadcast-worker",error);
    if(reservationMade&&!sendAttempted){
     const released=await db.rpc("tp_complete_campaign_email_usage",{p_job_id:job.job_id,p_status:"failed",p_provider_campaign_id:null});
     if(released.error)logFailure("broadcast-quota-release",released.error);
    }
    await failBroadcastJob(job,error);
   }
  }
 }catch(error){logFailure("marketing-worker",error);}finally{marketingWorkerBusy=false;}
}
async function runEmailQueue(){if(emailCoordinatorBusy)return;emailCoordinatorBusy=true;try{await runTransactionalQueue();await runMarketingQueue();}finally{emailCoordinatorBusy=false;}}
async function cleanup(){if(!db)return;try{await db.from("tp_pending_registrations").delete().lt("expires_at",new Date(Date.now()-86400000).toISOString());await db.from("tp_password_resets").delete().lt("expires_at",new Date(Date.now()-86400000).toISOString());await db.from("tp_sessions").delete().lt("expires_at",new Date().toISOString());await db.from("tp_sessions").delete().lt("revoked_at",new Date(Date.now()-30*86400000).toISOString());}catch(e){logFailure("cleanup",e);}}

app.get("/api/health",asyncRoute(async(_q,r)=>{let schemaReady=false;if(db){const check=await db.from("tp_users").select("id",{head:true,count:"exact"});const rateCheck=await db.from("tp_rate_limits").select("bucket_hash",{head:true,count:"exact"});const usageCheck=await db.from("tp_email_usage").select("id",{head:true,count:"exact"});schemaReady=!check.error&&!rateCheck.error&&!usageCheck.error;if(check.error)logFailure("health-schema",check.error);}const ready=authReady()&&schemaReady&&emailReady();r.status(ready?200:503).json({status:ready?"ready":"degraded",service:"teampeach",accountServicesConfigured:authReady(),databaseSchemaReady:schemaReady,emailDeliveryConfigured:emailReady()});}));
app.get("/api/csrf",(_q,r)=>{const token=crypto.randomBytes(32).toString("base64url");r.cookie("tp_csrf",token,{httpOnly:false,secure:isProd,sameSite:"lax",path:"/",maxAge:7200000});r.json({token});});
app.post("/api/auth/register/start",authLimit,csrf,persistentAuthIpLimit,persistentRegistrationEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,true))return;const name=normalizePersonName(q.body&&q.body.fullName),email=normalizeEmail(q.body&&q.body.email),password=q.body&&q.body.password,opt=Boolean(q.body&&q.body.marketingOptIn);if(name.length<2)return errorJson(r,400,"INVALID_NAME","Enter your name (at least 2 characters).");if(!isValidEmail(email))return errorJson(r,400,"INVALID_EMAIL","Enter a valid email address.");if(!validPassword(password))return errorJson(r,400,"INVALID_PASSWORD","Use a password between 12 and 128 characters.");try{if(await findUser(email))return errorJson(r,409,"ACCOUNT_EXISTS","This email already has a verified TeamPeach account. Sign in or reset your password.");const old=await db.from("tp_pending_registrations").select("expires_at,last_sent_at").eq("email",email).maybeSingle();if(old.error)throw old.error;const now=Date.now();if(old.data&&new Date(old.data.expires_at).getTime()>now&&now-new Date(old.data.last_sent_at).getTime()<60000)return r.json({ok:true,pending:true,message:"A code was already requested. Check your inbox or wait one minute before requesting another."});const code=generateOtp(),hashed=await hashPassword(password),saved=await db.from("tp_pending_registrations").upsert({email,full_name:name,password_hash:hashed,otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"registration"),marketing_opt_in:opt,expires_at:new Date(now+OTP_MINS*60000).toISOString(),attempt_count:0,last_sent_at:new Date(now).toISOString()},{onConflict:"email"});if(saved.error)throw saved.error;try{await sendBrevo(email,name,otpEmail(code,"registration",OTP_MINS,baseUrl()),["teampeach","registration-otp"],null,"registration_otp");}catch(e){await db.from("tp_pending_registrations").delete().eq("email",email);logFailure("register-email",e);return errorJson(r,502,"EMAIL_SEND_FAILED","We could not send a verification code. Please try again shortly.");}r.json({ok:true,pending:true,message:"We sent a verification code. Enter it to finish creating your account."});}catch(e){logFailure("register-start",e);errorJson(r,503,"REGISTRATION_UNAVAILABLE","Registration is temporarily unavailable. Please try again.");}}));
app.post("/api/auth/register/resend",authLimit,csrf,persistentAuthIpLimit,persistentRegistrationEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,true))return;const email=normalizeEmail(q.body&&q.body.email);if(!isValidEmail(email))return errorJson(r,400,"INVALID_EMAIL","Enter a valid email address.");try{const old=await db.from("tp_pending_registrations").select("full_name,expires_at,last_sent_at").eq("email",email).maybeSingle();if(old.error)throw old.error;if(!old.data||new Date(old.data.expires_at).getTime()<=Date.now())return errorJson(r,410,"REGISTRATION_EXPIRED","This registration expired. Return to registration and start again.");if(Date.now()-new Date(old.data.last_sent_at).getTime()<60000)return errorJson(r,429,"RESEND_COOLDOWN","Wait one minute before requesting another code.");const code=generateOtp(),u=await db.from("tp_pending_registrations").update({otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"registration"),expires_at:new Date(Date.now()+OTP_MINS*60000).toISOString(),attempt_count:0,last_sent_at:new Date().toISOString()}).eq("email",email);if(u.error)throw u.error;await sendBrevo(email,old.data.full_name,otpEmail(code,"registration",OTP_MINS,baseUrl()),["teampeach","registration-otp"],null,"registration_otp");r.json({ok:true,message:"A fresh code has been sent. Only the newest code will work."});}catch(e){logFailure("register-resend",e);errorJson(r,502,"RESEND_FAILED","We could not resend the code. Please try again.");}}));
app.post("/api/auth/register/verify",authLimit,csrf,persistentAuthIpLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,false))return;const email=normalizeEmail(q.body&&q.body.email),code=q.body&&q.body.code;if(!isValidEmail(email)||!validOtp(code))return errorJson(r,400,"INVALID_CODE","Enter your email and the six-digit code.");try{const v=await db.rpc("tp_complete_registration",{p_email:email,p_otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"registration")});if(v.error)throw v.error;const s=v.data&&v.data.status;if(s==="invalid")return errorJson(r,400,"INVALID_CODE","That code is not correct.");if(s==="expired")return errorJson(r,410,"CODE_EXPIRED","That code expired. Request a new one.");if(s==="too_many_attempts")return errorJson(r,429,"TOO_MANY_ATTEMPTS","Too many incorrect codes. Request a new one.");if(s==="already_registered")return errorJson(r,409,"ACCOUNT_EXISTS","This account already exists. Sign in or reset your password.");if(s!=="ok"||!v.data.user_id)return errorJson(r,400,"REGISTRATION_NOT_FOUND","No active registration was found. Start again.");try{await createSession(v.data.user_id,r);r.json({ok:true,authenticated:true,message:"Your email is verified. Welcome to TeamPeach."});}catch(e){logFailure("registration-session",e);r.json({ok:true,authenticated:false,message:"Your email is verified. Please sign in."});}}catch(e){logFailure("register-verify",e);errorJson(r,503,"VERIFICATION_UNAVAILABLE","We could not verify the code right now. Please retry.");}}));
app.post("/api/auth/login",authLimit,csrf,persistentAuthIpLimit,persistentLoginEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,false))return;const email=normalizeEmail(q.body&&q.body.email),pw=q.body&&q.body.password;if(!isValidEmail(email)||typeof pw!=="string"||pw.length>128)return errorJson(r,400,"INVALID_CREDENTIALS","Check your email and password.");try{const u=await findUser(email),matched=u?await verifyPassword(pw,u.password_hash):(await hashPassword(pw.length<12?pw.padEnd(12,"x"):pw),false);if(!u||!matched)return errorJson(r,401,"INVALID_CREDENTIALS","Email or password is incorrect. Complete email verification if registration is unfinished.");await createSession(u.id,r);r.json({ok:true,message:"Signed in."});}catch(e){logFailure("login",e);errorJson(r,503,"LOGIN_UNAVAILABLE","Sign-in is temporarily unavailable.");}}));
app.post("/api/auth/password-reset/start",authLimit,csrf,persistentAuthIpLimit,persistentResetEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,true))return;const email=normalizeEmail(q.body&&q.body.email);if(!isValidEmail(email))return errorJson(r,400,"INVALID_EMAIL","Enter a valid email address.");const generic={ok:true,message:"If a verified account exists, a recovery code will be sent."};try{const u=await findUser(email);if(!u)return r.json(generic);const old=await db.from("tp_password_resets").select("last_sent_at").eq("email",email).maybeSingle();if(old.error)throw old.error;if(old.data&&Date.now()-new Date(old.data.last_sent_at).getTime()<60000)return r.json(generic);const code=generateOtp(),saved=await db.from("tp_password_resets").upsert({email,otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"password-reset"),attempt_count:0,expires_at:new Date(Date.now()+OTP_MINS*60000).toISOString(),last_sent_at:new Date().toISOString()},{onConflict:"email"});if(saved.error)throw saved.error;await sendBrevo(email,u.full_name,otpEmail(code,"password-reset",OTP_MINS,baseUrl()),["teampeach","password-reset"],null,"password_reset");r.json(generic);}catch(e){logFailure("reset-start",e);errorJson(r,502,"RESET_START_FAILED","Password recovery could not start. Please retry.");}}));
app.post("/api/auth/password-reset/complete",authLimit,csrf,persistentAuthIpLimit,persistentResetEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,false))return;const email=normalizeEmail(q.body&&q.body.email),code=q.body&&q.body.code,pw=q.body&&q.body.password;if(!isValidEmail(email)||!validOtp(code))return errorJson(r,400,"INVALID_CODE","Enter your email and six-digit recovery code.");if(!validPassword(pw))return errorJson(r,400,"INVALID_PASSWORD","Use a password between 12 and 128 characters.");try{const v=await db.rpc("tp_complete_password_reset",{p_email:email,p_otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"password-reset"),p_password_hash:await hashPassword(pw)});if(v.error)throw v.error;const s=v.data&&v.data.status;if(s==="invalid")return errorJson(r,400,"INVALID_CODE","That recovery code is not correct.");if(s==="expired")return errorJson(r,410,"CODE_EXPIRED","The recovery code expired. Request another.");if(s==="too_many_attempts")return errorJson(r,429,"TOO_MANY_ATTEMPTS","Too many incorrect codes. Request another.");if(s!=="ok")return errorJson(r,400,"RESET_NOT_FOUND","No active recovery request was found.");r.clearCookie("tp_session",{httpOnly:true,secure:isProd,sameSite:"lax",path:"/"});r.json({ok:true,message:"Your password has changed. Sign in with your new password."});}catch(e){logFailure("reset-complete",e);errorJson(r,503,"RESET_COMPLETE_FAILED","Password recovery is temporarily unavailable.");}}));
app.post("/api/auth/logout",csrf,asyncRoute(async(q,r)=>{if(db&&q.cookies.tp_session){const d=await db.from("tp_sessions").update({revoked_at:new Date().toISOString()}).eq("token_hash",hashSessionToken(q.cookies.tp_session,process.env.SESSION_SECRET)).is("revoked_at",null);if(d.error)logFailure("logout",d.error);}r.clearCookie("tp_session",{httpOnly:true,secure:isProd,sameSite:"lax",path:"/"});r.json({ok:true,message:"Signed out."});}));
app.get("/api/auth/me",authenticated,(q,r)=>r.json({ok:true,user:{id:q.user.id,email:q.user.email,fullName:q.user.full_name,marketingOptIn:q.user.marketing_opt_in},isAdmin:q.isAdmin}));
app.patch("/api/account/preferences",csrf,authenticated,asyncRoute(async(q,r)=>{if(typeof(q.body&&q.body.marketingOptIn)!=="boolean")return errorJson(r,400,"INVALID_PREFERENCE","Choose an email preference.");const d=await db.from("tp_users").update({marketing_opt_in:q.body.marketingOptIn,marketing_opt_in_at:q.body.marketingOptIn?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",q.user.id).select("marketing_opt_in").single();if(d.error){logFailure("preferences",d.error);return errorJson(r,503,"PREFERENCE_FAILED","Your preference could not be saved.");}let providerSyncPending=false;if(process.env.BREVO_MARKETING_LIST_ID&&/^\d+$/.test(process.env.BREVO_MARKETING_LIST_ID)&&emailReady()){try{await syncMarketingContact({email:q.user.email,full_name:q.user.full_name,marketing_opt_in:d.data.marketing_opt_in},Number(process.env.BREVO_MARKETING_LIST_ID));}catch(e){providerSyncPending=true;logFailure("marketing-preference-sync",e);}}r.json({ok:true,marketingOptIn:d.data.marketing_opt_in,providerSyncPending,message:providerSyncPending?"Your preference was saved here; email-provider synchronization is pending.":"Your email preference has been saved."});}));
app.post("/api/projects",csrf,authLimit,persistentInquiryIpLimit,persistentInquiryEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,false))return;const name=normalizePersonName(q.body&&q.body.name),email=normalizeEmail(q.body&&q.body.email),type=cleanText(q.body&&q.body.type,100),details=cleanText(q.body&&q.body.details,5000);if(name.length<2||!isValidEmail(email)||type.length<3||details.length<10)return errorJson(r,400,"INVALID_INQUIRY","Enter your name, valid email, project type and at least 10 characters about the work.");try{const d=await db.from("tp_project_requests").insert({full_name:name,email,project_type:type,details,status:"new"}).select("id").single();if(d.error)throw d.error;const recipients=adminEmailsFromEnv(process.env.ADMIN_EMAILS).map(e=>({email:e,name:"TeamPeach administrator"}));if(recipients.length){try{await queueJob(null,"system","New TeamPeach project inquiry","Name: "+name+"\nEmail: "+email+"\nType: "+type+"\n\nDetails:\n"+details,recipients);runEmailQueue();}catch(e){logFailure("project-notice",e);}}r.status(201).json({ok:true,message:"Thank you. Your inquiry has been received. We’ll review it and follow up using the email address you provided."});}catch(e){logFailure("project-inquiry",e);errorJson(r,503,"INQUIRY_UNAVAILABLE","Your inquiry could not be submitted. Please try again later.");}}));

app.get("/api/admin/email/stats",authenticated,isAdmin,asyncRoute(async(_q,r)=>{const a=await db.from("tp_users").select("id",{count:"exact",head:true}).eq("marketing_opt_in",true),b=await db.from("tp_email_usage").select("id",{count:"exact",head:true}).eq("status","sent").gte("sent_at",new Date(new Date().setUTCHours(0,0,0,0)).toISOString());if(a.error||b.error){logFailure("admin-stats",a.error||b.error);return errorJson(r,503,"STATS_FAILED","Email statistics are unavailable.");}r.json({ok:true,optedInRecipients:a.count||0,sentToday:b.count||0,dailySoftLimit:DAILY_LIMIT});}));
app.get("/api/admin/email/jobs",authenticated,isAdmin,asyncRoute(async(_q,r)=>{const d=await db.from("tp_email_jobs").select("id,mode,subject,status,total_count,success_count,fail_count,created_at,completed_at").order("created_at",{ascending:false}).limit(20);if(d.error){logFailure("admin-jobs",d.error);return errorJson(r,503,"JOBS_FAILED","Email history unavailable.");}r.json({ok:true,jobs:d.data||[]});}));
app.get("/api/admin/projects",authenticated,isAdmin,asyncRoute(async(_q,r)=>{const d=await db.from("tp_project_requests").select("id,full_name,email,project_type,details,status,created_at").order("created_at",{ascending:false}).limit(50);if(d.error){logFailure("admin-projects",d.error);return errorJson(r,503,"PROJECTS_FAILED","Project inquiries unavailable.");}r.json({ok:true,projects:d.data||[]});}));
app.post("/api/admin/email",csrf,authLimit,authenticated,isAdmin,asyncRoute(async(q,r)=>{if(!backendReady(r,true))return;const mode=cleanText(q.body&&q.body.mode,20),subject=cleanText(q.body&&q.body.subject,150),body=cleanText(q.body&&q.body.bodyText,15000);if(!["single","broadcast"].includes(mode))return errorJson(r,400,"INVALID_MODE","Choose one person or an opted-in broadcast.");if(subject.length<3||body.length<5)return errorJson(r,400,"INVALID_MESSAGE","Add an email subject and a message of at least five characters.");if(mode==="broadcast"&&(!q.body.confirmBroadcast||!process.env.BREVO_MARKETING_LIST_ID||!/^[0-9]+$/.test(process.env.BREVO_MARKETING_LIST_ID)||!process.env.BREVO_WEBHOOK_TOKEN||process.env.BREVO_WEBHOOK_TOKEN.length<32))return errorJson(r,400,"BROADCAST_NOT_CONFIGURED","Confirm the broadcast and configure a numeric Brevo marketing list ID and the webhook token.");try{let recipients;if(mode==="single"){const email=normalizeEmail(q.body.email);if(!isValidEmail(email))return errorJson(r,400,"INVALID_EMAIL","Enter a valid recipient address.");recipients=[{email,name:cleanText(q.body.name,100)||email}];}else{const d=await db.from("tp_users").select("email,full_name").eq("marketing_opt_in",true).order("created_at",{ascending:true}).limit(10000);if(d.error)throw d.error;recipients=(d.data||[]).map(u=>({email:u.email,name:u.full_name}));if(!recipients.length)return errorJson(r,400,"NO_SUBSCRIBERS","No users have opted into product/news emails.");}const j=await queueJob(q.user.id,mode,subject,body,recipients);if(!j||j.status!=="queued")return errorJson(r,400,"EMAIL_NOT_QUEUED","No email job was queued.");runEmailQueue();r.status(202).json({ok:true,jobId:j.job_id,queuedCount:j.count,message:mode==="broadcast"?"Queued for opted-in users and paced to the daily cap.":"Queued for delivery."});}catch(e){logFailure("email-enqueue",e);errorJson(r,503,"EMAIL_QUEUE_FAILED","The email job could not be queued.");}}));
app.post("/api/webhooks/brevo",asyncRoute(async(q,r)=>{
 const expected=String(process.env.BREVO_WEBHOOK_TOKEN||"");
 const authorization=String(q.get("authorization")||"");const supplied=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 if(expected.length<32||!safeStringEqual(supplied,expected))return errorJson(r,401,"WEBHOOK_UNAUTHORIZED","Webhook authentication failed.");
 if(!db)return errorJson(r,503,"DATABASE_NOT_CONFIGURED","Webhook processing is not configured.");
 const incoming=Array.isArray(q.body)?q.body:[q.body||{}];
 const unsubscribed=[...new Set(incoming.filter(e=>String(e&&e.event||"").toLowerCase()==="unsubscribe"&&isValidEmail(e.email)).map(e=>normalizeEmail(e.email)))];
 try{
  for(const email of unsubscribed){
   const updated=await db.from("tp_users").update({marketing_opt_in:false,marketing_opt_in_at:null,updated_at:new Date().toISOString()}).eq("email",email);
   if(updated.error)throw updated.error;
  }
  r.json({ok:true,processed:unsubscribed.length});
 }catch(error){logFailure("brevo-webhook",error);errorJson(r,503,"WEBHOOK_PROCESSING_FAILED","Webhook event could not be processed. It may be retried.");}
}));
app.use((q,r,n)=>{if(!["GET","HEAD"].includes(q.method)||!/\.html$/i.test(q.path))return n();let t=/\/index\.html$/i.test(q.path)?(q.path.slice(0,-10)||"/"):q.path.slice(0,-5);if(!t.startsWith("/"))t="/"+t;if(t!=="/"&&!t.endsWith("/"))t+="/";r.redirect(301,t+(q.url.includes("?")?q.url.slice(q.url.indexOf("?")):""));});
app.use(express.static(PUBLIC_DIR,{index:"index.html",extensions:["html"],setHeaders(res,file){res.setHeader("Cache-Control",/\.html$/i.test(file)?"no-cache":"public, max-age=3600");}}));
app.use((q,r,n)=>q.path.startsWith("/api/")?errorJson(r,404,"API_ROUTE_NOT_FOUND","This API route does not exist."):n());
app.use((_q,r)=>r.status(404).sendFile(path.join(PUBLIC_DIR,"404.html")));
app.use((e,q,r,_n)=>{const s=e&&e.status===413?413:500;logFailure("request",e);if(q.path.startsWith("/api/"))return errorJson(r,s,s===413?"REQUEST_TOO_LARGE":"INTERNAL_ERROR",s===413?"That request is too large.":"Something went wrong.");r.status(s).sendFile(path.join(PUBLIC_DIR,"404.html"));});
if(db){setTimeout(()=>{cleanup();runEmailQueue();},1500);setInterval(()=>{cleanup();runEmailQueue();},6*60*60*1000).unref();setInterval(runEmailQueue,60000).unref();}
const port=Number(process.env.PORT||3000);if(require.main===module)app.listen(port,"0.0.0.0",()=>console.log("TeamPeach server listening on "+port+". Secrets are read only from environment variables."));
module.exports={app,runEmailQueue};