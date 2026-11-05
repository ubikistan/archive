(function(){
const ROLES=[
 ["steward","Steward","Drop board, rota, Sunday review"],
 ["anchor","Anchor","Long form and the Sunday confluence"],
 ["threader","Threader","Threads, Monday opener"],
 ["wire","Wire","Updates, team posts, editions, settlements"],
 ["desk","Desk","Markets context, own reads only"],
 ["studio","Studio","Memes and visuals"],
 ["curator","Curator","Creative work and credit"],
 ["scout","Scout","Ring 3 outreach"]];
const FORMATS=["Update","Long form","Thread","Meme","Creative project","Team comms","Future of TV signal"];
const NODES=["Generative TV","Characters as channels","What the character knows","Community first","The lineage and the world"];
const LEAD=["Confluence: the week gathered","Thread that opens the node","Memes on the node","Future of TV signals","Long form or article","Dev notes","Creative projects"];
const SQ=["A","B","C"];
const DEFAULT_START="2026-11-09";
const $=id=>document.getElementById(id);
const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e};
const state={roles:{},members:[],drops:[],weeks:[],settings:null,filter:"all",canWrite:true,db:null};
let loaded=false;

function iso(d){return d.toISOString().slice(0,10)}
function localISO(d){const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}
function parseDay(s){const [y,m,dd]=s.split("-").map(Number);return new Date(y,m-1,dd)}
function startDay(){return parseDay((state.settings&&state.settings.start)||DEFAULT_START)}
function dayIndex(d){return Math.floor((parseDay(localISO(d))-startDay())/864e5)}
function nodeFor(d){const i=dayIndex(d);if(i<0)return null;return Math.floor(i/7)%5}
function squadFor(d){const i=dayIndex(d);return SQ[((i%3)+3)%3]}
function isoWeek(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));const w=Math.ceil(((t-y)/864e5+1)/7);return t.getUTCFullYear()+"-W"+String(w).padStart(2,"0")}
function weekMonday(key){const m=/^(\d{4})-W(\d{2})$/.exec(key);if(!m)return null;const y=+m[1],w=+m[2];const j4=new Date(y,0,4);const dow=j4.getDay()||7;const mon=new Date(y,0,4-dow+1+(w-1)*7);return mon}
function setStatus(t,warn){const s=$("status");s.textContent=t;s.className="status"+(warn?" warn":"")}
function handle(h){h=(h||"").trim();if(!h)return"";return h.startsWith("@")?h:"@"+h}
function coreHandles(){return ROLES.map(r=>state.roles[r[0]]).filter(r=>r&&r.handle).map(r=>handle(r.handle))}

function suggestRing1(author){
  const cutoff=Date.now()-14*864e5;const count={};
  coreHandles().forEach(h=>count[h]=0);
  state.drops.forEach(d=>{if(Date.parse(d.createdAt||0)<cutoff)return;(d.ring1||[]).forEach(h=>{h=handle(h);if(h in count)count[h]++})});
  const a=handle(author);const off=Math.max(0,dayIndex(new Date()))%8;
  return Object.keys(count).filter(h=>h!==a).map((h,i)=>({h,c:count[h],o:(i+off)%8})).sort((x,y)=>x.c-y.c||x.o-y.o).slice(0,3).map(x=>x.h);
}

/* ---------- Today ---------- */
function renderToday(){
  const now=new Date();const n=nodeFor(now);const sq=squadFor(now);
  const today=localISO(now);const todays=state.drops.filter(d=>d.date===today).length;
  const tiles=[
    ["Node of the week",n==null?"Setup week":"Node "+(n+1)+" · "+NODES[n],n==null?"Node 1 starts "+((state.settings&&state.settings.start)||DEFAULT_START):""],
    ["Lead format",LEAD[now.getDay()],now.toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"short"})],
    ["Squad on duty","Squad "+sq,(state.members.filter(m=>m.squad===sq).length)+" members"],
    ["Drops today",todays+" of 3",todays>=3?"Board is full for today":"Room for "+(3-todays)+" more"]];
  const box=$("today-tiles");box.replaceChildren();
  tiles.forEach((t,i)=>{const d=el("div","tile"+(i===3&&todays>=3?" alert":""));d.append(el("p","k",t[0]),el("p","v",t[1]));if(t[2])d.append(el("p","s",t[2]));box.append(d)});
}

