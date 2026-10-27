"use strict";
require("dotenv").config();
const path=require("node:path"),crypto=require("node:crypto"),express=require("express"),helmet=require("helmet"),cookieParser=require("cookie-parser"),rateLimit=require("express-rate-limit");
const{createClient}=require("@supabase/supabase-js");
const nodemailer=require("nodemailer");
const{normalizeEmail,isValidEmail,cleanText,otpHash,hashPassword,verifyPassword,generateOtp,hashSessionToken,adminEmailsFromEnv,normalizePersonName,safeStringEqual}=require("./src/security");
const{otpEmail,plainNotificationEmail}=require("./src/email-templates");
const app=express(),PUBLIC_DIR=path.join(__dirname,"public"),isProd=process.env.NODE_ENV==="production";
const OTP_MINS=Math.max(5,Math.min(15,Number(process.env.OTP_TTL_MINUTES||10))),SESSION_DAYS=Math.max(1,Math.min(30,Number(process.env.SESSION_TTL_DAYS||7))),DAILY_LIMIT=Math.max(1,Math.min(250,Number(process.env.EMAIL_DAILY_SOFT_LIMIT||250))),TRANSACTIONAL_RESERVE=Math.max(0,Math.min(DAILY_LIMIT-1,Number.isFinite(Number(process.env.EMAIL_TRANSACTIONAL_RESERVE))&&String(process.env.EMAIL_TRANSACTIONAL_RESERVE||"")!==""?Number(process.env.EMAIL_TRANSACTIONAL_RESERVE):Math.ceil(DAILY_LIMIT*0.2))),CAMPAIGN_DAILY_LIMIT=Math.max(1,DAILY_LIMIT-TRANSACTIONAL_RESERVE);
const origins=new Set([process.env.APP_BASE_URL,process.env.SITE_URL,process.env.RENDER_EXTERNAL_URL,...String(process.env.TRUSTED_ORIGINS||"").split(",")].filter(Boolean).map(v=>{try{return new URL(v.trim()).origin;}catch(_){return"";}}).filter(Boolean));
if(!isProd){origins.add("http://localhost:3000");origins.add("http://127.0.0.1:3000");}
const db=process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY?createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null;
app.disable("x-powered-by");app.set("trust proxy",1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],baseUri:["'self'"],formAction:["'self'"],frameAncestors:["'none'"],objectSrc:["'none'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com","data:"],imgSrc:["'self'","data:","https://images.unsplash.com"],connectSrc:["'self'"]}},crossOriginEmbedderPolicy:false}));
app.use(express.json({limit:"64kb",strict:true,verify(req,res,buf){if(String(req.originalUrl||"").includes("/api/payments/webhooks/"))req.rawBody=Buffer.from(buf);}}));app.use(cookieParser());
app.use("/api",(req,res,next)=>{res.setHeader("Cache-Control","no-store");res.setHeader("Pragma","no-cache");next();});
app.use("/api",rateLimit({windowMs:15*60*1000,limit:150,standardHeaders:true,legacyHeaders:false,message:{error:"RATE_LIMITED",message:"Too many requests. Please wait a little and try again."}}));
const authLimit=rateLimit({windowMs:60*60*1000,limit:30,standardHeaders:true,legacyHeaders:false,message:{error:"AUTH_RATE_LIMITED",message:"Too many account attempts. Wait before trying again."}});
function errorJson(res,status,error,message){return res.status(status).json({error,message});}
function asyncRoute(fn){return(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);}

