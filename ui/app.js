"use strict";
const $=s=>document.querySelector(s);
const FALLBACK_PROFILE={id:"general",name:"通用",title_field:"事情",excerpt_field:"结果",fields:[
  {key:"时间",label:"时间"},{key:"地点",label:"地点"},{key:"人物",label:"人物"},{key:"事情",label:"事情"},
  {key:"原因",label:"原因"},{key:"结果",label:"结果"},{key:"重点",label:"重点"}
]};
const state={stats:null,sessions:[],view:"all",filter:"all",q:"",selected:null,records:[],page:1,pages:1,total:0,trash:[],conflicts:[],dirty:false,returnHash:"",profiles:{},profileList:[]};
let deleteArm={id:"",until:0};
const qcls=q=>["complete","partial","degraded"].includes(q)?q:"degraded";

function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fmt(ts){if(!ts)return"—";const d=new Date(ts),p=n=>("0"+n).slice(-2);return `${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;}
function fullFmt(ts){if(!ts)return"—";const d=new Date(ts),p=n=>("0"+n).slice(-2);return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;}
function toast(m,ms=2200){const t=$("#toast");t.textContent=m;t.classList.add("show");clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("show"),ms);}
function askToken(){const t=prompt("需要访问令牌。输入后浏览器会记住：");if(t)location.href="/?token="+encodeURIComponent(t);}

async function api(url,opt){
  const r=await fetch(url,opt);
  if(r.status===401){askToken();throw new Error("unauthorized");}
  const j=await r.json();
  if(!r.ok||!j.ok)throw new Error((j&&j.error)||("HTTP "+r.status));
  return j;
}
const post=(u,b)=>api(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b||{})});

function themeInit(){
  const param=new URLSearchParams(location.search).get("theme");
  if(param==="dark"||param==="light"){document.documentElement.dataset.theme=param;localStorage.setItem("ns-theme",param);return;}
  const saved=localStorage.getItem("ns-theme");
  const prefers=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme=saved||(prefers?"dark":"light");
}
function themeToggle(){
  const next=document.documentElement.dataset.theme==="dark"?"light":"dark";
  document.documentElement.dataset.theme=next;localStorage.setItem("ns-theme",next);
}

async function loadBase(){
  const [stats,sessions,conf,trash,prof]=await Promise.all([
    api("/api/stats"),api("/api/sessions"),api("/api/conflicts"),api("/api/trash"),api("/api/profiles")
  ]);
  state.stats=stats;state.sessions=sessions.sessions||[];state.conflicts=conf.reports||[];state.trash=trash.items||[];
  state.profileList=prof.profiles||[];state.profiles=Object.fromEntries(state.profileList.map(p=>[p.id,p]));
  state.activeProfile=prof.active||"general";
  if(!state.profiles.general)state.profiles.general=FALLBACK_PROFILE;
  renderProfileSwitch();
  $("#cAll").textContent=stats.total;
  $("#cSess").textContent=state.sessions.length;
  $("#cConf").textContent=state.conflicts.length||"";
  $("#cTrash").textContent=state.trash.length||"";
  $("#spacePill span").textContent=stats.space_id==="personal"?"个人空间":stats.space_id;
  const sync=$("#sync"),txt=$("#syncText");
  const confN=state.conflicts.length;
  sync.classList.toggle("alert",confN>0);
  txt.textContent=confN>0?`${confN} 个冲突已合并`:stats.device_id;
  sync.title=`设备 ${stats.device_id} · 墓碑 ${stats.tombstones||0} · 冲突 ${confN}`;
  renderSideSessions();
}
function renderProfileSwitch(){
  const sel=$("#profileSwitch");if(!sel)return;
  sel.innerHTML=state.profileList.map(p=>`<option value="${esc(p.id)}" ${p.id===state.activeProfile?"selected":""}>${esc(p.name)}（${esc(p.id)}）</option>`).join("");
  sel.onchange=async()=>{
    const id=sel.value;
    if(id===state.activeProfile)return;
    if(!confirm("切换后：新写入使用「"+id+"」方案，历史记录保留可读但不会被改写。继续？")){sel.value=state.activeProfile;return;}
    try{
      await post("/api/profile/active",{id});
      toast("已切换到 "+id);
      await loadBase();await route();
    }catch(e){toast("切换失败："+e.message);sel.value=state.activeProfile;}
  };
}
function renderSideSessions(){
  $("#sideSessions").innerHTML=state.sessions.map(s=>`
    <div class="side-session ${state.view==="session"&&state.selectedSession===s.session_key?"active":""}" onclick="go('#/s/${encodeURIComponent(s.session_key)}')">
      <span class="name">${esc(s.name||s.session_key)}</span><span class="n">${s.turn_count}</span>
    </div>`).join("")||`<div class="empty" style="padding:18px 10px;text-align:left;font-size:12px">暂无会话</div>`;
}

function go(h){ $("#shell").classList.remove("side-open"); location.hash=h; }

/* ---------- 详情抽屉宽度：拖动吸附 340/420/520/640，双击复位 ---------- */
const PANEL_SNAPS=[340,420,520,640];
function maxPanelW(){ return Math.min(760, Math.max(320, Math.round(window.innerWidth*0.62))); }
function setPanelW(w){
  const v=Math.max(260, Math.min(maxPanelW(), Math.round(w)));
  $("#shell").style.setProperty("--panel-w", v+"px");
  try{ localStorage.setItem("ns-panel-w", String(v)); }catch(e){}
}
function currentPanelW(){
  const v=parseFloat(getComputedStyle($("#shell")).getPropertyValue("--panel-w"));
  return isFinite(v)&&v>0?v:420;
}
(function initPanelResize(){
  const handle=$("#resizeHandle");
  let dragging=false,startX=0,startW=0;
  handle.addEventListener("pointerdown",e=>{
    if(window.innerWidth<=959) return;
    dragging=true;startX=e.clientX;startW=currentPanelW();
    handle.classList.add("dragging");
    try{ handle.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  });
  handle.addEventListener("pointermove",e=>{
    if(!dragging) return;
    setPanelW(startW-(e.clientX-startX));
  });
  const finish=()=>{
    if(!dragging) return;
    dragging=false;handle.classList.remove("dragging");
    const w=currentPanelW();
    if(w<300){ closePanel(); return; }
    const nearest=PANEL_SNAPS.reduce((a,b)=>Math.abs(b-w)<Math.abs(a-w)?b:a,PANEL_SNAPS[0]);
    setPanelW(Math.min(nearest,maxPanelW()));
  };
  handle.addEventListener("pointerup",finish);
  handle.addEventListener("pointercancel",finish);
  handle.addEventListener("dblclick",()=>setPanelW(420));
  window.addEventListener("resize",()=>{
    if($("#shell").classList.contains("with-panel")) setPanelW(currentPanelW());
  });
})();
function initPanelW(){
  try{
    const saved=Number(localStorage.getItem("ns-panel-w"));
    if(saved>=260) setPanelW(saved);
  }catch(e){}
}
$("#sideBtn").onclick=()=>$("#shell").classList.toggle("side-open");
$("#backdrop").onclick=()=>$("#shell").classList.remove("side-open");

async function route(){
  const h=location.hash||"#/all";
  if(!h.startsWith("#/r/")) state.returnHash=h;
  document.querySelectorAll(".nav-item").forEach(a=>a.classList.remove("active"));
  if(h.startsWith("#/s/")){
    state.view="session";state.selectedSession=decodeURIComponent(h.slice(4));
    document.querySelector('[data-nav="sessions"]').classList.add("active");
    return renderSession(state.selectedSession);
  }
  if(h.startsWith("#/q/")){
    state.view="search";state.q=decodeURIComponent(h.slice(4));return renderSearch(state.q);
  }
  if(h==="#/sessions"){state.view="sessions";document.querySelector('[data-nav="sessions"]').classList.add("active");return renderSessions();}
  if(h==="#/conflicts"){state.view="conflicts";document.querySelector('[data-nav="conflicts"]').classList.add("active");return renderConflicts();}
  if(h==="#/trash"){state.view="trash";document.querySelector('[data-nav="trash"]').classList.add("active");return renderTrash();}
  if(h.startsWith("#/r/")){
    if(!document.querySelector("#list")){
      if(state.view==="session"&&state.selectedSession) await renderSession(state.selectedSession);
      else await renderFeed(1);
    }
    return openRecord(decodeURIComponent(h.slice(4)),true);
  }
  state.view="all";state.selectedSession=null;
  document.querySelector('[data-nav="all"]').classList.add("active");
  return renderFeed(1);
}

function head(title,sub,filters){
  return `<div class="main-head"><div><h1>${esc(title)}</h1><div class="sub">${esc(sub||"")}</div></div>
    ${filters?`<div class="filters">${filters.map(f=>`<button class="${state.filter===f.k?'active':''}" onclick="setFilter('${f.k}')">${f.n}</button>`).join("")}</div>`:""}</div>`;
}

function rowHtml(r){
  const title=r.title||(r.fields&&(r.fields["事情"]||r.fields["事件"]||r.fields["目标"]))||"(未命名)";
  const excerpt=r.excerpt||(r.fields&&(r.fields["结果"]||r.fields["重点"]||r.fields["下一步"]||r.fields["状态"]))||"";
  const isRange=r.kind==="range";
  const tn=Number(r.turn_no)||0;
  const from=Number(r.range&&r.range.from)||0;
  const to=Number(r.range&&r.range.to)||0;
  const tag=isRange?`Σ ${from===to?from:from+"–"+to}`:"#"+tn;
  return `<div class="row ${isRange?"range-row":""} ${state.selected===r.id?"active":""}" tabindex="0" role="button" onclick="go('#/r/${encodeURIComponent(r.id)}')" onkeydown="if(event.key==='Enter')go('#/r/${encodeURIComponent(r.id)}')">
    <div class="row-time">${fmt(r.created_at).replace(" ","<br>")}</div>
    <div class="row-main">
      <div class="row-title"><span class="tag ${isRange?"range":""}">${tag}</span><span class="t-text">${esc(title)}</span><span class="dot ${qcls(r.quality)}"></span></div>
      <div class="row-excerpt">${isRange?'<span class="ex-label">范围总结</span>':""}${esc(excerpt)}</div>
    </div>
    <div class="row-meta">${r.truncated?'<span class="badge">截断</span>':""}${r.profile&&r.profile!==state.activeProfile?`<span class="tag">${esc(r.profile_name||r.profile)}</span>`:""}<span class="session" title="${esc(r.session_name||r.session_key)}">${esc(r.session_name||r.session_key)}</span></div>
  </div>`;
}

async function renderFeed(page=1,append=false){
  state.filter=state.filter||"all";
  if(!append){
    $("#main").innerHTML=head("记忆流",`${state.stats?state.stats.total:0} 条 · 最新在前`,[{k:"all",n:"全部"},{k:"turn",n:"单轮"},{k:"range",n:"范围"},{k:"bad",n:"不完整"}])+
      `<div class="list" id="list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;
  }
  const kind=state.filter==="turn"?"turn":state.filter==="range"?"range":"";
  const quality=state.filter==="bad"?"&quality=incomplete":"";
  let j;
  try{
    j=await api(`/api/list?page=${page}&page_size=30${kind?"&kind="+kind:""}${quality}`);
  }catch(e){
    const list=$("#list")||$("#main");
    list.innerHTML=`<div class="empty"><h3>加载失败</h3><div>${esc(e.message)}</div><button class="load-more" onclick="renderFeed(1)">重试</button></div>`;
    return;
  }
  const records=j.records||[];
  state.records=records;state.page=j.page;state.pages=j.pages;state.total=j.total;
  const list=$("#list");
  if(!list) return;
  const rows=records.map(rowHtml).join("");
  if(append){
    const old=list.querySelector(".load-more");
    if(old) old.remove();
    list.insertAdjacentHTML("beforeend",rows);
  }else{
    list.innerHTML=rows;
  }
  if(!state.records.length&&!append){list.innerHTML=`<div class="empty"><h3>还没有记忆</h3><div>让 Agent 在每轮结束时调用 memory_save，这里就会出现。</div></div>`;return;}
  if(j.page<j.pages){
    list.insertAdjacentHTML("beforeend",`<button class="load-more" onclick="renderFeed(${j.page+1},true)">加载更多（${j.total} 条）</button>`);
  }
}

