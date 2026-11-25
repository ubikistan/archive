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
  var ICON = {
    check: '<path d="M3.5 8.5l3 3 6-7"/>',
    clock: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.8V8l2.3 1.4"/>',
    spark: '<path d="M8 1.8l1.5 4.7L14.2 8l-4.7 1.5L8 14.2l-1.5-4.7L1.8 8l4.7-1.5z"/>',
    flame: '<path d="M8 14c-2.6 0-4.3-1.8-4.3-4.1 0-2.2 1.6-3.4 2.3-5.4.9 1 1.2 2 1.2 2.9C8.2 5.6 9 3.6 8.6 1.8c2.6 1.6 3.8 4.6 3.8 7.4 0 2.8-1.9 4.8-4.4 4.8z"/>',
    bolt: '<path d="M9.2 1.8L4 9h3.6l-.9 5.2L12 7H8.3z"/>',
    trophy: '<path d="M5 2.5h6v3.2a3 3 0 01-6 0zM8 8.7v2.8M5.6 13.5h4.8M5 3.8H3.2v.9A2.1 2.1 0 005 6.8M11 3.8h1.8v.9A2.1 2.1 0 0111 6.8"/>',
    ring: '<circle cx="8" cy="8" r="4.6"/>'
  };
  function ic(n, cls) { return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 16 16" aria-hidden="true">' + ICON[n] + "</svg>"; }
  function av(handle, url, cls) {
    var h = 2166136261, t = String(handle || "?");
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return '<span class="av ' + (cls || "") + '" style="background:hsl(' + ((h >>> 0) % 360) + ' 32% 30%)" aria-hidden="true">' + esc(t.replace(/^@/, "").charAt(0).toUpperCase()) +
      (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : "") + "</span>";
  }
  function ago(at) {
    var m = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 60000));
    return m < 1 ? "now" : m < 60 ? m + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d";
  }
  function short(q, n) { q = String(q || ""); n = n || 58; return q.length > n ? q.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : q; }
  var deck = $("deck");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var phone = window.matchMedia("(max-width: 700px)").matches;
  var state = Object.assign({ view: phone ? "today" : "home", topic: "", style: "flip" }, load("mm2-state", {}));
  state.when = "all"; state.cat = ""; state.str = ""; state.place = ""; state.q = "";
  if (state.view === "open") state.view = "home";
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
      render(true); drawTicker();
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
    document.querySelectorAll(".tkc").forEach(function (el) { var ms = Date.parse(el.getAttribute("data-due")) - now; el.textContent = ms > 0 ? span(ms) : "now"; });
  }
  setInterval(tick, 1000);

  // ---- scoring ----
  function bri(p, o) { var y = o === "yes" ? 1 : 0; return (p - y) * (p - y); }
  // points per settled forecast; the same rules as points() in worker/mm.js
  function points(m, s) {
    var b = bri(m.p, s.o), skill = (0.25 - b) * 200;
    var ahead = (Date.parse(dueOf(null, s.dl)) - Date.parse(m.at)) / 864e5;
    var hard = 1 + 2 * (typeof s.b === "number" ? s.b : 0) + Math.min(0.5, Math.max(0, ahead || 0) / 28);
    return 10 + (skill > 0 ? skill * hard : skill);
  }
  function record() {
    var ids = Object.keys(mine), done = [], wait = [];
    ids.forEach(function (id) { var s = SBY[id]; if (s && (s.o === "yes" || s.o === "no")) done.push(id); else wait.push(id); });
    var you = 0, ub = 0, won = 0, lost = 0, tied = 0, pts = 0;
    done.forEach(function (id) {
      var s = SBY[id], a = bri(mine[id].p, s.o), b = s.b; you += a; ub += b; pts += points(mine[id], s);
      if (Math.abs(a - b) < 1e-9) tied++; else if (a < b) won++; else lost++;
    });
    var days = {}; ids.forEach(function (id) { days[mine[id].day || amsDay(new Date(mine[id].at))] = 1; });
    var streak = 0, d = new Date(); if (!days[amsDay(d)]) d = new Date(Date.now() - 864e5);
    while (days[amsDay(d)]) { streak++; d = new Date(d.getTime() - 864e5); }
    return { n: ids.length, done: done, wait: wait, you: done.length ? you / done.length : null, ub: done.length ? ub / done.length : null, won: won, lost: lost, tied: tied, streak: streak, pts: Math.round(pts) };
  }
  function f3(x) { return x == null ? "–" : x.toFixed(3); }
  function pct(p) { return Math.round(p * 100) + "%"; }

  function forecast(id, p) {
    var r = OPEN.filter(function (x) { return x.id === id; })[0];
    mine[id] = { p: p, at: new Date().toISOString(), day: amsDay(), q: r ? r.q : (mine[id] || {}).q };
    save("mm2-forecasts", mine);
    if (token) api("/mm/forecast", { qid: id, p: p }).then(function () { loadCrowd(); loadFeed(); }, function (e) { toast(e.message); });
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
  function nf(n) { return n + (n === 1 ? " forecast" : " forecasts"); }
  function fcount(r) { var c = CROWD[r.id]; return c && c.n ? " · " + nf(c.n) : ""; }
  function slot(r) { return '<div class="crowd-slot" data-q="' + esc(r.id) + '">' + crowdHtml(r) + "</div>"; }
  function joinBtn(t) { return '<button type="button" class="linkbtn signin" data-p="x">' + (t || "Sign in with X") + "</button>"; }
  function crowdHtml(r) {
    var c = CROWD[r.id] || { n: 0, yes: 0 };
    if (!mine[r.id]) return c.n ? '<div class="crowd locked">' + nf(c.n) + " in. Make yours to see how the crowd leans.</div>" : "";
    if (!c.n) return '<div class="crowd"><span>' + (token ? "Yours is the first forecast on this question." : "No crowd here yet. " + joinBtn() + " so yours counts.") + "</span></div>";
    var y = Math.round(c.yes / c.n * 100);
    return '<div class="crowd"><div class="cl"><span>The crowd · ' + nf(c.n) + '</span><span><b class="y">' + y + '% lean YES</b></span></div>' +
      '<div class="cbar" role="img" aria-label="' + y + '% lean YES, ' + (100 - y) + '% lean NO"><i style="width:' + y + '%"></i></div>' +
      (token ? "" : '<div class="cnote">' + joinBtn() + " so your forecast counts here and on the leaderboard.</div>") + "</div>";
  }
  function refreshCrowd() {
    var by = {}; OPEN.forEach(function (r) { by[r.id] = r; });
    document.querySelectorAll(".crowd-slot").forEach(function (el) { var r = by[el.getAttribute("data-q")]; if (r) el.innerHTML = crowdHtml(r); });
    document.querySelectorAll(".fcount").forEach(function (el) { var r = by[el.getAttribute("data-q")]; if (r) el.textContent = fcount(r); });
    document.querySelectorAll(".fcount2").forEach(function (el) {
      var c = CROWD[el.getAttribute("data-q")], t = c && c.n ? nf(c.n) : "No forecasts yet";
      if (el.textContent !== t) { el.textContent = t; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
    });
    document.querySelectorAll("[data-act]").forEach(function (el) { var r = by[el.getAttribute("data-act")]; if (r) el.innerHTML = act(r); });
    drawSide(); drawTicker();
  }
  function full(r) {
    return '<article class="card" id="c-' + esc(r.id) + '" aria-label="' + esc(r.q) + '">' +
      '<div class="top">' + clock(r) + badge(r) + "</div>" +
      '<h2 class="q">' + esc(r.q) + "</h2>" + fq(r) + slot(r) + info(r) + foot(r) + "</article>";
  }
  function flip(r) {
    var wh = where(r);
    return '<article class="card fc" id="c-' + esc(r.id) + '" aria-label="' + esc(r.q) + '"><div class="inner">' +
      '<div class="face front">' +
        '<div class="top">' + clock(r, true) + badge(r) + "</div>" +
        '<div class="mid"><h2 class="q">' + esc(r.q) + '</h2><div class="where">' + esc(r.cat) + (wh ? " · " + esc(wh) : "") + '<span class="fcount" data-q="' + esc(r.id) + '">' + fcount(r) + "</span></div></div>" +
        '<div class="mid">' + fq(r) + '<div class="hint"><span>' + (mine[r.id] ? "See what moves" : "Or just read what moves") + '</span><button class="flipbtn turn" type="button" aria-label="Turn the card over">↻</button></div></div>' +
      "</div>" +
      '<div class="face back" inert>' +
        '<div class="q">' + esc(r.q) + "</div>" + slot(r) + info(r) + foot(r) +
        '<div class="backbar"><button class="flipbtn turn" type="button">↺ Question</button><button class="btn nextc" type="button">Next card →</button></div>' +
      "</div></div></article>";
  }

  // ---- the front page: topics, today's featured question, a grid of compact cards ----
  var EMB = { "Economy": "economy", "Energy & climate": "energy", "Geopolitics": "geopolitics", "Tech & science": "tech", "Markets & business": "markets", "Politics": "politics" };
  var SAVE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 3.5h9v13l-4.5-3.2-4.5 3.2z"/></svg>';
  var saved = load("mm2-saved", {}), pick = {}, heroI = 0;
  function byId(id) { for (var i = 0; i < OPEN.length; i++) if (OPEN[i].id === id) return OPEN[i]; return null; }
  function emb(r, big) {
    var s = EMB[r.cat] || "economy";
    return '<span class="emb' + (big ? " big" : "") + " e-" + s + '" data-l="' + esc((r.cat || "?").charAt(0)) + '" aria-hidden="true"><img src="img/' + s + '.jpg" alt="" loading="lazy" onerror="this.remove()"></span>';
  }
  function isNew(r) { var d = r.id.slice(2, 10); return Date.parse(d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8) + "T00:00:00Z") > Date.now() - 2 * 864e5; }
  function hot() {
    return OPEN.filter(function (r) { var c = CROWD[r.id]; return c && c.day && !past(r); }).sort(function (a, b) { return CROWD[b.id].day - CROWD[a.id].day; });
  }
  function badges(r) {
    var b = "";
    if (isNew(r)) b += '<span class="bdg new">' + ic("spark") + "New</span>";
    if (!past(r) && Date.parse(r.due) - Date.now() < 864e5) b += '<span class="bdg soon">' + ic("clock") + "Settling today</span>";
    if (hot().slice(0, 3).indexOf(r) >= 0) b += '<span class="bdg hot">' + ic("flame") + "Hot</span>";
    return b;
  }
  function act(r) {
    var m = mine[r.id];
    if (m) return '<div class="mc-mine ' + (m.p > 0.5 ? "y" : "n") + '"><span>You <b>' + pct(m.p) + " YES</b></span>" +
      (past(r) ? "" : '<button type="button" class="linkbtn" data-change="' + esc(r.id) + '">change</button>') + "</div>" + crowdHtml(r);
    if (past(r)) return '<div class="mc-mine">Awaiting result</div>';
    var s = pick[r.id];
    if (s) {
      var o = s === "yes" ? [[0.65, "Lean"], [0.9, "Sure"]] : [[0.35, "Lean"], [0.1, "Sure"]];
      return '<div class="mc-pick ' + s + '"><span class="how">' + s.toUpperCase() + ", how sure?</span>" + o.map(function (x) {
        return '<button type="button" data-f="' + esc(r.id) + '" data-p="' + x[0] + '"><b>' + x[1] + "</b><small>" + pct(x[0]) + " yes</small></button>";
      }).join("") + '<button type="button" class="x" data-unpick="' + esc(r.id) + '" aria-label="Back">×</button></div>';
    }
    return '<div class="mc-yn"><button type="button" class="y" data-pick="yes" data-q="' + esc(r.id) + '">Yes</button><button type="button" class="n" data-pick="no" data-q="' + esc(r.id) + '">No</button></div>';
  }
  function mcard(r) {
    var c = CROWD[r.id];
    return '<article class="mc" id="m-' + esc(r.id) + '">' +
      '<div class="mc-top">' + emb(r) + '<h3><a href="#q=' + esc(r.id) + '">' + esc(r.q) + "</a></h3>" +
      '<button type="button" class="save" data-save="' + esc(r.id) + '" aria-pressed="' + !!saved[r.id] + '" aria-label="Save this question">' + SAVE + "</button></div>" +
      '<div class="mc-mid">' + clock(r) + "</div>" +
      '<div class="mc-act" data-act="' + esc(r.id) + '">' + act(r) + "</div>" +
      '<div class="mc-foot">' + badges(r) + '<span class="fcount2" data-q="' + esc(r.id) + '">' + (c && c.n ? nf(c.n) : "No forecasts yet") + "</span><span>" + esc(r.cat) + "</span></div></article>";
  }
  function topics() {
    var t = [["", "All"], ["saved", "Saved"], ["new", "New"], ["soon", "Settling this week"]];
    Object.keys(EMB).forEach(function (c) { if (OPEN.some(function (r) { return r.cat === c && !past(r); })) t.push(["cat:" + c, c]); });
    var pc = {}; OPEN.forEach(function (r) { if (!past(r)) (r.pl || []).forEach(function (p) { if (p !== "GL") pc[p] = (pc[p] || 0) + 1; }); });
    Object.keys(pc).sort(function (a, b) { return pc[b] - pc[a]; }).slice(0, 7).forEach(function (p) { t.push(["pl:" + p, (PLACES[p] || [p])[0]]); });
    t.push(["wait", "Awaiting result"]);
    return t;
  }
  function qmatch(r) {
    if (!state.q) return true;
    return (r.q + " " + r.cat + " " + where(r) + " " + (r.instrument || "") + " " + (r.yes ? r.yes.head + " " + r.no.head : "")).toLowerCase().indexOf(state.q.toLowerCase()) >= 0;
  }
  function inTopic(r) {
    var t = state.topic || "";
    if (t === "wait") return past(r);
    if (past(r)) return false;
    if (t === "saved") return !!saved[r.id];
    if (t === "new") return isNew(r);
    if (t === "soon") return Date.parse(r.due) - Date.now() < 7 * 864e5;
    if (t.indexOf("cat:") === 0) return r.cat === t.slice(4);
    if (t.indexOf("pl:") === 0) return (r.pl || []).indexOf(t.slice(3)) >= 0;
    return true;
  }
  function heroHtml() {
    var five = todays(); if (!five.length) return "";
    heroI = (heroI % five.length + five.length) % five.length;
    var r = five[heroI], wh = where(r);
    return '<div class="hero-card" data-hero="' + esc(r.id) + '"><div class="hero-l">' +
      '<div class="hero-k">' + emb(r, true) + "<span>Today's five · " + (heroI + 1) + " of " + five.length + "</span></div>" +
      '<h2><a href="#q=' + esc(r.id) + '">' + esc(r.q) + "</a></h2>" +
      '<div class="hero-m">' + clock(r, true) + '<span class="where">' + esc(r.cat) + (wh ? " · " + esc(wh) : "") + "</span></div>" +
      '<div class="mc-act" data-act="' + esc(r.id) + '">' + act(r) + "</div></div>" +
      '<div class="hero-r">' + (r.mapped ? '<div class="out">' + outcome("yes", r.yes) + outcome("no", r.no) + "</div>" : '<div class="unmapped">The community Market Map has not mapped this question yet.</div>') + "</div>" +
      '<div class="hero-nav"><button type="button" data-hero-step="-1" aria-label="Previous question">←</button><span class="hdots">' +
      five.map(function (x, i) { return '<i class="' + (i === heroI ? "on " : "") + (mine[x.id] ? "fin" : "") + '"></i>'; }).join("") +
      '</span><button type="button" data-hero-step="1" aria-label="Next question">→</button><a href="#today">Play all five as cards →</a></div></div>';
  }
  function drawHero() { $("hero").innerHTML = heroHtml(); tick(); }
  function renderHome() {
    if (!phone) drawHero(); else $("hero").innerHTML = "";
    var t = topics();
    if (!t.some(function (x) { return x[0] === state.topic; })) state.topic = "";
    $("chips").innerHTML = t.map(function (x) {
      var n = x[0] === "saved" ? Object.keys(saved).filter(function (id) { var r = byId(id); return r && !past(r); }).length : null;
      return '<button type="button" class="chip" data-topic="' + esc(x[0]) + '" aria-pressed="' + (state.topic === x[0]) + '">' + esc(x[1]) + (n ? " <b>" + n + "</b>" : "") + "</button>";
    }).join("");
    var l = OPEN.filter(function (r) { return inTopic(r) && qmatch(r); });
    var lbl = (t.filter(function (x) { return x[0] === state.topic; })[0] || ["", "All"])[1];
    $("gridTitle").textContent = state.q ? "Results for “" + state.q + "”" : state.topic ? lbl : "All questions";
    $("gridCount").textContent = l.length + (l.length === 1 ? " question" : " questions") + (state.topic === "wait" ? "" : " · soonest first");
    $("grid").innerHTML = l.length ? l.map(mcard).join("") : '<p class="empty">' + (state.topic === "saved" ? "Nothing saved yet. Tap the bookmark on a card to keep it here." : "No questions here.") + "</p>";
    tick();
  }
  function drawSide() {
    var h = boardHtml(true), hh = hot().slice(0, 5);
    var fi = (FEED.items || []).slice(0, 6);
    h += '<div class="sbox"><h3>' + ic("bolt") + "Latest forecasts" + (FEED.hour ? '<span class="sub">' + FEED.hour + " in the last hour</span>" : "") + "</h3>" + (fi.length ? '<ol class="slist feed">' + fi.map(function (x) {
      var r = byId(x.qid) || SBY[x.qid];
      return "<li>" + av(x.handle, x.avatar) + '<span class="st"><span class="who2">' + (x.provider === "x" && x.handle !== "Administrator" ? "@" : "") + esc(x.handle) + ' <i>forecast</i></span><a href="#q=' + esc(x.qid) + '">' + esc(r ? r.q : x.qid) + '</a></span><span class="ago">' + ago(x.at) + "</span></li>";
    }).join("") + "</ol>" : '<p class="bd-sub">No forecasts on the board yet. ' + (token ? '<a href="#today">Make the first one</a>.' : 'Sign in and yours is the first.') + "</p>") + "</div>";
    h += '<div class="sbox"><h3>' + ic("flame") + "Most forecast today</h3>" + (hh.length ? '<ol class="slist">' + hh.map(function (r, i) {
      return '<li><span class="rk">' + (i + 1) + '</span><a href="#q=' + esc(r.id) + '">' + esc(r.q) + '</a><span class="n">' + CROWD[r.id].day + "</span></li>";
    }).join("") + "</ol>" : '<p class="bd-sub">No forecasts yet today. <a href="#today">Start with today\'s five</a>.</p>') + "</div>";
    var soon = OPEN.filter(function (r) { return !past(r); }).slice(0, 5);
    h += '<div class="sbox"><h3>' + ic("clock") + 'Settling soon</h3><ol class="slist soon">' + soon.map(function (r) {
      return "<li>" + emb(r) + '<span class="st"><a href="#q=' + esc(r.id) + '">' + esc(r.q) + "</a>" + clock(r) + "</span></li>";
    }).join("") + "</ol></div>";
    $("side").innerHTML = h; tick();
  }
  function openQ(id) {
    var r = byId(id), d = $("qdBody");
    if (r) d.innerHTML = full(r).replace('id="c-', 'id="d-');
    else if (SBY[id]) d.innerHTML = '<div class="list">' + sRow(SBY[id], false) + "</div>";
    else d.innerHTML = '<p class="empty">This question is not on the list any more.</p>';
    d.setAttribute("data-q", id);
    if (!$("qd").open) $("qd").showModal();
    tick();
  }
  function rerenderQ(id) {
    var r = byId(id); if (!r) return;
    document.querySelectorAll('[data-act="' + id + '"]').forEach(function (el) { el.innerHTML = act(r); });
    if ($("qd").open && $("qdBody").getAttribute("data-q") === id) $("qdBody").innerHTML = full(r).replace('id="c-', 'id="d-');
    strip(record()); tick();
  }
  function acct() {
    $("acct").innerHTML = token && who ? '<a class="acct" href="#you">' + av(who.handle, who.avatar, "sm") + "@" + esc(who.handle) + "</a>" : '<button type="button" class="acct signin" data-p="x">Sign in</button>';
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    var tp = t.closest("[data-topic]"); if (tp) { state.topic = tp.getAttribute("data-topic"); save("mm2-state", state); renderHome(); return; }
    var hs = t.closest("[data-hero-step]"); if (hs) { heroI += +hs.getAttribute("data-hero-step"); drawHero(); return; }
    var sv = t.closest("[data-save]");
    if (sv) {
      var sid = sv.getAttribute("data-save");
      if (saved[sid]) delete saved[sid]; else saved[sid] = true;
      save("mm2-saved", saved);
      document.querySelectorAll('[data-save="' + sid + '"]').forEach(function (b) { b.setAttribute("aria-pressed", String(!!saved[sid])); });
      if (state.topic === "saved" || !saved[sid]) renderHome(); else toast("Saved");
      return;
    }
    if (t.closest("#deck")) return; // the swipe deck handles its own cards
    var pk = t.closest("[data-pick]"); if (pk) { pick[pk.getAttribute("data-q")] = pk.getAttribute("data-pick"); rerenderQ(pk.getAttribute("data-q")); return; }
    var up = t.closest("[data-unpick]"); if (up) { delete pick[up.getAttribute("data-unpick")]; rerenderQ(up.getAttribute("data-unpick")); return; }
    var f = t.closest("[data-f]");
    if (f) {
      var id = f.getAttribute("data-f"), inHero = !!f.closest(".hero-card");
      forecast(id, +f.getAttribute("data-p")); delete pick[id]; rerenderQ(id);
      if (inHero) setTimeout(function () {
        var five = todays();
        for (var k = 1; k <= five.length; k++) { var j = (heroI + k) % five.length; if (!mine[five[j].id]) { heroI = j; break; } }
        drawHero();
      }, 1800);
      return;
    }
    var ch = t.closest("[data-change]");
    if (ch) {
      var cid = ch.getAttribute("data-change");
      delete mine[cid]; save("mm2-forecasts", mine);
      if (token) api("/mm/forecast", { qid: cid, p: null }).then(loadCrowd, function (e2) { toast(e2.message); });
      rerenderQ(cid); return;
    }
    var sh = t.closest("[data-share]"); if (sh) { shareCard(sh.getAttribute("data-share")); return; }
  });

  // ---- views ----
  var list = [];
  function show(id, on) { $(id).hidden = !on; }
  function render(keepScroll) {
    save("mm2-state", state);
    var v = state.view, rec = record();
    document.body.setAttribute("data-v", v);
    document.querySelectorAll(".views [data-v]").forEach(function (b) {
      var k = b.getAttribute("data-v"); b.setAttribute("aria-pressed", String(k === v));
      if (k === "you") b.innerHTML = "You" + (rec.n ? "<b>" + rec.n + "</b>" : "") + (unseen().length ? '<i class="dot" aria-label="new results"></i>' : "");
      if (k === "home") b.innerHTML = "Markets<b>" + OPEN.filter(function (r) { return !past(r); }).length + "</b>";
      if (k === "settled") b.innerHTML = "Settled<b>" + SETTLED.length + "</b>";
    });
    document.querySelectorAll(".style [data-s]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-s") === state.style)); });
    strip(rec); banner(v);
    var decky = v === "today";
    show("boardview", v === "board"); show("homeview", v === "home");
    show("todayview", v === "today"); show("mapview", v === "map");
    show("settledview", v === "settled"); show("youview", v === "you"); show("subrow", decky);
    deck.hidden = !decky; document.querySelector(".pager").hidden = !decky;
    $("done").hidden = true;
    acct();

    if (v === "today") renderToday();
    if (v === "home") renderHome();
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
      yb.textContent = rec.pts + " pts"; yb.className = rec.pts > 0 ? "ahead" : rec.pts < 0 ? "behind" : "";
      $("yoSub").textContent = "Brier " + f3(rec.you) + " · UBIK " + f3(rec.ub) + " on the same " + rec.done.length + (rec.wait.length ? " · " + rec.wait.length + " waiting" : "");
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
        '<div class="acts"><button class="btn" type="button" id="shareToday">Share today\'s five</button><a class="btn ghost" href="#home">All markets</a></div>';
    }
  }
  function sRow(s, isNew) {
    var m = mine[s.id], your = "";
    if (m && (s.o === "yes" || s.o === "no")) {
      var a = bri(m.p, s.o), w = Math.abs(a - s.b) < 1e-9 ? "" : a < s.b ? '<span class="won">You beat UBIK</span>' : '<span class="lost">UBIK beat you</span>';
      var pp = Math.round(points(m, s));
      your = "<span>You <b>" + pct(m.p) + "</b> · Brier <b>" + a.toFixed(3) + "</b> · <b class=\"" + (pp >= 0 ? "won" : "lost") + "\">" + (pp > 0 ? "+" : "") + pp + " pts</b></span>" + w;
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
        '<div class="who"><span class="lbl">Your points</span><b class="' + (rec.pts > 0 ? "ahead" : "") + '">' + (rec.done.length ? rec.pts : "–") + '</b><span class="sub">' + (rec.done.length ? "Brier " + f3(rec.you) + " over " + rec.done.length + " settled" : "Nothing settled yet") + "</span></div>" +
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
      if (!token) h += '<div class="bd-join"><b>Put your score on the leaderboard</b><span>Sign in and the forecasts you make on open questions count in the crowd and on the board. Your handle is shown there.</span><div class="acts"><button class="btn signin" type="button" data-p="x">Sign in with X</button><button class="btn ghost signin" type="button" data-p="github">GitHub</button></div></div>';
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
    var t = rec.done.length ? "Me vs UBIK on " + rec.done.length + " settled questions\n" + sq + "\n" + rec.pts + " points · my Brier " + f3(rec.you) + " · UBIK " + f3(rec.ub) + (rec.streak > 1 ? " · " + rec.streak + "-day streak" : "")
      : rec.n + " forecasts in against UBIK, waiting for the first result.";
    shareText(t, SITE + "#you");
  }
  function shareCard(id) {
    var r = OPEN.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var m = mine[id];
    shareText(r.q + (m ? "\nMy forecast: " + pct(m.p) + " YES. What's yours?" : "\nWhat's your forecast?"), SITE + "#q=" + id);
  }

  // ---- the desk: sign-in, shared forecasts, the crowd, the leaderboard ----
  var DESK = "https://ubikistan-guest-desk.ubikistan-archive.workers.dev";
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("desk")) DESK = new URLSearchParams(location.search).get("desk");
  var token = load("mm2-token", ""), who = load("mm2-who", null), CROWD = {}, BOARD = null, boardDays = load("mm2-days", 0);
  function api(path, body) {
    var o = { headers: {} };
    if (token) o.headers.Authorization = "Bearer " + token;
    if (body !== undefined) { o.method = "POST"; o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
    return fetch(DESK + path, o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && token) signOut(true);
        if (!r.ok) { var e = new Error(j.error || "The desk did not answer."); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function signIn(provider) {
    var n = Math.random().toString(36).slice(2) + Date.now().toString(36);
    save("mm2-nonce", n);
    location.href = DESK + "/auth/" + provider + "?return=" + encodeURIComponent(location.origin + location.pathname + location.search + "#board") + "&nonce=" + n;
  }
  function signedIn(h) {
    var q = new URLSearchParams(h.split("?")[1] || ""), n = load("mm2-nonce", "");
    var back = (q.get("back") || "board").replace(/^\/+/, "") || "board";
    if (q.get("t") && (!n || n === q.get("n"))) { token = q.get("t"); save("mm2-token", token); save("mm2-nonce", ""); hello(true); }
    history.replaceState(null, "", location.pathname + location.search + "#" + back);
  }
  function signOut(quiet) { token = ""; who = null; save("mm2-token", ""); save("mm2-who", null); if (!quiet) toast("Signed out"); render(true); loadBoard(); }
  function hello(fresh) {
    if (!token) return;
    api("/me").then(function (u) {
      who = { handle: u.handle, provider: u.provider, avatar: u.avatar || null }; save("mm2-who", who);
      var local = {}; Object.keys(mine).forEach(function (id) { local[id] = { p: mine[id].p, at: mine[id].at }; });
      return api("/mm/sync", { forecasts: local });
    }).then(function (res) {
      var by = {}; OPEN.forEach(function (r) { by[r.id] = r; });
      Object.keys(res.forecasts || {}).forEach(function (id) { var f = res.forecasts[id]; mine[id] = { p: f.p, at: f.at, day: amsDay(new Date(f.at)), q: by[id] ? by[id].q : (mine[id] || {}).q }; });
      save("mm2-forecasts", mine);
      if (fresh) toast("Signed in as @" + who.handle);
      render(true); loadCrowd(); loadBoard();
    }).catch(function () {});
  }
  var FEED = { items: [], hour: 0 };
  function loadFeed() { return api("/mm/feed").then(function (f) { FEED = f; drawSide(); drawTicker(); }, function () {}); }
  var tkSig = "";
  function drawTicker() {
    var it = [];
    var link = function (id, html) { return '<a class="tk" href="#q=' + esc(id) + '">' + html + "</a>"; };
    if (FEED.hour) it.push('<span class="tk">' + ic("bolt", "y") + "<b>" + FEED.hour + "</b> forecasts in the last hour</span>");
    (FEED.items || []).slice(0, 6).forEach(function (x) {
      var r = byId(x.qid); if (!r) return;
      it.push(link(x.qid, av(x.handle, x.avatar, "xs") + "<b>" + (x.provider === "x" && x.handle !== "Administrator" ? "@" : "") + esc(x.handle) + "</b> forecast " + esc(short(r.q, 44)) + ' <span class="dim">' + ago(x.at) + "</span>"));
    });
    OPEN.filter(function (r) { return !past(r); }).slice(0, 3).forEach(function (r) {
      it.push(link(r.id, ic("clock", "w") + esc(short(r.q, 48)) + ' <span class="tkc" data-due="' + esc(r.due) + '">--</span>'));
    });
    SETTLED.slice(0, 5).forEach(function (sx) {
      if (sx.o !== "yes" && sx.o !== "no") return;
      var c = CROWD[sx.id], m = mine[sx.id];
      it.push('<span class="tk">' + ic("check", sx.o === "yes" ? "y" : "n") + esc(short(sx.q, 46)) + ' <b class="' + (sx.o === "yes" ? "y" : "n") + '">' + sx.o.toUpperCase() + "</b>" +
        ' <span class="dim">UBIK ' + pct(sx.p) + (c && c.n ? " · crowd " + Math.round(c.yes / c.n * 100) + "% yes" : "") + (m ? " · you " + pct(m.p) : "") + "</span></span>");
    });
    OPEN.filter(function (r) { return isNew(r) && !past(r); }).slice(0, 3).forEach(function (r) { it.push(link(r.id, ic("spark", "g") + '<b class="g">New</b> ' + esc(short(r.q, 52)))); });
    it.push('<span class="tk"><span class="av ringav xs">' + ic("ring") + "</span><b>UBIK</b> " + COUNTS.right + " right · " + COUNTS.wrong + " wrong · Brier " + f3(BRIER) + "</span>");
    var real = BOARD && BOARD.rows && BOARD.rows.filter(function (r) { return r.ranked; })[0];
    if (real) it.push('<span class="tk">' + ic("trophy", "g") + av(real.handle, real.avatar, "xs") + "<b>" + esc(real.handle) + "</b> leads with " + real.points + " pts</span>");
    var html = it.join('<i class="tk-sep" aria-hidden="true"></i>'), sig = html.replace(/>\d+[mhd]</g, "><");
    if (sig === tkSig) return;
    tkSig = sig;
    var tr = $("tkTrack");
    tr.innerHTML = '<span class="tk-set">' + html + '</span><span class="tk-set" aria-hidden="true">' + html + "</span>";
    tr.querySelectorAll('.tk-set[aria-hidden] a').forEach(function (a) { a.tabIndex = -1; });
    var w = tr.firstChild.getBoundingClientRect().width || 1200;
    tr.style.setProperty("--dur", Math.max(30, Math.round(w / 45)) + "s");
    tick();
  }
  setInterval(function () { if (document.visibilityState === "visible") loadFeed(); }, 30000);
  function loadCrowd() { return api("/mm/crowd").then(function (c) { CROWD = c.questions || {}; refreshCrowd(); }, function () {}); }
  function loadBoard() { return api("/mm/board" + (boardDays ? "?days=" + boardDays : "")).then(function (b) { BOARD = b; drawBoard(); }, function () { if (!BOARD) BOARD = { error: true }; drawBoard(); }); }
  function bRow(r, line) {
    var nm = r.provider === "x" && r.handle !== "Administrator" ? '<a href="https://x.com/' + encodeURIComponent(r.handle) + '" target="_blank" rel="noopener">@' + esc(r.handle) + "</a>" : esc(r.handle);
    return '<li class="' + (r.me ? "me " : "") + (line != null && r.points > line ? "above" : "") + '"><span class="rk">' + r.rank + "</span>" + av(r.handle, r.avatar) + '<span class="nm">' + nm +
      "<small>" + r.n + " settled · Brier " + f3(r.brier) + "</small></span><span class=\"sc\">" + r.points + "<small>pts</small></span></li>";
  }
  // sample rows, shown (and labelled) until real forecasts settle; invented names, no links
  var SAMPLE = [["plainrider", 14, 0.098, 612], ["tram-14", 11, 0.121, 488], ["ledgerclerk", 19, 0.137, 455], ["station6", 9, 0.152, 301], ["ring_watcher", 22, 0.168, 296],
    ["mothlight", 7, 0.181, 214], ["border.desk", 16, 0.194, 188], ["night_ferry", 12, 0.207, 120], ["gold-reserve", 8, 0.226, 64], ["archive_intern", 25, 0.241, 41], ["low_orbit", 6, 0.263, -18], ["civil.service.b", 10, 0.289, -77]]
    .map(function (x, i) { return { handle: x[0], provider: "sample", n: x[1], brier: x[2], points: x[3], ranked: true, rank: i + 1 }; });
  function boardHtml(compact) {
    var b = BOARD;
    var h = '<div class="bd-head"><h2>' + ic("trophy") + 'Leaderboard</h2><div class="style" role="group" aria-label="Period">' + [[0, "All time"], [30, "30 days"]].map(function (d) {
      return '<button class="tab" type="button" data-days="' + d[0] + '" aria-pressed="' + (boardDays === d[0]) + '">' + d[1] + "</button>";
    }).join("") + "</div></div>";
    if (!compact) h += '<p class="bd-sub">Points for every settled forecast: 10 for taking part, plus accuracy, multiplied on questions UBIK got wrong and for forecasting early. Confident misses cost points, so guessing gets you nowhere. Everyone, UBIK too, counts from 25 November.</p>';
    if (!b) return h + '<p class="bd-sub">Loading…</p>';
    if (b.error) b = { min: 1, rows: [], ubik: { brier: null, n: 0, points: 0, since: "2026-11-25" }, people: 0, forecasts: 0, offline: true };
    var line = b.ubik.points || 0, ranked = b.rows.filter(function (r) { return r.ranked; }), warm = b.rows.length - ranked.length, placed = false, rows = "";
    var sample = !ranked.length;
    if (sample) { ranked = SAMPLE; h += '<p class="bd-sample">' + (compact ? "Sample names and scores, until real forecasts settle." : "Sample board. These names and scores are made up to show how it works; real ranks replace them as forecasts settle.") + "</p>"; }
    var ub = '<li class="ubik"><span class="rk">–</span><span class="av ringav">' + ic("ring") + '</span><span class="nm">UBIK<small>the agent · ' + (b.ubik.n ? b.ubik.n + " settled · Brier " + f3(b.ubik.brier) : "counting from " + dayLabel(b.ubik.since || "2026-11-25")) + '</small></span><span class="sc">' + line + "<small>pts</small></span></li>";
    if (compact) ranked = ranked.slice(0, 5);
    ranked.forEach(function (r) { if (!placed && r.points <= line) { rows += ub; placed = true; } rows += bRow(r, line); });
    if (!placed) rows += ub;
    h += '<ol class="bd">' + rows + "</ol>";
    h = h.replace('<ol class="bd">', '<ol class="bd' + (sample ? " sample" : "") + '">');
    if (compact) h += '<a class="bd-all" href="#board">Full leaderboard →</a>';
    if (warm && !compact) h += '<p class="bd-sub">' + warm + (warm === 1 ? " person is" : " people are") + " on the way, with fewer than " + b.min + " settled.</p>";
    if (token && who) {
      var me = b.me;
      h += '<div class="bd-me">' + (me ? (me.rank ? "You are <b>#" + me.rank + "</b> with " + me.points + " points over " + me.n + " settled." : "You have " + me.n + " settled.") : "Signed in as @" + esc(who.handle) + ". Your rank shows once your forecasts settle.") +
        ' <button type="button" class="linkbtn" id="signout">Sign out</button></div>';
    } else {
      h += '<div class="bd-join"><b>Join the board</b><span>Sign in and your forecasts count in the crowd and on the leaderboard. Your handle is shown here.</span><div class="acts"><button class="btn signin" type="button" data-p="x">Sign in with X</button><button class="btn ghost signin" type="button" data-p="github">GitHub</button></div></div>';
    }
    if (b.offline) return h + '<p class="bd-foot">The live leaderboard is not reachable from here.</p>';
    if (compact) return h;
    h += '<p class="bd-foot">' + b.people + (b.people === 1 ? " person" : " people") + " · " + b.forecasts + " forecasts. Only forecasts made while a question is open count. No prizes, only the ranking.</p>";
    return h;
  }
  function drawBoard() { $("boardview").innerHTML = boardHtml(false); drawSide(); }
  setInterval(function () { if (document.visibilityState === "visible") loadCrowd(); }, 60000);
  setInterval(function () { if (document.visibilityState === "visible") loadBoard(); }, 300000);

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
  function pickPlace(k) { state.topic = "pl:" + k; go("home"); }

  // ---- routing ----
  function go(v) { if (location.hash !== "#" + v) location.hash = v; else route(); }
  function route() {
    var h = location.hash.slice(1);
    if (h.indexOf("/signed-in") === 0) { signedIn(h); h = location.hash.slice(1); }
    if (h.indexOf("q=") === 0) {
      if (["home", "today"].indexOf(state.view) < 0) state.view = "home";
      if (!$("qd").open) render();
      openQ(decodeURIComponent(h.slice(2)));
      return;
    }
    if ($("qd").open) $("qd").close();
    if (h === "open") h = "home";
    if (["home", "today", "settled", "map", "you", "board"].indexOf(h) >= 0) state.view = h;
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
    if (ch) { delete mine[ch.getAttribute("data-change")]; save("mm2-forecasts", mine); if (token) api("/mm/forecast", { qid: ch.getAttribute("data-change"), p: null }).then(loadCrowd, function (e2) { toast(e2.message); }); var c0 = ch.closest(".card"), id2 = ch.getAttribute("data-change"); c0.insertAdjacentHTML("afterend", (c0.classList.contains("fc") ? flip : full)(OPEN.filter(function (r) { return r.id === id2; })[0])); c0.remove(); strip(record()); if (state.view === "today") renderToday(); tick(); return; }
    var sh = t.closest("[data-share]"); if (sh) { shareCard(sh.getAttribute("data-share")); return; }
    if (t.closest(".nextc")) { nextCard(t); return; }
    var fc = t.closest(".fc");
    if (fc && !t.closest(".fq")) turn(fc);
  });
  document.addEventListener("click", function (e) {
    var si = e.target.closest(".signin"); if (si) { signIn(si.getAttribute("data-p") || "x"); return; }
    if (e.target.closest("#signout")) { signOut(); return; }
    var dd = e.target.closest("[data-days]"); if (dd) { boardDays = +dd.getAttribute("data-days"); save("mm2-days", boardDays); BOARD = null; drawBoard(); loadBoard(); return; }
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
  var qt; $("search").addEventListener("input", function (e) {
    clearTimeout(qt);
    qt = setTimeout(function () { state.q = e.target.value.trim(); if (state.view !== "home") go("home"); else renderHome(); }, 120);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) { e.preventDefault(); $("search").focus(); }
  });
  $("howOpen").addEventListener("click", function () { $("how").showModal(); });
  [$("qd"), $("how")].forEach(function (d) {
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest(".dx")) d.close(); });
    d.addEventListener("close", function () { if (d.id === "qd" && location.hash.indexOf("#q=") === 0) history.replaceState(null, "", location.pathname + location.search + "#" + state.view); });
  });

  drawBoard();
  route();
  liveLoad();
  loadCrowd(); loadBoard(); loadFeed(); hello(false); drawTicker();
})();
