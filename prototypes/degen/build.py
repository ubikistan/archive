#!/usr/bin/env python3
"""Build the shareable Degen page: settled forecasts as legs, open ones locked.
usage: build.py <calls.static.html> <fc_instr.js> <settled.json> <open.json> <out.html> <read-stamp>"""
import json, re, sys

static_p, instr_p, settled_p, open_p, out_p, read_at = sys.argv[1:7]
static = open(static_p, encoding="utf-8").read()
css = static[static.index("<style>") + 7:static.index("</style>")]
instr = open(instr_p, encoding="utf-8").read()
instr = instr[instr.index("const INSTR="):]

settled = json.load(open(settled_p))
opened = json.load(open(open_p))
score = settled.get("score") or {}


def cat(f):
    c = f.get("categories") or []
    return (c[0]["id"], c[0]["name"]) if c else ("", "")


S = []
for f in settled["data"]:
    h = [[e["at"][:10], e["probability"], e.get("why") or ""] for e in (f.get("history") or []) if e.get("probability") is not None]
    if not h:
        continue
    ev = f.get("evidence") if isinstance(f.get("evidence"), dict) else {}
    cid, cname = cat(f)
    S.append({
        "id": f["question_id"], "q": f["claim"], "cat": cid, "catName": cname,
        "topic": (f.get("current") or {}).get("title") or "",
        "hist": h, "due": f.get("deadline"), "resolved": (f.get("resolved_at") or "")[:10],
        "outcome": (f.get("outcome") or "").lower(), "brier": f.get("brier"),
        "evTitle": ev.get("title") or "", "evPub": ev.get("publisher") or "", "evUrl": ev.get("url") or "",
    })

O = []
for f in opened["data"]:
    cid, cname = cat(f)
    due = f.get("due") or {}
    O.append({
        "id": f["question_id"], "q": f["claim"], "cat": cid, "catName": cname,
        "topic": (f.get("current") or {}).get("title") or "",
        "due": f.get("deadline"), "next": (due.get("at") or "")[:10], "awaiting": bool(f.get("awaiting")),
        "issued": f["question_id"][2:6] + "-" + f["question_id"][6:8] + "-" + f["question_id"][8:10],
    })

DATA = {"read": read_at, "edition": settled["meta"].get("latest"), "meanBrier": score.get("mean_brier"),
        "scored": score.get("scored"), "settled": S, "open": O}