function persistentRateLimit(scope,limit,windowSeconds,materialForRequest){
 return asyncRoute(async function(req,res,next){
  if(!db||!process.env.RATE_LIMIT_SECRET||process.env.RATE_LIMIT_SECRET.length<32)return next();
  const material=String((typeof materialForRequest==="function"?materialForRequest(req):req.ip)||"unknown").trim().slice(0,512)||"unknown";
  const bucketHash=crypto.createHmac("sha256",process.env.RATE_LIMIT_SECRET).update("teampeach-rate:"+scope+":"+material).digest("hex");
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

function authReady(){return Boolean(db&&process.env.OTP_PEPPER&&process.env.OTP_PEPPER.length>=32&&process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32&&process.env.RATE_LIMIT_SECRET&&process.env.RATE_LIMIT_SECRET.length>=32);}
function smtpSettings(){
 const port=Number(process.env.SMTP_PORT||587);
 return{host:String(process.env.SMTP_HOST||"smtp-relay.brevo.com").trim(),port,user:String(process.env.SMTP_USER||"").trim(),pass:String(process.env.SMTP_PASS||""),senderEmail:normalizeEmail(process.env.BREVO_SENDER_EMAIL),senderName:cleanText(process.env.BREVO_SENDER_NAME||"TeamPeach",70)};
}
function hasBrevoApiKey(){return Boolean(String(process.env.BREVO_API_KEY||"").trim());}
function emailTransportMode(){
 const requested=String(process.env.EMAIL_TRANSPORT||"auto").trim().toLowerCase();
 if(requested==="smtp"||requested==="brevo-api")return requested;
 if(requested!=="auto")return "invalid";
 return hasBrevoApiKey()?"brevo-api":"smtp";
}
function smtpReady(){const s=smtpSettings();return Boolean(s.host&&Number.isInteger(s.port)&&s.port>=1&&s.port<=65535&&s.user&&s.pass&&isValidEmail(s.senderEmail));}
function emailReady(){const s=smtpSettings(),mode=emailTransportMode();if(!isValidEmail(s.senderEmail))return false;if(mode==="smtp")return smtpReady();if(mode==="brevo-api")return hasBrevoApiKey();return false;}
let smtpTransporter=null;
function getSmtpTransporter(){
 if(!smtpReady())throw new Error("SMTP_NOT_CONFIGURED");
 if(!smtpTransporter){
  const s=smtpSettings();
  smtpTransporter=nodemailer.createTransport({host:s.host,port:s.port,secure:s.port===465,requireTLS:s.port!==465,auth:{user:s.user,pass:s.pass},tls:{minVersion:"TLSv1.2",rejectUnauthorized:true},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,pool:true,maxConnections:2,maxMessages:100,rateDelta:1000,rateLimit:5});
 }
 return smtpTransporter;
}
function backendReady(res,needEmail){if(!authReady()){errorJson(res,503,"SERVICE_NOT_CONFIGURED","Account services are being configured. Your information has not been submitted.");return false;}if(needEmail&&!emailReady()){errorJson(res,503,"EMAIL_NOT_CONFIGURED","Email delivery is not configured yet. Your information has not been submitted.");return false;}return true;}
function cookies(){return{httpOnly:true,secure:isProd,sameSite:"lax",path:"/",maxAge:SESSION_DAYS*86400000};}
function logFailure(area,e){const code=String(e&&(e.code||e.status||e.name)||"unknown").slice(0,40),details=[e&&e.responseCode?"response="+String(e.responseCode).slice(0,12):"",e&&e.providerCode?"provider="+String(e.providerCode).replace(/[^a-zA-Z0-9_. -]/g,"").slice(0,70):"",e&&e.deliveryCause?"cause="+String(e.deliveryCause).replace(/[^a-zA-Z0-9_. -]/g,"").slice(0,40):""].filter(Boolean).join(" ");console.error("["+area+"] operation failed ("+code+(details?" "+details:"")+").");}
function trusted(req){const o=req.get("origin");if(!o)return true;try{return origins.has(new URL(o).origin);}catch(_){return false;}}
function csrf(req,res,next){const c=Buffer.from(String(req.cookies.tp_csrf||"")),h=Buffer.from(String(req.get("x-csrf-token")||""));if(!trusted(req)||c.length<24||h.length<24||c.length!==h.length||!crypto.timingSafeEqual(c,h))return errorJson(res,403,"CSRF_CHECK_FAILED","Refresh the page and try again.");next();}
function baseUrl(){return cleanText(process.env.APP_BASE_URL||process.env.SITE_URL||process.env.RENDER_EXTERNAL_URL||"https://teampeach.org",300);}
async function reserveEmailUsage(to,category){
 const result=await db.rpc("tp_reserve_email_usage_v2",{p_recipient_email:normalizeEmail(to),p_category:category,p_daily_limit:DAILY_LIMIT,p_campaign_limit:CAMPAIGN_DAILY_LIMIT});
 if(result.error)throw result.error;
 const data=result.data||{};
 if(data.status!=="reserved"){const code=data.status==="limit_reached"?"EMAIL_DAILY_LIMIT":"EMAIL_USAGE_RESERVATION_FAILED";const error=new Error(code==="EMAIL_DAILY_LIMIT"?"The daily email allowance has been reached. Please try again later.":"Email capacity could not be reserved.");error.code=code;error.retryAfter=Math.max(60,Number(data.retry_after)||3600);throw error;}
 return data.usage_id;
}
async function completeEmailUsage(usageId,status,messageId){
 const result=await db.rpc("tp_complete_email_usage",{p_usage_id:usageId,p_status:status,p_provider_message_id:messageId||null});
 if(result.error)throw result.error;
 if(!result.data||!["ok","already_finalized"].includes(result.data.status))throw new Error("EMAIL_USAGE_FINALIZATION_FAILED");
}
function unsubscribeSignature(email){
 const secret=String(process.env.OTP_PEPPER||"");
 if(secret.length<32)throw new Error("OTP_PEPPER_NOT_CONFIGURED");
 return crypto.createHmac("sha256",secret).update("teampeach:unsubscribe:"+normalizeEmail(email)).digest("hex");
}
function unsubscribeUrl(email){
 const normalized=normalizeEmail(email),sig=unsubscribeSignature(normalized);
 return baseUrl()+"/unsubscribe/?email="+encodeURIComponent(normalized)+"&sig="+encodeURIComponent(sig);
}
async function sendSmtp(to,name,message,tags,usageId,category){
 if(!emailReady())throw new Error("EMAIL_NOT_CONFIGURED");
 const normalized=normalizeEmail(to),emailCategory=category||"single";
 const id=usageId||await reserveEmailUsage(normalized,emailCategory);
 const headers=emailCategory==="broadcast"?{"List-Unsubscribe":"<"+unsubscribeUrl(normalized)+">"}:undefined;
 let result;
 try{
  const settings=smtpSettings();
  if(emailTransportMode()==="brevo-api"){
   const payload={
    sender:{name:settings.senderName,email:settings.senderEmail},
    to:[{name:cleanText(name||"",100)||normalized,email:normalized}],
    subject:cleanText(message.subject,150),
    htmlContent:message.html,
    textContent:cleanText(message.text,15000),
    ...(Array.isArray(tags)&&tags.length?{tags:tags.map(tag=>cleanText(tag,50)).filter(Boolean).slice(0,10)}:{}),
    ...(headers?{headers}:{})
   };
   const response=await fetch("https://api.brevo.com/v3/smtp/email",{
    method:"POST",
    headers:{"accept":"application/json","api-key":String(process.env.BREVO_API_KEY).trim(),"content-type":"application/json"},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(15000)
   });
   const body=await response.json().catch(()=>({}));
   if(!response.ok){
    const error=new Error("Brevo HTTPS API request failed.");
    error.code="BREVO_API_HTTP_"+response.status;
    error.responseCode=response.status;
    error.providerCode=cleanText(body&&((body.code&&String(body.code))||(body.message&&String(body.message)))||"",80);
    throw error;
   }
   result={messageId:body&&body.messageId};
  }else{
   result=await getSmtpTransporter().sendMail({
    from:{name:settings.senderName,address:settings.senderEmail},
    to:{name:cleanText(name||"",100)||normalized,address:normalized},
    subject:cleanText(message.subject,150),
    html:message.html,
    text:cleanText(message.text,15000),
    ...(headers?{headers}:{})
   });
  }
 }catch(error){
  const responseCode=Number(error&&error.responseCode)||0;
  if(responseCode>=400&&responseCode<600){
   try{await completeEmailUsage(id,"failed",null);}catch(markError){logFailure("email-usage-release",markError);}
  }else{
   error.deliveryCause=String(error&&(error.code||error.name)||"network_error").slice(0,40);
   error.code="EMAIL_DELIVERY_UNCERTAIN";
  }
  throw error;
 }
 const messageId=cleanText(result&&result.messageId||"",200);
 // If the provider accepted the message but quota accounting fails, retain the reservation to avoid duplicates.
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
let workerBusy=false,emailCoordinatorBusy=false;
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
     if(item.mode==="broadcast"){
      const preference=await db.from("tp_users").select("marketing_opt_in").eq("email",normalizeEmail(item.recipient_email)).maybeSingle();
      if(preference.error)throw preference.error;
      if(!preference.data||preference.data.marketing_opt_in!==true){
       const skipped=await db.from("tp_email_queue").update({status:"skipped",last_error:"marketing_opt_out",completed_at:new Date().toISOString(),claimed_at:null}).eq("id",item.queue_id);
       if(skipped.error)throw skipped.error;
       return;
      }
     }
     const message=plainNotificationEmail(item.subject,item.body_text,baseUrl(),item.mode==="broadcast"?unsubscribeUrl(item.recipient_email):null);
     const category=item.mode==="system"?"system":item.mode==="broadcast"?"broadcast":"single";
     const sent=await sendSmtp(item.recipient_email,item.recipient_name,message,["teampeach",String(item.job_id).slice(0,20)],item.usage_id,category);
     const update=await db.from("tp_email_queue").update({status:"sent",brevo_message_id:sent.messageId||null,sent_at:new Date().toISOString(),last_error:null,claimed_at:null,next_attempt_at:null}).eq("id",item.queue_id);
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
async function runEmailQueue(){if(emailCoordinatorBusy)return;emailCoordinatorBusy=true;try{await runTransactionalQueue();}finally{emailCoordinatorBusy=false;}}
async function cleanup(){if(!db)return;try{await db.from("tp_pending_registrations").delete().lt("expires_at",new Date(Date.now()-86400000).toISOString());await db.from("tp_password_resets").delete().lt("expires_at",new Date(Date.now()-86400000).toISOString());await db.from("tp_sessions").delete().lt("expires_at",new Date().toISOString());await db.from("tp_sessions").delete().lt("revoked_at",new Date(Date.now()-30*86400000).toISOString());}catch(e){logFailure("cleanup",e);}}

app.get("/api/health",asyncRoute(async(_q,r)=>{let schemaReady=false;if(db){const [check,rateCheck,usageCheck,workspaceProjects,workspaceTasks,supportConversations,supportMessages]=await Promise.all([db.from("tp_users").select("id",{head:true,count:"exact"}),db.from("tp_rate_limits").select("bucket_hash",{head:true,count:"exact"}),db.from("tp_email_usage").select("id",{head:true,count:"exact"}),db.from("tp_workspace_projects").select("id",{head:true,count:"exact"}),db.from("tp_workspace_tasks").select("id",{head:true,count:"exact"}),db.from("tp_support_conversations").select("id",{head:true,count:"exact"}),db.from("tp_support_messages").select("id",{head:true,count:"exact"})]);schemaReady=!check.error&&!rateCheck.error&&!usageCheck.error&&!workspaceProjects.error&&!workspaceTasks.error&&!supportConversations.error&&!supportMessages.error;const schemaError=check.error||rateCheck.error||usageCheck.error||workspaceProjects.error||workspaceTasks.error||supportConversations.error||supportMessages.error;if(schemaError)logFailure("health-schema",schemaError);}const ready=authReady()&&schemaReady&&emailReady();r.status(ready?200:503).json({status:ready?"ready":"degraded",service:"teampeach",accountServicesConfigured:authReady(),databaseSchemaReady:schemaReady,emailDeliveryConfigured:emailReady(),emailTransport:emailReady()?emailTransportMode():"unconfigured"});}));
app.get("/api/csrf",(_q,r)=>{const token=crypto.randomBytes(32).toString("base64url");r.cookie("tp_csrf",token,{httpOnly:false,secure:isProd,sameSite:"lax",path:"/",maxAge:7200000});r.json({token});});
app.post("/api/auth/register/start",authLimit,csrf,persistentAuthIpLimit,persistentRegistrationEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,true))return;const name=normalizePersonName(q.body&&q.body.fullName),email=normalizeEmail(q.body&&q.body.email),password=q.body&&q.body.password,opt=Boolean(q.body&&q.body.marketingOptIn);if(name.length<2)return errorJson(r,400,"INVALID_NAME","Enter your name (at least 2 characters).");if(!isValidEmail(email))return errorJson(r,400,"INVALID_EMAIL","Enter a valid email address.");if(!validPassword(password))return errorJson(r,400,"INVALID_PASSWORD","Use a password between 12 and 128 characters.");try{if(await findUser(email))return errorJson(r,409,"ACCOUNT_EXISTS","This email already has a verified TeamPeach account. Sign in or reset your password.");const old=await db.from("tp_pending_registrations").select("expires_at,last_sent_at").eq("email",email).maybeSingle();if(old.error)throw old.error;const now=Date.now();if(old.data&&new Date(old.data.expires_at).getTime()>now&&now-new Date(old.data.last_sent_at).getTime()<60000)return r.json({ok:true,pending:true,message:"A code was already requested. Check your inbox or wait one minute before requesting another."});const code=generateOtp(),hashed=await hashPassword(password),saved=await db.from("tp_pending_registrations").upsert({email,full_name:name,password_hash:hashed,otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"registration"),marketing_opt_in:opt,expires_at:new Date(now+OTP_MINS*60000).toISOString(),attempt_count:0,last_sent_at:new Date(now).toISOString()},{onConflict:"email"});if(saved.error)throw saved.error;try{await sendSmtp(email,name,otpEmail(code,"registration",OTP_MINS,baseUrl()),["teampeach","registration-otp"],null,"registration_otp");}catch(e){logFailure("register-email",e);if(e.code==="EMAIL_DELIVERY_UNCERTAIN"){return r.status(202).json({ok:true,pending:true,message:"We could not confirm delivery. Check your inbox; the current code remains valid if the email was accepted. If needed, request a fresh code after one minute."});}await db.from("tp_pending_registrations").delete().eq("email",email);if(e.code==="EMAIL_DAILY_LIMIT")return errorJson(r,429,"EMAIL_DAILY_LIMIT","The daily email allowance has been reached. Please try again later.");return errorJson(r,502,"EMAIL_SEND_FAILED","We could not send a verification code. Please try again shortly.");}r.json({ok:true,pending:true,message:"We sent a verification code. Enter it to finish creating your account."});}catch(e){logFailure("register-start",e);errorJson(r,503,"REGISTRATION_UNAVAILABLE","Registration is temporarily unavailable. Please try again.");}}));
app.post("/api/auth/register/resend",authLimit,csrf,persistentAuthIpLimit,persistentRegistrationEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,true))return;const email=normalizeEmail(q.body&&q.body.email);if(!isValidEmail(email))return errorJson(r,400,"INVALID_EMAIL","Enter a valid email address.");try{const old=await db.from("tp_pending_registrations").select("full_name,expires_at,last_sent_at").eq("email",email).maybeSingle();if(old.error)throw old.error;if(!old.data||new Date(old.data.expires_at).getTime()<=Date.now())return r.json({ok:true,message:"If there is an active registration for this address, a fresh code may be sent. You can also return to registration and start again."});if(Date.now()-new Date(old.data.last_sent_at).getTime()<60000)return r.json({ok:true,message:"If you recently requested a code, check your inbox. Please wait a minute before requesting another."});const code=generateOtp(),u=await db.from("tp_pending_registrations").update({otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"registration"),expires_at:new Date(Date.now()+OTP_MINS*60000).toISOString(),attempt_count:0,last_sent_at:new Date().toISOString()}).eq("email",email);if(u.error)throw u.error;try{await sendSmtp(email,old.data.full_name,otpEmail(code,"registration",OTP_MINS,baseUrl()),["teampeach","registration-otp"],null,"registration_otp");}catch(e){logFailure("register-resend-email",e);return r.status(202).json({ok:true,message:"If a registration is active, check your inbox; if delivery could not be confirmed, the current code may still work. You can request a fresh code shortly."});}r.json({ok:true,message:"A fresh code has been sent. Only the newest code will work."});}catch(e){logFailure("register-resend",e);r.json({ok:true,message:"If a registration is active, check your inbox or try again shortly."});}}));
app.post("/api/auth/register/verify",authLimit,csrf,persistentAuthIpLimit,asyncRoute(async(q,r)=>{
 if(!backendReady(r,false))return;
 const email=normalizeEmail(q.body&&q.body.email),code=q.body&&q.body.code;
 if(!isValidEmail(email)||!validOtp(code))return errorJson(r,400,"INVALID_CODE","Enter your email and the six-digit code.");
 try{
  const v=await db.rpc("tp_complete_registration",{p_email:email,p_otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"registration")});
  if(v.error)throw v.error;
  const status=v.data&&v.data.status;
  if(status==="invalid")return errorJson(r,400,"INVALID_CODE","That code is not correct.");
  if(status==="expired")return errorJson(r,410,"CODE_EXPIRED","That code expired. Request a new one.");
  if(status==="too_many_attempts")return errorJson(r,429,"TOO_MANY_ATTEMPTS","Too many incorrect codes. Request a new one.");
  if(status==="already_registered")return errorJson(r,409,"ACCOUNT_EXISTS","This account already exists. Sign in or reset your password.");
  if(status!=="ok"||!v.data.user_id)return errorJson(r,400,"REGISTRATION_NOT_FOUND","No active registration was found. Start again.");
  try{await createSession(v.data.user_id,r);r.json({ok:true,authenticated:true,message:"Your email is verified. Welcome to TeamPeach."});}
  catch(e){logFailure("registration-session",e);r.json({ok:true,authenticated:false,message:"Your email is verified. Please sign in."});}
 }catch(e){logFailure("register-verify",e);errorJson(r,503,"VERIFICATION_UNAVAILABLE","We could not verify the code right now. Please retry.");}
}));
app.post("/api/auth/login",authLimit,csrf,persistentAuthIpLimit,persistentLoginEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,false))return;const email=normalizeEmail(q.body&&q.body.email),pw=q.body&&q.body.password;if(!isValidEmail(email)||typeof pw!=="string"||pw.length>128)return errorJson(r,400,"INVALID_CREDENTIALS","Check your email and password.");try{const u=await findUser(email),matched=u?await verifyPassword(pw,u.password_hash):(await hashPassword(pw.length<12?pw.padEnd(12,"x"):pw),false);if(!u||!matched)return errorJson(r,401,"INVALID_CREDENTIALS","Email or password is incorrect. Complete email verification if registration is unfinished.");await createSession(u.id,r);r.json({ok:true,message:"Signed in."});}catch(e){logFailure("login",e);errorJson(r,503,"LOGIN_UNAVAILABLE","Sign-in is temporarily unavailable.");}}));
app.post("/api/auth/password-reset/start",authLimit,csrf,persistentAuthIpLimit,persistentResetEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,true))return;const email=normalizeEmail(q.body&&q.body.email);if(!isValidEmail(email))return errorJson(r,400,"INVALID_EMAIL","Enter a valid email address.");const generic={ok:true,message:"If a verified account exists, a recovery code will be sent."};try{const u=await findUser(email);if(!u)return r.json(generic);const old=await db.from("tp_password_resets").select("last_sent_at").eq("email",email).maybeSingle();if(old.error)throw old.error;if(old.data&&Date.now()-new Date(old.data.last_sent_at).getTime()<60000)return r.json(generic);const code=generateOtp(),saved=await db.from("tp_password_resets").upsert({email,otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"password-reset"),attempt_count:0,expires_at:new Date(Date.now()+OTP_MINS*60000).toISOString(),last_sent_at:new Date().toISOString()},{onConflict:"email"});if(saved.error)throw saved.error;try{await sendSmtp(email,u.full_name,otpEmail(code,"password-reset",OTP_MINS,baseUrl()),["teampeach","password-reset"],null,"password_reset");}catch(e){logFailure("reset-email",e);}r.json(generic);}catch(e){logFailure("reset-start",e);r.json(generic);}}));
app.post("/api/auth/password-reset/complete",authLimit,csrf,persistentAuthIpLimit,persistentResetEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,false))return;const email=normalizeEmail(q.body&&q.body.email),code=q.body&&q.body.code,pw=q.body&&q.body.password;if(!isValidEmail(email)||!validOtp(code))return errorJson(r,400,"INVALID_CODE","Enter your email and six-digit recovery code.");if(!validPassword(pw))return errorJson(r,400,"INVALID_PASSWORD","Use a password between 12 and 128 characters.");try{const v=await db.rpc("tp_complete_password_reset",{p_email:email,p_otp_hash:otpHash(email,code,process.env.OTP_PEPPER,"password-reset"),p_password_hash:await hashPassword(pw)});if(v.error)throw v.error;const s=v.data&&v.data.status;if(s==="invalid")return errorJson(r,400,"INVALID_CODE","That recovery code is not correct.");if(s==="expired")return errorJson(r,410,"CODE_EXPIRED","The recovery code expired. Request another.");if(s==="too_many_attempts")return errorJson(r,429,"TOO_MANY_ATTEMPTS","Too many incorrect codes. Request another.");if(s!=="ok")return errorJson(r,400,"RESET_NOT_FOUND","No active recovery request was found.");r.clearCookie("tp_session",{httpOnly:true,secure:isProd,sameSite:"lax",path:"/"});r.json({ok:true,message:"Your password has changed. Sign in with your new password."});}catch(e){logFailure("reset-complete",e);errorJson(r,503,"RESET_COMPLETE_FAILED","Password recovery is temporarily unavailable.");}}));
app.post("/api/auth/logout",csrf,asyncRoute(async(q,r)=>{if(db&&q.cookies.tp_session){const d=await db.from("tp_sessions").update({revoked_at:new Date().toISOString()}).eq("token_hash",hashSessionToken(q.cookies.tp_session,process.env.SESSION_SECRET)).is("revoked_at",null);if(d.error)logFailure("logout",d.error);}r.clearCookie("tp_session",{httpOnly:true,secure:isProd,sameSite:"lax",path:"/"});r.json({ok:true,message:"Signed out."});}));
app.get("/api/auth/me",authenticated,(q,r)=>r.json({ok:true,user:{id:q.user.id,email:q.user.email,fullName:q.user.full_name,marketingOptIn:q.user.marketing_opt_in},isAdmin:q.isAdmin}));

