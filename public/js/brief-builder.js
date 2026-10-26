"use strict";
(function(){
  const $=selector=>document.querySelector(selector);
  const form=$("#brief-form");
  let csrfToken="",signedIn=false,currentProjectId=null,currentBrief=null;
  const intentLabels={informational:"Learn / understand",commercial:"Compare options",transactional:"Take action / buy",navigational:"Find a specific brand"};
  const formatLabels={guide:"Practical guide",listicle:"List / roundup",comparison:"Comparison",tutorial:"Step-by-step tutorial","landing-page":"Service / landing page"};
  const intentGuidance={
    informational:"Answer the reader's main question early, explain unfamiliar terms plainly and support important claims with trustworthy sources.",
    commercial:"Give readers a useful comparison framework, explain the criteria that matter and distinguish verified facts from opinions.",
    transactional:"Make the next step clear, describe prerequisites and costs transparently, and remove avoidable uncertainty.",
    navigational:"Help readers find the right official destination quickly; verify brand names, product names and destination URLs."
  };
  function text(node,value){if(node)node.textContent=value==null?"":String(value);}
  function node(tag,className,value){const item=document.createElement(tag);if(className)item.className=className;if(value!==undefined)item.textContent=String(value);return item;}
  function say(selector,message,state){const item=$(selector);if(!item)return;item.textContent=message||"";item.dataset.state=state||"";}
  function titleCase(value){return String(value||"").trim().split(/\s+/).map(word=>word.length<=3?word.toUpperCase():word.charAt(0).toUpperCase()+word.slice(1)).join(" ");}
  function cleanLines(value){const seen=new Set();return String(value||"").split(/\r?\n/).map(line=>line.trim().replace(/^[-*•]\s*/,"")).filter(line=>line.length>2).filter(line=>{const key=line.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);}
  function slugPart(value){return String(value||"topic").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,65)||"topic";}
  function buildBrief(values){
    const topic=values.topic.trim(),topicTitle=titleCase(topic),keyword=values.primaryKeyword.trim()||topic,audience=values.audience.trim()||"general readers",intent=values.intent,format=values.format,goal=values.goal.trim()||"Understand the topic and identify a useful next step.",provided=cleanLines(values.related);
    let outline=[];
    if(format==="listicle")outline=[
      ["What readers should know first","Set clear selection criteria and explain who this list is for."],
      ["The main options or approaches","Organize each item consistently with use case, strengths, limits and evidence."],
      ["How to choose what fits","Help readers match the options to their needs, constraints and experience."],
      ["Common mistakes to avoid","Address the shortcuts, assumptions or trade-offs that can lead readers astray."],
      ["A practical next step","Offer a concise checklist readers can apply after finishing the article."]
    ];
    else if(format==="comparison")outline=[
      ["The options at a glance","Define the options being compared and the context in which each makes sense."],
      ["The criteria that matter most","Compare cost, time, capability, ease, support and other topic-specific factors."],
      ["Strengths and trade-offs","Describe concrete benefits and limitations rather than declaring a universal winner."],
      ["Which option fits which reader?","Map different needs and constraints to the most suitable approach."],
      ["Decision checklist","Give readers a repeatable way to make a confident, informed choice."]
    ];
    else if(format==="tutorial")outline=[
      ["Before you begin","List prerequisites, materials, access, time and safety or quality checks."],
      ["Step 1: Set up the basics","Explain the first action and what a successful setup looks like."],
      ["Step 2: Work through the core process","Break the main action into clear, verifiable sub-steps."],
      ["Step 3: Check the result","Show how to verify the result and correct common problems."],
      ["Troubleshooting and common mistakes","Address likely blockers and practical ways to resolve them."],
      ["What to do next","Provide a sensible follow-up action and criteria for when more help is needed."]
    ];
    else if(format==="landing-page")outline=[
      ["The reader's problem and desired outcome","Reflect the audience's real problem using clear, specific language."],
      ["The proposed solution","Explain what is offered, who it is for and what is included."],
      ["Benefits and evidence","Support outcome claims with proof, examples, process detail or transparent limitations."],
      ["How it works","Show the steps from initial contact or sign-up to the expected delivery."],
      ["Common questions and practical details","Address fit, timing, cost, requirements, support and limitations."],
      ["One clear next action","Use a direct call to action that matches the reader's readiness."]
    ];
    else outline=[
      ["Introduction: why "+topic+" matters","Connect the topic to the reader's situation and state what the page will help them do."],
      ["What is "+topic+"?","Define the topic clearly and explain any terms readers need to understand."],
      ["The key benefits and considerations","Explain meaningful benefits alongside limitations, costs or trade-offs."],
      ["A practical way to approach "+topic,"Use a logical process, steps or criteria the reader can follow."],
      ["Examples, options or use cases","Make the guidance concrete with examples relevant to "+audience+"."],
      ["Common mistakes and how to avoid them","Address frequent misunderstandings and show better alternatives."],
      ["Frequently asked questions","Answer real reader questions directly and concisely."],
      ["Conclusion: choose your next step","Summarize the main takeaway and reinforce the stated reader goal."]
    ];
    if(provided.length){
      const questionItems=provided.slice(0,5).map(q=>[q.endsWith("?")?q:q.replace(/[.!]+$/,"")+"?","Answer directly, then add a brief explanation or example relevant to the reader."]);
      const beforeFaq=outline.findIndex(item=>/frequently asked questions/i.test(item[0]));
      if(beforeFaq>=0)outline.splice(beforeFaq,1,...questionItems);
      else outline=outline.concat(questionItems);
    }
    const questions=[
      "What is "+topic+"?",
      "How does "+topic+" work in practice?",
      "Who is "+topic+" most useful for?",
      "What should I consider before getting started with "+topic+"?",
      "What are common mistakes people make with "+topic+"?"
    ];
    const faqs=provided.length?provided.slice(0,5).map(q=>q.endsWith("?")?q:q.replace(/[.!]+$/,"")+"?"):questions;
    let title=topicTitle+" — A Practical Guide for "+titleCase(audience);
    if(title.length>68)title=topicTitle+" — Practical Guide";
    let meta="Learn about "+topic+", explore key considerations and practical steps, and find a useful next step for "+audience+".";
    if(meta.length>160)meta="A practical guide to "+topic+". Explore key considerations, helpful steps and common questions for "+audience+".";
    if(meta.length>160)meta=meta.slice(0,157).replace(/\s+\S*$/,"")+"...";
    return {
      topic:topic,primaryKeyword:keyword,audience:audience,intent:intent,format:format,goal:goal,related:provided,
      title:title,metaDescription:meta,h1:topicTitle,outline:outline,faqs:faqs.slice(0,8),
      intentGuidance:intentGuidance[intent]||intentGuidance.informational,
      editorialNotes:[
        "State the main answer or promise near the top, then add depth in a logical order.",
        "Use first-hand examples and authoritative sources for factual, financial, health, legal or technical claims.",
        "Answer each section heading fully; remove repeated points and unsupported promises.",
        "Review current search results and genuine reader questions before finalizing headings.",
        "End with a useful next action that matches the reader's goal: "+goal
      ],
      createdAt:new Date().toISOString()
    };
  }
  function valuesFromForm(){return {topic:form.elements.topic.value.trim(),primaryKeyword:form.elements.primaryKeyword.value.trim(),audience:form.elements.audience.value.trim(),intent:form.elements.intent.value,format:form.elements.format.value,goal:form.elements.goal.value.trim(),related:form.elements.related.value};}
  function fillForm(brief){for(const name of ["topic","primaryKeyword","audience","intent","format","goal"]){if(brief[name]!==undefined&&form.elements[name])form.elements[name].value=brief[name];}if(form.elements.related)form.elements.related.value=Array.isArray(brief.related)?brief.related.join("\n"):"";}
  function outputSection(kicker,title){const section=node("section","brief-output-section");section.append(node("p","brief-output-kicker",kicker));if(title)section.append(node("h3","",title));return section;}
  function renderBrief(brief){
    currentBrief=brief;$("#brief-output-empty").hidden=true;$("#brief-output").hidden=false;
    const body=$("#brief-output-body");body.replaceChildren();
    const overview=outputSection("BRIEF OVERVIEW");
    overview.append(node("h2","",brief.title||brief.h1||brief.topic));
    overview.append(node("p","","Audience: "+brief.audience+" · Intent: "+(intentLabels[brief.intent]||intentLabels.informational)+" · Format: "+(formatLabels[brief.format]||formatLabels.guide)));
    overview.append(node("p","", "Reader goal: "+brief.goal));
    body.append(overview);
    const seo=outputSection("SEARCH & EDITORIAL");
    const metaLabel=node("p","brief-output-kicker","Suggested page title");metaLabel.style.marginTop="5px";seo.append(metaLabel,node("p","",brief.title));
    seo.append(node("p","brief-output-kicker","Meta description"));
    seo.append(node("p","",brief.metaDescription));
    seo.append(node("p","brief-output-kicker","Recommended H1"));
    seo.append(node("h2","",brief.h1));
    seo.append(node("p","",brief.intentGuidance));
    const keywordWrap=node("div","");
    [brief.primaryKeyword].concat(brief.related||[]).filter(Boolean).forEach(word=>keywordWrap.append(node("span","brief-keyword-chip",word)));
    seo.append(keywordWrap);body.append(seo);
    const outline=outputSection("SUGGESTED STRUCTURE","Draft outline");
    const outlineList=node("div","brief-outline-list");
    (brief.outline||[]).forEach(item=>{const line=node("div","brief-outline-item");const copy=node("div","");copy.append(node("strong","",item[0]));copy.append(node("small","",item[1]));line.append(copy);outlineList.append(line);});
    outline.append(outlineList);body.append(outline);
    const faq=outputSection("READER QUESTIONS","Questions to address");
    const faqList=node("div","brief-faq-list");
    (brief.faqs||[]).forEach(question=>faqList.append(node("div","brief-faq-item",question)));
    faq.append(faqList);body.append(faq);
    const notes=outputSection("QUALITY CHECK","Editorial notes");
    const noteList=node("div","brief-faq-list");
    (brief.editorialNotes||[]).forEach(note=>noteList.append(node("div","brief-faq-item",note)));
    notes.append(noteList);body.append(notes);
    $("#save-brief").textContent=currentProjectId?"Update saved brief ↗":"Save to workspace ↗";
  }
  function toMarkdown(brief){
    let out="# "+brief.title+"\n\n";
    out+="**Topic:** "+brief.topic+"\n\n**Primary keyword:** "+brief.primaryKeyword+"\n\n**Audience:** "+brief.audience+"\n\n**Search intent:** "+(intentLabels[brief.intent]||brief.intent)+"\n\n**Format:** "+(formatLabels[brief.format]||brief.format)+"\n\n**Reader goal:** "+brief.goal+"\n\n";
    out+="## Meta description\n\n"+brief.metaDescription+"\n\n## Recommended H1\n\n"+brief.h1+"\n\n## Search intent guidance\n\n"+brief.intentGuidance+"\n\n## Draft outline\n\n";
    (brief.outline||[]).forEach((item,index)=>{out+=(index+1)+". **"+item[0]+"**\n   "+item[1]+"\n\n";});
    out+="## Reader questions to address\n\n";(brief.faqs||[]).forEach(q=>{out+="- "+q+"\n";});
    out+="\n## Editorial quality checks\n\n";(brief.editorialNotes||[]).forEach(n=>{out+="- "+n+"\n";});
    if((brief.related||[]).length){out+="\n## Related topics and questions\n\n";brief.related.forEach(item=>{out+="- "+item+"\n";});}
    out+="\n---\nCreated with TeamPeach's structured brief builder. Verify the recommendations against current search results and trustworthy sources before publishing.\n";
    return out;
  }
  async function ensureCsrf(){if(csrfToken)return csrfToken;const response=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error("Secure request setup failed. Refresh and try again.");const result=await response.json();csrfToken=result.token||"";if(!csrfToken)throw new Error("Could not establish a secure request.");return csrfToken;}
  async function api(url,method,data){
    const verb=method||"GET",opts={method:verb,credentials:"same-origin",cache:"no-store",headers:{}};
    if(["POST","PATCH","DELETE"].includes(verb))opts.headers["X-CSRF-Token"]=await ensureCsrf();
    if(data!==undefined){opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(data);}
    const response=await fetch(url,opts),result=await response.json().catch(()=>({}));
    if(!response.ok){const err=new Error(result.message||"The request could not be completed.");err.code=result.error||"REQUEST_FAILED";throw err;}
    return result;
  }
  async function checkSession(){
    try{const response=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});if(!response.ok)return false;const result=await response.json();signedIn=Boolean(result&&result.user);$("#signin-save").hidden=signedIn;$("#save-brief").hidden=!signedIn;return signedIn;}catch(_){return false;}
  }
  function makeBrief(){
    const values=valuesFromForm();if(values.topic.length<2){say("#brief-form-feedback","Enter a topic with at least two characters.","error");return;}
    const brief=buildBrief(values);currentProjectId=currentProjectId||null;renderBrief(brief);say("#brief-form-feedback","Your structured content brief is ready. Review and adjust it before using it.","success");say("#brief-save-feedback","");
  }
  form?.addEventListener("submit",event=>{event.preventDefault();currentProjectId=null;makeBrief();});
  $("#regenerate-brief")?.addEventListener("click",()=>{currentProjectId=null;makeBrief();});
  $("#copy-brief")?.addEventListener("click",async()=>{
    if(!currentBrief)return;
    try{await navigator.clipboard.writeText(toMarkdown(currentBrief));say("#brief-save-feedback","Brief copied as Markdown.","success");}
    catch(_){say("#brief-save-feedback","Copy is unavailable in this browser. Use Download .md instead.","error");}
  });
  $("#download-brief")?.addEventListener("click",()=>{
    if(!currentBrief)return;
    const blob=new Blob([toMarkdown(currentBrief)],{type:"text/markdown;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download=slugPart(currentBrief.topic)+"-content-brief.md";document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
    say("#brief-save-feedback","Your Markdown file has been prepared.","success");
  });
  $("#save-brief")?.addEventListener("click",async()=>{
    if(!currentBrief)return;
    if(!signedIn){location.href="/login/?next=%2Ftools%2Fseo-content-brief%2F";return;}
    const button=$("#save-brief");button.disabled=true;say("#brief-save-feedback","Saving to your workspace…","");
    const payload={title:(currentBrief.title||currentBrief.topic).slice(0,120),description:"SEO content brief for "+currentBrief.topic+". Audience: "+currentBrief.audience+".",data:{brief:currentBrief}};
    try{
      let result;
      if(currentProjectId){result=await api("/api/workspace/projects/"+encodeURIComponent(currentProjectId),"PATCH",payload);currentProjectId=result.project.id;}
      else{result=await api("/api/workspace/projects","POST",{...payload,projectType:"seo-brief"});currentProjectId=result.project.id;}
      if(result.project&&result.project.project_type!=="seo-brief"&&!currentProjectId)currentProjectId=result.project.id;
      const url=new URL(location.href);url.searchParams.set("project",currentProjectId);history.replaceState({}, "",url.pathname+url.search+url.hash);
      button.textContent="Update saved brief ↗";say("#brief-save-feedback","Saved to your TeamPeach workspace.","success");
    }catch(error){say("#brief-save-feedback",error.message+" If your workspace was just enabled, check the database migration.","error");}
    finally{button.disabled=false;}
  });
  async function loadSavedBrief(){
    const projectId=new URLSearchParams(location.search).get("project");if(!projectId||!signedIn)return;
    try{
      const result=await api("/api/workspace","GET"),project=(result.projects||[]).find(item=>item.id===projectId);
      if(!project||project.project_type!=="seo-brief"||!project.data||!project.data.brief){say("#brief-save-feedback","That saved brief was not found in your workspace.","error");return;}
      currentProjectId=project.id;const brief=project.data.brief;fillForm(brief);renderBrief(brief);say("#brief-save-feedback","Loaded your saved brief.","success");
    }catch(error){say("#brief-save-feedback",error.message,"error");}
  }
  async function init(){
    const session=await checkSession();
    if(!session){$("#save-brief").hidden=true;$("#signin-save").hidden=false;}
    else{await loadSavedBrief();}
  }
  init();
})();