extra_css = r"""
/* ---- the shareable degen cut ---- */
body{min-height:100vh}
.mast .pw{font-family:var(--ui);font-weight:700;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;border:1px solid;padding:3px 7px;border-radius:3px;white-space:nowrap}
.notice{font-family:var(--mono);font-size:10.5px;line-height:1.55;color:var(--muted);border:1px solid #2f2150;border-left:2px solid var(--purple);padding:9px 11px;margin:12px 0 0;border-radius:3px;background:rgba(var(--n),.05)}
.notice b{color:var(--purple-ink);font-weight:600}
.sum>div{min-width:0}
.sum .v{font-size:clamp(19px,5.6vw,28px)}
.sum .v small{display:block;margin:6px 0 0;letter-spacing:.04em;font-weight:500}
.sum .v.txt{font-size:15px;line-height:1.25;color:var(--ink)}
.mast .sub{display:inline!important}
.mast .lock{min-width:0;overflow:hidden}
@media (max-width:520px){.mast .stamp{display:none}.mast{gap:7px}.mast .mark{width:26px;height:26px}.mast .wm{font-size:12px;letter-spacing:.12em}.mast .sub{font-size:9.5px;letter-spacing:.1em;margin-left:0}.mast .lock{gap:6px}.mast .sp{min-width:0}.mast .pw{font-size:8.5px;letter-spacing:.1em;padding:3px 5px}}
.card .top .res{font-family:var(--ui);font-weight:800;font-size:10px;letter-spacing:.16em;padding:3px 6px;border-radius:3px;border:1px solid var(--line);color:var(--muted)}
.card .top .res.win{border-color:var(--green);color:var(--green);box-shadow:0 0 10px -3px var(--green-soft)}
.card .top .res.loss{border-color:var(--neon);color:var(--neon);box-shadow:0 0 10px -3px var(--neon-soft)}
.card .top .res.flat{border-color:var(--yellow);color:var(--yellow)}
.card .sub{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:4px}
.card .sub b{color:var(--ink);font-weight:500}
.list{display:flex;flex-direction:column;gap:10px;padding-bottom:6px}
.instr .ir{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:12px}
.instr .ir .d{text-transform:uppercase;font-size:10.5px;letter-spacing:.08em;width:44px;flex:none}
.instr .ir .nm{flex:1;min-width:0}
.instr .ir a.ch{text-decoration:none;font-size:10.5px;padding:3px 8px;border-radius:3px}
.card .evl{font-family:var(--mono);font-size:11px;color:var(--muted);margin:10px 0 0;line-height:1.5}
.card .evl a{color:var(--purple-ink)}
.card.lock{border-left-color:var(--purple);padding:11px 12px 10px}
.card.lock .pos{margin:6px 0 0;flex-wrap:nowrap;align-items:flex-start}
.card.lock .pos .tag{border-color:rgba(var(--n),.6);color:var(--purple-ink);box-shadow:0 0 12px -4px rgba(var(--n),.8);font-size:10px;padding:5px 7px 4px;margin-top:2px}
.card.lock .asset{font-family:var(--display);font-size:17.5px;line-height:1.25;color:var(--ink)}
.card.lock .dash{font-family:var(--mono);color:var(--muted)}
.card.lock .lnk{font-family:var(--mono);font-size:11px;color:var(--purple-ink);display:inline-block;margin-top:8px}
.grp{font-family:var(--ui);font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:14px 0 0;display:flex;align-items:center;gap:8px}
.grp::after{content:"";flex:1;height:1px;background:var(--line)}
.cta{display:block;text-align:center;font-family:var(--ui);font-weight:800;font-size:11px;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;color:var(--purple-ink);border:1px solid var(--purple);padding:12px;border-radius:3px;margin:14px 0 4px;box-shadow:0 0 18px -6px rgba(var(--n),.9)}
.cta:hover{background:var(--purple);color:#fff}
.tabs button{white-space:nowrap}
footer .legal a{color:var(--purple-ink)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
"""