async function renderSession(key){
  $("#main").innerHTML=head("会话",key)+`<div class="list" id="list"><div class="skeleton"></div></div>`;
  const j=await api("/api/session/"+encodeURIComponent(key));
  const s=j.session,recs=j.records||[];
  const gaps=(s.gaps||[]);
  $("#main").innerHTML=head(s.name||key,`${s.turn_count} 轮 · ${s.range_count} 范围 · ${s.last_at?fmt(s.last_at):"—"}${gaps.length?" · 缺口 "+gaps.join(","):""}`)+
    `<div class="list">${recs.map(rowHtml).join("")||'<div class="empty"><h3>空会话</h3></div>'}</div>`;
}

async function renderSessions(){
  $("#main").innerHTML=head("会话",`${state.sessions.length} 个会话`)+`<div class="list">${state.sessions.map(s=>`
    <div class="row" onclick="go('#/s/${encodeURIComponent(s.session_key)}')">
      <div class="row-time">${fmt(s.last_at).replace(" ","<br>")}</div>
      <div class="row-main"><div class="row-title">${esc(s.name||s.session_key)} ${s.gaps&&s.gaps.length?`<span class="tag">缺口 ${s.gaps.length}</span>`:""}</div>
      <div class="row-excerpt">${s.turn_count} 轮 · ${s.range_count} 个范围总结</div></div>
      <div class="row-meta"><span>${esc(s.session_key)}</span></div>
    </div>`).join("")||'<div class="empty"><h3>暂无会话</h3></div>'}</div>`;
}

