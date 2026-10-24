// ---- live data from ubik.gold, through the desk ----
// The page carries no holder content. It renders the public snapshot inlined below at once, then asks
// the desk for the current edition (public, or with the holder's own key the holder view), and for the
// archive of earlier editions the desk keeps. The key lives in this browser only.
const DESK = (()=>{ const m=document.querySelector('meta[name="desk"]'); const v=m&&m.content&&!/^%/.test(m.content)?m.content.replace(/\/$/,""):""; if(v) return v; if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return (location.port==="5173"||location.port==="4173") ? "/api" : "http://localhost:8787"; return "https://ubikistan-guest-desk.ubikistan-archive.workers.dev"; })();
const UBIK_HOME = "https://ubik.gold";
const KEY_HOME = "https://app.ubik.gold";   // where a holder signs in for a key
const THRESHOLD = "200,000 UBIK";
let F=[], CURRENTS=[], TS={}, RESOLVED_AT={}, GEO={}, AGENT_ED={date:"",updated:"",sources:0,developments:0,thesis:"",change:[],watch:[]};
let EDITIONS=[], EDITION_DAY="", EDITION_LONG="", EDITION_TITLE="", EDITION_UPDATED="", LEDE="", LOCKED="", STANDING="none", LIVE=false, SHOWING="current", RAW=null;
let byId={}, LAST_CHANGE="";

const T_KEYS = {
 ukraine:["ukraine","kyiv","putin","zelensky","russia","patriot","hungary"],
 gulf:["saudi","yemen","houthi","riyadh","aramco","brent","opec","yanbu","iraq"],
 iran:["iran","hormuz","israel","tehran","netanyahu"],
 europe:["france","french","paris","yellow vest","eu ","european","germany","moody","macron"],
 india:["india","delhi","rupee","rbi"],
 americas:["brazil","lula","mexico","argentina"],
 asia:["china","shenzhen","japan","korea","taiwan","indonesia","kospi"],
 ai:["ai ","chip","meta ","nvidia","data cent","sk hynix","samsung","tsmc","hynix","openai","anthropic","oracle"],
 crypto:["bitcoin","polymarket","cftc","crypto"],
 markets:["fed ","federal reserve","treasury","i-bond","bond"],
};
function updatedTag(iso){ if(!iso) return ""; const d=new Date(iso); if(isNaN(d)) return ""; const day=d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}), hm=d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:false}); return `updated ${day} ${hm}`; }
function themeOf(text, dflt="markets"){ if(!text) return dflt; const t=text.toLowerCase()+" "; for(const k in T_KEYS) if(T_KEYS[k].some(w=>t.includes(w))) return k; return dflt; }
const CUR_THEME = {"ukraine-winter-grid":"ukraine","gulf-oil-war":"gulf","iran-strike-israel-vote":"iran","france-cost-revolt":"europe","ai-buildout-money":"ai"};
const G_KEYS = [["kyiv",[50.45,30.52,"Kyiv"]],["ukrain",[50.45,30.52,"Kyiv"]],["moscow",[55.75,37.62,"Moscow"]],["shenzhen",[22.54,114.06,"Shenzhen"]],["putin",[22.54,114.06,"Shenzhen"]],
 ["saudi",[24.71,46.68,"Riyadh"]],["riyadh",[24.71,46.68,"Riyadh"]],["yemen",[15.37,44.19,"Sanaa"]],["iran",[35.69,51.39,"Tehran"]],["israel",[31.77,35.22,"Jerusalem"]],["hormuz",[26.57,56.25,"Strait of Hormuz"]],
 ["france",[48.86,2.35,"Paris"]],["french",[48.86,2.35,"Paris"]],["paris",[48.86,2.35,"Paris"]],["brazil",[-15.79,-47.88,"Brasília"]],["iraq",[33.31,44.37,"Baghdad"]],["taiwan",[25.03,121.57,"Taipei"]],
 ["korea",[37.57,126.98,"Seoul"]],["kospi",[37.57,126.98,"Seoul"]],["delhi",[28.61,77.21,"New Delhi"]],["india",[19.08,72.88,"Mumbai"]],["indonesia",[-6.21,106.85,"Jakarta"]],["russia",[55.75,37.62,"Moscow"]],
 ["diesel",[55.75,37.62,"Moscow"]],["meta ",[37.48,-122.15,"Menlo Park"]],["nvidia",[37.39,-121.96,"Santa Clara"]],["fed",[38.90,-77.04,"Washington"]],["i-bond",[38.90,-77.04,"Washington"]],
 ["america",[38.90,-77.04,"Washington"]],["us ",[38.90,-77.04,"Washington"]],["chip",[25.03,121.57,"Taipei"]],["egypt",[30.04,31.24,"Cairo"]],["china",[39.90,116.40,"Beijing"]]];