js = r"""
const DATA=__DATA__;
const GF=s=>`https://www.google.com/finance/quote/${s}`, TV=s=>`https://www.tradingview.com/symbols/${s}/`;
__INSTR__
const pc=p=>Math.round(p*100);
const d2=iso=>{ if(!iso) return "—"; const d=new Date(iso+"T12:00:00Z"); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short"}); };
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=u=>/^https:\/\//.test(u||"")?u:"";
const SVG=b=>`<svg class="ic" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
const IC={
  long:SVG('<path d="M3 12 13 4M7 4h6v6"/>'),
  short:SVG('<path d="M3 4l10 8M7 12h6V6"/>'),
  cash:SVG('<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/>'),
  clock:SVG('<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.4 1.6"/>'),
  move:SVG('<path d="M2 11 6 7l3 3 5-6M10 4h4v4"/>'),
  ev:SVG('<circle cx="8" cy="8" r="6"/><path d="M8 4.5v7M6 6.3h3a1.3 1.3 0 0 1 0 2.6H7a1.3 1.3 0 0 0 0 2.6h3"/>'),
  rec:SVG('<circle cx="8" cy="8" r="6"/><path d="M5.5 8.2 7.3 10 10.8 6"/>'),
  eye:SVG('<circle cx="8" cy="8" r="5.5" stroke-width="2.4"/>'),
  lock:SVG('<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>'),
};
const MARK=`<svg viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="46" fill="none" stroke="var(--gold)" stroke-width="22"/></svg>`;
function ring(v,cls){ const r=15, C=2*Math.PI*r, f=Math.max(0,Math.min(1,v)); return `<svg class="ring ${cls}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" class="rb"/><circle cx="20" cy="20" r="${r}" class="rf" stroke-dasharray="${(C*f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 20 20)"/></svg>`; }

// ---- the reading: above 60% the YES leg, below 40% the NO leg, between is cash ----
const P=f=>f.hist[f.hist.length-1][1];
function leg(f){
  const p=P(f), side=p>=.6?"yes":p<=.4?"no":null, i=INSTR[f.id];
  if(!side) return {s:"cash",side:null,label:"Cash",instr:[],head:(i&&i.short)||f.q};
  const instr=(i&&i[side])||[];
  const head=i?(side==="no"&&i.shortNo?i.shortNo:i.short):f.q;
  if(instr.length){ const d=instr[0][2]==="short"?"short":"long"; return {s:d,side,label:(d==="short"?"Short ":"Long ")+instr[0][0],instr,head}; }
  return {s:side==="yes"?"long":"short",side,label:side==="yes"?"Buy YES":"Buy NO",instr:[],head};
}
function result(f,l){ if(!l.side) return "flat"; if(f.outcome!=="yes"&&f.outcome!=="no") return "flat"; return l.side===f.outcome?"win":"loss"; }
const LEGS=DATA.settled.map(f=>{ const l=leg(f); return {f,l,r:result(f,l)}; }).sort((a,b)=>(b.f.resolved||"").localeCompare(a.f.resolved||"")||b.f.id.localeCompare(a.f.id));
const OPEN=DATA.open.slice().sort((a,b)=>(a.due||"").localeCompare(b.due||"")||a.id.localeCompare(b.id));

function spark(f){
  const h=f.hist, w=120, hh=28, n=h.length;
  const line=`<line x1="4" y1="${hh/2}" x2="${w-4}" y2="${hh/2}" stroke="var(--line)" stroke-dasharray="2 3"/>`;
  const pt=(e,i,cx,cy)=>{ const prev=i>0?h[i-1][1]:null, diff=prev!==null?pc(e[1])-pc(prev):0;
    const move=i===0?"issued":(diff>0?`+${diff} pts`:diff<0?`${diff} pts`:"flat");
    return `<g class="spk-pt" tabindex="0" role="button" aria-label="${esc(d2(e[0]))}, ${pc(e[1])}%, ${esc(move)}" data-date="${esc(d2(e[0]))}" data-p="${pc(e[1])}%" data-move="${esc(move)}" data-why="${esc(e[2]||"")}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" class="spk-hit"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${i===n-1?2.5:2}" class="spk-dot"/></g>`; };
  if(n<2) return `<svg viewBox="0 0 ${w} ${hh}" class="spk">${line}${pt(h[0],0,w-4,hh-4-h[0][1]*(hh-8))}</svg>`;
  const xy=i=>[4+i*(w-8)/(n-1),hh-4-h[i][1]*(hh-8)];
  return `<svg viewBox="0 0 ${w} ${hh}" class="spk">${line}<polyline points="${h.map((e,i)=>xy(i).join(",")).join(" ")}" fill="none" stroke="var(--gold)" stroke-width="1.6" stroke-linejoin="round"/>${h.map((e,i)=>pt(e,i,...xy(i))).join("")}</svg>`;
}
function stepsOf(f){ const h=f.hist, out=[]; h.forEach((e,i)=>{ if(i===0) out.push(`${d2(e[0])} issued at <b>${pc(e[1])}%</b>`); else if(e[1]!==h[i-1][1]) out.push(`${d2(e[0])} ${e[1]>h[i-1][1]?"raised":"lowered"} to <b>${pc(e[1])}%</b>`); }); return out.slice(-4).join("<br>"); }
const record=id=>`https://ubik.gold/forecasts/${encodeURIComponent(id)}`;

function legCard(x){
  const f=x.f, l=x.l, p=P(f), conv=Math.max(p,1-p), why=f.hist[f.hist.length-1][2]||f.hist[0][2];
  const resWord={win:"Win",loss:"Loss",flat:"Sat out"}[x.r];
  const sub=l.side?`the ${l.side.toUpperCase()} leg at <b>${pc(p)}%</b> · resolved <b>${esc(f.outcome.toUpperCase())}</b>`:`no leg at <b>${pc(p)}%</b> · resolved <b>${esc(f.outcome.toUpperCase())}</b>`;
  const rows=l.instr.length?`<div class="instr">${l.instr.map(([n,u,d])=>`<div class="ir"><span class="d ${d==="short"?"short":"long"}">${esc(d)}</span><span class="nm">${esc(n)}</span><span class="lk"><a href="${safeUrl(u)}" target="_blank" rel="noopener" class="ch">chart</a></span></div>`).join("")}</div>`:"";
  const ev=safeUrl(f.evUrl)?`<p class="evl">Settled on: <a href="${safeUrl(f.evUrl)}" target="_blank" rel="noopener">${esc(f.evTitle||f.evPub||"source")}</a>${f.evPub&&f.evTitle?` · ${esc(f.evPub)}`:""}</p>`:"";
  return `<article class="card hc ${l.s}" id="${f.id}">
    <div class="top"><span class="cats"><span>${esc(f.catName||"Forecast")}</span></span><span class="res ${x.r}">${resWord}</span><span class="sp"></span><span class="hz">${IC.clock}resolved ${d2(f.resolved)}</span></div>
    <div class="pos ${l.s}"><span class="tag ${l.s}">${IC[l.s]}${esc(l.label)}</span><span class="asset">${esc(l.head)}</span></div>
    <div class="sub">${sub}</div>
    <div class="stats"><div class="cv">${ring(conv,l.s)}<div><div class="k">Conviction</div><div class="v">${pc(conv)}<small>%</small></div></div></div><div><div class="k">${IC.move}At issue</div><div class="v dim">${pc(f.hist[0][1])}<small>%</small></div></div><div><div class="k">${IC.ev}Brier</div><div class="v">${f.brier!=null?f.brier.toFixed(3):"—"}</div></div></div>
    ${l.head!==f.q?`<h2>${esc(f.q)}</h2>`:""}
    ${rows}
    ${ev}
    <details class="more"><summary>Why, history</summary><div class="body">
      ${why?`<p style="margin-top:8px">${esc(why)}</p>`:""}
      <span class="k">History</span><div class="hist">${spark(f)}<div class="steps">${stepsOf(f)}</div></div>
      <a class="lnk" href="${record(f.id)}" target="_blank" rel="noopener">Rule, evidence and reasoning on ubik.gold · ${esc(f.id)} →</a>
    </div></details>
  </article>`;
}
function lockCard(f){
  return `<article class="card lock" id="${f.id}">
    <div class="top"><span class="cats"><span>${esc(f.catName||"Forecast")}</span></span><span class="sp"></span><span class="hz">${IC.clock}${f.awaiting?"awaiting result":"settles by "+d2(f.due)}</span></div>
    <div class="pos"><span class="tag">${IC.lock}Locked</span><span class="asset">${esc(f.q)}</span></div>
    <a class="lnk" href="${record(f.id)}" target="_blank" rel="noopener">Holders read the figure on ubik.gold →</a>
  </article>`;
}

let tab="all", query="";
const TABS=[["all","Legs"],["long","Long"],["short","Short"],["cash","Cash"],["open","Open"]];
const hayL=x=>[x.f.q,x.f.topic,x.f.catName,x.l.label,x.l.head,x.f.id,x.r,...x.l.instr.map(i=>i[0])].join(" ").toLowerCase();
const hayO=f=>[f.q,f.topic,f.catName,f.id].join(" ").toLowerCase();
function rowsFor(k){ const q=query.trim().toLowerCase(); if(k==="open") return OPEN.filter(f=>!q||hayO(f).includes(q)); return LEGS.filter(x=>(k==="all"||x.l.s===k)&&(!q||hayL(x).includes(q))); }
function tabsHTML(){ document.getElementById("tabs").innerHTML=TABS.map(([k,n])=>`<button role="tab" aria-selected="${tab===k}" data-tab="${k}">${k==="all"?IC.eye:k==="open"?IC.lock:IC[k]}${n}<span class="n">${rowsFor(k).length}</span></button>`).join(""); }
function wl(k){ const r=LEGS.filter(x=>x.l.s===k); return [r.length,r.filter(x=>x.r==="win").length,r.filter(x=>x.r==="loss").length]; }
function render(){
  tabsHTML();
  const rows=rowsFor(tab), q=query.trim(), list=document.getElementById("list"), sum=document.getElementById("sum"), h1=document.getElementById("h1"), lede=document.getElementById("ledep");
  if(tab==="open"){
    const next=OPEN.find(f=>!f.awaiting), waiting=OPEN.filter(f=>f.awaiting).length;
    h1.innerHTML=`<em>Open.</em> ${OPEN.length} questions still running.`;
    lede.innerHTML=`<b>The figures on open forecasts are for holders.</b> Without the engine's number there is no leg to read, so these show the question and its deadline only. Each links to its record on ubik.gold.`;
    sum.innerHTML=`<div><div class="k">Open</div><div class="v">${OPEN.length}</div></div><div><div class="k">Awaiting</div><div class="v">${waiting}</div></div><div><div class="k">Next</div><div class="v txt">${next?d2(next.due):"—"}</div></div><div><div class="k">Figures</div><div class="v txt">holders only</div></div>`;
    if(!rows.length){ list.innerHTML=`<div class="empty">No open forecasts match “${esc(q)}”. <button type="button" class="btn-clear">Clear search</button></div>`; return; }
    let out="", cur="";
    for(const f of rows){ const g=f.awaiting?"Awaiting result":"Settles by "+d2(f.due); if(g!==cur){ out+=`<div class="grp">${esc(g)}</div>`; cur=g; } out+=lockCard(f); }
    list.innerHTML=out+`<a class="cta" href="https://ubik.gold" target="_blank" rel="noopener">Read the open figures on ubik.gold →</a>`;
    return;
  }
  const [nl,wl_,ll]=wl("long"), [ns,ws,ls]=wl("short"), nc=LEGS.filter(x=>x.l.s==="cash").length;
  const W=wl_+ws, L=ll+ls;
  h1.innerHTML=tab==="all"?`Every settled forecast, read as a <em>leg</em>.`:tab==="cash"?`<em>Cash.</em> The ones the reading sat out.`:`<em>${tab==="long"?"Long":"Short"}.</em> Settled legs on that side.`;
  lede.innerHTML=`<b>${W} of ${W+L} legs resolved the way they leaned.</b> Above 60% the reading takes the YES leg, below 40% the NO leg, between it stays in cash. A leg wins when the question resolves its way; that says nothing about what any instrument's price did.`;
  sum.innerHTML=`<div class="long"><div class="k">Long</div><div class="v">${nl}<small>${wl_}W ${ll}L</small></div></div><div class="short"><div class="k">Short</div><div class="v">${ns}<small>${ws}W ${ls}L</small></div></div><div class="cash"><div class="k">Cash</div><div class="v">${nc}</div></div><div><div class="k">Brier</div><div class="v">${DATA.meanBrier!=null?DATA.meanBrier.toFixed(3):"—"}</div></div>`;
  list.innerHTML=rows.length?rows.map(legCard).join("")+`<p class="hnote">Brier is the engine's squared error on the question: 0 is perfect, 0.25 is a coin flip. The mean is ubik.gold's own figure over ${DATA.scored} scored forecasts.</p>`:`<div class="empty">${q?`No settled legs match “${esc(q)}”. <button type="button" class="btn-clear">Clear search</button>`:"Nothing here yet."}</div>`;
}
document.getElementById("tabs").addEventListener("click",e=>{ const b=e.target.closest("[data-tab]"); if(!b) return; tab=b.dataset.tab; render(); window.scrollTo({top:0,behavior:"smooth"}); });
const searchEl=document.getElementById("fcsearch"), clearEl=document.getElementById("fcsearch-clear");
function clearSearch(){ query=""; searchEl.value=""; clearEl.classList.add("hidden"); render(); }
searchEl.addEventListener("input",e=>{ query=e.target.value; clearEl.classList.toggle("hidden",!query); render(); });
searchEl.addEventListener("keydown",e=>{ if(e.key==="Escape"){ clearSearch(); searchEl.blur(); } });
clearEl.addEventListener("click",clearSearch);
document.getElementById("list").addEventListener("click",e=>{ if(e.target.closest(".btn-clear")) clearSearch(); });

// ---- history points: a small tip on hover, focus or tap ----
let tip=null, activePt=null;
function hideTip(){ if(tip){ tip.classList.remove("visible"); tip.setAttribute("aria-hidden","true"); } if(activePt){ activePt.classList.remove("active"); activePt=null; } }
function showTip(pt){
  if(!tip){ tip=document.createElement("div"); tip.id="spk-tip"; tip.setAttribute("role","tooltip"); document.body.appendChild(tip); }
  if(activePt&&activePt!==pt) activePt.classList.remove("active"); activePt=pt; pt.classList.add("active");
  const move=pt.dataset.move, cls=move.startsWith("+")?"up":move.startsWith("-")?"dn":move==="issued"?"iss":"";
  tip.innerHTML=`<div class="tip-h"><span>${esc(pt.dataset.date)} · <b>${esc(pt.dataset.p)}</b></span><span class="tip-m ${cls}">${esc(move)}</span></div>${pt.dataset.why?`<div class="tip-b">${esc(pt.dataset.why)}</div>`:""}<div class="tip-arr"></div>`;
  tip.style.display="block"; tip.classList.remove("visible","below");
  const r=pt.getBoundingClientRect(), t=tip.getBoundingClientRect(); let top=r.top-t.height-7, below=false; if(top<8){ top=r.bottom+7; below=true; }
  const left=Math.max(8,Math.min(window.innerWidth-t.width-8,r.left+r.width/2-t.width/2));
  tip.style.top=`${Math.round(top+window.scrollY)}px`; tip.style.left=`${Math.round(left+window.scrollX)}px`; if(below) tip.classList.add("below");
  const arr=tip.querySelector(".tip-arr"); if(arr) arr.style.left=`${Math.max(6,Math.min(t.width-6,r.left+r.width/2-left))}px`;
  tip.classList.add("visible"); tip.setAttribute("aria-hidden","false");
}
document.addEventListener("mouseover",e=>{ const pt=e.target.closest&&e.target.closest(".spk-pt"); if(pt) showTip(pt); });
document.addEventListener("mouseout",e=>{ const pt=e.target.closest&&e.target.closest(".spk-pt"); if(pt&&!(e.relatedTarget&&e.relatedTarget.closest&&e.relatedTarget.closest(".spk-pt"))) hideTip(); });
document.addEventListener("focusin",e=>{ const pt=e.target.closest&&e.target.closest(".spk-pt"); if(pt) showTip(pt); });
document.addEventListener("focusout",e=>{ if(e.target.closest&&e.target.closest(".spk-pt")) hideTip(); });
document.addEventListener("click",e=>{ const pt=e.target.closest&&e.target.closest(".spk-pt"); if(pt){ if(activePt===pt&&e.detail>1) hideTip(); else showTip(pt); } else if(!(e.target.closest&&e.target.closest("#spk-tip"))) hideTip(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") hideTip(); });
window.addEventListener("scroll",hideTip,{passive:true});

document.getElementById("wmmark").innerHTML=MARK; document.getElementById("fmark").innerHTML=MARK;
document.getElementById("stamp").textContent="READ "+DATA.read;
document.getElementById("foot").textContent=`Settled forecasts and open questions: ubik.gold's public API, read ${DATA.read}, edition ${DATA.edition}. A fixed copy; it does not update. Instruments: hand-written for the questions of 17 to 21 October 2026, chart links only.`;
render();
"""