/* ---------- Roster ---------- */
function renderRoster(){
  const tb=$("roster-body");tb.replaceChildren();
  ROLES.forEach(([id,name,desc])=>{
    const r=state.roles[id]||{};const tr=el("tr");
    const tdR=el("td","role",name);tdR.append(el("small",null,desc));
    const nameI=el("input");nameI.id="r-"+id+"-name";nameI.maxLength=40;nameI.value=r.name||"";nameI.placeholder="Open";
    const hI=el("input");hI.id="r-"+id+"-handle";hI.maxLength=40;hI.value=r.handle||"";hI.placeholder="@handle";hI.className="mono";
    const st=el("select");st.id="r-"+id+"-status";["open","proposed","confirmed"].forEach(v=>{const o=el("option",null,v);o.value=v;if((r.status||"open")===v)o.selected=true;st.append(o)});
    const pill=el("span","pill "+(r.status||"open"),r.status||"open");
    const stWrap=el("div");stWrap.style.display="grid";stWrap.style.gap="6px";stWrap.append(pill,st);
    const nI=el("input");nI.id="r-"+id+"-notes";nI.maxLength=200;nI.value=r.notes||"";
    const save=el("button","btn small ghost","Save");save.type="button";save.disabled=!state.canWrite;
    save.addEventListener("click",async()=>{
      const next={name:nameI.value.trim(),handle:handle(hI.value),status:st.value,notes:nI.value.trim(),updatedAt:new Date().toISOString()};
      const cur=state.roles[id]||{};
      if(next.name===(cur.name||"")&&next.handle===(cur.handle||"")&&next.status===(cur.status||"open")&&next.notes===(cur.notes||"")){save.textContent="No change";setTimeout(()=>save.textContent="Save",1200);return}
      save.disabled=true;save.textContent="Saving";
      try{await state.db.doc("roles/"+id).set(next);save.textContent="Saved"}catch(e){save.textContent="Not saved";setStatus("Could not save "+name+": "+(e.message||e.code||"error"),true)}
      setTimeout(()=>{save.textContent="Save";save.disabled=!state.canWrite},1400);
    });
    const tdN=el("td");tdN.append(nameI);const tdH=el("td");tdH.append(hI);const tdS=el("td");tdS.append(stWrap);const tdNo=el("td");tdNo.append(nI);const tdB=el("td");tdB.append(save);
    tr.append(tdR,tdN,tdH,tdS,tdNo,tdB);tb.append(tr);
  });
}

/* ---------- Squads ---------- */
function renderSquads(){
  const box=$("squad-list");box.replaceChildren();const duty=squadFor(new Date());
  SQ.forEach(s=>{
    const p=el("div","panel squad"+(s===duty?" duty":""));
    const h=el("h3",null,"Squad "+s+(s===duty?" · on duty today":""));
    const chips=el("div","chips");
    const mem=state.members.filter(m=>m.squad===s).sort((a,b)=>a.handle.localeCompare(b.handle));
    if(!mem.length)chips.append(el("span","muted","No members yet"));
    mem.forEach(m=>{const c=el("span","chip",m.handle);const x=el("button",null,"×");x.type="button";x.setAttribute("aria-label","Remove "+m.handle);x.disabled=!state.canWrite;
      x.addEventListener("click",async()=>{try{await state.db.doc("members/"+m.id).delete()}catch(e){setStatus("Could not remove "+m.handle,true)}});c.append(x);chips.append(c)});
    const row=el("div","addrow");const i=el("input");i.id="sq-"+s;i.placeholder="@handle";i.maxLength=40;i.className="mono";
    const b=el("button","btn small ghost","Add");b.type="button";b.disabled=!state.canWrite;
    const add=async()=>{const hh=handle(i.value);if(!hh)return;if(state.members.some(m=>m.handle.toLowerCase()===hh.toLowerCase())){setStatus(hh+" is already in a squad",true);return}
      b.disabled=true;try{await state.db.collection("members").add({handle:hh,squad:s,addedAt:new Date().toISOString()});i.value=""}catch(e){setStatus("Could not add "+hh,true)}b.disabled=!state.canWrite};
    b.addEventListener("click",add);i.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();add()}});
    row.append(i,b);p.append(h,chips,row,el("p","hint",mem.length+" members"));box.append(p);
  });
}

