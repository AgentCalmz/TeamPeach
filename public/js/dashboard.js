"use strict";
(function(){
  const $=selector=>document.querySelector(selector);
  const shell=$(".workspace-shell");
  const projectDialog=$("#project-dialog");
  const projectForm=$("#new-project-form");
  const taskForm=$("#new-task-form");
  const toastNode=$("#workspace-toast");
  let csrfToken="";
  let workspace={user:null,projects:[],tasks:[]};
  let toastTimer=null;

  function text(node,value){if(node)node.textContent=value==null?"":String(value);}
  function feedback(node,message,state){if(!node)return;node.textContent=message||"";node.dataset.state=state||"";}
  function element(tag,className,value){const node=document.createElement(tag);if(className)node.className=className;if(value!==undefined)node.textContent=String(value);return node;}
  function toast(message){if(!toastNode)return;text(toastNode,message);toastNode.classList.add("visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastNode.classList.remove("visible"),3200);}
  function formatDate(value){if(!value)return "No due date";const d=new Date(value+(String(value).length===10?"T12:00:00":""));if(!Number.isFinite(d.getTime()))return "No due date";return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:d.getFullYear()!==new Date().getFullYear()?"numeric":undefined});}
  function formatUpdated(value){if(!value)return "Just now";const d=new Date(value);if(!Number.isFinite(d.getTime()))return "Recently updated";return "Updated "+d.toLocaleDateString(undefined,{month:"short",day:"numeric"});}
  function projectTypeLabel(type){return {"general":"General project","seo-brief":"SEO content brief","content":"Content & marketing","automation":"Automation idea"}[type]||"Project";}
  function projectGlyph(type){return {"general":"▦","seo-brief":"✳","content":"✦","automation":"⌘"}[type]||"▦";}
  function projectIconClass(type){return type==="content"?"content":type==="automation"?"automation":"";}

  async function ensureCsrf(){
    if(csrfToken)return csrfToken;
    const response=await fetch("/api/csrf",{credentials:"same-origin",cache:"no-store"});
    if(!response.ok)throw new Error("We could not set up a secure request. Refresh the page and try again.");
    const body=await response.json();csrfToken=body.token||"";
    if(!csrfToken)throw new Error("Secure request setup did not return a token.");
    return csrfToken;
  }
  async function request(url,method,data){
    const verb=String(method||"GET").toUpperCase(),options={method:verb,credentials:"same-origin",cache:"no-store",headers:{}};
    if(["POST","PATCH","DELETE"].includes(verb)){options.headers["X-CSRF-Token"]=await ensureCsrf();}
    if(data!==undefined){options.headers["Content-Type"]="application/json";options.body=JSON.stringify(data);}
    const response=await fetch(url,options),body=await response.json().catch(()=>({}));
    if(response.status===401||body.error==="NOT_AUTHENTICATED"){const next=location.pathname+location.search;location.href="/login/?next="+encodeURIComponent(next);throw new Error("Your session has ended. Please sign in again.");}
    if(!response.ok){const error=new Error(body.message||"That request could not be completed.");error.code=body.error||"REQUEST_FAILED";throw error;}
    return body;
  }
  function openProjectDialog(){
    feedback($("#project-feedback"),"","");
    if(projectDialog&&typeof projectDialog.showModal==="function")projectDialog.showModal();
    else if(projectDialog)projectDialog.setAttribute("open","");
    setTimeout(()=>$("#new-project-title")&&$("#new-project-title").focus(),80);
  }
  function closeProjectDialog(){if(!projectDialog)return;if(typeof projectDialog.close==="function")projectDialog.close();else projectDialog.removeAttribute("open");}
  document.querySelectorAll("[data-open-project]").forEach(button=>button.addEventListener("click",openProjectDialog));
  $("#close-project-dialog")?.addEventListener("click",closeProjectDialog);
  $("#cancel-project-dialog")?.addEventListener("click",closeProjectDialog);
  projectDialog?.addEventListener("click",event=>{if(event.target===projectDialog)closeProjectDialog();});
  $("#mobile-sidebar-toggle")?.addEventListener("click",()=>{
    const isOpen=shell.classList.toggle("mobile-nav-open");
    $("#mobile-sidebar-toggle").setAttribute("aria-expanded",String(isOpen));
    $("#mobile-sidebar-toggle").setAttribute("aria-label",isOpen?"Close navigation":"Open navigation");
  });
  document.querySelectorAll(".workspace-nav-link[href^='#']").forEach(link=>link.addEventListener("click",()=>{
    shell.classList.remove("mobile-nav-open");
    $("#mobile-sidebar-toggle")?.setAttribute("aria-expanded","false");
    document.querySelectorAll(".workspace-nav-link[href^='#']").forEach(item=>item.classList.toggle("active",item===link));
  }));

  function renderProjectEmpty(){const box=element("div","project-card-empty");box.append(element("span","project-empty-icon","✳"),element("h3","","Every good idea starts somewhere."),element("p","","Create your first project to keep the goal, context and next steps together."));const button=element("button","button button-dark","Create your first project ↗");button.type="button";button.addEventListener("click",openProjectDialog);box.append(button);$("#projects-list").replaceChildren(box);}
  function renderProjects(){
    const list=$("#projects-list"),term=($("#project-search")?.value||"").trim().toLowerCase();
    const projects=workspace.projects.filter(project=>(project.title+" "+project.description+" "+projectTypeLabel(project.project_type)).toLowerCase().includes(term));
    text($("#nav-project-count"),workspace.projects.length);
    text($("#stat-active-projects"),workspace.projects.filter(p=>p.status==="active").length);
    text($("#stat-projects-note"),workspace.projects.length===1?"1 idea in your workspace":workspace.projects.length+" ideas in your workspace");
    if(!list)return;
    list.replaceChildren();
    if(!workspace.projects.length){renderProjectEmpty();return;}
    if(!projects.length){const box=element("div","project-card-empty");box.append(element("span","project-empty-icon","⌕"),element("h3","","No projects match that search."),element("p","","Try a shorter search or a different word."));list.append(box);return;}
    projects.forEach(project=>{
      const card=element("article","project-card");
      const top=element("div","project-card-top");
      top.append(element("span","project-type-icon "+projectIconClass(project.project_type),projectGlyph(project.project_type)));
      const status=element("span","project-status "+project.status,project.status);top.append(status);card.append(top);
      card.append(element("h3","",project.title));
      card.append(element("p","project-card-description",project.description||projectTypeLabel(project.project_type)+" · A place to keep your plan and progress."));
      const bottom=element("div","project-card-bottom");
      bottom.append(element("span","project-date",formatUpdated(project.updated_at)));
      const actions=element("div","project-actions");
      if(project.project_type==="seo-brief"&&project.data&&project.data.brief){
        const open=element("a","project-action","Open brief ↗");open.href="/tools/seo-content-brief/?project="+encodeURIComponent(project.id);actions.append(open);
      }
      if(project.status!=="completed"){
        const statusButton=element("button","project-action",project.status==="paused"?"Resume":"Mark complete");statusButton.type="button";
        statusButton.addEventListener("click",()=>updateProject(project.id,{status:project.status==="paused"?"active":"completed"}));actions.append(statusButton);
      }else{
        const reopen=element("button","project-action","Reopen");reopen.type="button";reopen.addEventListener("click",()=>updateProject(project.id,{status:"active"}));actions.append(reopen);
      }
      const remove=element("button","project-action delete","Delete");remove.type="button";remove.setAttribute("aria-label","Delete project "+project.title);remove.addEventListener("click",()=>deleteProject(project));actions.append(remove);
      bottom.append(actions);card.append(bottom);list.append(card);
    });
  }
  function renderTasks(){
    const list=$("#tasks-list"),openTasks=workspace.tasks.filter(t=>!t.completed),doneTasks=workspace.tasks.filter(t=>t.completed);
    text($("#nav-task-count"),openTasks.length);
    text($("#stat-open-tasks"),openTasks.length);
    text($("#stat-tasks-note"),openTasks.length===1?"One next step to focus on":"Your next steps, gathered in one place");
    text($("#stat-completed-tasks"),doneTasks.length);
    if(!list)return;
    list.replaceChildren();
    if(!workspace.tasks.length){const empty=element("div","tasks-empty");empty.append(element("strong","","A clear list starts with one task."),element("span","","Add a next step above. You can link it to a project later."));list.append(empty);return;}
    const ordered=[...openTasks,...doneTasks];
    ordered.forEach(task=>{
      const row=element("div","task-row"+(task.completed?" is-complete":""));
      const check=element("input","task-check");check.type="checkbox";check.checked=Boolean(task.completed);check.setAttribute("aria-label",(task.completed?"Reopen ":"Complete ")+task.title);check.addEventListener("change",async()=>{check.disabled=true;try{await updateTask(task.id,{completed:check.checked});}catch(_){check.checked=!check.checked;}finally{check.disabled=false;}});row.append(check);
      const copy=element("div","task-copy");copy.append(element("strong","",task.title));
      const linkedProject=workspace.projects.find(p=>p.id===task.project_id);
      const hint=task.due_on?"Due "+formatDate(task.due_on):(linkedProject?linkedProject.title:"No due date");
      copy.append(element("small","",hint));row.append(copy);
      if(!task.completed)row.append(element("span","task-priority "+(task.priority==="normal"?"":task.priority),task.priority));
      const remove=element("button","task-delete","×");remove.type="button";remove.setAttribute("aria-label","Delete task "+task.title);remove.addEventListener("click",()=>deleteTask(task));row.append(remove);
      list.append(row);
    });
      }

  async function updateProject(id,patch){
    try{const result=await request("/api/workspace/projects/"+encodeURIComponent(id),"PATCH",patch);workspace.projects=workspace.projects.map(p=>p.id===id?result.project:p);renderProjects();toast("Project updated.");}
    catch(error){toast(error.message);}
  }
  async function deleteProject(project){
    if(!window.confirm("Delete \""+project.title+"\"? Tasks linked to this project will remain in your workspace."))return;
    try{await request("/api/workspace/projects/"+encodeURIComponent(project.id),"DELETE");workspace.projects=workspace.projects.filter(p=>p.id!==project.id);workspace.tasks=workspace.tasks.map(t=>t.project_id===project.id?{...t,project_id:null}:t);text($("#workspace-load-feedback"),"");text($("#workspace-load-feedback"),"");renderProjects();renderTasks();renderTaskProjectOptions();toast("Project deleted.");}
    catch(error){toast(error.message);}
  }
  async function updateTask(id,patch){
    try{const result=await request("/api/workspace/tasks/"+encodeURIComponent(id),"PATCH",patch);workspace.tasks=workspace.tasks.map(t=>t.id===id?result.task:t);renderTasks();feedback($("#tasks-feedback"),"Task updated.","success");setTimeout(()=>feedback($("#tasks-feedback"),""),1800);}
    catch(error){feedback($("#tasks-feedback"),error.message,"error");toast(error.message);throw error;}
  }
  async function deleteTask(task){
    if(!window.confirm("Delete the task \""+task.title+"\"?"))return;
    try{await request("/api/workspace/tasks/"+encodeURIComponent(task.id),"DELETE");workspace.tasks=workspace.tasks.filter(t=>t.id!==task.id);renderTasks();toast("Task deleted.");}
    catch(error){toast(error.message);}
  }
  function renderTaskProjectOptions(){
    const select=$("#new-task-project");if(!select)return;
    select.replaceChildren();const noProject=element("option","","No project");noProject.value="";select.append(noProject);
    workspace.projects.filter(project=>project.status!=="completed").forEach(project=>{const option=element("option","",project.title);option.value=project.id;select.append(option);});
  }
  async function loadSupportUnreadCount(){
    const badge=$("#support-unread-count");
    if(!badge||$("#support-conversations"))return;
    try{
      const response=await fetch("/api/support/conversations",{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)return;
      const body=await response.json().catch(()=>({}));
      const count=(Array.isArray(body.conversations)?body.conversations:[]).filter(item=>item.unread===true).length;
      text(badge,count);badge.hidden=count===0;
    }catch(_){badge.hidden=true;}
  }

  function updateAccountChrome(user){
    workspace.user=user||null;
    const name=String((workspace.user&&workspace.user.fullName)||"there").trim(),first=name.split(/\\s+/)[0]||"there";
    const hour=new Date().getHours(),greeting=hour<12?"Good morning":hour<18?"Good afternoon":"Good evening";
    text($("#welcome-title"),greeting+", "+first+".");
    text($("#welcome-subtitle"),"Your workspace is ready. Pick one useful next step and make it happen.");
    text($("#sidebar-name"),name);
    text($("#sidebar-email"),workspace.user&&workspace.user.email||"");
    text($("#sidebar-avatar"),first.charAt(0).toUpperCase());
    text($("#topbar-avatar"),first.charAt(0).toUpperCase());
    const adminLink=$("#workspace-admin-link");
    if(adminLink)adminLink.hidden=!Boolean(workspace.user&&workspace.user.isAdmin);
  }

  async function loadWorkspace(){
    const projectsList=$("#projects-list"),tasksList=$("#tasks-list");
    let profileLoaded=false;
    try{
      const profile=await request("/api/auth/me","GET");
      profileLoaded=true;
      const profileUser={...(profile.user||{}),isAdmin:Boolean(profile.isAdmin)};
      workspace={user:profileUser,projects:[],tasks:[]};
      updateAccountChrome(profileUser);
      text($("#workspace-load-feedback"),"");
      const needsWorkspaceData=Boolean(projectsList||tasksList||$("#stat-active-projects")||$("#stat-open-tasks")||$("#stat-completed-tasks")||$("#new-task-project"));
      if(!needsWorkspaceData)return;

      const result=await request("/api/workspace","GET");
      const workspaceUser=result.user||profileUser;
      workspace={user:workspaceUser,projects:Array.isArray(result.projects)?result.projects:[],tasks:Array.isArray(result.tasks)?result.tasks:[]};
      updateAccountChrome(workspaceUser);
      text($("#workspace-load-feedback"),"");
      renderProjects();
      renderTasks();
      renderTaskProjectOptions();
    }catch(error){
      if(!profileLoaded){
        text($("#workspace-load-feedback"),"We couldn't verify your account session. Please sign in again or refresh this page. "+error.message);
        return;
      }
      const detail="Your account is signed in, but project and task data could not be loaded. Confirm supabase/migrations/002_workspace_dashboard.sql has been applied in Supabase and that the database is reachable. "+error.message;
      text($("#workspace-load-feedback"),detail);
      if(projectsList){
        const box=element("div","project-card-empty");
        box.append(element("span","project-empty-icon","!"),element("h3","","Your projects are temporarily unavailable."),element("p","",detail));
        const retry=element("button","button button-dark","Try again");retry.type="button";retry.addEventListener("click",loadWorkspace);
        box.append(retry);projectsList.replaceChildren(box);
      }
      if(tasksList){
        tasksList.replaceChildren();
        const box=element("div","tasks-empty");
        box.append(element("strong","","Your tasks are temporarily unavailable."),element("span","",detail));
        const retry=element("button","button button-outline","Try again");retry.type="button";retry.addEventListener("click",loadWorkspace);
        box.append(retry);tasksList.append(box);
      }
    }
  }

  projectForm?.addEventListener("submit",async event=>{
    event.preventDefault();const button=projectForm.querySelector('button[type="submit"]');if(button)button.disabled=true;
    feedback($("#project-feedback"),"Saving your project…","");
    try{
      const result=await request("/api/workspace/projects","POST",{
        title:projectForm.elements.title.value.trim(),
        description:projectForm.elements.description.value.trim(),
        projectType:projectForm.elements.projectType.value
      });
      workspace.projects=[result.project,...workspace.projects];renderProjects();renderTaskProjectOptions();projectForm.reset();closeProjectDialog();toast("Your project has been created.");
    }catch(error){feedback($("#project-feedback"),error.message,"error");}
    finally{if(button)button.disabled=false;}
  });
  taskForm?.addEventListener("submit",async event=>{
    event.preventDefault();const input=$("#new-task-title"),title=input.value.trim();if(title.length<2){feedback($("#tasks-feedback"),"Add a task title with at least two characters.","error");return;}
    const button=taskForm.querySelector('button[type="submit"]');if(button)button.disabled=true;
    try{
      const result=await request("/api/workspace/tasks","POST",{title,priority:"normal",projectId:($("#new-task-project")?.value||null)});
      workspace.tasks.unshift(result.task);input.value="";renderTasks();toast("Task added to your list.");
    }catch(error){feedback($("#tasks-feedback"),error.message,"error");}
    finally{if(button)button.disabled=false;}
  });
  $("#project-search")?.addEventListener("input",renderProjects);
  $("#dashboard-logout")?.addEventListener("click",async()=>{
    const button=$("#dashboard-logout");button.disabled=true;
    try{await request("/api/auth/logout","POST",{});location.href="/login/";}
    catch(error){toast(error.message);button.disabled=false;}
  });
  loadWorkspace();
  loadSupportUnreadCount();
})();