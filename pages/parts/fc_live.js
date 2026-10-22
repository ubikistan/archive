// ---- live data from ubik.gold, through the desk (the Forecasts page) ----
const DESK = (()=>{ const m=document.querySelector('meta[name="desk"]'); const v=m&&m.content&&!/^%/.test(m.content)?m.content.replace(/\/$/,""):""; if(v) return v; if(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return (location.port==="5173"||location.port==="4173") ? "/api" : "http://localhost:8787"; return "https://ubikistan-guest-desk.ubikistan-archive.workers.dev"; })();
const UBIK_HOME = "https://ubik.gold";
const THRESHOLD = "200,000 UBIK";
let DEGEN=false; try{ DEGEN=localStorage.getItem('ubik-degen')==='1'; }catch(e){}
let RAW=null, F=[], TS={}, CALLS=[], NON_MARKET=[], EXTRA_CAL=[], F_BY={}, ALL=[], DONE=[], STANDING="none", LIVE=false, EDITION_DAY="";
const READ={forecasts:"", poly:"2026-10-13", kalshi:"2026-10-14", aixbt:"2026-10-16T07:45Z"};
const T_KEYS={ukraine:["ukraine","kyiv","putin","zelensky","russia","patriot","hungary"],gulf:["saudi","yemen","houthi","riyadh","aramco","brent","opec","yanbu","iraq"],iran:["iran","hormuz","israel","tehran"],europe:["france","french","paris","moody"],india:["india","delhi","rupee"],americas:["brazil","lula"],asia:["china","shenzhen","korea","taiwan","indonesia"],ai:["ai ","chip","nvidia"],crypto:["bitcoin","polymarket","crypto"],markets:[]};
function themeOf(t){ t=(t||"").toLowerCase()+" "; for(const k in T_KEYS) if(T_KEYS[k].some(w=>t.includes(w))) return k; return "markets"; }
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function transform(raw){
  const syn=raw.synthesis||{}, meta=syn.meta||{}, meth=syn.methodology||{};
  const list=x=>Array.isArray(x)?x:(x&&x.data)||[];
  const all={}; for(const f of [...list(raw.open),...list(raw.settled)]) if(!all[f.question_id]) all[f.question_id]=f;
  const date=(meta.updated_at||meta.revised_at||new Date().toISOString()).slice(0,10); // the edition is its publication day; revisions keep the day
  const hist=f=>{ const h=(f.history||[]).map(e=>Array.isArray(e)?{at:e[0],probability:e[1],why:e[2]}:e); return h.length?h:[{at:f.updated_at||date,probability:f.probability,why:null}]; };
  const Fo=[], TSo={};
  for(const f of Object.values(all).sort((a,b)=>hist(b)[0].at.localeCompare(hist(a)[0].at))){
    const h=hist(f), id=f.question_id;
    TSo[id]=h.map(e=>[e.at,e.probability]);
    const o={id, theme:themeOf(f.claim), q:f.claim, hist:h.map(e=>[e.at.slice(0,10),e.probability]), due:f.deadline, status:f.status||"open", locked:!!f.locked};
    if(f.resolved_at) o.resolved=f.resolved_at.slice(0,10);
    const outcome=f.outcome||(f.status==="yes"?"yes":f.status==="no"?"no":null);
    if(outcome) o.outcome=outcome;
    if(f.brier!=null) o.brier=f.brier;
    if(f.resolution_rule) o.rule=f.resolution_rule;
    let ev=f.evidence; if(ev&&typeof ev==="object") ev=(ev.quote||"")+(ev.url?` (${ev.url.split("/")[2]})`:""); if(ev) o.evidence=ev;
    if(h[0].why) o.why=h[0].why; else if(f.reasoning) o.why=f.reasoning.split(". ")[0];
    if(h.length>1&&h[h.length-1].why) o.change=h[h.length-1].why;
    Fo.push(o);
  }
  const D=new Date(date+"T12:00:00Z"); const cal=[];
  for(const w of meth.watch||[]){ const i=w.indexOf(":"); if(i<0) continue; const label=w.slice(0,i).trim(), what=w.slice(i+1).trim(); const m=/^([A-Za-z]+)\.?\s+(\d+)/.exec(label); if(!m) continue; const mo=MONTHS[m[1].toLowerCase().slice(0,3)]; if(!mo) continue; const yr=mo>=D.getUTCMonth()+1?D.getUTCFullYear():D.getUTCFullYear()+1; cal.push([`${yr}-${String(mo).padStart(2,"0")}-${String(+m[2]).padStart(2,"0")}`, what]); }
  return {F:Fo, TS:TSo, EXTRA_CAL:cal, DATE:date, FIRST:meta.updated_at||meta.revised_at||""};
}
function buildCalls(){
  CALLS=[]; NON_MARKET=[];
  for(const f of F){ if(f.status!=="open") continue; let i=INSTR[f.id];
    if(!i||!(i.yes.length||i.no.length)) NON_MARKET.push(f.id);
    const cleanQ=f.q.replace(/^Will\s+/i,"").replace(/\?$/,"");
    if(!i) i={asset:cleanQ.slice(0,32), cats:[themeOf(f.q)==="crypto"?"c":themeOf(f.q)==="markets"||themeOf(f.q)==="ai"?"m":"s"], short:cleanQ, yes:[], no:[], catalyst:[f.due,"Resolution date"], note:""};
    const mk=MKT[f.id]; CALLS.push({id:f.id, asset:i.asset, cats:i.cats, short:i.short, yes:i.yes, no:i.no, catalyst:i.catalyst, chatter:[], note:i.note, market:mk?{venue:mk.venue,p:mk.p,read:mk.read,c:mk.c,adj:mk.adj,url:mk.url}:undefined}); }
}
function applyEdition(raw){
  const t=transform(raw); F=t.F; TS=t.TS; EXTRA_CAL=t.EXTRA_CAL; EDITION_DAY=t.DATE; READ.forecasts=t.DATE;
  TODAY=(new Date().toISOString().slice(0,10)>=EDITION_DAY)?new Date().toISOString().slice(0,10):(EDITION_DAY||new Date().toISOString().slice(0,10));
  buildCalls(); F_BY=Object.fromEntries(F.map(f=>[f.id,f]));
  // listed contracts first, widest gap first; then the rest by distance from the coin flip, soonest first
  const hasM=o=>o.market&&o.market.p!=null?0:1, gapAbs=o=>o.market&&o.market.p!=null?Math.abs(o.p-o.market.p):0;
  ALL=CALLS.map(build).sort((a,b)=>hasM(a)-hasM(b)||gapAbs(b)-gapAbs(a)||Math.abs(b.p-.5)-Math.abs(a.p-.5)||a.d-b.d);
  DONE=F.filter(f=>f.status!=="open").sort((a,b)=>(b.resolved||"").localeCompare(a.resolved||""));
  render(); moves(); calendar(); record(); stamp(); renderGate();
  FIRST_AT=t.FIRST||""; startNextClock();
}
const keyOf=()=>{ try{ return localStorage.getItem("ubik-key")||""; }catch(e){ return ""; } };
function parseKey(s){
  s=(s||"").trim();
  const m=/\bubik_[A-Za-z0-9._~-]{11,123}\b/.exec(s);
  if(m) return m[0];
  return /^[A-Za-z0-9._~-]{16,128}$/.test(s)?s:"";
}
let USER=null, TOKEN=null; try{ TOKEN=localStorage.getItem("ubk.session"); }catch(e){}
function setToken(t){ TOKEN=t; try{ if(t) localStorage.setItem("ubk.session",t); else localStorage.removeItem("ubk.session"); }catch(e){} }
function signinURL(prov){ let n=""; try{ n=sessionStorage.getItem("ubk.nonce")||""; if(!n){ n=Math.random().toString(36).slice(2)+Date.now().toString(36); sessionStorage.setItem("ubk.nonce",n); } }catch(e){} return DESK+"/auth/"+prov+"?nonce="+encodeURIComponent(n)+"&return="+encodeURIComponent(location.href.split("#")[0]); }
function whoami(){ if(!TOKEN){ USER=null; renderUser(); return; } fetch(DESK+"/me",{headers:{Authorization:"Bearer "+TOKEN}}).then(r=>r.ok?r.json():null).then(u=>{ USER=u?{provider:u.provider,handle:u.handle}:null; if(!u) setToken(null); renderUser(); },()=>{ renderUser(); }); }
function renderUser(){ const el=document.getElementById("acct-userrow"); if(!el) return;
  const e=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const kTitle=document.getElementById("acct-user-k"), kDesc=document.getElementById("acct-user-desc"), hasKey=!!keyOf();
  if(kTitle){
    if(USER) kTitle.textContent="SOCIAL ACCOUNT";
    else if(hasKey) kTitle.textContent="SOCIAL ACCOUNT (OPTIONAL)";
    else kTitle.textContent="SIGN IN (SOCIAL)";
  }
  if(kDesc){
    if(hasKey && !USER) kDesc.textContent="Signed in with your ubik.gold key (Holder). You can optionally link GitHub or X to attach your handle to remarks.";
    else kDesc.textContent="Through the Archive's desk, the same sign-in as the Archive. The desk keeps your handle and the time you signed in, nothing else.";
  }
  el.innerHTML=USER?`<span class="me">@${e(USER.handle)}<small>${USER.provider==="x"?"X":"GitHub"}</small></span><button type="button" class="secondary signout">Sign out</button>`:(hasKey?`<button type="button" data-prov="github">Link GitHub</button><button type="button" data-prov="x">Link X</button>`:`<button type="button" data-prov="github">Sign in with GitHub</button><button type="button" data-prov="x">Sign in with X</button>`);
  el.querySelectorAll("[data-prov]").forEach(b=>b.addEventListener("click",()=>{ location.href=signinURL(b.dataset.prov); }));
  const so=el.querySelector(".signout"); if(so) so.addEventListener("click",()=>{ setToken(null); USER=null; renderUser(); });
  if(typeof renderGate==="function") renderGate();
}
(function signedIn(){ const h=location.hash||""; if(!h.startsWith("#/signed-in")) return; const q={}; (h.split("?")[1]||"").split("&").forEach(p=>{ const [k,v]=p.split("="); if(k) q[decodeURIComponent(k)]=decodeURIComponent((v||"").replace(/\+/g," ")); }); let mine=""; try{ mine=sessionStorage.getItem("ubk.nonce")||""; sessionStorage.removeItem("ubk.nonce"); }catch(e){} if(q.t&&q.n&&q.n===mine) setToken(q.t); history.replaceState(null,"",location.pathname); })();
async function deskGet(path,retry=1){ const headers={}; const k=keyOf(); if(k) headers["Authorization"]="Bearer "+k; let r; try{ r=await fetch(DESK+"/ubik"+path,{headers}); }catch(e){ if(retry>0){ await new Promise(res=>setTimeout(res,2500)); return deskGet(path,retry-1); } throw new Error("network"); }
  const standing=r.headers.get("x-ubik-key")||(k?"invalid":"none"); if(r.status===451){ notAvailable(); throw new Error("451"); }
  if(r.status===429){ const e=new Error("429"); e.retryAfter=r.headers.get("retry-after")||"60"; throw e; }
  if(!r.ok){ if(retry>0&&r.status>=500){ await new Promise(res=>setTimeout(res,2500)); return deskGet(path,retry-1); } throw new Error(`desk ${path}: ${r.status}`); } return {body:await r.json(), standing}; }
async function deskGetForecasts(path,retry=1){
  const first=await deskGet(path,retry);
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
      const res=await deskGet(p,retry);
      const data=Array.isArray(res.body)?res.body:(Array.isArray(res.body&&res.body.data)?res.body.data:[]);
      all=all.concat(data);
      next=res.body&&res.body.meta&&res.body.meta.links&&res.body.meta.links.next;
    }catch(e){ break; }
  }
  return {body:{...(first.body||{}),data:all},standing:first.standing};
}
async function loadCurrent(){
  if(!keyOf()){ holderGate("none"); return; }
  const [syn,open,settled]=await Promise.all([deskGet("/synthesis?include=all"),deskGetForecasts("/forecasts?status=open&include=history,details"),deskGetForecasts("/forecasts?status=settled&include=history,details")]);
  STANDING=syn.standing; LIVE=true;
  if(STANDING!=="holder"){ holderGate(STANDING); return; }
  holderGate(null); RAW={synthesis:syn.body,open:open.body,settled:settled.body}; applyEdition(RAW);
  try{ await loadMarkets(); applyEdition(RAW); }catch(e){}
}
// the whole page is for holders: nothing renders until ubik.gold answers "holder" to the reader's key
function holderGate(state){
  const g=document.getElementById("holdergate"); if(!g) return;
  document.body.classList.toggle("gated", state!==null);
  renderGate();
  if(state===null){ g.classList.add("hidden"); return; }
  g.classList.remove("hidden");
  const msg={none:"This page is for holders. Sign in at ubik.gold with a wallet that holds "+THRESHOLD+", copy the key it gives you, and enter it here.",
    locked:"Your key is known to ubik.gold, but its wallet holds less than "+THRESHOLD+" just now, so the page stays closed.",
    invalid:"ubik.gold does not recognise this key: unknown, replaced or revoked. Sign in there again for a fresh one.",
    unknown:"The desk could not reach ubik.gold to check the key. Try again in a moment.",
    limited:"ubik.gold is holding this key for a minute: it allows 60 requests a minute, and the page just used some of them. Try again shortly.",
    unavailable:"Not available in the United States."}[state]||"";
  g.querySelector(".gmsg").textContent=msg; g.querySelector(".gstate").textContent={none:"HOLDERS ONLY",locked:"KEY HOLDS UNDER "+THRESHOLD.toUpperCase(),invalid:"KEY NOT RECOGNISED",unknown:"NOT CHECKED",limited:"ONE MOMENT",unavailable:"NOT AVAILABLE"}[state]||"";
  g.querySelector("input").value=""; g.querySelector(".kerr").textContent="";
}
(function wireHolderGate(){ const g=document.getElementById("holdergate"); if(!g) return;
  const form=g.querySelector("form"), btn=form.querySelector('button[type="submit"]'), errEl=g.querySelector(".kerr");
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const v=parseKey(g.querySelector("input").value);
    if(!v){ errEl.textContent="That does not look like a ubik.gold key."; return; }
    try{ localStorage.setItem("ubik-key",v); }catch(err){}
    STANDING="unknown"; renderGate(); if(typeof renderUser==="function") renderUser(); errEl.textContent="";
    if(btn){ btn.disabled=true; btn.textContent="Checking…"; }
    try{ await loadCurrent(); }catch(err){ if(String(err.message)==="429") holderGate("limited"); else if(String(err.message)!=="451") holderGate("unknown"); }
    finally{ if(btn){ btn.disabled=false; btn.textContent="Open"; } if(typeof renderUser==="function") renderUser(); }
  });
  const f=g.querySelector(".forget"); if(f) f.addEventListener("click",()=>{ try{ localStorage.removeItem("ubik-key"); }catch(e){} STANDING="none"; if(typeof renderUser==="function") renderUser(); holderGate("none"); });
})();
function renderGate(){
  const el=document.getElementById("gate"); if(!el) return; const k=keyOf(); const st=k?(STANDING==="none"?"unknown":STANDING):"none";
  const word={holder:"HOLDER",locked:"UNDER "+THRESHOLD.toUpperCase(),invalid:"KEY NOT RECOGNISED",unknown:"KEY NOT CHECKED",none:"HOLDERS ONLY"}[st]||"HOLDERS ONLY";
  const who=(typeof USER!=="undefined"&&USER)?"@"+String(USER.handle||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])):"Account";
  el.innerHTML=`<button type="button" class="acctbtn" id="keybtn"><i class="${st}"></i>${who}<small>${word}</small></button>`;
  document.getElementById("keybtn").addEventListener("click",()=>{ const d=document.getElementById("keydlg"); d.querySelector("input").value=""; d.querySelector(".kerr").textContent=""; renderUser(); d.showModal(); });
  const ac=document.getElementById("acct-standing"); if(ac){ ac.className="gstate "+st; ac.textContent={holder:"holder · open",locked:"key holds under "+THRESHOLD,invalid:"key not recognised",unknown:"key not checked yet",none:"no key"}[st]||"no key"; }
  const kf=document.querySelector("#keydlg .kforget"); if(kf) kf.style.display=k?"":"none";
}
(function wireKey(){ const d=document.getElementById("keydlg"); if(!d) return;
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
  const kf=d.querySelector(".kforget"); if(kf) kf.addEventListener("click",()=>{ try{localStorage.removeItem("ubik-key")}catch(e){} STANDING="none"; d.close(); if(typeof renderUser==="function") renderUser(); loadCurrent().catch(()=>{ if(typeof holderGate==="function") holderGate("none"); else renderGate(); }); }); })();