js = js.replace("__DATA__", json.dumps(DATA, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")).replace("__INSTR__", instr)

html = f"""<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<title>Ubikistan Forecasts · Degen</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="UBIK's settled forecasts read as legs: long, short or cash, with what each resolved to. A mechanical reading for entertainment; not financial advice.">
<meta name="robots" content="noindex">
<link rel="stylesheet" href="../assets/fonts-VPBoBIfD.css">
<style>{css}{extra_css}</style>
</head>
<body class="degen">
<header>
  <div class="wrap">
    <div class="mast">
      <svg class="mark" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="46" fill="none" stroke="var(--gold)" stroke-width="22"/></svg>
      <span class="lock"><span class="wm">Ubikistan</span><span class="sub">Forecasts</span></span>
      <span class="sp"></span>
      <span class="stamp" id="stamp"></span>
      <a class="pw" href="https://ubik.gold" target="_blank" rel="noopener">ubik.gold ↗</a>
    </div>
    <div class="tabrow"><nav class="tabs" role="tablist" id="tabs" aria-label="Views"></nav></div>
  </div>
</header>

<main class="wrap">
  <div class="lede">
    <div class="wm-mark" id="wmmark" aria-hidden="true"></div>
    <h1 id="h1"></h1>
    <p id="ledep"></p>
  </div>
  <p class="notice"><b>Degen mode.</b> For entertainment only. Each leg is a mechanical reading of a forecast the UBIK engine published and has since settled. Nothing here is a position, a recommendation or advice.</p>
  <div class="sum" id="sum"></div>
  <div class="filterrow">
    <div class="chips"></div>
    <div class="searchbox">
      <span class="sicon" aria-hidden="true"><svg class="ic" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg></span>
      <input type="search" id="fcsearch" placeholder="Search questions or tickers…" aria-label="Search forecasts">
      <button type="button" id="fcsearch-clear" class="sclear hidden" aria-label="Clear search">×</button>
    </div>
  </div>
  <div class="list" id="list"></div>
</main>
<footer>
  <div class="wrap">
    <p><b>How to read it.</b> The engine gives each question a probability. At 60% or more the reading takes the YES leg, at 40% or less the NO leg, and between it stays in cash. Where a question of 17 to 21 October has a hand-picked instrument, the leg is named after it; otherwise it is the YES or NO side of the question itself. The leg is read off the last figure the engine stood at before the question settled, so a forecast that changed sides late counts on its final side. Win and loss count the question's outcome, never a price.</p>
    <p class="mono" id="foot"></p>
    <div class="flogo"><span class="fm" id="fmark"></span><span class="fw">Ubikistan Forecasts</span></div>
    <p class="legal"><a href="https://ubik.gold/disclaimer" target="_blank" rel="noopener">ubik.gold disclaimer</a> · <a href="https://ubik.gold/terms" target="_blank" rel="noopener">ubik.gold terms</a>. Not financial advice. For entertainment and education only. Built on content published by ubik.gold; a non-commercial, community-run page, not run or endorsed by ubik.gold. AI-generated. Not for persons under 18 or in the United States.</p>
  </div>
</footer>
<script>{js}</script>
</body>
</html>
"""
open(out_p, "w", encoding="utf-8").write(html)
print("built", out_p, len(html), "bytes;", len(S), "settled,", len(O), "open")