async function renderSearch(q){
  $("#main").innerHTML=head("搜索",`“${q}”`)+`<div class="list" id="list"><div class="skeleton"></div></div>`;
  const j=await api("/api/search?q="+encodeURIComponent(q)+"&limit=50");
  const rows=(j.results||[]).map(r=>`<div class="row" onclick="go('#/r/${encodeURIComponent(r.id)}')">
    <div class="row-time">${fmt(r.created_at).replace(" ","<br>")}</div>
    <div class="row-main"><div class="row-title"><span class="tag">${r.kind==="range"?"Σ":"#"+r.turn_no}</span><span class="t-text">${esc(r.title)}</span></div>
    <div class="row-excerpt">${esc(r.excerpt)}</div></div>
    <div class="row-meta"><span>${esc(r.session_key)}</span></div></div>`).join("");
  $("#list").innerHTML=rows||`<div class="empty"><h3>没有命中</h3><div>换个关键词试试。</div></div>`;
}

async function renderTrash(){
  $("#main").innerHTML=head("回收站",`${state.trash.length} 项 · 删除可恢复`)+`<div class="list" style="padding-top:4px">${state.trash.map(t=>`
    <div class="trash-row">
      <div class="info"><div class="title">${esc(t.record.title||(t.record.fields&&(t.record.fields["事情"]||t.record.fields["事件"]||t.record.fields["目标"]))||"(无标题)")}</div>
      <div class="meta">${esc(t.record.session_key)} · 删除于 ${fullFmt(t.deleted_at)} · ${esc(t.reason)}</div></div>
      <button class="btn" onclick="restoreTrash('${t.trash_id}')">恢复</button>
      <button class="btn danger" onclick="purgeTrash('${t.trash_id}')">彻底删除</button>
    </div>`).join("")||'<div class="empty"><h3>回收站为空</h3></div>'}</div>`;
}

