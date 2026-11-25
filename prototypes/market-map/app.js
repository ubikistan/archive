(function () {
  "use strict";
  var MM = {}; (window.MM_DATA || []).forEach(function (r) { MM[r.id] = r; });
  var SNAP = window.MM_SNAP;
  var API = "https://api.ubik.gold/forecasts?per_page=100&status=";
  var PLACES = { US: ["United States", 39, -98], RU: ["Russia", 60, 90], CN: ["China", 35, 104], KR: ["South Korea", 36.4, 127.9], IR: ["Iran", 32.4, 53.7], UA: ["Ukraine", 49, 31.4], DE: ["Germany", 51, 10.4], BR: ["Brazil", -10.8, -52.9], IN: ["India", 22, 79], TW: ["Taiwan", 23.7, 121], BE: ["Belgium and the EU", 50.6, 4.6], SA: ["Saudi Arabia", 24, 45], CA: ["Canada", 57, -101], QA: ["Qatar", 25.3, 51.2], HK: ["Hong Kong", 22.3, 114.2], GB: ["United Kingdom", 54, -2.5], HU: ["Hungary", 47.2, 19.5], EG: ["Egypt", 26.8, 30.8], FR: ["France", 46.6, 2.4], JP: ["Japan", 36.2, 138.3], AR: ["Argentina", -35, -65], CO: ["Colombia", 4.6, -74.1], PL: ["Poland", 52, 19.4], AU: ["Australia", -25.3, 133.8], TR: ["Turkey", 39, 35.2], ID: ["Indonesia", -2.5, 118], GL: ["Worldwide", null, null] };
  var STR = { linked: "Direct market", proxy: "Proxy", none: "No clean instrument" };
  var OPTS = [[0.1, "No", "n2"], [0.35, "Lean no", "n1"], [0.65, "Lean yes", "y1"], [0.9, "Yes", "y2"]];
  var WHEN = [["day", "Next 24 hours"], ["week", "This week"], ["month", "This month"], ["later", "Later"], ["wait", "Awaiting result"], ["all", "All"]];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var SITE = location.protocol.indexOf("http") === 0 && location.hostname.indexOf("claude") < 0 ? location.origin + location.pathname : "https://ubikistan.github.io/archive/prototypes/market-map/";

  var $ = function (id) { return document.getElementById(id); };
  var deck = $("deck");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var phone = window.matchMedia("(max-width: 700px)").matches;
  var state = Object.assign({ view: "today", when: "week", cat: "", str: "", q: "", place: "", style: "flip" }, load("mm2-state", {}));
  var mine = load("mm2-forecasts", {});   // id -> { p, at, q }
  var seen = load("mm2-seen", {});        // id -> true once its result was shown
  var live = false, OPEN = [], SETTLED = [], SBY = {}, COUNTS = {}, BRIER = 0, SCORED = 0, ASOF = SNAP.date;

  // ---- data ----
  function dueOf(due, dl) {
    if (due && due.length > 10) return due;
    return (due || dl) + "T23:59:59-05:00";
  }
  function build(open, settled, counts, brier, scored) {
    OPEN = open.map(function (x) {
      var base = MM[x.id], r = {};
      if (base) for (var k in base) r[k] = base[k];
      r.id = x.id; r.q = r.q || x.q; r.cat = x.cat || r.cat || "Uncategorised";
      r.dl = x.dl; r.due = dueOf(x.due, x.dl); r.mapped = !!base; r.pl = base ? base.pl : [];
      return r;
    }).sort(function (a, b) { return Date.parse(a.due) - Date.parse(b.due); });
    SETTLED = settled.slice().sort(function (a, b) { return Date.parse(b.at || b.dl) - Date.parse(a.at || a.dl); });
    SBY = {}; SETTLED.forEach(function (s) { SBY[s.id] = s; });
    COUNTS = counts; BRIER = brier; SCORED = scored;
  }
  build(SNAP.open, SNAP.settled, SNAP.counts, SNAP.brier, SNAP.scored);

  function liveLoad() {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 7000);
    function get(s) { return fetch(API + s, ctl ? { signal: ctl.signal } : {}).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
    function cat(x) { return ((x.categories || [])[0] || {}).name || ""; }
    Promise.all([get("open"), get("settled")]).then(function (res) {
      clearTimeout(t);
      var O = res[0], S = res[1];
      if (O.meta.pages > 1 || S.meta.pages > 1) return; // keep the snapshot rather than show half a list
      build(
        O.data.map(function (x) { return { id: x.question_id, q: x.claim, cat: cat(x), dl: x.deadline, due: (x.due || {}).at }; }),
        S.data.map(function (x) { return { id: x.question_id, q: x.claim, cat: cat(x), dl: x.deadline, o: x.outcome, p: x.probability, b: x.brier, at: x.resolved_at, ev: (x.evidence || {}).url }; }),
        S.meta.counts, S.score.mean_brier, S.score.scored);
      live = true; ASOF = new Date().toISOString().slice(0, 10);
      render(true);
    }).catch(function () { clearTimeout(t); });
  }

  // ---- time ----
  function amsDay(d) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d || new Date()); }
  function msToAmsMidnight() {
    var p = {}; new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).forEach(function (x) { p[x.type] = +x.value; });
    return (86400 - (p.hour * 3600 + p.minute * 60 + p.second)) * 1000;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function span(ms) { var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400); return (d ? d + "d " : "") + pad(Math.floor(s % 86400 / 3600)) + ":" + pad(Math.floor(s % 3600 / 60)) + ":" + pad(s % 60); }
  function dayLabel(iso) { var p = iso.slice(0, 10).split("-"); return MONTHS[+p[1] - 1] + " " + (+p[2]); }
  function past(r) { return Date.parse(r.due) <= Date.now(); }
  function bucket(r) {
    var ms = Date.parse(r.due) - Date.now();
    if (ms <= 0) return "wait";
    if (ms < 864e5) return "day";
    if (ms < 7 * 864e5) return "week";
    if (ms < 31 * 864e5) return "month";
    return "later";
  }
  function tick() {
    var now = Date.now();
    document.querySelectorAll(".clock").forEach(function (c) {
      var t = c.firstChild, ms = Date.parse(c.getAttribute("data-due")) - now;
      if (!(ms > 0)) { t.textContent = "Awaiting result"; c.classList.add("past"); c.classList.remove("soon"); return; }
      t.textContent = span(ms); c.classList.remove("past"); c.classList.toggle("soon", ms < 864e5);
    });
    var n5 = $("next5"); if (n5) n5.textContent = span(msToAmsMidnight());
  }
  setInterval(tick, 1000);

  // ---- scoring ----
  function bri(p, o) { var y = o === "yes" ? 1 : 0; return (p - y) * (p - y); }
  function record() {
    var ids = Object.keys(mine), done = [], wait = [];
    ids.forEach(function (id) { var s = SBY[id]; if (s && (s.o === "yes" || s.o === "no")) done.push(id); else wait.push(id); });
    var you = 0, ub = 0, won = 0, lost = 0, tied = 0;
    done.forEach(function (id) {
      var s = SBY[id], a = bri(mine[id].p, s.o), b = s.b; you += a; ub += b;
      if (Math.abs(a - b) < 1e-9) tied++; else if (a < b) won++; else lost++;
    });
    var days = {}; ids.forEach(function (id) { days[mine[id].day || amsDay(new Date(mine[id].at))] = 1; });
    var streak = 0, d = new Date(); if (!days[amsDay(d)]) d = new Date(Date.now() - 864e5);
    while (days[amsDay(d)]) { streak++; d = new Date(d.getTime() - 864e5); }
    return { n: ids.length, done: done, wait: wait, you: done.length ? you / done.length : null, ub: done.length ? ub / done.length : null, won: won, lost: lost, tied: tied, streak: streak };
  }
  function f3(x) { return x == null ? "–" : x.toFixed(3); }
  function pct(p) { return Math.round(p * 100) + "%"; }

  function forecast(id, p) {
    var r = OPEN.filter(function (x) { return x.id === id; })[0];
    mine[id] = { p: p, at: new Date().toISOString(), day: amsDay(), q: r ? r.q : (mine[id] || {}).q };
    save("mm2-forecasts", mine);
  }

  // ---- today's five ----
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function todays() {
    var day = amsDay(), soon = Date.now() + 3600e3;
    var c = OPEN.filter(function (r) { return Date.parse(r.due) > soon; });
    var near = c.filter(function (r) { return Date.parse(r.due) < Date.now() + 14 * 864e5; });
    if (near.length >= 5) c = near;
    return c.slice().sort(function (a, b) { return hash(day + a.id) - hash(day + b.id); }).slice(0, 5);
  }

  // ---- filters ----
  var cats = [];
  function fillCats() {
    var cs = {}; OPEN.forEach(function (r) { cs[r.cat] = 1; });
    var now = Object.keys(cs).sort().join("|"); if (now === cats.join("|")) return;
    cats = now.split("|"); var sel = $("cat");
    sel.innerHTML = '<option value="">All categories</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + "</option>"; }).join("");
    sel.value = state.cat;
  }
  function matches(r, skipWhen, skipPlace) {
    if (!skipWhen && state.when !== "all" && bucket(r) !== state.when) return false;
    if (state.cat && r.cat !== state.cat) return false;
    if (!skipPlace && state.place && (r.pl || []).indexOf(state.place) < 0) return false;
    if (state.str && r.strength !== state.str) return false;
    if (state.q) {
      var t = (r.q + " " + (r.instrument || "") + " " + (r.yes ? r.yes.head + " " + r.no.head : "")).toLowerCase();
      if (t.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
  }
  function whenTabs() {
    $("when").innerHTML = WHEN.map(function (g) {
      var n = OPEN.filter(function (r) { return matches(r, true) && (g[0] === "all" || bucket(r) === g[0]); }).length;
      return '<button class="tab" type="button" data-g="' + g[0] + '" aria-pressed="' + (state.when === g[0]) + '">' + g[1] + "<b>" + n + "</b></button>";
    }).join("");
  }

  // ---- card parts ----
  function phrase(m) {
    if (m.dir === "up") return { cls: "up", arrow: "↑", text: m.head + " could rise" };
    if (m.dir === "down") return { cls: "down", arrow: "↓", text: m.head + " could fall" };
    return { cls: "flat", arrow: "↔", text: m.head };
  }
  function outcome(kind, m) {
    var p = phrase(m), tone = p.cls === "flat" ? "neutral" : kind;
    return '<div class="oc ' + tone + '"><div class="lab"><span class="ans">IF ' + kind.toUpperCase() + (tone === "neutral" ? " · LITTLE MOVE" : "") + '</span><span class="arrow" aria-hidden="true">' + p.arrow + "</span></div>" +
      '<div class="head">' + esc(p.text) + '</div><div class="why">' + esc(m.why) + "</div></div>";
  }
  function markets(r) {
    var a = function (l, cls) { return '<a class="' + (cls || "") + '" href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + " ↗</a>"; };
    var html = (r.links || []).map(function (l) { return a(l); }).join("") + (r.listings || []).map(function (l) { return a(l, "ev"); }).join("");
    if (!html) html = a(["Find on Kalshi", "https://kalshi.com/search?q=" + encodeURIComponent(r.query || r.instrument || r.q)], "find");
    if (r.coverage) html += '<span class="cov">' + esc(r.coverage) + "</span>";
    return '<div class="mkts" aria-label="Markets and contracts">' + html + "</div>";
  }
  function clock(r, big) {
    return '<span class="clock' + (big ? " big" : "") + '" data-due="' + esc(r.due) + '"><span class="t">--</span><span class="d">Due ' + dayLabel(r.dl) + "</span></span>";
  }
  function badge(r) { return r.mapped ? '<span class="str ' + r.strength + '">' + STR[r.strength] + "</span>" : '<span class="str none">Not mapped yet</span>'; }
  function where(r) { return (r.pl || []).map(function (k) { return (PLACES[k] || [k])[0]; }).join(", "); }
  function fq(r) {
    var m = mine[r.id];
    if (m) {
      var y = m.p > 0.5;
      return '<div class="mine ' + (y ? "y" : "n") + '">Your forecast <b>' + pct(m.p) + " YES</b>" + (past(r) ? "" : '<button type="button" data-change="' + esc(r.id) + '">change</button>') + "</div>";
    }
    if (past(r)) return '<div class="mine">Closed for forecasts</div>';
    return '<div class="fq"><span class="ask">How likely is YES?</span><div class="opts">' + OPTS.map(function (o) {
      return '<button type="button" class="' + o[2] + '" data-f="' + esc(r.id) + '" data-p="' + o[0] + '"><b>' + pct(o[0]) + "</b><span>" + o[1] + "</span></button>";
    }).join("") + "</div></div>";
  }
  function info(r) {
    if (!r.mapped) return '<div class="unmapped">The community Market Map has not mapped this question yet, so there are no market notes. UBIK\'s page has the details for holders.</div>';
    return '<div class="inst"><span>' + esc(r.cat) + " · </span>" + esc(r.instrument) + "</div>" +
      '<div class="out">' + outcome("yes", r.yes) + outcome("no", r.no) + "</div>" + markets(r) +
      (r.caveat ? '<div class="cav">' + esc(r.caveat) + "</div>" : "");
  }
  function foot(r) {
    return '<div class="foot"><button class="share" type="button" data-share="' + esc(r.id) + '">Share</button><a href="https://ubik.gold/forecasts/' + esc(r.id) + '">On ubik.gold ↗</a></div>';
  }
  function full(r) {
    return '<article class="card" id="c-' + esc(r.id) + '" aria-label="' + esc(r.q) + '">' +
      '<div class="top">' + clock(r) + badge(r) + "</div>" +
      '<h2 class="q">' + esc(r.q) + "</h2>" + fq(r) + info(r) + foot(r) + "</article>";
  }
  function flip(r) {
    var wh = where(r);
    return '<article class="card fc" id="c-' + esc(r.id) + '" aria-label="' + esc(r.q) + '"><div class="inner">' +
      '<div class="face front">' +
        '<div class="top">' + clock(r, true) + badge(r) + "</div>" +
        '<div class="mid"><h2 class="q">' + esc(r.q) + '</h2><div class="where">' + esc(r.cat) + (wh ? " · " + esc(wh) : "") + "</div></div>" +
        '<div class="mid">' + fq(r) + '<div class="hint"><span>' + (mine[r.id] ? "See what moves" : "Or just read what moves") + '</span><button class="flipbtn turn" type="button" aria-label="Turn the card over">↻</button></div></div>' +
      "</div>" +
      '<div class="face back" inert>' +
        '<div class="q">' + esc(r.q) + "</div>" + info(r) + foot(r) +
        '<div class="backbar"><button class="flipbtn turn" type="button">↺ Question</button><button class="btn nextc" type="button">Next card →</button></div>' +
      "</div></div></article>";
  }

  // ---- views ----
  var list = [];
  function show(id, on) { $(id).hidden = !on; }
  function render(keepScroll) {
    save("mm2-state", state);
    fillCats();
    var v = state.view, rec = record();
    document.body.setAttribute("data-v", v);
    document.querySelectorAll(".views [data-v]").forEach(function (b) {
      var k = b.getAttribute("data-v"); b.setAttribute("aria-pressed", String(k === v));
      if (k === "you") b.innerHTML = "You" + (rec.n ? "<b>" + rec.n + "</b>" : "") + (unseen().length ? '<i class="dot" aria-label="new results"></i>' : "");
      if (k === "open") b.innerHTML = "Open<b>" + OPEN.length + "</b>";
      if (k === "settled") b.innerHTML = "Settled<b>" + SETTLED.length + "</b>";
    });
    document.querySelectorAll(".style [data-s]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-s") === state.style)); });
    strip(rec); banner(v);
    var decky = v === "today" || v === "open";
    show("todayview", v === "today"); show("openview", v === "open"); show("mapview", v === "map");
    show("settledview", v === "settled"); show("youview", v === "you"); show("subrow", decky);
    deck.hidden = !decky; document.querySelector(".pager").hidden = !decky;
    var chip = $("placechip");
    if (state.place && v === "open") { chip.hidden = false; chip.innerHTML = esc((PLACES[state.place] || [state.place])[0]) + ' <button type="button" id="clearplace" aria-label="Show all places">×</button>'; }
    else chip.hidden = true;
    $("done").hidden = true;

    if (v === "today") renderToday();
    if (v === "open") { whenTabs(); list = OPEN.filter(function (r) { return matches(r); }); list = list.filter(function (r) { return !past(r); }).concat(list.filter(past)); }
    if (decky) {
      $("count").textContent = list.length; $("countLbl").textContent = list.length === 1 ? "question" : "questions";
      var sx = deck.scrollLeft;
      deck.innerHTML = list.length ? list.map(state.style === "flip" ? flip : full).join("") : '<p class="empty">No questions match. Try another time range or clear the filters.</p>';
      deck.scrollLeft = keepScroll ? sx : 0;
      window.requestAnimationFrame(pager);
    }
    if (v === "map") drawMap();
    if (v === "settled") renderSettled();
    if (v === "you") renderYou(rec);
    $("foot").textContent = (live ? "Live from ubik.gold, " + ASOF + "." : "Snapshot of ubik.gold, " + dayLabel(ASOF) + " 2026.") +
      " Market notes written by the community's UBIK Market Map. UBIK's figure on an open question stays with holders; once a question settles ubik.gold publishes it. Your forecasts stay in this browser. Forecasts are probabilities, not financial advice.";
    tick();
  }
  function strip(rec) {
    $("ubB").textContent = f3(BRIER);
    $("ubSub").textContent = COUNTS.right + " right · " + COUNTS.wrong + " wrong of " + SCORED + " settled";
    $("ubMini").innerHTML = '<span class="r" style="flex:' + COUNTS.right + '"></span><span class="w" style="flex:' + COUNTS.wrong + '"></span>';
    var yb = $("yoB");
    yb.className = "";
    if (rec.you != null) {
      yb.textContent = f3(rec.you); yb.className = rec.you < rec.ub ? "ahead" : rec.you > rec.ub ? "behind" : "";
      $("yoSub").textContent = "UBIK " + f3(rec.ub) + " on the same " + rec.done.length + (rec.wait.length ? " · " + rec.wait.length + " waiting" : "");
    } else if (rec.n) { yb.textContent = rec.n; $("yoSub").textContent = (rec.n === 1 ? "forecast" : "forecasts") + " waiting to settle"; }
    else { yb.textContent = "–"; $("yoSub").textContent = "Make a forecast to get a score"; }
  }
  function unseen() { return record().done.filter(function (id) { return !seen[id]; }); }
  function banner(v) {
    var u = unseen(), b = $("banner");
    if (!u.length || v === "you") { b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = "<span>" + (u.length === 1 ? "One of your forecasts settled." : u.length + " of your forecasts settled.") + "</span><a href=\"#you\">See how you did →</a>";
  }
  function renderToday() {
    list = todays();
    var n = list.filter(function (r) { return mine[r.id]; }).length;
    $("dots").innerHTML = list.map(function (r) { var m = mine[r.id]; return "<i" + (m ? ' class="' + (m.p > 0.5 ? "y" : "n") + '"' : "") + "></i>"; }).join("");
    $("todaySub").textContent = n === list.length && n ? "All in. They settle between " + dayLabel(list.map(function (r) { return r.dl; }).sort()[0]) + " and " + dayLabel(list.map(function (r) { return r.dl; }).sort().pop()) + "." : n + " of " + list.length + " done. Make your forecast, then turn the card to see what moves.";
    if (n === list.length && n) {
      var d = $("done"); d.hidden = false;
      d.innerHTML = "<h2>Today's five are in.</h2><p>Next five in <span class=\"next5\" id=\"next5\">--</span>. Results land under You as each question settles.</p>" +
        '<div class="acts"><button class="btn" type="button" id="shareToday">Share today\'s five</button><a class="btn ghost" href="#open">More open questions</a></div>';
    }
  }
  function sRow(s, isNew) {
    var m = mine[s.id], your = "";
    if (m && (s.o === "yes" || s.o === "no")) {
      var a = bri(m.p, s.o), w = Math.abs(a - s.b) < 1e-9 ? "" : a < s.b ? '<span class="won">You beat UBIK</span>' : '<span class="lost">UBIK beat you</span>';
      your = "<span>You <b>" + pct(m.p) + "</b> · Brier <b>" + a.toFixed(3) + "</b></span>" + w;
    }
    var res = s.o === "yes" || s.o === "no" ? s.o : "wait";
    return '<div class="row-s' + (isNew ? " new" : "") + '"><span class="res ' + res + '">' + (res === "wait" ? "VOID" : res.toUpperCase()) + "</span>" +
      '<div class="qq">' + esc(s.q) + (isNew ? '<span class="tag">NEW</span>' : "") + "</div>" +
      '<div class="facts"><span>Settled ' + dayLabel(s.at || s.dl) + "</span><span>UBIK <b>" + pct(s.p) + "</b> · Brier <b>" + (s.b == null ? "–" : s.b.toFixed(3)) + "</b></span>" + your +
      (s.ev ? '<a href="' + esc(s.ev) + '" target="_blank" rel="noopener">Source ↗</a>' : "") + "</div></div>";
  }
  function renderSettled() {
    var you = SETTLED.filter(function (s) { return mine[s.id]; }).length;
    $("settledview").innerHTML = '<p class="h2">' + SETTLED.length + " settled · newest first" + (you ? " · " + you + " with your forecast" : "") + "</p>" +
      '<div class="list">' + SETTLED.map(function (s) { return sRow(s, false); }).join("") + "</div>";
  }
  function renderYou(rec) {
    var u = {}; unseen().forEach(function (id) { u[id] = 1; });
    var h = "";
    if (!rec.n) {
      h = '<p class="empty-you">No forecasts yet. Start with <a href="#today">today\'s five</a>: pick how likely YES is, and your score builds as the questions settle. UBIK\'s Brier is the number to beat.</p>';
    } else {
      h += '<div class="duel">' +
        '<div class="who"><span class="lbl">You</span><b class="' + (rec.you != null && rec.you < rec.ub ? "ahead" : "") + '">' + f3(rec.you) + '</b><span class="sub">' + (rec.done.length ? "Brier over " + rec.done.length + " settled" : "Nothing settled yet") + "</span></div>" +
        '<div class="who"><span class="lbl">UBIK, same questions</span><b>' + f3(rec.ub) + '</b><span class="sub">' + (rec.done.length ? "You beat it on " + rec.won + ", it beat you on " + rec.lost + (rec.tied ? ", " + rec.tied + " even" : "") : "Head to head starts at the first result") + "</span></div>" +
        '<div class="who"><span class="lbl">Streak</span><b>' + rec.streak + '</b><span class="sub">' + (rec.streak === 1 ? "day" : "days") + " in a row · " + rec.n + " forecasts</span></div></div>" +
        '<div class="done" style="display:grid"><div class="acts"><button class="btn" type="button" id="shareYou">Share my record</button><a class="btn ghost" href="#today">Today\'s five</a></div></div>';
      var done = rec.done.slice().sort(function (a, b) { return (u[b] || 0) - (u[a] || 0) || Date.parse(SBY[b].at || SBY[b].dl) - Date.parse(SBY[a].at || SBY[a].dl); });
      if (done.length) h += '<p class="h2">Settled</p><div class="list">' + done.map(function (id) { return sRow(SBY[id], !!u[id]); }).join("") + "</div>";
      var byId = {}; OPEN.forEach(function (r) { byId[r.id] = r; });
      var wait = rec.wait.slice().sort(function (a, b) { return (byId[a] ? Date.parse(byId[a].due) : 9e15) - (byId[b] ? Date.parse(byId[b].due) : 9e15); });
      if (wait.length) h += '<p class="h2">Waiting</p><div class="list">' + wait.map(function (id) {
        var r = byId[id], m = mine[id];
        return '<div class="row-s"><span class="res wait">' + pct(m.p) + "</span>" + '<div class="qq"><a href="#q=' + esc(id) + '" style="color:inherit;text-decoration:none">' + esc(r ? r.q : m.q) + "</a></div>" +
          (r ? clock(r) : '<div class="facts"><span>Settling on ubik.gold</span></div>') + "</div>";
      }).join("") + "</div>";
      h += '<p class="foot-note">Brier score: the gap between a forecast and what happened. 0 is perfect, a coin flip scores 0.25, lower is better. Your forecasts are kept in this browser only. <button class="linkbtn" type="button" id="wipe">Clear them</button></p>';
    }
    $("youview").innerHTML = h;
    Object.keys(u).forEach(function (id) { seen[id] = true; }); save("mm2-seen", seen);
    var dot = document.querySelector('.views [data-v="you"] .dot'); if (dot) dot.remove();
  }

  // ---- share ----
  function toast(t) { var el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2200); }
  function shareText(text, url) {
    var full = text + "\n" + url;
    if (navigator.share && phone) { navigator.share({ text: text, url: url }).catch(function () {}); return; }
    var done = function () { toast("Copied"); };
    if (navigator.clipboard) navigator.clipboard.writeText(full).then(done, function () { fallback(full); });
    else fallback(full);
    function fallback(s) { var ta = document.createElement("textarea"); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
  }
  function shareToday() {
    var t = todays(), sq = t.map(function (r) { var m = mine[r.id]; return !m ? "⬜" : m.p > 0.5 ? "🟩" : "🟥"; }).join("");
    shareText("Today's five on the UBIK Market Map, " + dayLabel(amsDay()) + "\n" + sq + "\nMy forecasts are in. UBIK's Brier to beat: " + f3(BRIER), SITE + "#today");
  }
  function shareYou() {
    var rec = record();
    var sq = rec.done.slice(-10).map(function (id) { var a = bri(mine[id].p, SBY[id].o); return Math.abs(a - SBY[id].b) < 1e-9 ? "⬜" : a < SBY[id].b ? "🟩" : "🟥"; }).join("");
    var t = rec.done.length ? "Me vs UBIK on " + rec.done.length + " settled questions\n" + sq + "\nMy Brier " + f3(rec.you) + " · UBIK " + f3(rec.ub) + (rec.streak > 1 ? " · " + rec.streak + "-day streak" : "")
      : rec.n + " forecasts in against UBIK, waiting for the first result.";
    shareText(t, SITE + "#you");
  }
  function shareCard(id) {
    var r = OPEN.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var m = mine[id];
    shareText(r.q + (m ? "\nMy forecast: " + pct(m.p) + " YES. What's yours?" : "\nWhat's your forecast?"), SITE + "#q=" + id);
  }

  // ---- map ----
  function counts() {
    var c = {};
    OPEN.forEach(function (r) { if (!past(r) && matches(r, true, true)) ((r.pl && r.pl.length) ? r.pl : ["_"]).forEach(function (p) { c[p] = (c[p] || 0) + 1; }); });
    return c;
  }
  function drawMap() {
    var D = window.MM_DOTS, st = D.step, cell = 10, W = D.rows[0].length * cell, H = D.rows.length * cell, land = [];
    D.rows.forEach(function (row, y) { for (var x = 0; x < row.length; x++) if (row[x] === "1") land.push('<circle class="land" cx="' + (x * cell + 5) + '" cy="' + (y * cell + 5) + '" r="2.6"/>'); });
    var svg = $("map"); svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var k0 = W / (svg.getBoundingClientRect().width || W), c = counts(), mk = [];
    Object.keys(c).filter(function (k) { return PLACES[k] && PLACES[k][1] !== null; }).sort(function (a, b) { return c[b] - c[a]; }).forEach(function (k) {
      var P = PLACES[k], x = (P[2] + 180) / st * cell, y = (D.top - P[1]) / st * cell, r = Math.min(22, 6 + Math.sqrt(c[k]) * 2.6) * k0;
      mk.push('<g class="mk' + (state.place === k ? " on" : "") + '" data-p="' + k + '" tabindex="0" role="button" aria-label="' + esc(P[0]) + ", " + c[k] + ' questions">' +
        '<circle class="halo" cx="' + x + '" cy="' + y + '" r="' + (r + 3 * k0) + '"/><circle class="core" cx="' + x + '" cy="' + y + '" r="' + r + '"/>' +
        '<text x="' + x + '" y="' + y + '" style="font-size:' + ((c[k] > 9 ? 10 : 9.5) * k0) + 'px">' + c[k] + "</text><title>" + esc(P[0]) + "</title></g>");
    });
    svg.innerHTML = land.join("") + mk.reverse().join("");
    $("places").innerHTML = Object.keys(c).sort(function (a, b) { var z = function (k) { return k === "GL" ? 1 : k === "_" ? 2 : 0; }; return z(a) - z(b) || c[b] - c[a]; }).map(function (k) {
      var name = k === "_" ? "Not mapped yet" : (PLACES[k] || [k])[0];
      return '<li class="' + (k === "GL" || k === "_" ? "gl" : "") + '">' + (k === "_" ? '<button type="button" disabled>' : '<button type="button" data-p="' + k + '">') + esc(name) + "<b>" + c[k] + "</b></button></li>";
    }).join("");
  }
  function pickPlace(k) { state.place = k; state.when = "all"; go("open"); }

  // ---- routing ----
  function go(v) { if (location.hash !== "#" + v) location.hash = v; else route(); }
  function route() {
    var h = location.hash.slice(1);
    if (h.indexOf("q=") === 0) {
      var id = decodeURIComponent(h.slice(2));
      state.view = "open"; state.when = "all"; state.cat = ""; state.str = ""; state.q = ""; state.place = "";
      $("q").value = ""; render();
      var el = document.getElementById("c-" + id);
      if (el) { el.classList.add("hl"); el.scrollIntoView({ block: "center", inline: "center" }); setTimeout(function () { el.classList.remove("hl"); }, 2400); }
      return;
    }
    if (["today", "open", "settled", "map", "you"].indexOf(h) >= 0) state.view = h;
    render(); if (h) window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", route);

  // ---- events ----
  function turn(fc, on) {
    if (on == null) on = !fc.classList.contains("on");
    fc.classList.toggle("on", on);
    fc.querySelector(".front").inert = on; fc.querySelector(".back").inert = !on;
  }
  function nextCard(fromEl) {
    var cards = Array.prototype.slice.call(deck.querySelectorAll(".card")), i = cards.indexOf(fromEl.closest(".card"));
    var n = cards[i + 1];
    if (!n) { if (state.view === "today") { window.scrollTo({ top: 0, behavior: "smooth" }); } return; }
    n.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "center", block: "nearest" });
    var t = n.querySelector(".fq button, .turn"); if (t) t.focus({ preventScroll: true });
  }
  deck.addEventListener("click", function (e) {
    var t = e.target;
    if (t.closest("a")) return;
    var f = t.closest("[data-f]");
    if (f) {
      var id = f.getAttribute("data-f"), card = f.closest(".card");
      forecast(id, +f.getAttribute("data-p"));
      var wasFlip = card.classList.contains("fc");
      var html = (wasFlip ? flip : full)(OPEN.filter(function (r) { return r.id === id; })[0]);
      card.insertAdjacentHTML("afterend", html); card.remove();
      var fresh = document.getElementById("c-" + id);
      if (wasFlip) setTimeout(function () { turn(fresh, true); fresh.querySelector(".back .nextc").focus({ preventScroll: true }); }, 60);
      strip(record()); if (state.view === "today") { renderToday(); } tick();
      return;
    }
    var ch = t.closest("[data-change]");
    if (ch) { delete mine[ch.getAttribute("data-change")]; save("mm2-forecasts", mine); var c0 = ch.closest(".card"), id2 = ch.getAttribute("data-change"); c0.insertAdjacentHTML("afterend", (c0.classList.contains("fc") ? flip : full)(OPEN.filter(function (r) { return r.id === id2; })[0])); c0.remove(); strip(record()); if (state.view === "today") renderToday(); tick(); return; }
    var sh = t.closest("[data-share]"); if (sh) { shareCard(sh.getAttribute("data-share")); return; }
    if (t.closest(".nextc")) { nextCard(t); return; }
    var fc = t.closest(".fc");
    if (fc && !t.closest(".fq")) turn(fc);
  });
  document.addEventListener("click", function (e) {
    if (e.target.closest("#shareToday")) shareToday();
    if (e.target.closest("#shareYou")) shareYou();
    var w = e.target.closest("#wipe");
    if (w) {
      if (w.getAttribute("data-sure")) { mine = {}; seen = {}; save("mm2-forecasts", mine); save("mm2-seen", seen); render(); toast("Cleared"); }
      else { w.setAttribute("data-sure", "1"); w.textContent = "Tap again to clear all your forecasts"; }
    }
  });

  // pager
  function current() {
    var cards = deck.querySelectorAll(".card"); if (!cards.length) return 0;
    var w = cards[0].getBoundingClientRect().width + 10;
    return Math.min(cards.length - 1, Math.max(0, Math.round(deck.scrollLeft / w)));
  }
  function pager() {
    var n = deck.querySelectorAll(".card").length, i = current();
    $("pos").textContent = n ? (i + 1) + " / " + n : "0 / 0";
    $("prev").disabled = i <= 0; $("next").disabled = i >= n - 1;
  }
  function step(d) {
    var cards = deck.querySelectorAll(".card"), c = cards[current() + d];
    if (c) c.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "center", block: "nearest" });
  }
  deck.addEventListener("scroll", function () { window.requestAnimationFrame(pager); }, { passive: true });
  $("prev").addEventListener("click", function () { step(-1); });
  $("next").addEventListener("click", function () { step(1); });
  deck.addEventListener("keydown", function (e) { if (e.target !== deck) return; if (e.key === "ArrowRight") { step(1); e.preventDefault(); } if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); } });

  document.querySelector(".views").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (b) { go(b.getAttribute("data-v")); return; }
    if (e.target.closest("#clearplace")) { state.place = ""; render(); }
  });
  document.querySelector(".style").addEventListener("click", function (e) { var b = e.target.closest("[data-s]"); if (b) { state.style = b.getAttribute("data-s"); render(); } });
  $("map").addEventListener("click", function (e) { var g = e.target.closest(".mk"); if (g) pickPlace(g.getAttribute("data-p")); });
  $("map").addEventListener("keydown", function (e) { var g = e.target.closest(".mk"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickPlace(g.getAttribute("data-p")); } });
  $("places").addEventListener("click", function (e) { var b = e.target.closest("button[data-p]"); if (b) pickPlace(b.getAttribute("data-p")); });
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { if (state.view === "map") drawMap(); }, 150); });
  $("when").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { state.when = b.dataset.g; render(); } });
  $("cat").addEventListener("change", function (e) { state.cat = e.target.value; render(); });
  $("str").addEventListener("change", function (e) { state.str = e.target.value; render(); });
  var qt; $("q").addEventListener("input", function (e) { clearTimeout(qt); qt = setTimeout(function () { state.q = e.target.value.trim(); render(); }, 150); });
  $("str").value = state.str; $("q").value = state.q;

  route();
  liveLoad();
})();