// Authenticated workspace API. The service-role key stays server-side; every query is scoped to the current user.
const workspaceProjectFields="id,title,description,project_type,status,data,created_at,updated_at";
const workspaceTaskFields="id,title,project_id,due_on,priority,completed,created_at,updated_at";
function validWorkspaceId(value){return typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
function validWorkspaceDate(value){if(value===null||value==="")return true;if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+"T00:00:00.000Z");return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
function workspaceObject(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function workspaceDataFits(value){try{return JSON.stringify(workspaceObject(value)).length<=18000;}catch(_){return false;}}
app.get("/api/workspace",authenticated,asyncRoute(async(q,r)=>{
 const [projects,tasks]=await Promise.all([
  db.from("tp_workspace_projects").select(workspaceProjectFields).eq("user_id",q.user.id).order("updated_at",{ascending:false}).limit(100),
  db.from("tp_workspace_tasks").select(workspaceTaskFields).eq("user_id",q.user.id).order("completed",{ascending:true}).order("due_on",{ascending:true,nullsFirst:false}).order("created_at",{ascending:false}).limit(200)
 ]);
 if(projects.error||tasks.error){logFailure("workspace-read",projects.error||tasks.error);return errorJson(r,503,"WORKSPACE_UNAVAILABLE","Your workspace is temporarily unavailable. Confirm the workspace database migration has been applied, then retry.");}
 r.json({ok:true,user:{id:q.user.id,email:q.user.email,fullName:q.user.full_name},projects:projects.data||[],tasks:tasks.data||[]});
}));
app.post("/api/workspace/projects",csrf,authenticated,asyncRoute(async(q,r)=>{
 const body=q.body||{},title=cleanText(body.title,120),description=cleanText(body.description,1200),type=String(body.projectType||"general"),data=workspaceObject(body.data);
 if(title.length<2)return errorJson(r,400,"INVALID_PROJECT","Give this project a title of at least two characters.");
 if(!["general","seo-brief","content","automation"].includes(type))return errorJson(r,400,"INVALID_PROJECT_TYPE","Choose a supported project type.");
 if(!workspaceDataFits(data))return errorJson(r,400,"PROJECT_DATA_TOO_LARGE","This project contains too much data to save.");
 const saved=await db.from("tp_workspace_projects").insert({user_id:q.user.id,title,description,project_type:type,status:"active",data}).select(workspaceProjectFields).single();
 if(saved.error){logFailure("workspace-project-create",saved.error);return errorJson(r,503,"PROJECT_CREATE_FAILED","We could not save this project. Confirm the workspace database migration has been applied.");}
 r.status(201).json({ok:true,project:saved.data});
}));
app.patch("/api/workspace/projects/:id",csrf,authenticated,asyncRoute(async(q,r)=>{
 if(!validWorkspaceId(q.params.id))return errorJson(r,400,"INVALID_PROJECT_ID","This project link is invalid.");
 const body=q.body||{},updates={updated_at:new Date().toISOString()};
 if(Object.prototype.hasOwnProperty.call(body,"title")){const title=cleanText(body.title,120);if(title.length<2)return errorJson(r,400,"INVALID_PROJECT","Project title must contain at least two characters.");updates.title=title;}
 if(Object.prototype.hasOwnProperty.call(body,"description"))updates.description=cleanText(body.description,1200);
 if(Object.prototype.hasOwnProperty.call(body,"status")){if(!["active","paused","completed"].includes(body.status))return errorJson(r,400,"INVALID_PROJECT_STATUS","Choose active, paused or completed.");updates.status=body.status;}
 if(Object.prototype.hasOwnProperty.call(body,"data")){if(!workspaceDataFits(body.data))return errorJson(r,400,"PROJECT_DATA_TOO_LARGE","This project contains too much data to save.");updates.data=workspaceObject(body.data);}
 if(Object.keys(updates).length===1)return errorJson(r,400,"EMPTY_PROJECT_UPDATE","There are no project changes to save.");
 const saved=await db.from("tp_workspace_projects").update(updates).eq("id",q.params.id).eq("user_id",q.user.id).select(workspaceProjectFields).maybeSingle();
 if(saved.error){logFailure("workspace-project-update",saved.error);return errorJson(r,503,"PROJECT_UPDATE_FAILED","We could not update this project.");}
 if(!saved.data)return errorJson(r,404,"PROJECT_NOT_FOUND","This project could not be found.");
 r.json({ok:true,project:saved.data});
}));
app.delete("/api/workspace/projects/:id",csrf,authenticated,asyncRoute(async(q,r)=>{
 if(!validWorkspaceId(q.params.id))return errorJson(r,400,"INVALID_PROJECT_ID","This project link is invalid.");
 const removed=await db.from("tp_workspace_projects").delete().eq("id",q.params.id).eq("user_id",q.user.id).select("id").maybeSingle();
 if(removed.error){logFailure("workspace-project-delete",removed.error);return errorJson(r,503,"PROJECT_DELETE_FAILED","We could not delete this project.");}
 if(!removed.data)return errorJson(r,404,"PROJECT_NOT_FOUND","This project could not be found.");
 r.json({ok:true,id:removed.data.id});
}));
app.post("/api/workspace/tasks",csrf,authenticated,asyncRoute(async(q,r)=>{
 const body=q.body||{},title=cleanText(body.title,180),priority=String(body.priority||"normal"),projectId=body.projectId||null,dueOn=body.dueOn||null;
 if(title.length<2)return errorJson(r,400,"INVALID_TASK","Task title must contain at least two characters.");
 if(!["low","normal","high"].includes(priority))return errorJson(r,400,"INVALID_TASK_PRIORITY","Choose a supported task priority.");
 if(!validWorkspaceDate(dueOn))return errorJson(r,400,"INVALID_DUE_DATE","Choose a valid due date.");
 if(projectId){if(!validWorkspaceId(projectId))return errorJson(r,400,"INVALID_PROJECT_ID","Choose a valid project.");const project=await db.from("tp_workspace_projects").select("id").eq("id",projectId).eq("user_id",q.user.id).maybeSingle();if(project.error){logFailure("workspace-task-project",project.error);return errorJson(r,503,"TASK_CREATE_FAILED","We could not check the selected project.");}if(!project.data)return errorJson(r,400,"INVALID_PROJECT_ID","That project does not belong to your workspace.");}
 const saved=await db.from("tp_workspace_tasks").insert({user_id:q.user.id,title,priority,project_id:projectId,due_on:dueOn}).select(workspaceTaskFields).single();
 if(saved.error){logFailure("workspace-task-create",saved.error);return errorJson(r,503,"TASK_CREATE_FAILED","We could not save this task. Confirm the workspace database migration has been applied.");}
 r.status(201).json({ok:true,task:saved.data});
}));
app.patch("/api/workspace/tasks/:id",csrf,authenticated,asyncRoute(async(q,r)=>{
 if(!validWorkspaceId(q.params.id))return errorJson(r,400,"INVALID_TASK_ID","This task link is invalid.");
 const body=q.body||{},updates={updated_at:new Date().toISOString()};
 if(Object.prototype.hasOwnProperty.call(body,"completed")){if(typeof body.completed!=="boolean")return errorJson(r,400,"INVALID_TASK_STATUS","Choose a valid task status.");updates.completed=body.completed;}
 if(Object.prototype.hasOwnProperty.call(body,"title")){const title=cleanText(body.title,180);if(title.length<2)return errorJson(r,400,"INVALID_TASK","Task title must contain at least two characters.");updates.title=title;}
 if(Object.prototype.hasOwnProperty.call(body,"priority")){if(!["low","normal","high"].includes(body.priority))return errorJson(r,400,"INVALID_TASK_PRIORITY","Choose a supported task priority.");updates.priority=body.priority;}
 if(Object.prototype.hasOwnProperty.call(body,"dueOn")){if(!validWorkspaceDate(body.dueOn))return errorJson(r,400,"INVALID_DUE_DATE","Choose a valid due date.");updates.due_on=body.dueOn||null;}
 if(Object.keys(updates).length===1)return errorJson(r,400,"EMPTY_TASK_UPDATE","There are no task changes to save.");
 const saved=await db.from("tp_workspace_tasks").update(updates).eq("id",q.params.id).eq("user_id",q.user.id).select(workspaceTaskFields).maybeSingle();
 if(saved.error){logFailure("workspace-task-update",saved.error);return errorJson(r,503,"TASK_UPDATE_FAILED","We could not update this task.");}
 if(!saved.data)return errorJson(r,404,"TASK_NOT_FOUND","This task could not be found.");
 r.json({ok:true,task:saved.data});
}));
app.delete("/api/workspace/tasks/:id",csrf,authenticated,asyncRoute(async(q,r)=>{
 if(!validWorkspaceId(q.params.id))return errorJson(r,400,"INVALID_TASK_ID","This task link is invalid.");
 const removed=await db.from("tp_workspace_tasks").delete().eq("id",q.params.id).eq("user_id",q.user.id).select("id").maybeSingle();
 if(removed.error){logFailure("workspace-task-delete",removed.error);return errorJson(r,503,"TASK_DELETE_FAILED","We could not delete this task.");}
 if(!removed.data)return errorJson(r,404,"TASK_NOT_FOUND","This task could not be found.");
 r.json({ok:true,id:removed.data.id});
}));

app.patch("/api/account/preferences",csrf,authenticated,asyncRoute(async(q,r)=>{
 if(typeof(q.body&&q.body.marketingOptIn)!=="boolean")return errorJson(r,400,"INVALID_PREFERENCE","Choose an email preference.");
 const optedIn=q.body.marketingOptIn,now=new Date().toISOString();
 const d=await db.from("tp_users").update({marketing_opt_in:optedIn,marketing_opt_in_at:optedIn?now:null,marketing_opt_out_at:optedIn?null:now,updated_at:now}).eq("id",q.user.id).select("marketing_opt_in").single();
 if(d.error){logFailure("preferences",d.error);return errorJson(r,503,"PREFERENCE_FAILED","Your preference could not be saved.");}
 r.json({ok:true,marketingOptIn:d.data.marketing_opt_in,message:"Your email preference has been saved."});
}));
app.post("/api/projects",csrf,authLimit,persistentInquiryIpLimit,persistentInquiryEmailLimit,asyncRoute(async(q,r)=>{if(!backendReady(r,false))return;const name=normalizePersonName(q.body&&q.body.name),email=normalizeEmail(q.body&&q.body.email),type=cleanText(q.body&&q.body.type,100),details=cleanText(q.body&&q.body.details,5000);if(name.length<2||!isValidEmail(email)||type.length<3||details.length<10)return errorJson(r,400,"INVALID_INQUIRY","Enter your name, valid email, project type and at least 10 characters about the work.");try{const d=await db.from("tp_project_requests").insert({full_name:name,email,project_type:type,details,status:"new"}).select("id").single();if(d.error)throw d.error;const recipients=adminEmailsFromEnv(process.env.ADMIN_EMAILS).map(e=>({email:e,name:"TeamPeach administrator"}));if(recipients.length){try{await queueJob(null,"system","New TeamPeach project inquiry","Name: "+name+"\nEmail: "+email+"\nType: "+type+"\n\nDetails:\n"+details,recipients);runEmailQueue();}catch(e){logFailure("project-notice",e);}}r.status(201).json({ok:true,message:"Thank you. Your inquiry has been received. We’ll review it and follow up using the email address you provided."});}catch(e){logFailure("project-inquiry",e);errorJson(r,503,"INQUIRY_UNAVAILABLE","Your inquiry could not be submitted. Please try again later.");}}));


const supportConversationFields="id,user_id,subject,status,last_message_at,last_user_read_at,last_staff_read_at,created_at,updated_at";
const supportMessageFields="id,conversation_id,sender_user_id,sender_role,sender_name,body,created_at";
async function supportListWithLatest(conversations,perspective){
 if(!conversations.length)return [];
 const ids=conversations.map(item=>item.id);
 const query=await db.from("tp_support_messages").select(supportMessageFields).in("conversation_id",ids).order("created_at",{ascending:false}).limit(Math.min(1000,Math.max(100,ids.length*10)));
 if(query.error)throw query.error;
 const latest=new Map();
 for(const message of query.data||[])if(!latest.has(message.conversation_id))latest.set(message.conversation_id,message);
 return conversations.map(conversation=>{
  const lastMessage=latest.get(conversation.id)||null;
  const readAt=perspective==="staff"?conversation.last_staff_read_at:conversation.last_user_read_at;
  const incomingRole=perspective==="staff"?"user":"staff";
  const unread=Boolean(lastMessage&&lastMessage.sender_role===incomingRole&&new Date(lastMessage.created_at).getTime()>new Date(readAt||0).getTime());
  return {...conversation,last_message:lastMessage?{body:lastMessage.body,sender_role:lastMessage.sender_role,sender_name:lastMessage.sender_name,created_at:lastMessage.created_at}:null,unread};
 });
}
app.get("/api/support/conversations",authenticated,asyncRoute(async(q,r)=>{
 try{
  const result=await db.from("tp_support_conversations").select(supportConversationFields).eq("user_id",q.user.id).order("last_message_at",{ascending:false}).limit(50);
  if(result.error)throw result.error;
  const conversations=await supportListWithLatest(result.data||[],"user");
  r.json({ok:true,conversations});
 }catch(e){logFailure("support-user-list",e);errorJson(r,503,"SUPPORT_UNAVAILABLE","Support chat is unavailable. Confirm that supabase/migrations/003_support_chat.sql has been applied, then retry.");}
}));
app.post("/api/support/conversations",csrf,authLimit,authenticated,asyncRoute(async(q,r)=>{
 const body=q.body||{},subject=cleanText(body.subject,120),messageBody=cleanText(body.body,4000);
 if(subject.length<3)return errorJson(r,400,"INVALID_SUPPORT_SUBJECT","Use a subject between 3 and 120 characters.");
 if(messageBody.length<1)return errorJson(r,400,"INVALID_SUPPORT_MESSAGE","Write a message before sending.");
 const now=new Date().toISOString();
 try{
  const created=await db.from("tp_support_conversations").insert({user_id:q.user.id,subject,status:"waiting_for_staff",last_message_at:now,last_user_read_at:now,created_at:now,updated_at:now}).select(supportConversationFields).single();
  if(created.error)throw created.error;
  const sent=await db.from("tp_support_messages").insert({conversation_id:created.data.id,sender_user_id:q.user.id,sender_role:"user",sender_name:q.user.full_name,body:messageBody,created_at:now}).select(supportMessageFields).single();
  if(sent.error){
   const rollback=await db.from("tp_support_conversations").delete().eq("id",created.data.id).eq("user_id",q.user.id);
   if(rollback.error)logFailure("support-create-rollback",rollback.error);
   throw sent.error;
  }
  r.status(201).json({ok:true,conversation:{...created.data,last_message:{body:sent.data.body,sender_role:"user",sender_name:sent.data.sender_name,created_at:sent.data.created_at},unread:false}});
 }catch(e){logFailure("support-create",e);errorJson(r,503,"SUPPORT_CREATE_FAILED","We could not start your conversation. Confirm the support database migration has been applied, then retry.");}
}));
app.get("/api/support/conversations/:id/messages",authenticated,asyncRoute(async(q,r)=>{
 if(!validWorkspaceId(q.params.id))return errorJson(r,400,"INVALID_SUPPORT_ID","This conversation link is invalid.");
 try{
  let conversationQuery=db.from("tp_support_conversations").select(supportConversationFields).eq("id",q.params.id);
  if(!q.isAdmin)conversationQuery=conversationQuery.eq("user_id",q.user.id);
  const conversation=await conversationQuery.maybeSingle();
  if(conversation.error)throw conversation.error;
  if(!conversation.data)return errorJson(r,404,"SUPPORT_CONVERSATION_NOT_FOUND","That support conversation could not be found.");
  const result=await db.from("tp_support_messages").select(supportMessageFields).eq("conversation_id",q.params.id).order("created_at",{ascending:false}).limit(100);
  if(result.error)throw result.error;
  const now=new Date().toISOString(),readPatch=q.isAdmin?{last_staff_read_at:now}:{last_user_read_at:now};
  const readUpdate=await db.from("tp_support_conversations").update(readPatch).eq("id",q.params.id);
  if(readUpdate.error)logFailure("support-read-marker",readUpdate.error);
  r.json({ok:true,conversation:conversation.data,messages:(result.data||[]).reverse()});
 }catch(e){logFailure("support-messages",e);errorJson(r,503,"SUPPORT_MESSAGES_FAILED","We could not load these messages. Please refresh and try again.");}
}));
app.post("/api/support/conversations/:id/messages",csrf,authLimit,authenticated,asyncRoute(async(q,r)=>{
 if(!validWorkspaceId(q.params.id))return errorJson(r,400,"INVALID_SUPPORT_ID","This conversation link is invalid.");
 const messageBody=cleanText(q.body&&q.body.body,4000);
 if(messageBody.length<1)return errorJson(r,400,"INVALID_SUPPORT_MESSAGE","Write a message before sending.");
 try{
  let conversationQuery=db.from("tp_support_conversations").select(supportConversationFields).eq("id",q.params.id);
  if(!q.isAdmin)conversationQuery=conversationQuery.eq("user_id",q.user.id);
  const conversation=await conversationQuery.maybeSingle();
  if(conversation.error)throw conversation.error;
  if(!conversation.data)return errorJson(r,404,"SUPPORT_CONVERSATION_NOT_FOUND","That support conversation could not be found.");
  const now=new Date().toISOString(),role=q.isAdmin?"staff":"user";
  const saved=await db.from("tp_support_messages").insert({conversation_id:q.params.id,sender_user_id:q.user.id,sender_role:role,sender_name:q.isAdmin?(q.user.full_name||"TeamPeach Support"):q.user.full_name,body:messageBody,created_at:now}).select(supportMessageFields).single();
  if(saved.error)throw saved.error;
  const patch={status:q.isAdmin?"waiting_for_user":"waiting_for_staff",last_message_at:now,updated_at:now};
  patch[q.isAdmin?"last_staff_read_at":"last_user_read_at"]=now;
  const updated=await db.from("tp_support_conversations").update(patch).eq("id",q.params.id);
  if(updated.error)logFailure("support-update-conversation",updated.error);
  r.status(201).json({ok:true,message:saved.data});
 }catch(e){logFailure("support-send-message",e);errorJson(r,503,"SUPPORT_SEND_FAILED","Your message could not be sent. Please refresh and retry.");}
}));
app.get("/api/admin/support/conversations",authenticated,isAdmin,asyncRoute(async(_q,r)=>{
 try{
  const result=await db.from("tp_support_conversations").select(supportConversationFields).order("last_message_at",{ascending:false}).limit(100);
  if(result.error)throw result.error;
  const conversations=result.data||[];
  const enriched=await supportListWithLatest(conversations,"staff");
  const ids=[...new Set(conversations.map(item=>item.user_id))];
  const users=ids.length?await db.from("tp_users").select("id,email,full_name").in("id",ids):{data:[],error:null};
  if(users.error)throw users.error;
  const byId=new Map((users.data||[]).map(user=>[user.id,user]));
  r.json({ok:true,conversations:enriched.map(item=>({...item,user_name:byId.get(item.user_id)?.full_name||"Customer",user_email:byId.get(item.user_id)?.email||""}))});
 }catch(e){logFailure("support-admin-list",e);errorJson(r,503,"SUPPORT_ADMIN_UNAVAILABLE","The support inbox is unavailable. Confirm that supabase/migrations/003_support_chat.sql has been applied, then retry.");}
}));
app.patch("/api/admin/support/conversations/:id/status",csrf,authenticated,isAdmin,asyncRoute(async(q,r)=>{
 if(!validWorkspaceId(q.params.id))return errorJson(r,400,"INVALID_SUPPORT_ID","This conversation link is invalid.");
 const status=String(q.body&&q.body.status||"");
 if(!["open","waiting_for_staff","waiting_for_user","closed"].includes(status))return errorJson(r,400,"INVALID_SUPPORT_STATUS","Choose a valid conversation status.");
 try{
  const saved=await db.from("tp_support_conversations").update({status,updated_at:new Date().toISOString()}).eq("id",q.params.id).select(supportConversationFields).maybeSingle();
  if(saved.error)throw saved.error;
  if(!saved.data)return errorJson(r,404,"SUPPORT_CONVERSATION_NOT_FOUND","That conversation could not be found.");
  r.json({ok:true,conversation:saved.data});
 }catch(e){logFailure("support-status",e);errorJson(r,503,"SUPPORT_STATUS_FAILED","The conversation status could not be updated.");}
}));


const publicProductFields="id,slug,name,summary,description,category,product_type,price_minor,currency,hosted_enabled,self_hosted_enabled,credit_cost_per_run,member_discount_percent,included_setup_hours,features";
const publicPlanFields="id,slug,name,description,price_minor,currency,monthly_credits,member_discount_percent,sort_order,paystack_plan_code,flutterwave_payment_plan_id,active";
const paymentTypeValues=["membership","credit_topup","tool_license"];
function safeEqualText(left,right){
 const a=Buffer.from(String(left||"")),b=Buffer.from(String(right||""));
 return a.length>0&&a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function paymentMode(){return String(process.env.PAYMENT_MODE||"test").trim().toLowerCase()==="live"?"live":"test";}
function paymentSecret(gateway){
 const secret=String((gateway==="paystack"?process.env.PAYSTACK_SECRET_KEY:process.env.FLW_SECRET_KEY)||"").trim();
 if(!secret)return null;
 if(paymentMode()==="test"){
  if(gateway==="paystack"&&!secret.startsWith("sk_test_"))return null;
  if(gateway==="flutterwave"&&!/^FLWSECK_TEST[-_]/i.test(secret))return null;
 }else{
  if(gateway==="paystack"&&secret.startsWith("sk_test_"))return null;
  if(gateway==="flutterwave"&&/^FLWSECK_TEST/i.test(secret))return null;
 }
 return secret;
}
function paymentReady(gateway){return ["paystack","flutterwave"].includes(gateway)&&Boolean(paymentSecret(gateway));}
function currencyMajor(minor){return Number((Number(minor||0)/100).toFixed(2));}
function newPaymentReference(gateway){
 const prefix=gateway==="paystack"?"TPPSK":"TPFLW";
 return prefix+Date.now().toString(36).toUpperCase()+crypto.randomBytes(9).toString("hex").toUpperCase();
}
async function gatewayRequest(gateway,url,method,body){
 const secret=paymentSecret(gateway);
 if(!secret)throw new Error("PAYMENT_GATEWAY_NOT_CONFIGURED");
 const response=await fetch(url,{method:method||"GET",headers:{
  "Authorization":"Bearer "+secret,"Content-Type":"application/json","Accept":"application/json"
 },...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||(gateway==="paystack"&&data.status!==true)||(gateway==="flutterwave"&&data.status!=="success")){
  const error=new Error("PAYMENT_PROVIDER_REQUEST_FAILED");
  error.code="PAYMENT_PROVIDER_HTTP_"+response.status;
  throw error;
 }
 return data;
}
function cleanProviderText(value,max){
 return cleanText(typeof value==="string"?value:"",max||200);
}
function publicProduct(row){
 return {id:row.id,slug:row.slug,name:row.name,summary:row.summary,description:row.description,category:row.category,productType:row.product_type,
  priceMinor:Number(row.price_minor),currency:row.currency,hostedEnabled:row.hosted_enabled,selfHostedEnabled:row.self_hosted_enabled,
  creditCostPerRun:row.credit_cost_per_run,memberDiscountPercent:row.member_discount_percent,includedSetupHours:Number(row.included_setup_hours||0),
  features:Array.isArray(row.features)?row.features:[]};
}
function publicPlan(row){
 return {id:row.id,slug:row.slug,name:row.name,description:row.description,priceMinor:Number(row.price_minor),currency:row.currency,
  monthlyCredits:row.monthly_credits,memberDiscountPercent:row.member_discount_percent,sortOrder:row.sort_order,
  availableGateways:{paystack:Boolean(row.paystack_plan_code),flutterwave:Boolean(row.flutterwave_payment_plan_id)}};
}
async function currentSubscription(userId){
 const now=new Date().toISOString();
 const result=await db.from("tp_subscriptions").select("id,user_id,plan_id,gateway,status,current_period_start,current_period_end,cancel_at_period_end,provider_subscription_id,provider_customer_code,provider_email_token,provider_plan_id,last_payment_reference,tp_subscription_plans(id,slug,name,description,price_minor,currency,monthly_credits,member_discount_percent)")
  .eq("user_id",userId).in("status",["active","cancelled","past_due"]).gt("current_period_end",now)
  .order("current_period_end",{ascending:false}).limit(1).maybeSingle();
 if(result.error)throw result.error;
 return result.data||null;
}
async function createGatewayPlan(plan,gateway){
 if(!paymentReady(gateway))throw new Error("PAYMENT_GATEWAY_NOT_CONFIGURED");
 if(gateway==="paystack"){
  const data=await gatewayRequest(gateway,"https://api.paystack.co/plan","POST",{
   name:plan.name,amount:Number(plan.price_minor),interval:"monthly",currency:plan.currency
  });
  const code=data.data&&data.data.plan_code;
  if(typeof code!=="string"||!code)throw new Error("PAYSTACK_PLAN_ID_MISSING");
  const updated=await db.from("tp_subscription_plans").update({paystack_plan_code:code,updated_at:new Date().toISOString()}).eq("id",plan.id).select(publicPlanFields).single();
  if(updated.error)throw updated.error;
  return updated.data;
 }
 const data=await gatewayRequest(gateway,"https://api.flutterwave.com/v3/payment-plans","POST",{
  name:plan.name,amount:currencyMajor(plan.price_minor),interval:"monthly",currency:plan.currency
 });
 const id=Number(data.data&&data.data.id);
 if(!Number.isSafeInteger(id)||id<1)throw new Error("FLUTTERWAVE_PLAN_ID_MISSING");
 const updated=await db.from("tp_subscription_plans").update({flutterwave_payment_plan_id:id,updated_at:new Date().toISOString()}).eq("id",plan.id).select(publicPlanFields).single();
 if(updated.error)throw updated.error;
 return updated.data;
}
async function verifyGatewayPayment(payment,transactionId){
 const gateway=payment.gateway;
 if(!paymentReady(gateway))throw new Error("PAYMENT_GATEWAY_NOT_CONFIGURED");
 let data;
 if(gateway==="paystack"){
  const response=await gatewayRequest(gateway,"https://api.paystack.co/transaction/verify/"+encodeURIComponent(payment.reference),"GET");
  data=response.data;
  if(!data||data.status!=="success"||String(data.reference||"")!==payment.reference)throw new Error("PAYMENT_NOT_SUCCESSFUL");
  if(Number(data.amount)!==Number(payment.amount_minor)||String(data.currency||"").toUpperCase()!==payment.currency)throw new Error("PAYMENT_AMOUNT_MISMATCH");
 }else{
  const id=String(transactionId||payment.provider_transaction_id||"").trim();
  if(!/^\d{1,24}$/.test(id))throw new Error("FLUTTERWAVE_TRANSACTION_ID_REQUIRED");
  const response=await gatewayRequest(gateway,"https://api.flutterwave.com/v3/transactions/"+encodeURIComponent(id)+"/verify","GET");
  data=response.data;
  if(!data||String(data.status||"").toLowerCase()!=="successful"||String(data.tx_ref||"")!==payment.reference)throw new Error("PAYMENT_NOT_SUCCESSFUL");
  if(currencyMajor(payment.amount_minor)>Number(data.amount||0)+0.01||String(data.currency||"").toUpperCase()!==payment.currency)throw new Error("PAYMENT_AMOUNT_MISMATCH");
 }
 const customerEmail=normalizeEmail(data.customer&&data.customer.email||data.customer_email||"");
 const owner=await db.from("tp_users").select("email").eq("id",payment.user_id).maybeSingle();
 if(owner.error)throw owner.error;
 if(customerEmail&&owner.data&&customerEmail!==owner.data.email)throw new Error("PAYMENT_CUSTOMER_MISMATCH");
 return {data,transactionId:String(data.id||transactionId||"")};
}
async function fulfillVerifiedPayment(payment,verified){
 const result=await db.rpc("tp_fulfill_payment",{
  p_payment_id:payment.id,
  p_provider_transaction_id:cleanProviderText(verified&&verified.transactionId,120)||null,
  p_metadata:{verifiedBy:"gateway-api",paymentMode:paymentMode()}
 });
 if(result.error)throw result.error;
 const body=result.data||{};
 if(!["fulfilled","already_fulfilled"].includes(body.status))throw new Error("PAYMENT_FULFILLMENT_FAILED");
 return body;
}
async function recurringPaymentFromEvent(gateway,data,eventName){
 const email=normalizeEmail(data&&data.customer&&data.customer.email||data&&data.customer_email||"");
 const reference=String(gateway==="paystack"?(data&&data.reference||""):(data&&data.tx_ref||"")).trim();
 if(!isValidEmail(email)||reference.length<8||reference.length>120)return null;
 const already=await db.from("tp_payments").select("id,user_id,gateway,reference,payment_type,product_id,plan_id,credit_pack_id,amount_minor,currency,status,provider_transaction_id,provider_subscription_id,metadata,fulfilled_at")
  .eq("reference",reference).maybeSingle();
 if(already.error)throw already.error;
 if(already.data)return already.data;
 const user=await db.from("tp_users").select("id,email").eq("email",email).maybeSingle();
 if(user.error)throw user.error;
 if(!user.data)return null;
 const active=await db.from("tp_subscriptions").select("id,user_id,plan_id,gateway,status,current_period_start,current_period_end,provider_plan_id")
  .eq("user_id",user.data.id).eq("gateway",gateway).eq("status","active").gt("current_period_end",new Date().toISOString())
  .order("current_period_end",{ascending:false}).limit(3);
 if(active.error)throw active.error;
 const incomingPlan=gateway==="paystack"
  ?String(data&&data.plan&&(data.plan.plan_code||data.plan.code||data.plan)||data&&data.plan_code||"")
  :String(data&&data.payment_plan||data&&data.plan_id||data&&data.plan&&data.plan.id||"");
 for(const sub of active.data||[]){
  if(incomingPlan&&String(sub.provider_plan_id||"")!==incomingPlan)continue;
  const plan=await db.from("tp_subscription_plans").select("id,price_minor,currency,active").eq("id",sub.plan_id).maybeSingle();
  if(plan.error)throw plan.error;
  if(!plan.data)continue;
  const amountMatches=gateway==="paystack"
   ?Number(data.amount)===Number(plan.data.price_minor)&&String(data.currency||"").toUpperCase()===plan.data.currency
   :Number(data.amount)+0.01>=currencyMajor(plan.data.price_minor)&&String(data.currency||"").toUpperCase()===plan.data.currency;
  if(!amountMatches)continue;
  const inserted=await db.from("tp_payments").insert({
   user_id:user.data.id,gateway,reference,payment_type:"membership",plan_id:plan.data.id,
   amount_minor:plan.data.price_minor,currency:plan.data.currency,status:"pending",
   provider_transaction_id:String(data.id||""),provider_subscription_id:String(data.subscription_id||""),
   metadata:{recurringRenewal:true,providerEvent:cleanProviderText(eventName,80)}
  }).select("id,user_id,gateway,reference,payment_type,product_id,plan_id,credit_pack_id,amount_minor,currency,status,provider_transaction_id,provider_subscription_id,metadata,fulfilled_at").single();
  if(inserted.error){
   if(inserted.error.code==="23505"){
    const duplicate=await db.from("tp_payments").select("id,user_id,gateway,reference,payment_type,product_id,plan_id,credit_pack_id,amount_minor,currency,status,provider_transaction_id,provider_subscription_id,metadata,fulfilled_at").eq("reference",reference).maybeSingle();
    if(!duplicate.error&&duplicate.data)return duplicate.data;
   }
   throw inserted.error;
  }
  return inserted.data;
 }
 return null;
}
async function handlePaymentWebhook(gateway,event){
 if(!db)throw new Error("DATABASE_NOT_CONFIGURED");
 const eventName=String(event&&event.event||event&&event.type||"");
 const data=event&&event.data||{};
 if(gateway==="paystack"&&["subscription.create","subscription.not_renew","subscription.disable"].includes(eventName)){
  const email=normalizeEmail(data.customer&&data.customer.email||data.customer_email||data.email||"");
  const planCode=String(data.plan&&(data.plan.plan_code||data.plan.code||data.plan)||data.plan_code||"");
  if(isValidEmail(email)&&planCode){
   const u=await db.from("tp_users").select("id").eq("email",email).maybeSingle();
   if(u.error)throw u.error;
   if(u.data){
    const patch={updated_at:new Date().toISOString()};
    if(eventName==="subscription.create"){
     patch.provider_subscription_id=String(data.subscription_code||data.subscription&&data.subscription.subscription_code||"");
     patch.provider_email_token=String(data.email_token||data.subscription&&data.subscription.email_token||"");
    }else patch.cancel_at_period_end=true;
    const update=await db.from("tp_subscriptions").update(patch).eq("user_id",u.data.id).eq("gateway","paystack").eq("provider_plan_id",planCode).eq("status","active");
    if(update.error)throw update.error;
   }
  }
  return {status:"event_processed"};
 }
 if(gateway==="flutterwave"&&eventName==="subscription.cancelled"){
  const email=normalizeEmail(data.customer&&data.customer.email||"");
  const planId=String(data.plan&&data.plan.id||"");
  if(isValidEmail(email)&&planId){
   const u=await db.from("tp_users").select("id").eq("email",email).maybeSingle();
   if(u.error)throw u.error;
   if(u.data){
    const update=await db.from("tp_subscriptions").update({cancel_at_period_end:true,updated_at:new Date().toISOString()})
      .eq("user_id",u.data.id).eq("gateway","flutterwave").eq("provider_plan_id",planId).eq("status","active");
    if(update.error)throw update.error;
   }
  }
  return {status:"event_processed"};
 }
 if(gateway==="paystack"&&eventName!=="charge.success")return {status:"ignored"};
 if(gateway==="flutterwave"&&eventName!=="charge.completed")return {status:"ignored"};
 const reference=String(gateway==="paystack"?(data.reference||""):(data.tx_ref||"")).trim();
 if(reference.length<8)return {status:"ignored"};
 const found=await db.from("tp_payments").select("id,user_id,gateway,reference,payment_type,product_id,plan_id,credit_pack_id,amount_minor,currency,status,provider_transaction_id,provider_subscription_id,metadata,fulfilled_at")
   .eq("reference",reference).maybeSingle();
 if(found.error)throw found.error;
 let payment=found.data;
 if(!payment)payment=await recurringPaymentFromEvent(gateway,data,eventName);
 if(!payment)return {status:"unmatched"};
 if(payment.gateway!==gateway)return {status:"gateway_mismatch"};
 const verified=await verifyGatewayPayment(payment,String(data.id||""));
 return await fulfillVerifiedPayment(payment,verified);
}


app.get("/api/commerce/catalog",asyncRoute(async(_q,r)=>{
 if(!db)return errorJson(r,503,"COMMERCE_NOT_CONFIGURED","The product catalogue is not configured yet.");
 const [products,plans,packs]=await Promise.all([
  db.from("tp_products").select(publicProductFields).eq("active",true).eq("visible_publicly",true).order("created_at",{ascending:false}).limit(100),
  db.from("tp_subscription_plans").select(publicPlanFields).eq("active",true).order("sort_order",{ascending:true}).limit(50),
  db.from("tp_credit_packs").select("id,slug,name,description,credits,price_minor,currency").eq("active",true).order("price_minor",{ascending:true}).limit(50)
 ]);
 if(products.error||plans.error||packs.error){logFailure("commerce-catalog",products.error||plans.error||packs.error);return errorJson(r,503,"CATALOG_UNAVAILABLE","The product catalogue could not be loaded.");}
 r.json({ok:true,paymentMode:paymentMode(),products:(products.data||[]).map(publicProduct),plans:(plans.data||[]).map(publicPlan),
  creditPacks:(packs.data||[]).map(p=>({id:p.id,slug:p.slug,name:p.name,description:p.description,credits:p.credits,priceMinor:Number(p.price_minor),currency:p.currency})),
  gateways:{paystack:paymentReady("paystack"),flutterwave:paymentReady("flutterwave")}});
}));
app.get("/api/commerce/overview",authenticated,asyncRoute(async(q,r)=>{
 if(!db)return errorJson(r,503,"COMMERCE_NOT_CONFIGURED","Billing and usage records are not configured yet.");
 try{
  const [sub,balance,ledger,payments,licenses,deployments,catalog]=await Promise.all([
   currentSubscription(q.user.id),
   db.rpc("tp_credit_balance",{p_user_id:q.user.id}),
   db.from("tp_credit_ledger").select("id,amount,entry_type,description,idempotency_key,payment_id,created_at").eq("user_id",q.user.id).order("created_at",{ascending:false}).limit(50),
   db.from("tp_payments").select("id,gateway,reference,payment_type,amount_minor,currency,status,created_at,fulfilled_at,product_id,plan_id,credit_pack_id").eq("user_id",q.user.id).order("created_at",{ascending:false}).limit(30),
   db.from("tp_tool_licenses").select("id,license_key,status,deployment_mode,delivery_status,source_code_url,delivery_notes,included_setup_hours,purchased_at,updated_at,product_id,tp_products(name,slug,description)").eq("user_id",q.user.id).order("purchased_at",{ascending:false}).limit(50),
   db.from("tp_deployments").select("id,license_id,hosting_provider,deployment_url,status,notes,created_at,updated_at").eq("user_id",q.user.id).order("updated_at",{ascending:false}).limit(50),
   db.from("tp_products").select(publicProductFields).eq("active",true).eq("visible_publicly",true).order("created_at",{ascending:false}).limit(100)
  ]);
  const failure=[ledger,payments,licenses,deployments,catalog].find(x=>x.error);
  if(failure||balance.error){logFailure("commerce-overview",failure&&failure.error||balance.error);return errorJson(r,503,"COMMERCE_OVERVIEW_UNAVAILABLE","Your billing dashboard could not be loaded.");}
  const subEnd=sub&&sub.current_period_end;
  const memberActive=Boolean(subEnd&&new Date(subEnd).getTime()>Date.now()&&["active","past_due","cancelled"].includes(sub.status));
  r.json({ok:true,user:{id:q.user.id,email:q.user.email,fullName:q.user.full_name},subscription:sub?{id:sub.id,status:sub.status,gateway:sub.gateway,currentPeriodStart:sub.current_period_start,currentPeriodEnd:sub.current_period_end,cancelAtPeriodEnd:sub.cancel_at_period_end,plan:sub.tp_subscription_plans||null}:null,
   membershipActive:memberActive,credits:Number(balance.data||0),ledger:ledger.data||[],payments:(payments.data||[]).map(p=>({...p,amount_minor:Number(p.amount_minor)})),
   licenses:(licenses.data||[]).map(l=>({...l,product:l.tp_products||null})),deployments:deployments.data||[],
   products:(catalog.data||[]).map(publicProduct),gateways:{paystack:paymentReady("paystack"),flutterwave:paymentReady("flutterwave"),mode:paymentMode()}});
 }catch(e){logFailure("commerce-overview",e);errorJson(r,503,"COMMERCE_OVERVIEW_UNAVAILABLE","Your billing dashboard could not be loaded.");}
}));
app.post("/api/commerce/checkout",csrf,authLimit,authenticated,asyncRoute(async(q,r)=>{
 if(!db)return errorJson(r,503,"COMMERCE_NOT_CONFIGURED","Checkout is not configured yet.");
 const body=q.body||{},gateway=String(body.gateway||""),type=String(body.type||"");
 if(!["paystack","flutterwave"].includes(gateway))return errorJson(r,400,"INVALID_PAYMENT_GATEWAY","Choose Paystack or Flutterwave.");
 if(!paymentReady(gateway))return errorJson(r,503,"PAYMENT_GATEWAY_NOT_CONFIGURED","This payment option is not configured for the current test/live mode. Add its secret key in Render Environment.");
 if(!paymentTypeValues.includes(type))return errorJson(r,400,"INVALID_PURCHASE_TYPE","Choose a membership, credit pack or tool licence.");
 try{
  let amountMinor=0,currency="NGN",planId=null,productId=null,packId=null,planRow=null,productRow=null,packRow=null,discountPercent=0;
  const subscription=await currentSubscription(q.user.id);
  if(type==="membership"){
   if(subscription)return errorJson(r,409,"ACTIVE_MEMBERSHIP","You already have a current membership. Your current provider subscription will renew automatically unless cancelled.");
   const slug=cleanText(body.planSlug,80);
   const result=await db.from("tp_subscription_plans").select("id,slug,name,description,price_minor,currency,monthly_credits,member_discount_percent,paystack_plan_code,flutterwave_payment_plan_id,active").eq("slug",slug).eq("active",true).maybeSingle();
   if(result.error)throw result.error;
   planRow=result.data;
   if(!planRow)return errorJson(r,404,"PLAN_NOT_FOUND","That membership plan is not currently available.");
   if(gateway==="paystack"&&!planRow.paystack_plan_code)return errorJson(r,409,"SUBSCRIPTION_GATEWAY_PLAN_MISSING","The administrator must sync this monthly plan with Paystack before it can be purchased.");
   if(gateway==="flutterwave"&&!planRow.flutterwave_payment_plan_id)return errorJson(r,409,"SUBSCRIPTION_GATEWAY_PLAN_MISSING","The administrator must sync this monthly plan with Flutterwave before it can be purchased.");
   planId=planRow.id;amountMinor=Number(planRow.price_minor);currency=planRow.currency;
  }else if(type==="credit_topup"){
   const slug=cleanText(body.packSlug,80);
   const result=await db.from("tp_credit_packs").select("id,slug,name,credits,price_minor,currency,active").eq("slug",slug).eq("active",true).maybeSingle();
   if(result.error)throw result.error;
   packRow=result.data;
   if(!packRow)return errorJson(r,404,"CREDIT_PACK_NOT_FOUND","That credit pack is not currently available.");
   packId=packRow.id;amountMinor=Number(packRow.price_minor);currency=packRow.currency;
  }else{
   const slug=cleanText(body.productSlug,80);
   const result=await db.from("tp_products").select("id,slug,name,price_minor,currency,active,visible_publicly,self_hosted_enabled,member_discount_percent").eq("slug",slug).eq("active",true).eq("visible_publicly",true).maybeSingle();
   if(result.error)throw result.error;
   productRow=result.data;
   if(!productRow||!productRow.self_hosted_enabled)return errorJson(r,404,"LICENSE_NOT_AVAILABLE","That product is not currently offered as a self-hosted licence.");
   productId=productRow.id;amountMinor=Number(productRow.price_minor);currency=productRow.currency;
   if(subscription&&subscription.tp_subscription_plans)discountPercent=Math.max(Number(productRow.member_discount_percent||0),Number(subscription.tp_subscription_plans.member_discount_percent||0));
   amountMinor=Math.round(amountMinor*(100-discountPercent)/100);
  }
  if(amountMinor<1||currency!=="NGN")return errorJson(r,409,"PRICE_NOT_CONFIGURED","This item needs a valid NGN price before checkout can start.");
  const reference=newPaymentReference(gateway);
  const metadata={paymentMode:paymentMode(),discountPercent,regularAmountMinor:type==="tool_license"?Number(productRow.price_minor):amountMinor,
   ...(type==="membership"?{planSlug:planRow.slug,monthlyCredits:planRow.monthly_credits}:{})};
  const inserted=await db.from("tp_payments").insert({user_id:q.user.id,gateway,reference,payment_type:type,product_id:productId,plan_id:planId,credit_pack_id:packId,amount_minor:amountMinor,currency,status:"pending",metadata}).select("id,user_id,gateway,reference,payment_type,product_id,plan_id,credit_pack_id,amount_minor,currency,status,metadata").single();
  if(inserted.error)throw inserted.error;
  let checkoutUrl="";
  try{
   const base=baseUrl().replace(/\/+$/,"");
   if(gateway==="paystack"){
    const payload={email:q.user.email,amount:amountMinor,currency,reference,callback_url:base+"/dashboard/?gateway=paystack",metadata:{
     payment_id:inserted.data.id,payment_type:type,teampeach_reference:reference
    }};
    if(type==="membership")payload.plan=planRow.paystack_plan_code;
    const response=await gatewayRequest(gateway,"https://api.paystack.co/transaction/initialize","POST",payload);
    checkoutUrl=String(response.data&&response.data.authorization_url||"");
   }else{
    const payload={tx_ref:reference,amount:currencyMajor(amountMinor),currency,redirect_url:base+"/dashboard/?gateway=flutterwave",
     customer:{email:q.user.email,name:q.user.full_name},
     customizations:{title:"TeamPeach",description:type==="membership"?"Monthly membership":type==="credit_topup"?"Usage credits":"Tool licence"},
     meta:{payment_id:inserted.data.id,payment_type:type,teampeach_reference:reference}};
    if(type==="membership")payload.payment_plan=Number(planRow.flutterwave_payment_plan_id);
    const response=await gatewayRequest(gateway,"https://api.flutterwave.com/v3/payments","POST",payload);
    checkoutUrl=String(response.data&&response.data.link||"");
   }
   if(!/^https:\/\//i.test(checkoutUrl))throw new Error("CHECKOUT_URL_MISSING");
  }catch(e){
   logFailure("payment-checkout-provider",e);
   await db.from("tp_payments").update({status:"failed",updated_at:new Date().toISOString()}).eq("id",inserted.data.id).eq("status","pending");
   return errorJson(r,502,"CHECKOUT_INITIALIZATION_FAILED","The payment provider could not start checkout. Try the other gateway or contact support.");
  }
  r.status(201).json({ok:true,reference,checkoutUrl,gateway,type,amountMinor,currency,discountPercent,
   message:"Checkout is ready. Your account will be updated only after the payment is verified."});
 }catch(e){logFailure("payment-checkout",e);errorJson(r,503,"CHECKOUT_UNAVAILABLE","Checkout could not be prepared. Please try again.");}
}));
app.post("/api/commerce/verify-payment",csrf,authLimit,authenticated,asyncRoute(async(q,r)=>{
 if(!db)return errorJson(r,503,"COMMERCE_NOT_CONFIGURED","Payment verification is unavailable.");
 const reference=String(q.body&&q.body.reference||"").trim(),transactionId=String(q.body&&q.body.transactionId||"").trim();
 if(reference.length<8||reference.length>120)return errorJson(r,400,"INVALID_PAYMENT_REFERENCE","This payment reference is invalid.");
 try{
  const result=await db.from("tp_payments").select("id,user_id,gateway,reference,payment_type,product_id,plan_id,credit_pack_id,amount_minor,currency,status,provider_transaction_id,provider_subscription_id,metadata,fulfilled_at")
    .eq("reference",reference).eq("user_id",q.user.id).maybeSingle();
  if(result.error)throw result.error;
  const payment=result.data;
  if(!payment)return errorJson(r,404,"PAYMENT_NOT_FOUND","We could not find this payment for your account.");
  if(payment.status==="paid"&&payment.fulfilled_at)return r.json({ok:true,alreadyFulfilled:true,reference,message:"Payment already verified; your account is up to date."});
  const verified=await verifyGatewayPayment(payment,transactionId);
  const completed=await fulfillVerifiedPayment(payment,verified);
  r.json({ok:true,reference,fulfilled:true,paymentType:payment.payment_type,result:completed,message:"Payment verified. Your account has been updated."});
 }catch(e){
  logFailure("payment-verify",e);
  if(["PAYMENT_NOT_SUCCESSFUL","PAYMENT_AMOUNT_MISMATCH","PAYMENT_CUSTOMER_MISMATCH","FLUTTERWAVE_TRANSACTION_ID_REQUIRED"].includes(e.message))
   return errorJson(r,400,e.message,"The provider has not confirmed a matching successful payment yet. Refresh after a successful checkout.");
  if(e.message==="PAYMENT_GATEWAY_NOT_CONFIGURED")return errorJson(r,503,e.message,"Payment verification is not configured in the server environment.");
  errorJson(r,503,"PAYMENT_VERIFICATION_UNAVAILABLE","We could not verify this payment right now. Refresh and try again; no credits or licence will be granted until verification succeeds.");
 }
}));
app.post("/api/payments/webhooks/paystack",asyncRoute(async(q,r)=>{
 const secret=paymentSecret("paystack");
 if(!db||!secret)return r.status(503).json({error:"WEBHOOK_NOT_CONFIGURED"});
 const signature=String(q.get("x-paystack-signature")||"");
 const expected=crypto.createHmac("sha512",secret).update(q.rawBody||Buffer.from(JSON.stringify(q.body||{}))).digest("hex");
 if(!safeEqualText(signature,expected))return r.status(401).end();
 try{await handlePaymentWebhook("paystack",q.body||{});r.status(200).send("ok");}
 catch(e){logFailure("paystack-webhook",e);r.status(500).send("retry");}
}));
app.post("/api/payments/webhooks/flutterwave",asyncRoute(async(q,r)=>{
 const secret=paymentSecret("flutterwave"),secretHash=String(process.env.FLW_SECRET_HASH||process.env.FLW_WEBHOOK_SECRET_HASH||"").trim();
 if(!db||!secret||!secretHash)return r.status(503).json({error:"WEBHOOK_NOT_CONFIGURED"});
 const oldSignature=String(q.get("verif-hash")||"");
 const newSignature=String(q.get("flutterwave-signature")||"");
 const expectedV4=crypto.createHmac("sha256",secretHash).update(q.rawBody||Buffer.from(JSON.stringify(q.body||{}))).digest("base64");
 if(!(safeEqualText(oldSignature,secretHash)||safeEqualText(newSignature,expectedV4)))return r.status(401).end();
 try{await handlePaymentWebhook("flutterwave",q.body||{});r.status(200).send("ok");}
 catch(e){logFailure("flutterwave-webhook",e);r.status(500).send("retry");}
}));
app.post("/api/commerce/tool-runs",csrf,authLimit,authenticated,asyncRoute(async(q,r)=>{
 if(!db)return errorJson(r,503,"COMMERCE_NOT_CONFIGURED","Tool usage is not configured yet.");
 const productSlug=cleanText(q.body&&q.body.productSlug,80);
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug))return errorJson(r,400,"INVALID_PRODUCT","Choose a valid tool.");
 const reference="RUN"+Date.now().toString(36).toUpperCase()+crypto.randomBytes(10).toString("hex").toUpperCase();
 const saved=await db.rpc("tp_start_tool_run",{p_user_id:q.user.id,p_product_slug:productSlug,p_run_reference:reference,p_metadata:{requestedAt:new Date().toISOString()}});
 if(saved.error){logFailure("tool-run-start",saved.error);return errorJson(r,503,"TOOL_RUN_UNAVAILABLE","This tool could not start. Please retry.");}
 const data=saved.data||{};
 if(data.status==="membership_required")return errorJson(r,402,"MEMBERSHIP_REQUIRED","A current membership is required to run hosted tools. Choose a plan from your dashboard.");
 if(data.status==="insufficient_credits")return r.status(402).json({error:"INSUFFICIENT_CREDITS",message:"You do not have enough credits for this run. Add credits or choose a plan with a larger allowance.",balance:Number(data.balance||0)});
 if(data.status==="tool_unavailable")return errorJson(r,404,"TOOL_NOT_AVAILABLE","This hosted tool is not enabled yet. Check the product catalogue or contact support.");
 if(data.status!=="ok")return errorJson(r,400,"TOOL_RUN_REJECTED","This tool run could not be authorised.");
 r.status(201).json({ok:true,runId:data.run_id,reference,creditsCharged:data.credits_charged,creditsRemaining:data.balance});
}));

app.get("/api/admin/email/stats",authenticated,isAdmin,asyncRoute(async(_q,r)=>{const a=await db.from("tp_users").select("id",{count:"exact",head:true}).eq("marketing_opt_in",true),b=await db.from("tp_email_usage").select("id",{count:"exact",head:true}).eq("status","sent").gte("sent_at",new Date(new Date().setUTCHours(0,0,0,0)).toISOString());if(a.error||b.error){logFailure("admin-stats",a.error||b.error);return errorJson(r,503,"STATS_FAILED","Email statistics are unavailable.");}r.json({ok:true,optedInRecipients:a.count||0,sentToday:b.count||0,dailySoftLimit:DAILY_LIMIT});}));
app.get("/api/admin/email/jobs",authenticated,isAdmin,asyncRoute(async(_q,r)=>{const d=await db.from("tp_email_jobs").select("id,mode,subject,status,total_count,success_count,fail_count,created_at,completed_at").order("created_at",{ascending:false}).limit(20);if(d.error){logFailure("admin-jobs",d.error);return errorJson(r,503,"JOBS_FAILED","Email history unavailable.");}r.json({ok:true,jobs:d.data||[]});}));
app.get("/api/admin/projects",authenticated,isAdmin,asyncRoute(async(_q,r)=>{const d=await db.from("tp_project_requests").select("id,full_name,email,project_type,details,status,created_at").order("created_at",{ascending:false}).limit(50);if(d.error){logFailure("admin-projects",d.error);return errorJson(r,503,"PROJECTS_FAILED","Project inquiries unavailable.");}r.json({ok:true,projects:d.data||[]});}));
app.post("/api/admin/email",csrf,authLimit,authenticated,isAdmin,asyncRoute(async(q,r)=>{if(!backendReady(r,true))return;const mode=cleanText(q.body&&q.body.mode,20),subject=cleanText(q.body&&q.body.subject,150),body=cleanText(q.body&&q.body.bodyText,15000);if(!["single","broadcast"].includes(mode))return errorJson(r,400,"INVALID_MODE","Choose one person or an opted-in broadcast.");if(subject.length<3||body.length<5)return errorJson(r,400,"INVALID_MESSAGE","Add an email subject and a message of at least five characters.");if(mode==="broadcast"&&!q.body.confirmBroadcast)return errorJson(r,400,"BROADCAST_NOT_CONFIRMED","Confirm that this message is intended for users who opted in.");try{let recipients;if(mode==="single"){const email=normalizeEmail(q.body.email);if(!isValidEmail(email))return errorJson(r,400,"INVALID_EMAIL","Enter a valid recipient address.");recipients=[{email,name:cleanText(q.body.name,100)||email}];}else{const d=await db.from("tp_users").select("email,full_name").eq("marketing_opt_in",true).order("created_at",{ascending:true}).limit(10000);if(d.error)throw d.error;recipients=(d.data||[]).map(u=>({email:u.email,name:u.full_name}));if(!recipients.length)return errorJson(r,400,"NO_SUBSCRIBERS","No users have opted into product/news emails.");if(recipients.length>CAMPAIGN_DAILY_LIMIT)return errorJson(r,400,"BROADCAST_EXCEEDS_DAILY_CAP","This opted-in audience exceeds the current campaign allowance of "+CAMPAIGN_DAILY_LIMIT+" recipients. Reduce the audience or review the configured daily cap before queueing.");}const j=await queueJob(q.user.id,mode,subject,body,recipients);if(!j||j.status!=="queued")return errorJson(r,400,"EMAIL_NOT_QUEUED","No email job was queued.");runEmailQueue();r.status(202).json({ok:true,jobId:j.job_id,queuedCount:j.count,message:mode==="broadcast"?"Queued for opted-in users; unsubscribe links will be included.":"Queued for delivery."});}catch(e){logFailure("email-enqueue",e);errorJson(r,503,"EMAIL_QUEUE_FAILED","The email job could not be queued.");}}));
app.post("/api/unsubscribe",csrf,asyncRoute(async(q,r)=>{
 if(!db)return errorJson(r,503,"DATABASE_NOT_CONFIGURED","Email preferences are temporarily unavailable.");
 const email=normalizeEmail(q.body&&q.body.email),sig=String(q.body&&q.body.sig||"");
 if(!isValidEmail(email)||!/^[a-f0-9]{64}$/i.test(sig))return errorJson(r,400,"INVALID_UNSUBSCRIBE_LINK","This unsubscribe link is invalid or incomplete.");
 let expected;
 try{expected=unsubscribeSignature(email);}catch(error){logFailure("unsubscribe-config",error);return errorJson(r,503,"UNSUBSCRIBE_NOT_CONFIGURED","Email preferences are temporarily unavailable.");}
 if(!safeStringEqual(sig,expected))return errorJson(r,400,"INVALID_UNSUBSCRIBE_LINK","This unsubscribe link is invalid or incomplete.");
 try{
  const now=new Date().toISOString();
  const updated=await db.from("tp_users").update({marketing_opt_in:false,marketing_opt_in_at:null,marketing_opt_out_at:now,updated_at:now}).eq("email",email);
  if(updated.error)throw updated.error;
  r.json({ok:true,message:"You have been unsubscribed from optional product/news email. Account and security messages are unaffected."});
 }catch(error){logFailure("unsubscribe",error);errorJson(r,503,"UNSUBSCRIBE_FAILED","Your email preference could not be updated. Please try again.");}
}));
app.use((q,r,n)=>{if(!["GET","HEAD"].includes(q.method)||!/\.html$/i.test(q.path))return n();let t=/\/index\.html$/i.test(q.path)?(q.path.slice(0,-10)||"/"):q.path.slice(0,-5);if(!t.startsWith("/"))t="/"+t;if(t!=="/"&&!t.endsWith("/"))t+="/";r.redirect(301,t+(q.url.includes("?")?q.url.slice(q.url.indexOf("?")):""));});
app.use(express.static(PUBLIC_DIR,{index:"index.html",extensions:["html"],setHeaders(res,file){res.setHeader("Cache-Control",/\.html$/i.test(file)?"no-cache":"public, max-age=3600");}}));
app.use((q,r,n)=>q.path.startsWith("/api/")?errorJson(r,404,"API_ROUTE_NOT_FOUND","This API route does not exist."):n());
app.use((_q,r)=>r.status(404).sendFile(path.join(PUBLIC_DIR,"404.html")));
app.use((e,q,r,_n)=>{const s=e&&e.status===413?413:500;logFailure("request",e);if(q.path.startsWith("/api/"))return errorJson(r,s,s===413?"REQUEST_TOO_LARGE":"INTERNAL_ERROR",s===413?"That request is too large.":"Something went wrong.");r.status(s).sendFile(path.join(PUBLIC_DIR,"404.html"));});
if(db){setTimeout(()=>{cleanup();runEmailQueue();},1500);setInterval(()=>{cleanup();runEmailQueue();},6*60*60*1000).unref();setInterval(runEmailQueue,60000).unref();}
const port=Number(process.env.PORT||3000);if(require.main===module)app.listen(port,"0.0.0.0",()=>console.log("TeamPeach server listening on "+port+". Secrets are read only from environment variables."));
module.exports={app,runEmailQueue};