async function renderConflicts(){
  const reports=state.conflicts||[];
  $("#main").innerHTML=head("冲突",`${reports.length} 个冲突副本已按字段合并并归档`)+
    `<div style="padding-top:6px">${reports.map(r=>`
      <div class="conflict">
        <h3>${esc(r.conflict_file||"冲突副本")}</h3>
        <div class="meta">${fullFmt(new Date(r.at).getTime())} · 合并到 ${esc(r.target_id||"—")} · 设备 ${esc(r.device||"—")}</div>
        <div class="fields">${(r.fields||[]).map(f=>`<span class="field">${esc(f)}：保留较新值</span>`).join("")||'<span class="field">无字段冲突</span>'}</div>
      </div>`).join("")||'<div class="empty"><h3>没有冲突</h3><div>多设备同步产生冲突副本时，会自动按字段合并并记录在这里。</div></div>'}</div>`;
}

async function restoreTrash(id){
  try{await post("/api/restore",{trash_id:id});toast("已恢复");await loadBase();renderTrash();}
  catch(e){toast("恢复失败："+e.message);}
}
async function purgeTrash(id){
  const s=prompt("彻底删除不可恢复。输入 PURGE 确认：");if(s!=="PURGE")return;
  try{await post("/api/purge",{trash_id:id,confirm:true});toast("已彻底删除");await loadBase();renderTrash();}
  catch(e){toast("失败："+e.message);}
}