renderUser(); whoami();

NEXT_RECHECK=()=>{ if(STANDING==="holder") return loadCurrent(); };
// ---- the easter egg: degen mode ----
(function wireDegen(){
  const b=document.getElementById("degenbtn"), note=document.getElementById("degennote"), on=document.getElementById("degenon"); if(!b) return;
  const fab=document.getElementById("degenfab");
  const paint=()=>{ document.body.classList.toggle("degen",DEGEN); b.setAttribute("aria-pressed",String(DEGEN)); b.title=DEGEN?"degen mode · on":"degen mode"; };
  // the circle shows itself once the reader has scrolled down, and only when the page is open
  const show=()=>{ fab.classList.toggle("show",(window.scrollY>400||DEGEN)&&!document.body.classList.contains("gated")); if(window.scrollY<=400&&!DEGEN) note.classList.add("hidden"); };
  window.addEventListener("scroll",show,{passive:true}); setInterval(show,1500); show();
  b.addEventListener("click",()=>{ if(DEGEN){ DEGEN=false; try{localStorage.setItem("ubik-degen","0")}catch(e){} paint(); note.classList.add("hidden"); if(RAW) applyEdition(RAW); } else { note.classList.toggle("hidden"); } });
  on.addEventListener("click",()=>{ DEGEN=true; try{localStorage.setItem("ubik-degen","1")}catch(e){} note.classList.add("hidden"); paint(); if(RAW) applyEdition(RAW); window.scrollTo({top:0,behavior:"smooth"}); });
  paint();
})();
