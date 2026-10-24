"use strict";
const crypto=require("node:crypto"),{promisify}=require("node:util"),scryptAsync=promisify(crypto.scrypt);
function normalizeEmail(v){return String(v||"").trim().toLowerCase();}
function isValidEmail(v){const e=normalizeEmail(v);return e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);}
function cleanText(v,n){return String(v||"").trim().slice(0,n);}
function htmlEscape(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function otpHash(email,code,pepper,purpose){if(!pepper||pepper.length<32)throw new Error("OTP_PEPPER must contain at least 32 characters.");return crypto.createHmac("sha256",pepper).update(String(purpose||"registration")+":"+normalizeEmail(email)+":"+String(code)).digest("hex");}
function safeStringEqual(a,b){const x=Buffer.from(String(a||""));const y=Buffer.from(String(b||""));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
async function hashPassword(password){const value=String(password||"");if(value.length<12||value.length>128)throw new Error("Password must be between 12 and 128 characters.");const salt=crypto.randomBytes(16),N=16384,r=8,p=1;const hash=await scryptAsync(value,salt,64,{N,r,p,maxmem:64*1024*1024});return["scrypt",N,r,p,salt.toString("hex"),Buffer.from(hash).toString("hex")].join("$");}
async function verifyPassword(password,stored){try{const a=String(stored||"").split("$");if(a.length!==6||a[0]!=="scrypt"||a[1]!=="16384"||a[2]!=="8"||a[3]!=="1")return false;const salt=Buffer.from(a[4],"hex"),expected=Buffer.from(a[5],"hex");if(salt.length!==16||expected.length!==64)return false;const actual=Buffer.from(await scryptAsync(String(password||""),salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}));return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}catch(_){return false;}}
function generateOtp(){return String(crypto.randomInt(0,1000000)).padStart(6,"0");}
function hashSessionToken(token,secret){const key=String(secret||"");if(key.length>=32)return crypto.createHmac("sha256",key).update(String(token||"")).digest("hex");return crypto.createHash("sha256").update(String(token||"")).digest("hex");}
function adminEmailsFromEnv(v){return String(v||"").split(",").map(normalizeEmail).filter(isValidEmail);}
function normalizePersonName(v){return cleanText(v,100).replace(/\s+/g," ");}
module.exports={normalizeEmail,isValidEmail,cleanText,htmlEscape,otpHash,safeStringEqual,hashPassword,verifyPassword,generateOtp,hashSessionToken,adminEmailsFromEnv,normalizePersonName};