async function openRecord(id,keepView){
  let rec;
  try{rec=await api("/api/record/"+encodeURIComponent(id)).then(j=>j.record);}
  catch(e){toast("找不到该记录");return;}
  if(!state.returnHash) state.returnHash = location.hash.startsWith("#/r/") ? "#/all" : (location.hash||"#/all");
  state.selected=id;state.dirty=false;
  $("#shell").classList.add("with-panel");
  const profile=state.profiles[rec.profile]||state.profiles.general||FALLBACK_PROFILE;
  const installed=!!state.profiles[rec.profile]||rec.profile==="general";
  const miss=new Set(rec.missing||[]);
  const tn=Number(rec.turn_no)||0;
  const from=Number(rec.range&&rec.range.from)||0;
  const to=Number(rec.range&&rec.range.to)||0;
  const fieldsHtml=profile.fields.map((f,i)=>{
    const v=(rec.fields&&rec.fields[f.key])||"";
    const rows=Math.min(4,Math.max(1,Math.round((Number(f.max_chars)||200)/100)));
    return `<div class="fld"><label><span>${esc(f.label||f.key)}</span>${miss.has(f.key)?'<span class="miss">缺失</span>':""}</label>
      <textarea id="f-${i}" data-field="${esc(f.key)}" class="${miss.has(f.key)?"missing":""}" rows="${rows}">${esc(v)}</textarea></div>`;
  }).join("");
  const known=new Set(profile.fields.map(f=>f.key));
  const extra=Object.keys(rec.fields||{}).filter(k=>!known.has(k)&&String(rec.fields[k]||"").trim());
  const extraHtml=extra.length?`<details class="raw"><summary>其他字段（当前方案未定义，${extra.length} 项，只读）</summary>
    ${extra.map(k=>`<div class="fld"><label><span>${esc(k)}</span></label><textarea readonly>${esc(rec.fields[k])}</textarea></div>`).join("")}
  </details>`:"";
  $("#panel").innerHTML=`
    <div class="panel-head">
      <div class="t"><button class="icon-btn panel-back" onclick="closePanel()" aria-label="返回">←</button><h2>${esc((rec.fields&&(rec.fields[profile.title_field]||rec.fields["事情"]))||"(未命名)")}</h2><button class="icon-btn" onclick="closePanel()" aria-label="关闭">✕</button></div>
      <div class="meta">
        <span class="pill">${rec.kind==="range"?"范围 "+from+"–"+to:"第 "+tn+" 轮"}</span>
        <span class="pill ${rec.quality==="complete"?"ok":"warn"}">${rec.quality==="complete"?"完整":rec.quality==="partial"?"部分":"骨架"}</span>
        <span class="pill ${installed?"":"warn"}">${esc(profile.name)}${installed?"":"（未安装）"}</span>
        ${rec.truncated?'<span class="pill warn">截断轮</span>':""}
        <span>${esc(rec.session_key)}</span><span>${fullFmt(rec.created_at)}</span><span>r${Number(rec.revision)||1}</span>
      </div>
    </div>
    <div class="panel-body">
      ${fieldsHtml}
      ${extraHtml}
      <details class="raw"><summary>原文（${rec.raw_text?rec.raw_text.length:0} 字，仅本地）</summary>
        <textarea id="f-raw">${esc(rec.raw_text||"")}</textarea></details>
    </div>
    <div class="panel-foot">
      <button class="btn primary" id="saveBtn" disabled onclick="saveRecord('${rec.id}',${Number(rec.revision)||1})">保存</button>
      <span class="spacer"></span>
      <button class="btn danger" id="delBtn" onclick="delRecord('${rec.id}')">删除</button>
    </div>`;
  $("#panel").querySelectorAll("textarea").forEach(t=>{
    t.addEventListener("input",()=>{t.classList.add("dirty");state.dirty=true;$("#saveBtn").disabled=false;});
  });
  // 列表行高亮
  document.querySelectorAll(".row").forEach(el=>el.classList.remove("active"));
  const row=[...document.querySelectorAll(".row")].find(el=>el.getAttribute("onclick")&&el.getAttribute("onclick").includes(rec.id));
  if(row)row.classList.add("active");
}
function closePanel(){
  if(state.dirty && !confirm("有未保存的编辑，确定关闭？")) return;
  state.dirty=false;
  $("#shell").classList.remove("with-panel");
  state.selected=null;document.querySelectorAll(".row").forEach(el=>el.classList.remove("active"));
  const back=state.returnHash||"#/all";
  if(location.hash.startsWith("#/r/")) location.hash=back;
}
async function saveRecord(id,rev){
  const fields={};
  document.querySelectorAll("#panel textarea[data-field]").forEach(el=>{fields[el.dataset.field]=el.value.trim();});
  const raw=document.getElementById("f-raw");
  const body={id,fields,raw_text:raw?raw.value:"",expect_revision:rev};
  try{
    const j=await post("/api/update",body);toast("已保存 · r"+j.record.revision);
    state.dirty=false;await loadBase();await openRecord(id,true);
  }catch(e){
    if(String(e.message).includes("revision mismatch")){
      if(confirm("该记录已被其他设备修改。仍用当前编辑覆盖吗？")){
        delete body.expect_revision;
        try{const j=await post("/api/update",body);toast("已覆盖保存 · r"+j.record.revision);await loadBase();await openRecord(id,true);}
        catch(e2){toast("保存失败："+e2.message);}
      }
    }else toast("保存失败："+e.message);
  }
}
async function delRecord(id){
  const now=Date.now();
  if(deleteArm.id!==id||now>deleteArm.until){deleteArm={id,until:now+3000};const b=$("#delBtn");if(b)b.textContent="确认删除？";return;}
  try{await post("/api/delete",{id,confirm:true});toast("已删除，可在回收站恢复");closePanel();await loadBase();route();}
  catch(e){toast("删除失败："+e.message);}
}
function setFilter(k){state.filter=k;renderFeed(1);}