/* ---------- Drops ---------- */
function fillSelect(sel,items,withIndex){sel.replaceChildren();items.forEach((t,i)=>{const o=el("option",null,withIndex?(i+1)+" · "+t:t);o.value=withIndex?String(i+1):t;sel.append(o)})}
function openDropForm(){
  const now=new Date();$("d-date").value=localISO(now);
  const n=nodeFor(now);$("d-node").value=String((n==null?0:n)+1);
  $("d-squad").value=squadFor(now);
  ["d-link","d-angle","d-source","d-author","d-r1","d-r2","d-r3"].forEach(k=>$(k).value="");
  const sug=suggestRing1("");$("d-r1").value=sug[0]||"";$("d-r2").value=sug[1]||"";$("d-r3").value=sug[2]||"";
  const today=state.drops.filter(d=>d.date===localISO(now)).length;
  $("drop-hint").textContent=today>=3?"Three drops are already logged today. Save only if this one replaces nothing.":"Ring 1 suggested from who has had the fewest drops in two weeks.";
  $("drop-form-wrap").hidden=false;$("d-format").focus();
}
$("d-author").addEventListener("change",()=>{const s=suggestRing1($("d-author").value);if(!$("d-r1").dataset.touched){$("d-r1").value=s[0]||"";$("d-r2").value=s[1]||"";$("d-r3").value=s[2]||""}});
["d-r1","d-r2","d-r3"].forEach(k=>$(k).addEventListener("input",()=>$("d-r1").dataset.touched="1"));
function dropCard(d){return "DROP · "+d.format+" · node "+d.node+"\nLink: "+d.link+"\nAngle: "+d.angle+"\nSource: "+(d.source||"(none)")+"\nRing 1: "+(d.ring1||[]).filter(Boolean).join(", ")+"  ·  Squad on duty: "+d.squad}
function formDrop(){return{date:$("d-date").value,format:$("d-format").value,node:+$("d-node").value,author:handle($("d-author").value),link:$("d-link").value.trim(),angle:$("d-angle").value.trim(),source:$("d-source").value.trim(),ring1:[$("d-r1").value,$("d-r2").value,$("d-r3").value].map(handle).filter(Boolean),squad:$("d-squad").value}}
async function copyText(t,btn){try{await navigator.clipboard.writeText(t);btn.textContent="Copied"}catch(e){btn.textContent="Copy failed"}setTimeout(()=>btn.textContent=btn.dataset.label,1500)}
$("drop-card").dataset.label="Copy drop card";
$("drop-card").addEventListener("click",e=>copyText(dropCard(formDrop()),e.currentTarget));
$("new-drop").addEventListener("click",openDropForm);
$("drop-cancel").addEventListener("click",()=>{$("drop-form-wrap").hidden=true;delete $("d-r1").dataset.touched});
$("drop-form").addEventListener("submit",async e=>{
  e.preventDefault();const d=formDrop();d.createdAt=new Date().toISOString();d.outsideReplies=null;d.outsideQuotes=null;d.bookmarks=null;d.confluence=false;d.notes="";
  const btn=e.submitter||e.target.querySelector("[type=submit]");btn.disabled=true;
  try{await state.db.collection("drops").add(d);$("drop-form-wrap").hidden=true;delete $("d-r1").dataset.touched;setStatus("Drop logged.")}catch(err){setStatus("Could not log the drop: "+(err.message||err.code||"error"),true)}
  btn.disabled=false;
});
document.querySelectorAll(".filters button").forEach(b=>b.addEventListener("click",()=>{state.filter=b.dataset.f;document.querySelectorAll(".filters button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderDrops()}));
function isLive(d){return Date.now()-Date.parse(d.createdAt||0)<48*3600e3}
function needsNumbers(d){return !isLive(d)&&(d.outsideReplies==null||d.outsideQuotes==null)}
function renderDrops(){
  const box=$("drop-list");box.replaceChildren();
  let list=state.drops.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
  if(state.filter==="live")list=list.filter(isLive);
  if(state.filter==="todo")list=list.filter(needsNumbers);
  if(state.filter==="flag")list=list.filter(d=>d.confluence);
  if(!list.length){box.append(el("div","empty",state.drops.length?"Nothing under this filter.":"No drops logged yet. The first one appears here after you press Log a drop."));return}
  list.forEach(d=>{
    const card=el("article","panel drop");
    const top=el("div","drop-top");const meta=el("div","drop-meta");
    meta.append(el("span","pill "+(isLive(d)?"live":"closed"),isLive(d)?"live":"closed"));
    if(needsNumbers(d))meta.append(el("span","pill proposed","needs numbers"));
    if(d.confluence)meta.append(el("span","pill flag","confluence"));
    meta.append(el("span",null,d.date+" · "+d.format+" · node "+d.node+" "+(NODES[d.node-1]||"")+" · "+(d.author||"")));
    const actions=el("div","actions");const cp=el("button","btn small ghost","Copy card");cp.type="button";cp.dataset.label="Copy card";cp.addEventListener("click",()=>copyText(dropCard(d),cp));
    const del=el("button","btn small danger","Delete");del.type="button";del.disabled=!state.canWrite;
    del.addEventListener("click",()=>{if(del.dataset.armed){state.db.doc("drops/"+d.id).delete().catch(()=>setStatus("Could not delete the drop",true));return}del.dataset.armed="1";del.textContent="Press again to delete";setTimeout(()=>{delete del.dataset.armed;del.textContent="Delete"},3000)});
    actions.append(cp,del);top.append(meta,actions);
    const link=el("a","drop-link",d.link);link.href=d.link;link.target="_blank";link.rel="noopener";
    const ang=el("p","drop-angle",d.angle);
    const ring=el("p","drop-meta","Ring 1: "+((d.ring1||[]).join(", ")||"none")+" · Squad "+d.squad+(d.source?" · Source: "+d.source:""));
    const res=el("div","results");
    const num=(k,lab)=>{const l=el("label",null,lab);const i=el("input");i.type="number";i.min="0";i.step="1";i.id="x-"+d.id+"-"+k;if(d[k]!=null)i.value=d[k];l.append(i);return [l,i]};
    const [l1,i1]=num("outsideReplies","Outside replies"),[l2,i2]=num("outsideQuotes","Outside quotes"),[l3,i3]=num("bookmarks","Bookmarks");
    const cl=el("label","check");const cb=el("input");cb.type="checkbox";cb.id="x-"+d.id+"-conf";cb.checked=!!d.confluence;cl.append(cb,document.createTextNode("For Sunday confluence"));
    const nl=el("label",null,"Notes");nl.style.flex="1 1 200px";const ni=el("input");ni.id="x-"+d.id+"-notes";ni.maxLength=300;ni.value=d.notes||"";nl.append(ni);
    const sv=el("button","btn small","Save numbers");sv.type="button";sv.disabled=!state.canWrite;
    sv.addEventListener("click",async()=>{
      const v=i=>i.value===""?null:Math.max(0,parseInt(i.value,10)||0);
      const patch={outsideReplies:v(i1),outsideQuotes:v(i2),bookmarks:v(i3),confluence:cb.checked,notes:ni.value.trim()};
      if(Object.keys(patch).every(k=>(d[k]??null)===patch[k]||(k==="notes"&&(d.notes||"")===patch.notes)||(k==="confluence"&&!!d.confluence===patch.confluence))){sv.textContent="No change";setTimeout(()=>sv.textContent="Save numbers",1200);return}
      sv.disabled=true;try{await state.db.doc("drops/"+d.id).update(patch);sv.textContent="Saved"}catch(e){sv.textContent="Not saved"}setTimeout(()=>{sv.textContent="Save numbers";sv.disabled=!state.canWrite},1400)});
    res.append(l1,l2,l3,cl,nl,sv);
    card.append(top,link,ang,ring,res);box.append(card);
  });
}

/* ---------- Weeks ---------- */
function weekDrops(key){const mon=weekMonday(key);if(!mon)return[];const a=localISO(mon),b=localISO(new Date(mon.getTime()+6*864e5));return state.drops.filter(d=>d.date>=a&&d.date<=b)}
function prefillWeek(key){
  const mon=weekMonday(key);const n=mon?nodeFor(mon):null;$("w-node").value=n==null?"Setup week":"Node "+(n+1)+" · "+NODES[n];
  const w=state.weeks.find(x=>x.id===key)||{};
  const ds=weekDrops(key);const sum=k=>ds.reduce((s,d)=>s+(d[k]||0),0);
  const set=(id,v)=>{$(id).value=v==null?"":v};
  set("w-replies",w.outsideReplies??(ds.length?sum("outsideReplies"):""));set("w-quotes",w.outsideQuotes??(ds.length?sum("outsideQuotes"):""));
  set("w-inside",w.inside);set("w-followers",w.followers);set("w-echoes",w.echoes);set("w-notes",w.notesMutes);
  set("w-worked",w.worked);set("w-change",w.change);set("w-link",w.link);
  $("week-hint").textContent=ds.length+" drops logged this week"+(w.id?" · review saved before":"");
}
$("w-week").addEventListener("change",()=>{const k=$("w-week").value.trim().toUpperCase();$("w-week").value=k;if(/^\d{4}-W\d{2}$/.test(k))prefillWeek(k)});
$("week-form").addEventListener("submit",async e=>{
  e.preventDefault();const key=$("w-week").value.trim().toUpperCase();if(!/^\d{4}-W\d{2}$/.test(key)){$("week-hint").textContent="Write the week as 2026-W46.";return}
  const n=v=>v===""?null:Math.max(0,parseInt(v,10)||0);
  const doc={week:key,node:$("w-node").value,outsideReplies:n($("w-replies").value),outsideQuotes:n($("w-quotes").value),inside:n($("w-inside").value),followers:n($("w-followers").value),echoes:n($("w-echoes").value),notesMutes:n($("w-notes").value),worked:$("w-worked").value.trim(),change:$("w-change").value.trim(),link:$("w-link").value.trim(),savedAt:new Date().toISOString()};
  try{await state.db.doc("weeks/"+key).set(doc);$("week-hint").textContent="Week saved."}catch(err){$("week-hint").textContent="Not saved: "+(err.message||err.code||"error")}
});
function renderWeeks(){
  const box=$("week-list");box.replaceChildren();
  const list=state.weeks.slice().sort((a,b)=>b.id.localeCompare(a.id));
  if(!list.length){box.append(el("div","empty","No reviews yet. The first Sunday review shows up here."));return}
  list.forEach(w=>{const c=el("article","panel week");c.append(el("h3",null,w.id+" · "+(w.node||"")));
    const dl=el("dl");const ratio=(w.inside&&w.outsideReplies!=null)?((w.outsideReplies+(w.outsideQuotes||0))/w.inside).toFixed(2):"–";
    [["Outside replies",w.outsideReplies],["Outside quotes",w.outsideQuotes],["Outside/inside",ratio],["Followers",w.followers],["Echoes",w.echoes],["Notes, mutes",w.notesMutes]].forEach(([k,v])=>{dl.append(el("dt",null,k),el("dd",null,v==null?"–":String(v)))});
    c.append(dl);if(w.worked)c.append(el("p",null,"Worked: "+w.worked));if(w.change)c.append(el("p",null,"Next: "+w.change));
    if(w.link){const a=el("a","drop-link",w.link);a.href=w.link;a.target="_blank";a.rel="noopener";c.append(a)}
    const ed=el("button","btn small ghost","Edit");ed.type="button";ed.addEventListener("click",()=>{$("w-week").value=w.id;prefillWeek(w.id);$("review").scrollIntoView()});c.append(ed);
    box.append(c)});
}

/* ---------- Settings ---------- */
$("settings-form").addEventListener("submit",async e=>{e.preventDefault();const v=$("s-start").value;if(!v)return;
  if(parseDay(v).getDay()!==1){$("settings-hint").textContent="Pick a Monday.";return}
  if(state.settings&&state.settings.start===v){$("settings-hint").textContent="No change.";return}
  try{await state.db.doc("settings/main").set({start:v});$("settings-hint").textContent="Saved."}catch(err){$("settings-hint").textContent="Not saved."}});

function renderAll(){renderToday();renderRoster();renderSquads();renderDrops();if(!$("w-week").value){$("w-week").value=isoWeek(new Date());}prefillWeek($("w-week").value);renderWeeks();if(!$("s-start").matches(":focus"))$("s-start").value=(state.settings&&state.settings.start)||DEFAULT_START}

fillSelect($("d-format"),FORMATS,false);fillSelect($("d-node"),NODES,true);
renderAll();


/* ---------- the desk: sign-in and storage ---------- */
const DESK="https://ubikistan-guest-desk.ubikistan-archive.workers.dev";
let TOKEN=null;try{TOKEN=localStorage.getItem("ubk.session")}catch(e){}
function setToken(t){TOKEN=t;try{t?localStorage.setItem("ubk.session",t):localStorage.removeItem("ubk.session")}catch(e){}}
(function signedIn(){const h=location.hash||"";if(!h.startsWith("#/signed-in"))return;const q={};(h.split("?")[1]||"").split("&").forEach(p=>{const [k,v]=p.split("=");if(k)q[decodeURIComponent(k)]=decodeURIComponent((v||"").replace(/\+/g," "))});let mine="";try{mine=sessionStorage.getItem("ubk.nonce")||"";sessionStorage.removeItem("ubk.nonce")}catch(e){}if(q.t&&q.n&&q.n===mine)setToken(q.t);history.replaceState(null,"",location.pathname)})();
function signIn(p){const n=Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,"0")).join("");try{sessionStorage.setItem("ubk.nonce",n)}catch(e){}location.href=DESK+"/auth/"+p+"?return="+encodeURIComponent(location.origin+location.pathname)+"&nonce="+n}
async function api(m,path,body){let r;try{r=await fetch(DESK+path,{method:m,headers:Object.assign({Authorization:"Bearer "+TOKEN},body?{"Content-Type":"application/json"}:{}),body:body?JSON.stringify(body):undefined})}catch(e){const x=new Error("The desk did not answer. Check your connection.");x.status=0;throw x}
  const j=await r.json().catch(()=>({}));if(!r.ok){const x=new Error(j.error||"The desk refused this.");x.status=r.status;throw x}return j}
const cache={roles:{},members:{},drops:{},weeks:{},settings:{}};const subs={};let YOU=null,CREW=[];
function emit(){Object.keys(subs).forEach(k=>{const [c,id]=k.split("/");const s=id?{id,exists:id in cache[c],data:()=>cache[c][id]}:(()=>{const docs=Object.keys(cache[c]).map(i=>({id:i,exists:true,data:()=>cache[c][i]}));return{docs,size:docs.length,empty:!docs.length}})();subs[k].forEach(fn=>fn(s))})}
let boardWeek="";
function weekKey(off){const d=new Date(Date.now()+off*7*864e5);const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y=new Date(Date.UTC(t.getUTCFullYear(),0,1));return t.getUTCFullYear()+"-W"+String(Math.ceil(((t-y)/864e5+1)/7)).padStart(2,"0")}
async function loadBoard(){let b;try{b=await api("GET","/ripple/board"+(boardWeek?"?week="+boardWeek:""))}catch(e){return}
  const tb=$("board-body");tb.replaceChildren();$("board-sub").textContent="Week "+b.week+". Ranked by impact of posts about UBIK on X, measured 48 hours after each post. Up to "+b.per_day+" posts a day count per person.";
  if(!b.rows.length){const tr=el("tr");const td=el("td","muted","No linked posts this week yet.");td.colSpan=6;tr.append(td);tb.append(tr)}
  b.rows.forEach((r,i)=>{const tr=el("tr");const best=el("td");if(r.best){const a=el("a","drop-link",r.best.kind+" · "+r.best.impact);a.href=r.best.url;a.target="_blank";a.rel="noopener";best.append(a)}else best.append(el("span","muted","–"));
    tr.append(el("td","num",String(i+1)),el("td","mono","@"+r.handle),el("td","num",String(r.impact)),el("td","num",String(r.counted)),el("td","num",r.pending?String(r.pending):"–"),best);tb.append(tr)});
  $("board-chat").textContent=b.chat.length?"Most active in the Telegram groups this week: "+b.chat.map(x=>x.who+" ("+x.msgs+")").join(", "):""}
$("board-prev").addEventListener("click",()=>{boardWeek=weekKey(-1);$("board-prev").setAttribute("aria-pressed","true");$("board-now").setAttribute("aria-pressed","false");loadBoard()});
$("board-now").addEventListener("click",()=>{boardWeek="";$("board-now").setAttribute("aria-pressed","true");$("board-prev").setAttribute("aria-pressed","false");loadBoard()});
async function refresh(){loadBoard();const j=await api("GET","/ripple");Object.keys(cache).forEach(k=>cache[k]={});(j.docs||[]).forEach(d=>{if(cache[d.coll])cache[d.coll][d.id]=d.data});CREW=j.crew||[];YOU=j.you||null;emit();renderAccount();renderCrew()}
async function put(c,id,data){await api("POST","/ripple/put",{coll:c,id,data});cache[c][id]=data;emit()}
const deskDb={
  collection(c){return{onSnapshot(fn){(subs[c]=subs[c]||[]).push(fn)},async add(data){const id=Date.now().toString(36)+Math.random().toString(36).slice(2,7);await put(c,id,data);return{id}}}},
  doc(path){const [c,id]=path.split("/");return{onSnapshot(fn){(subs[path]=subs[path]||[]).push(fn)},async set(data){await put(c,id,data)},async update(p){await put(c,id,Object.assign({},cache[c][id]||{},p))},async delete(){await api("POST","/ripple/del",{coll:c,id});delete cache[c][id];emit()}}}};

function renderAccount(){const a=$("account");a.replaceChildren();
  if(!TOKEN){a.append(el("span","muted","Not signed in"));return}
  a.append(el("span",null,YOU?"Signed in as @"+YOU.handle+(YOU.admin?" · State Archive":""):"Signed in"));
  const out=el("button","btn small ghost","Sign out");out.type="button";out.addEventListener("click",()=>{setToken(null);location.reload()});a.append(out)}
function gate(mode,msg){
  const g=$("gate"),d=$("desk"),n=$("desk-nav");
  if(mode==="ok"){g.hidden=true;d.hidden=false;n.hidden=false;return}
  d.hidden=true;n.hidden=true;g.hidden=false;g.replaceChildren();
  const h=el("h2",null,mode==="signin"?"Sign in to open the logbook":mode==="denied"?"Not on the crew yet":"The logbook did not open");
  const p=el("p",null,mode==="signin"?"The logbook is for the Project Red Ripple core group. Sign in with your X account; the Steward adds your handle to the crew.":msg||"Try again in a minute.");
  g.append(h,p);
  const row=el("div","actions");
  if(mode!=="error"){const x=el("button","btn","Sign in with X");x.type="button";x.addEventListener("click",()=>signIn("x"));const gh=el("button","btn ghost","Sign in with GitHub");gh.type="button";gh.addEventListener("click",()=>signIn("github"));row.append(x,gh)}
  else{const r=el("button","btn","Try again");r.type="button";r.addEventListener("click",start);row.append(r)}
  g.append(row)}
function renderCrew(){const box=$("crew-panel");if(!box)return;box.hidden=!(YOU&&YOU.admin);if(box.hidden)return;
  const chips=$("crew-chips");chips.replaceChildren();if(!CREW.length)chips.append(el("span","muted","Nobody on the crew yet"));
  CREW.forEach(h=>{const c=el("span","chip","@"+h);const x=el("button",null,"×");x.type="button";x.setAttribute("aria-label","Remove @"+h);
    x.addEventListener("click",async()=>{try{const j=await api("POST","/ripple/crew",{remove:h});CREW=j.crew;renderCrew()}catch(e){$("crew-hint").textContent=e.message}});c.append(x);chips.append(c)})}
$("crew-add").addEventListener("click",async()=>{const v=$("crew-handle").value.trim();if(!v)return;try{const j=await api("POST","/ripple/crew",{add:v});CREW=j.crew;$("crew-handle").value="";$("crew-hint").textContent="Added.";renderCrew()}catch(e){$("crew-hint").textContent=e.message}});
$("crew-handle").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("crew-add").click()}});