function geoOf(q){ const t=q.toLowerCase()+" "; for(const [k,v] of G_KEYS) if(t.includes(k)) return v; return null; }
const ABBR=/\b(U\.S|U\.K|U\.N|Nov|Oct|Dec|Sept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|St|Mr|Dr)\./g;
const longDate=d=>{ const [y,m,dd]=d.split("-"); return `${+dd} ${["January","February","March","April","May","June","July","August","September","October","November","December"][+m-1]} ${y}`; };
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

// raw = {synthesis, open, settled} as the desk hands them (synthesis with include=all; open/settled as /forecasts)
function transform(raw){
  const syn=raw.synthesis||{}, meth=syn.methodology||{}, meta=syn.meta||{};
  const list=x=>Array.isArray(x)?x:(x&&x.data)||[];
  const all={}; for(const f of [...list(raw.open),...list(raw.settled),...(syn.forecasts||[])]) if(!all[f.question_id]) all[f.question_id]=f;
  const inEd=new Set((syn.forecasts||[]).map(f=>f.question_id));
  const date=(meta.updated_at||meta.revised_at||new Date().toISOString()).slice(0,10); // the edition is its publication day; revisions keep the day
  const hist=f=>{ const h=(f.history||[]).map(e=>Array.isArray(e)?{at:e[0],probability:e[1],why:e[2]}:e); return h.length?h:[{at:f.updated_at||meta.revised_at||date,probability:f.probability,why:null}]; };
  const out={F:[],TS:{},RESOLVED_AT:{},GEO:{},CURRENTS:[],DATE:date,LONG:longDate(date),UPDATED:meta.revised_at||meta.updated_at||"",FIRST:meta.updated_at||meta.revised_at||"",LOCKED:meta.locked||""};
  for(const f of Object.values(all).sort((a,b)=>hist(b)[0].at.localeCompare(hist(a)[0].at))){
    const h=hist(f), id=f.question_id, status=["open","yes","no"].includes(f.status)?f.status:(["yes","no"].includes(f.outcome)?f.outcome:"open");
    out.TS[id]=h.map(e=>[e.at,e.probability]);
    const o={id, theme:themeOf(f.claim,null)||themeOf((f.reasoning||"").slice(0,300)), q:f.claim, hist:h.map(e=>[e.at.slice(0,10),e.probability]), due:f.deadline, status, locked:!!f.locked};
    const g=geoOf(f.claim); if(g) out.GEO[id]=g;
    if(f.resolved_at){ o.resolved=f.resolved_at.slice(0,10); out.RESOLVED_AT[id]=f.resolved_at; }
    if(f.outcome) o.outcome=f.outcome;
    if(f.brier!=null) o.brier=f.brier;
    if(inEd.has(id)) o.edition=true;
    const why=h[0].why||(f.reasoning||"").split(". ")[0]; if(why) o.why=why;
    if(h.length>1&&h[h.length-1].why) o.change=h[h.length-1].why;
    let ev=f.evidence; if(ev&&typeof ev==="object") ev=(ev.quote||"")+(ev.url?` (${ev.url.split("/")[2]})`:""); if(ev) o.evidence=ev;
    for(const [s,d] of [["resolution_rule","rule"],["resolution_source","source"],["reasoning","reasoning"],["uncertainty","uncertainty"],["rises_if","confirmation"],["falls_if","disconfirmation"],["note","note"]]) if(f[s]) o[d]=f[s];
    if(Array.isArray(f.chain)&&f.chain.length) o.chain=f.chain.map(c=>typeof c==="string"?c:(c.step||c.text||JSON.stringify(c)));
    if(Array.isArray(f.theses)&&f.theses.length){ const t=f.theses[0]; o.thesis=typeof t==="string"?t:(t.thesis||t.text||t.claim||""); }
    out.F.push(o);
  }
  // currents from the prose
  const prose=syn.prose||"", parts=prose.split(/^## /m), intro=parts[0];
  const introParas=intro.split(/\n\s*\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith("# "));
  out.LEDE=introParas[0]||meth.thesis||"";
  const hm=/^#\s+(.+)$/m.exec(prose); out.TITLE=hm?hm[1].trim():`The world on ${out.LONG}`;
  const plain=md=>md.replace(/\[([^\]]+)\]\(\/forecasts\/[^)]+\)/g,"$1").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").trim();
  const devs={}; for(const d of meth.developments||[]) devs[d.id]=d;
  const comp=(meth.interpretation||{}).competing_explanations||""; const compMap={};
  for(const m of comp.matchAll(/(Ukraine|Gulf|Iran|France|AI):\s*(.+?)(?=(?:\s(?:Ukraine|Gulf|Iran|France|AI):)|$)/gs)) compMap[m[1]]=m[2].trim();
  const COMP={ukraine:"Ukraine",gulf:"Gulf",iran:"Iran",europe:"France",ai:"AI"};
  parts.slice(1).forEach((sec,i)=>{
    const nl=sec.indexOf("\n"); const head=sec.slice(0,nl).trim(), body=sec.slice(nl+1);
    const paras=body.split(/\n\s*\n/).map(plain).filter(Boolean);
    const fids=[...sec.matchAll(/\]\(\/forecasts\/([^)]+)\)/g)].map(m=>m[1]);
    const cur=(meth.currents||[])[i]||{};
    const theme=CUR_THEME[cur.id]||themeOf(head);
    const lines=(cur.development_ids||[]).filter(x=>devs[x]).slice(0,3).map(x=>["r",devs[x].title]);
    const mech=cur.mechanism||""; const first=mech?mech.split(". ")[0].replace(/\.$/,"")+".":""; if(first) lines.push(["i",first]);
    out.CURRENTS.push({theme, n:String(i+1).padStart(2,"0"), still:null, film:null, cid:cur.id||`sec-${i+1}`, h:head, short:cur.short_title||head, lines, fcs:fids, mech,
      chain:mech.replace(ABBR,(m,a)=>a.replace(".","")), body:paras, contrary:compMap[COMP[theme]]||comp||"", locked:!!cur.locked||(!!meta.gate&&i>0&&paras.length<=1)});
  });
  // agent edition
  const interp=meth.interpretation||{};
  const change=[]; for(const s0 of (interp.what_would_change_the_view||"").split(/(?<=\.)\s+/)){ const s=s0.trim(); if(!s) continue; const m=/^(.+?)\s+would\s+(.+)$/.exec(s); change.push(m?[themeOf(s),m[1],"would "+m[2]]:[themeOf(s),s,""]); }
  const D=new Date(date+"T12:00:00Z");
  const watch=(meth.watch||[]).map(w=>{ const i=w.indexOf(":"); const label=i>0?w.slice(0,i).trim():"", what=i>0?w.slice(i+1).trim():w; let iso="any"; const m=/^([A-Za-z]+)\.?\s+(\d+)/.exec(label); if(m&&MONTHS[m[1].toLowerCase().slice(0,3)]){ const mo=MONTHS[m[1].toLowerCase().slice(0,3)]; const yr=mo>=D.getUTCMonth()+1?D.getUTCFullYear():D.getUTCFullYear()+1; iso=`${yr}-${String(mo).padStart(2,"0")}-${String(+m[2]).padStart(2,"0")}`; } return [iso,label,what,themeOf(what)]; });
  const srcm=/(\d+) sources/.exec(JSON.stringify(meta.include||{}));
  out.AGENT_ED={date, updated:meta.revised_at||meta.updated_at||"", sources:srcm?+srcm[1]:0, developments:(meth.developments||[]).length, thesis:meth.thesis||"", argument:interp.argument||"", stakes:interp.human_stakes||"", change, watch};
  return out;
}
const keyOf=()=>{ try{ return localStorage.getItem("ubik-key")||""; }catch(e){ return ""; } };
function parseKey(s){
  s=(s||"").trim();
  const m=/\bubik_[A-Za-z0-9._~-]{11,123}\b/.exec(s);
  if(m) return m[0];
  return /^[A-Za-z0-9._~-]{16,128}$/.test(s)?s:"";
}
async function deskGet(path, withKey=true, retry=1){
  const headers={}; const k=withKey?keyOf():""; if(k) headers["Authorization"]="Bearer "+k;
  let r; try{ r=await fetch(DESK+"/ubik"+path,{headers}); }catch(e){ if(retry>0){ await new Promise(res=>setTimeout(res,2500)); return deskGet(path,withKey,retry-1); } throw new Error("network"); }
  const standing=r.headers.get("x-ubik-key")||(k?"invalid":"none");
  if(r.status===451){ notAvailable(); throw new Error("451"); }
  if(r.status===429){ const e=new Error("429"); e.retryAfter=r.headers.get("retry-after")||"60"; throw e; }
  if(!r.ok){ if(retry>0&&r.status>=500){ await new Promise(res=>setTimeout(res,2500)); return deskGet(path,withKey,retry-1); } throw new Error(`desk ${path}: ${r.status}`); }
  return {body:await r.json(), standing};
}
async function deskGetForecasts(path, withKey=true, retry=1){
  const first=await deskGet(path,withKey,retry);
  let all=Array.isArray(first.body)?first.body:(Array.isArray(first.body&&first.body.data)?first.body.data:[]);
  if(Array.isArray(first.body)) return first;
  let next=first.body&&first.body.meta&&first.body.meta.links&&first.body.meta.links.next;
  const seen=new Set([path]);
  while(next&&!seen.has(next)&&seen.size<50){
    seen.add(next);
    let p=next;
    if(p.startsWith("http://")||p.startsWith("https://")){ try{ const u=new URL(p); p=u.pathname+u.search; }catch(e){} }
    if(!p.startsWith("/")) p="/"+p;
    try{
      const res=await deskGet(p,withKey,retry);
      const data=Array.isArray(res.body)?res.body:(Array.isArray(res.body&&res.body.data)?res.body.data:[]);
      all=all.concat(data);
      next=res.body&&res.body.meta&&res.body.meta.links&&res.body.meta.links.next;
    }catch(e){ break; }
  }
  return {body:{...(first.body||{}),data:all},standing:first.standing};
}
async function loadCurrent(){
  const [syn,open,settled]=await Promise.all([deskGet("/synthesis?include=all"),deskGetForecasts("/forecasts?status=open&include=history,details"),deskGetForecasts("/forecasts?status=settled&include=history,details")]);
  STANDING=keyOf()?syn.standing:"none"; LIVE=true;
  applyEdition({synthesis:syn.body,open:open.body,settled:settled.body},"current");
  try{ await loadMarkets(); renderAll(); }catch(e){}
}
async function loadEditions(){
  try{ const {body}=await deskGet("/editions",false); const kept=(body.editions||[]).filter(e=>e.day!==EDITION_DAY||SHOWING!=="current");
    EDITIONS=[{d:EDITION_DAY,title:EDITION_TITLE,sum:LEDE,current:true,live:true},...kept.map(e=>({d:e.day,title:e.title,sum:"",holder:e.holder_part,updated:e.revised_at}))];
  }catch(e){ EDITIONS=[{d:EDITION_DAY,title:EDITION_TITLE,sum:LEDE,current:true,live:true}]; }
  if(view==="ledger"&&pane==="history") renderHistory(); if(view==="films") renderFilms();
}
async function openEdition(day){
  const {body,standing}=await deskGet("/editions/"+day); if(keyOf()) STANDING=standing;
  applyEdition(body,day);
}
function applyEdition(raw, showing){
  RAW=raw; SHOWING=showing; const t=transform(raw);
  F=t.F; CURRENTS=t.CURRENTS; TS=t.TS; RESOLVED_AT=t.RESOLVED_AT; GEO=t.GEO; AGENT_ED=t.AGENT_ED; EDITION_DAY=t.DATE; EDITION_LONG=t.LONG; EDITION_TITLE=t.TITLE; EDITION_UPDATED=t.UPDATED; LEDE=t.LEDE; LOCKED=t.LOCKED;
  TODAY=(showing==="current"&&new Date().toISOString().slice(0,10)>=EDITION_DAY)?new Date().toISOString().slice(0,10):(EDITION_DAY||new Date().toISOString().slice(0,10));
  byId=Object.fromEntries(F.map(f=>[f.id,f])); const ch=changes(); LAST_CHANGE=ch.length?ch[0].t:(t.UPDATED||new Date().toISOString());
  if(!EDITIONS.length||showing==="current") EDITIONS=[{d:EDITION_DAY,title:EDITION_TITLE,sum:LEDE,current:true,live:true},...EDITIONS.filter(e=>!e.live&&e.d!==EDITION_DAY)];
  const open=F.filter(f=>f.status==="open"), res=F.filter(f=>f.resolved), moved=F.filter(f=>TS[f.id].slice(1).some(e=>e[0].slice(0,10)===EDITION_DAY)).length;
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
  set("edate",EDITION_TITLE); set("ekick",`The world on ${EDITION_LONG} · ${updatedTag(EDITION_UPDATED)}`); set("elede",LEDE); set("cover-h",EDITION_TITLE); set("cover-k",`The world on ${EDITION_LONG} · ${updatedTag(EDITION_UPDATED)}`); set("agdate",`AGENT EDITION · ${EDITION_DAY} · FOR MODELS, AGENTS AND THE PEOPLE WHO RUN THEM`); set("agtitle",`The world on ${EDITION_LONG}, as data.`);
  const counts=document.getElementById("counts"); if(counts) counts.innerHTML=`<span><b>${CURRENTS.length}</b> currents</span><span><b>${open.length}</b> open forecasts</span><span><b>${moved}</b> changes of mind today</span><span><b>${AGENT_ED.sources}</b> sources</span><span class="sep"></span><span id="score"></span>`;
  const st=document.getElementById("stamp"); if(st) st.textContent=`EDITION ${EDITION_DAY} · ${showing==="current"?(LIVE?"LIVE":"SNAPSHOT"):"FROM THE ARCHIVE"}`;
  if(showing==="current"){ FIRST_AT=t.FIRST||""; startNextClock(); }
  renderResolved(); renderAll();
  if(typeof selected==="string"&&selected){
    if(selected.startsWith("sec:")) selectSection(selected.slice(4));
    else if(byId[selected]){ const cur=selected; selected=null; select(cur); }
  }
  renderGate(); if(typeof renderAgent==="function") renderAgent(); if(typeof renderFilms==="function"&&view==="films") renderFilms();
  if(typeof view!=="undefined"&&view==="ledger"&&typeof pane!=="undefined"&&pane==="mine"&&typeof renderMine==="function") renderMine();
  if(typeof view!=="undefined"&&view==="ledger"&&typeof pane!=="undefined"&&pane==="record"&&typeof renderResolved==="function") renderResolved();
  const cs=document.getElementById("cover-score"); if(cs) cs.innerHTML=`<span><b>${CURRENTS.length}</b> currents</span><span><b>${open.length}</b> open forecasts</span><span><b>${res.length}</b> settled</span>${res.length?`<span>Brier <b>${(res.reduce((a,f)=>a+(f.brier||0),0)/res.length).toFixed(3)}</b></span>`:""}<span><b>${AGENT_ED.sources}</b> sources</span>`;
  const back=document.getElementById("archivebar"); if(back){ back.classList.toggle("hidden",showing==="current"); back.querySelector("b").textContent=`Edition of ${EDITION_LONG}, from the archive`; }
}
// ---- the gate: a holder's key opens the holder parts; everything else stays open ----
function renderGate(){
  const el=document.getElementById("gate"); if(!el) return;
  const k=keyOf(); const st=k?(STANDING==="none"?"unknown":STANDING):"none";
  const word={holder:"HOLDER",locked:"UNDER "+THRESHOLD.toUpperCase(),invalid:"KEY NOT RECOGNISED",unknown:"KEY NOT CHECKED",none:"PUBLIC"}[st]||"PUBLIC";
  const who=(typeof USER!=="undefined"&&USER)?"@"+esc(USER.handle):"Account";
  el.innerHTML=`<button type="button" class="acctbtn" id="keybtn"><i class="${st}"></i>${who}<small>${word}</small></button>`;
  document.getElementById("keybtn").addEventListener("click",openKey);
  const ac=document.getElementById("acct-standing"); if(ac){ ac.className="gstate "+st; ac.textContent={holder:"holder · open",locked:"key holds under "+THRESHOLD,invalid:"key not recognised",unknown:"key not checked yet",none:"no key"}[st]||"no key"; }
  const kf=document.querySelector("#keydlg .kforget"); if(kf) kf.style.display=k?"":"none";
  document.querySelectorAll(".lockednote:not(.figs)").forEach(n=>n.remove());
  if(STANDING!=="holder"){
    document.querySelectorAll("#dev .ed-sec, #dossier .ed-sec").forEach(sec=>{ const c=CURRENTS.find(x=>x.theme===sec.dataset.t); if(c&&c.locked) sec.insertAdjacentHTML("beforeend",`<p class="lockednote">${ICON("holders")} The rest of this story, its reasoning and its sources are for holders: a wallet with ${THRESHOLD}, signed in at <a href="${KEY_HOME}" target="_blank" rel="noopener">app.ubik.gold</a>, gives a key that opens them here. <button type="button" class="keylink">Enter a key</button></p>`); });
    document.querySelectorAll(".keylink").forEach(b=>b.addEventListener("click",openKey));
  }
}
function openKey(){
  const d=document.getElementById("keydlg"); if(!d) return; d.querySelector("input").value=""; d.querySelector(".kerr").textContent=""; if(typeof renderUser==="function") renderUser(); d.showModal();
}
(function wireKey(){
  const d=document.getElementById("keydlg"); if(!d) return;
  const form=d.querySelector("form"), btn=form.querySelector('button[type="submit"]'), errEl=d.querySelector(".kerr");
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const v=parseKey(d.querySelector("input").value);
    if(!v){ errEl.textContent="That does not look like a ubik.gold key."; return; }
    try{ localStorage.setItem("ubik-key",v); }catch(err){}
    STANDING="unknown"; renderGate(); if(typeof renderUser==="function") renderUser(); errEl.textContent="";
    if(btn){ btn.disabled=true; btn.textContent="Checking…"; }
    try{
      await loadCurrent();
      if(typeof view!=="undefined"&&view==="ledger"&&typeof pane!=="undefined"&&pane==="mine"&&typeof renderMine==="function") renderMine();
      if(typeof view!=="undefined"&&view==="ledger"&&typeof pane!=="undefined"&&pane==="record"&&typeof renderResolved==="function") renderResolved();
      if(STANDING==="holder") d.close();
      else if(STANDING==="locked") errEl.textContent=`Key recognised, but wallet holds under ${THRESHOLD}.`;
      else if(STANDING==="invalid") errEl.textContent="ubik.gold does not recognise this key.";
      else d.close();
    }catch(err){
      renderGate();
      errEl.textContent=String(err&&err.message)==="429"?"Rate limit reached on ubik.gold (60/min). Try again in a moment.":"Could not reach the desk to verify the key. Try again shortly.";
    }finally{
      if(btn){ btn.disabled=false; btn.textContent="Save"; }
      if(typeof renderUser==="function") renderUser();
    }
  });
  d.querySelector(".kcancel").addEventListener("click",()=>d.close());
  const kf=d.querySelector(".kforget"); if(kf) kf.addEventListener("click",()=>{
    try{localStorage.removeItem("ubik-key")}catch(e){}
    STANDING="none"; d.close();
    if(typeof renderUser==="function") renderUser();
    loadCurrent().then(()=>{
      if(typeof view!=="undefined"&&view==="ledger"&&typeof pane!=="undefined"&&pane==="mine"&&typeof renderMine==="function") renderMine();
      if(typeof view!=="undefined"&&view==="ledger"&&typeof pane!=="undefined"&&pane==="record"&&typeof renderResolved==="function") renderResolved();
    }).catch(()=>{
      if(typeof holderGate==="function") holderGate("none"); else renderGate();
      if(typeof view!=="undefined"&&view==="ledger"&&typeof pane!=="undefined"&&pane==="mine"&&typeof renderMine==="function") renderMine();
      if(typeof view!=="undefined"&&view==="ledger"&&typeof pane!=="undefined"&&pane==="record"&&typeof renderResolved==="function") renderResolved();
    });
  });
})();