$("#q").addEventListener("keydown",e=>{
  if(e.key==="Enter"){const q=e.target.value.trim();if(q)go("#/q/"+encodeURIComponent(q));}
});
document.addEventListener("keydown",e=>{
  const tag=(document.activeElement&&document.activeElement.tagName)||"";
  if(e.key==="/"&&tag!=="INPUT"&&tag!=="TEXTAREA"){e.preventDefault();$("#q").focus();}
  if(e.key==="Escape"){
    $("#shell").classList.remove("side-open");
    closePanel();
  }
});
$("#themeBtn").onclick=themeToggle;
window.addEventListener("hashchange",()=>{
  if(state.dirty){
    if(!confirm("有未保存的编辑，确定离开？")){ location.hash=state.returnHash||"#/all"; return; }
    state.dirty=false;
  }
  state.selected=null;$("#shell").classList.remove("with-panel");route();
});

(async()=>{
  themeInit();initPanelW();await loadBase();await route();
  if(new URLSearchParams(location.search).get("debug")==="1"){
    setTimeout(()=>{
      const d=document.documentElement;
      const el=document.createElement("div");
      el.style.cssText="position:fixed;left:0;bottom:0;z-index:9999;background:#000;color:#0f0;font:12px/1.4 monospace;padding:2px 6px";
      el.textContent=`W ${d.scrollWidth}/${innerWidth} H ${d.scrollHeight}/${innerHeight}`;
      document.body.appendChild(el);
    },1200);
  }
})();