let started=false,poll=null;
async function start(){
  renderAccount();
  if(!TOKEN){gate("signin");setStatus("");return}
  setStatus("Opening the logbook…");
  if(!started){started=true;state.db=deskDb;const db=deskDb;
    db.collection("roles").onSnapshot(s=>{state.roles={};s.docs.forEach(d=>state.roles[d.id]=d.data()||{});renderRoster();renderToday()});
    db.collection("members").onSnapshot(s=>{state.members=s.docs.map(d=>Object.assign({id:d.id},d.data()));renderSquads();renderToday()});
    db.collection("drops").onSnapshot(s=>{state.drops=s.docs.map(d=>Object.assign({id:d.id},d.data()));renderDrops();renderToday();prefillWeek($("w-week").value)});
    db.collection("weeks").onSnapshot(s=>{state.weeks=s.docs.map(d=>Object.assign({id:d.id},d.data()));renderWeeks()});
    db.doc("settings/main").onSnapshot(s=>{state.settings=s.exists?s.data():null;renderAll()});}
  try{await refresh();gate("ok");setStatus("Up to date. Changes save for the whole crew; the page refreshes every 30 seconds.");
    if(!poll)poll=setInterval(()=>{if(document.visibilityState==="visible")refresh().catch(()=>{})},30000)}
  catch(e){if(e.status===401){setToken(null);gate("signin");setStatus("")}else if(e.status===403){gate("denied",e.message);setStatus("")}else{gate("error",e.message);setStatus(e.message,true)}}
}
start();
})();
