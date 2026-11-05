(function(){
"use strict";
const script=document.currentScript;if(!script)return;
const assistantId=String(script.getAttribute("data-assistant-id")||"").trim();
const mode=script.getAttribute("data-mode")==="preview"?"preview":"public";
const openOnLoad=script.getAttribute("data-open-on-load")==="1";
if(!assistantId)return;
const apiBase=new URL(script.src,location.href).origin;
const storageKey="teampeach.chatbot."+mode+"."+assistantId,visitorKeyName=storageKey+".visitor";
const root=document.createElement("div");root.setAttribute("data-teampeach-chatbot","true");(document.body||document.documentElement).appendChild(root);
const shadow=root.attachShadow?root.attachShadow({mode:"open"}):root;
const style=document.createElement("style");
style.textContent=":host{all:initial}*{box-sizing:border-box}.tp-launch{position:fixed;right:22px;bottom:22px;z-index:2147483000;width:60px;height:60px;border:0;border-radius:50%;background:var(--tp-chat-color,#253047);color:#fff;box-shadow:0 12px 35px #18203340;display:grid;place-items:center;font:600 25px/1 system-ui,sans-serif;cursor:pointer}.tp-launch:focus-visible,.tp-send:focus-visible,.tp-input:focus-visible,.tp-action:focus-visible{outline:3px solid #f0a17f;outline-offset:3px}.tp-panel{position:fixed;right:22px;bottom:94px;z-index:2147483000;width:min(380px,calc(100vw - 28px));height:min(570px,calc(100dvh - 125px));min-height:340px;display:none;flex-direction:column;overflow:hidden;border:1px solid #dfe3e9;border-radius:19px;background:#fff;color:#222b3b;box-shadow:0 22px 70px #17203335;font:14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,\\\"Segoe UI\\\",sans-serif}.tp-panel.tp-open{display:flex}.tp-header{display:flex;align-items:center;gap:11px;padding:15px;background:var(--tp-chat-color,#253047);color:#fff}.tp-avatar{display:grid;place-items:center;width:38px;height:38px;flex:0 0 auto;border-radius:12px;background:#ffffff24;font-size:19px}.tp-headcopy{min-width:0;flex:1}.tp-title{font-size:14px;font-weight:750;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tp-subtitle{font-size:11px;opacity:.78;margin-top:2px}.tp-action{border:0;background:transparent;color:#fff;border-radius:8px;padding:7px;font-size:18px;cursor:pointer}.tp-stream{flex:1;min-height:0;overflow:auto;padding:15px;background:#f7f8fa;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}.tp-bubble{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.tp-bubble.tp-assistant{align-self:flex-start;border:1px solid #e8ebef;background:#fff;color:#283246;border-bottom-left-radius:5px}.tp-bubble.tp-user{align-self:flex-end;background:var(--tp-chat-color,#253047);color:#fff;border-bottom-right-radius:5px}.tp-error{padding:10px 12px;border:1px solid #f2d6c9;border-radius:11px;background:#fff7f2;color:#96523e;font-size:12px}.tp-typing{display:flex;gap:4px;align-items:center;padding:12px;width:58px}.tp-typing i{width:6px;height:6px;border-radius:50%;background:#8d96a4;animation:tp-pulse 1s infinite alternate}.tp-typing i:nth-child(2){animation-delay:.2s}.tp-typing i:nth-child(3){animation-delay:.4s}@keyframes tp-pulse{to{opacity:.25;transform:translateY(-3px)}}.tp-form{display:flex;align-items:flex-end;gap:8px;padding:11px;border-top:1px solid #e9ebef;background:#fff}.tp-input{flex:1;min-width:0;max-height:100px;min-height:43px;resize:none;border:1px solid #dfe3e8;border-radius:12px;padding:11px 12px;color:#202b3b;background:#fff;font:13px/1.4 system-ui,sans-serif;outline:none}.tp-send{width:43px;height:43px;flex:0 0 auto;border:0;border-radius:12px;background:var(--tp-chat-color,#253047);color:#fff;font-size:17px;font-weight:800;cursor:pointer}.tp-send:disabled{opacity:.5;cursor:wait}.tp-footer{padding:6px 10px;text-align:center;background:#fff;color:#9098a5;font-size:10px}.tp-footer a{color:inherit;text-decoration:none;font-weight:750}.tp-footer a:hover{text-decoration:underline}@media(max-width:560px){.tp-launch{right:16px;bottom:16px;width:56px;height:56px}.tp-panel{right:8px;bottom:82px;width:calc(100vw - 16px);height:min(72dvh,600px);min-height:310px;border-radius:17px}}@media(prefers-reduced-motion:reduce){.tp-stream{scroll-behavior:auto}.tp-typing i{animation:none}}";
style.textContent+=".tp-rich p{margin:0}.tp-rich p+p{margin-top:7px}.tp-rich h4,.tp-rich h5,.tp-rich h6{margin:3px 0 0;color:#243147;font-size:13px;font-weight:800;line-height:1.4}.tp-rich ul,.tp-rich ol{margin:1px 0;padding-left:20px}.tp-rich li{padding-left:2px;margin:2px 0}.tp-rich strong{font-weight:800;color:#202b3d}.tp-rich a{color:#2566a8;text-decoration:underline;text-underline-offset:2px}.tp-rich code{padding:1px 4px;border-radius:4px;background:#eef1f5;color:#334155;font:12px/1.4 ui-monospace,monospace}.tp-rich blockquote{margin:2px 0;padding:4px 9px;border-left:3px solid #d8a087;color:#687487}.tp-rich hr{width:100%;border:0;border-top:1px solid #e3e7ec}";
shadow.appendChild(style);
const launch=document.createElement("button");launch.className="tp-launch";launch.type="button";launch.setAttribute("aria-label","Open chat assistant");launch.setAttribute("aria-expanded","false");launch.textContent="✦";
const panel=document.createElement("section");panel.className="tp-panel";panel.setAttribute("role","dialog");panel.setAttribute("aria-label","Business assistant chat");panel.setAttribute("aria-modal","false");
const header=document.createElement("header");header.className="tp-header";
const avatar=document.createElement("div");avatar.className="tp-avatar";avatar.textContent="✦";
const headcopy=document.createElement("div");headcopy.className="tp-headcopy";
const title=document.createElement("div");title.className="tp-title";title.textContent="Business Assistant";
const subtitle=document.createElement("div");subtitle.className="tp-subtitle";subtitle.textContent="Ask us a question";headcopy.append(title,subtitle);
const newChat=document.createElement("button");newChat.className="tp-action";newChat.type="button";newChat.textContent="↻";newChat.title="Start a new chat";newChat.setAttribute("aria-label","Start a new chat");
const close=document.createElement("button");close.className="tp-action";close.type="button";close.textContent="×";close.title="Close chat";close.setAttribute("aria-label","Close chat");
header.append(avatar,headcopy,newChat,close);
const stream=document.createElement("div");stream.className="tp-stream";stream.setAttribute("aria-live","polite");stream.setAttribute("aria-relevant","additions text");
const form=document.createElement("form");form.className="tp-form";
const input=document.createElement("textarea");input.className="tp-input";input.rows=1;input.maxLength=2000;input.placeholder="Type your message…";input.setAttribute("aria-label","Your message");
const send=document.createElement("button");send.className="tp-send";send.type="submit";send.textContent="➤";send.setAttribute("aria-label","Send message");form.append(input,send);
const footer=document.createElement("div");footer.className="tp-footer";panel.append(header,stream,form,footer);shadow.append(launch,panel);
let config=null,loading=false,csrfToken="",history=[],visitorKey="",welcomeShown=false;
function uuid(){if(window.crypto&&typeof window.crypto.randomUUID==="function")return window.crypto.randomUUID();return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==="x"?r:(r&3|8)).toString(16);});}
function loadStored(){history=[];}
function selectVisitorKey(){
 if(config&&config.saveConversations===true){
  try{visitorKey=localStorage.getItem(visitorKeyName)||"";}catch(_){visitorKey="";}
  if(!/^[0-9a-f-]{36}$/i.test(visitorKey)){visitorKey=uuid();try{localStorage.setItem(visitorKeyName,visitorKey);}catch(_){}}
 }else visitorKey=uuid();
}
function saveStored(){}
function appendInlineMarkdown(target,value){
 const source=String(value||"");
 const pattern=/\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\x60[^\x60\n]+\x60|\*[^*\n]+?\*|_[^_\n]+?_|\[[^\]]+\]\(https?:\/\/[^\s)]+\)/g;
 let cursor=0,match;
 while((match=pattern.exec(source))){
  if(match.index>cursor)target.append(document.createTextNode(source.slice(cursor,match.index)));
  const token=match[0];let element=null,value=token;
  if(token.startsWith("**")||token.startsWith("__")){element=document.createElement("strong");value=token.slice(2,-2);}
  else if(token.startsWith("~~")){element=document.createElement("del");value=token.slice(2,-2);}
  else if(token.charCodeAt(0)===96){element=document.createElement("code");value=token.slice(1,-1);}
  else if(token.startsWith("*")||token.startsWith("_")){element=document.createElement("em");value=token.slice(1,-1);}
  else{
   const link=token.trim().match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
   if(link){try{const url=new URL(link[2]);if(url.protocol==="https:"||url.protocol==="http:"){element=document.createElement("a");element.href=url.href;element.target="_blank";element.rel="noopener noreferrer";value=link[1];}}catch(_){}}
  }
  if(element){element.textContent=value;target.append(element);}else target.append(document.createTextNode(token));
  cursor=pattern.lastIndex;
 }
 if(cursor<source.length)target.append(document.createTextNode(source.slice(cursor)));
}
function renderAssistantMessage(container,value){
 const lines=String(value||"").replace(/\r\n?/g,"\n").split("\n");
 let paragraph=[],list=null;
 const flushParagraph=()=>{
  if(!paragraph.length)return;
  const p=document.createElement("p");
  paragraph.forEach((line,index)=>{if(index)p.append(document.createElement("br"));appendInlineMarkdown(p,line);});
  container.append(p);paragraph=[];
 };
 const flushList=()=>{if(list){container.append(list);list=null;}};
 for(const line of lines){
  const trimmed=line.trim();
  if(!trimmed){flushParagraph();flushList();continue;}
  const heading=trimmed.match(/^(#{1,3})\s+(.+)$/);
  if(heading){flushParagraph();flushList();const h=document.createElement(heading[1].length===1?"h4":heading[1].length===2?"h5":"h6");appendInlineMarkdown(h,heading[2]);container.append(h);continue;}
  if(/^([-*_])\1\1+\s*$/.test(trimmed)){flushParagraph();flushList();container.append(document.createElement("hr"));continue;}
  const bullet=trimmed.match(/^[-*•]\s+(.+)$/),numbered=trimmed.match(/^\d+[.)]\s+(.+)$/);
  if(bullet||numbered){
   flushParagraph();const type=bullet?"ul":"ol";
   if(!list||list.tagName.toLowerCase()!==type){flushList();list=document.createElement(type);}
   const item=document.createElement("li");appendInlineMarkdown(item,(bullet||numbered)[1]);list.append(item);continue;
  }
  flushList();
  const quote=trimmed.match(/^>\s?(.+)$/);
  if(quote){flushParagraph();const block=document.createElement("blockquote");appendInlineMarkdown(block,quote[1]);container.append(block);continue;}
  paragraph.push(line);
 }
 flushParagraph();flushList();
}
function addBubble(role,content){
 const node=document.createElement("div");node.className="tp-bubble "+(role==="user"?"tp-user":"tp-assistant");
 if(role==="assistant"){node.classList.add("tp-rich");renderAssistantMessage(node,content);}
 else node.textContent=String(content||"");
 stream.appendChild(node);stream.scrollTop=stream.scrollHeight;return node;
}
function addError(message){const node=document.createElement("div");node.className="tp-error";node.textContent=String(message);stream.appendChild(node);stream.scrollTop=stream.scrollHeight;}
function networkErrorMessage(error){
 const message=String(error&&error.message||"");
 if((error&&error.name==="TypeError")||/failed to fetch|networkerror/i.test(message)){
  return mode==="public"
   ?"We couldn't connect to the chat service from this website. Refresh the page and try again. If it continues, ask the website owner to contact TeamPeach support."
   :"We couldn't connect to the preview service. Refresh this page and make sure you are signed in to the TeamPeach account that owns this assistant.";
 }
 return message||"Something went wrong. Please try again.";
}
function addTyping(){const node=document.createElement("div");node.className="tp-bubble tp-assistant tp-typing";for(let i=0;i<3;i++)node.appendChild(document.createElement("i"));stream.appendChild(node);stream.scrollTop=stream.scrollHeight;return node;}
function paintConfig(value){
 config=value||{};title.textContent=config.assistantName||"Business Assistant";subtitle.textContent=config.businessName||"Ask us a question";
 root.style.setProperty("--tp-chat-color",/^#[0-9a-f]{6}$/i.test(config.widgetColor||"")?config.widgetColor:"#253047");
 launch.textContent=config.widgetIcon==="sparkles"?"✦":config.widgetIcon==="help"?"?":"☏";
 avatar.textContent=config.widgetIcon==="sparkles"?"✦":config.widgetIcon==="help"?"?":"✳";
 footer.replaceChildren();if(config.showBranding!==false){footer.append(document.createTextNode("Powered by "));const link=document.createElement("a");link.href="https://teampeach.org/tools/ai-chatbot/";link.target="_blank";link.rel="noopener noreferrer";link.textContent="TeamPeach";footer.append(link);}
 if(!welcomeShown){if(history.length)history.forEach(item=>addBubble(item.role,item.content));else addBubble("assistant",config.welcomeMessage||"Hello! How can I help you today?");welcomeShown=true;}
}
function resetConversation(){history=[];visitorKey=uuid();if(config&&config.saveConversations===true){try{localStorage.setItem(visitorKeyName,visitorKey);}catch(_){}}stream.replaceChildren();welcomeShown=false;if(config)addBubble("assistant",config.welcomeMessage||"Hello! How can I help you today?");}
async function ensureCsrf(){if(csrfToken)return csrfToken;const response=await fetch(apiBase+"/api/csrf",{credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error("Your secure preview session has expired. Refresh this page and sign in again.");const body=await response.json();csrfToken=body.token||"";if(!csrfToken)throw new Error("Secure request setup failed.");return csrfToken;}
async function loadConfig(){
 if(config)return config;
 try{
  const url=mode==="preview"?apiBase+"/api/chatbots/"+encodeURIComponent(assistantId)+"/preview-config":apiBase+"/api/chatbot/public/"+encodeURIComponent(assistantId);
  const response=await fetch(url,{credentials:mode==="preview"?"same-origin":"omit",cache:"no-store"});
  const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.message||"This assistant is not available.");
  paintConfig(mode==="preview"?body.config:body.assistant);selectVisitorKey();return config;
 }catch(error){throw error;}
}
async function sendMessage(message){
 if(loading)return;const value=String(message||"").trim();if(!value)return;if(value.length>2000){addError("Please keep your message under 2,000 characters.");return;}
 loading=true;send.disabled=true;input.disabled=true;addBubble("user",value);const typing=addTyping();
 try{
  await loadConfig();const payload={message:value,history:history.slice(-8),visitorKey,requestId:uuid()};let response;
  if(mode==="preview")response=await fetch(apiBase+"/api/chatbots/"+encodeURIComponent(assistantId)+"/preview-message",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-CSRF-Token":await ensureCsrf()},body:JSON.stringify(payload)});
  else response=await fetch(apiBase+"/api/chatbot/public/"+encodeURIComponent(assistantId)+"/messages",{method:"POST",credentials:"omit",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const body=await response.json().catch(()=>({}));typing.remove();if(!response.ok){const error=new Error(body.message||"We could not send your message.");error.status=response.status;throw error;}
  const answer=mode==="preview"?body.answer:body.reply;if(typeof answer!=="string"||!answer.trim())throw new Error("The assistant returned an empty response.");
  if(mode==="preview"&&Number.isFinite(Number(body.creditsRemaining)))subtitle.textContent="Preview · "+Number(body.creditsRemaining).toLocaleString()+" credits remaining";
  addBubble("assistant",answer);if(mode==="public"&&body.conversationSaved===false)addError("Your reply was delivered, but this conversation could not be saved. Please let the business owner know.");history.push({role:"user",content:value},{role:"assistant",content:answer});history=history.slice(-8);saveStored();
 }catch(error){typing.remove();if(error.status===402)addError(error.message+" The business owner needs to add credits to this TeamPeach account.");else addError(networkErrorMessage(error));}
 finally{loading=false;send.disabled=false;input.disabled=false;input.focus();}
}
launch.addEventListener("click",async()=>{const isOpen=panel.classList.toggle("tp-open");launch.setAttribute("aria-expanded",String(isOpen));if(isOpen){loadStored();try{await loadConfig();}catch(error){addError(error.message||"The assistant could not be loaded.");}if(!history.length&&config&&!welcomeShown){addBubble("assistant",config.welcomeMessage||"Hello! How can I help you today?");welcomeShown=true;}input.focus();}});
close.addEventListener("click",()=>{panel.classList.remove("tp-open");launch.setAttribute("aria-expanded","false");launch.focus();});
newChat.addEventListener("click",resetConversation);
form.addEventListener("submit",event=>{event.preventDefault();const value=input.value;input.value="";input.style.height="auto";sendMessage(value);});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,100)+"px";});
input.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();form.requestSubmit();}});
loadStored();if(openOnLoad)setTimeout(()=>launch.click(),250);
})();