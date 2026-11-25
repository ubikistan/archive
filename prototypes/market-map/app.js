(function () {
  var DATA = window.MM_DATA;
  var GROUPS = [
    ["week", "This week", ["Awaiting result", "Today", "Tomorrow", "This week"]],
    ["next", "Next week", ["Next week"]],
    ["dec", "December", ["Dec 7–13", "Dec 14–20", "Dec 21–27"]],
    ["later", "Later", ["Dec 28–Jan 3", "Jan 4–10"]],
    ["all", "All", null]
  ];
  var STR = { linked: "Direct market", proxy: "Proxy", none: "No clean instrument" };
  var state = { when: "week", cat: "", str: "", q: "", view: "cards", place: "" };
  var PLACES = { US: ["United States", 39, -98], RU: ["Russia", 60, 90], CN: ["China", 35, 104], KR: ["South Korea", 36.4, 127.9], IR: ["Iran", 32.4, 53.7], UA: ["Ukraine", 49, 31.4], DE: ["Germany", 51, 10.4], BR: ["Brazil", -10.8, -52.9], IN: ["India", 22, 79], TW: ["Taiwan", 23.7, 121], BE: ["Belgium and the EU", 50.6, 4.6], SA: ["Saudi Arabia", 24, 45], CA: ["Canada", 57, -101], QA: ["Qatar", 25.3, 51.2], HK: ["Hong Kong", 22.3, 114.2], GB: ["United Kingdom", 54, -2.5], HU: ["Hungary", 47.2, 19.5], EG: ["Egypt", 26.8, 30.8], FR: ["France", 46.6, 2.4], JP: ["Japan", 36.2, 138.3], AR: ["Argentina", -35, -65], CO: ["Colombia", 4.6, -74.1], PL: ["Poland", 52, 19.4], AU: ["Australia", -25.3, 133.8], TR: ["Turkey", 39, 35.2], ID: ["Indonesia", -2.5, 118], GL: ["Worldwide", null, null] };
  try { var saved = JSON.parse(localStorage.getItem("mm-filters") || "null"); if (saved) state = Object.assign(state, saved); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var deck = $("deck");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function inGroup(r, g) { var set = GROUPS.filter(function (x) { return x[0] === g; })[0][2]; return !set || set.indexOf(r.group) >= 0; }

  // filters
  var cats = [];
  DATA.forEach(function (r) { if (cats.indexOf(r.cat) < 0) cats.push(r.cat); });
  cats.sort().forEach(function (c) { var o = document.createElement("option"); o.value = c; o.textContent = c; $("cat").appendChild(o); });
  function matches(r, skipWhen) {
    if (!skipWhen && !inGroup(r, state.when)) return false;
    if (state.cat && r.cat !== state.cat) return false;
    if (state.place && (r.pl || []).indexOf(state.place) < 0) return false;
    if (state.str && r.strength !== state.str) return false;
    if (state.q) {
      var t = (r.q + " " + r.instrument + " " + r.label + " " + r.yes.head + " " + r.no.head).toLowerCase();
      if (t.indexOf(state.q.toLowerCase()) < 0) return false;
    }
    return true;
  }
  function tabs() {
    $("when").innerHTML = GROUPS.map(function (g) {
      var n = DATA.filter(function (r) { return matches(r, true) && inGroup(r, g[0]); }).length;
      return '<button class="tab" type="button" data-g="' + g[0] + '" aria-pressed="' + (state.when === g[0]) + '">' + g[1] + "<b>" + n + "</b></button>";
    }).join("");
  }

  function phrase(m) {
    if (m.dir === "up") return { cls: "up", arrow: "↑", text: m.head + " could rise" };
    if (m.dir === "down") return { cls: "down", arrow: "↓", text: m.head + " could fall" };
    return { cls: "flat", arrow: "↔", text: m.head };
  }
  function outcome(kind, m) {
    var p = phrase(m);
    var tone = p.cls === "flat" ? "neutral" : kind;
    return '<div class="oc ' + tone + '"><div class="lab"><span class="ans">IF ' + kind.toUpperCase() + (tone === "neutral" ? " · LITTLE MOVE" : "") + '</span><span class="arrow" aria-hidden="true">' + p.arrow + "</span></div>" +
      '<div class="head">' + esc(p.text) + '</div><div class="why">' + esc(m.why) + "</div></div>";
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dueLabel(r) {
    if (!r.dl) return r.when;
    var p = r.dl.split("-");
    return "Due " + MONTHS[+p[1] - 1] + " " + (+p[2]);
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function tick() {
    var now = Date.now();
    deck.querySelectorAll(".clock").forEach(function (c) {
      var due = c.getAttribute("data-due"), t = c.firstChild;
      if (!due) { t.textContent = "Awaiting result"; c.classList.add("past"); return; }
      var ms = new Date(due).getTime() - now;
      if (ms <= 0) { t.textContent = "Awaiting result"; c.classList.add("past"); c.classList.remove("soon"); return; }
      var sec = Math.floor(ms / 1000), d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), mi = Math.floor(sec % 3600 / 60), x = sec % 60;
      t.textContent = (d ? d + "d " : "") + pad(h) + ":" + pad(mi) + ":" + pad(x);
      c.classList.remove("past"); c.classList.toggle("soon", ms < 86400000);
    });
  }
  setInterval(tick, 1000);
  function markets(r) {
    var a = function (l, cls) { return '<a class="' + (cls || "") + '" href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + esc(l[0]) + " ↗</a>"; };
    var html = (r.links || []).map(function (l) { return a(l); }).join("") +
      (r.listings || []).map(function (l) { return a(l, "ev"); }).join("") +
      a(["Find on Kalshi", "https://kalshi.com/search?q=" + encodeURIComponent(r.query || r.instrument)], "find");
    if (r.coverage) html += '<span class="cov">' + esc(r.coverage) + "</span>";
    return '<div class="mkts" aria-label="Markets and contracts">' + html + "</div>";
  }
  function card(r) {
    return '<article class="card" aria-label="' + esc(r.q) + '">' +
      '<div class="top"><span class="clock" data-due="' + esc(r.due || "") + '"><span class="t">--</span><span class="d">' + esc(dueLabel(r)) + '</span></span><span class="str ' + r.strength + '">' + STR[r.strength] + '</span></div>' +
      '<h2 class="q">' + esc(r.q) + "</h2>" +
      '<div class="inst"><span>' + esc(r.cat) + " · </span>" + esc(r.instrument) + "</div>" +
      markets(r) +
      '<div class="out">' + outcome("yes", r.yes) + outcome("no", r.no) + "</div>" +
      (r.caveat ? '<div class="cav">' + esc(r.caveat) + "</div>" : "") +
      '<div class="foot"><span>UBIK\'s figure is for holders</span><a href="https://ubik.gold/forecasts/' + esc(r.id) + '">On ubik.gold ↗</a></div>' +
      "</article>";
  }

  function flipcard(r) {
    var where = (r.pl || ["GL"]).map(function (k) { return (PLACES[k] || [k])[0]; }).join(", ");
    return '<article class="card fc" aria-label="' + esc(r.q) + '"><div class="inner">' +
      '<div class="face front" role="button" tabindex="0" aria-label="' + esc(r.q) + '. Turn the card to see what moves.">' +
        '<div class="top"><span class="clock big" data-due="' + esc(r.due || "") + '"><span class="t">--</span><span class="d">' + esc(dueLabel(r)) + '</span></span><span class="str ' + r.strength + '">' + STR[r.strength] + "</span></div>" +
        '<div><h2 class="q">' + esc(r.q) + '</h2><div class="where">' + esc(r.cat) + " · " + esc(where) + "</div></div>" +
        '<div class="hint"><span>Tap to see what moves</span><b aria-hidden="true">↻</b></div>' +
      "</div>" +
      '<div class="face back" inert>' +
        '<div class="q">' + esc(r.q) + "</div>" +
        '<div class="inst"><span>' + esc(r.cat) + " · </span>" + esc(r.instrument) + "</div>" +
        '<div class="out">' + outcome("yes", r.yes) + outcome("no", r.no) + "</div>" +
        markets(r) +
        (r.caveat ? '<div class="cav">' + esc(r.caveat) + "</div>" : "") +
        '<div class="foot"><span>UBIK\'s figure is for holders</span><a href="https://ubik.gold/forecasts/' + esc(r.id) + '">On ubik.gold ↗</a></div>' +
        '<button class="flipbtn" type="button">↺ Back to the question</button>' +
      "</div></div></article>";
  }
  function turn(fc) {
    var on = !fc.classList.contains("on");
    fc.classList.toggle("on", on);
    fc.querySelector(".front").inert = on;
    fc.querySelector(".back").inert = !on;
    (on ? fc.querySelector(".flipbtn") : fc.querySelector(".front")).focus({ preventScroll: true });
  }
  deck.addEventListener("click", function (e) {
    if (e.target.closest("a")) return;
    var fc = e.target.closest(".fc"); if (fc) turn(fc);
  });
  deck.addEventListener("keydown", function (e) {
    var f = e.target.closest(".front");
    if (f && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); turn(f.closest(".fc")); }
  });

  function counts() {
    var c = {};
    DATA.forEach(function (r) {
      var keep = state.place; state.place = "";
      var ok = matches(r); state.place = keep;
      if (ok) (r.pl || ["GL"]).forEach(function (p) { c[p] = (c[p] || 0) + 1; });
    });
    return c;
  }
  function drawMap() {
    var D = window.MM_DOTS, st = D.step, cell = 10, W = D.rows[0].length * cell, H = D.rows.length * cell;
    var land = [];
    D.rows.forEach(function (row, y) { for (var x = 0; x < row.length; x++) if (row[x] === "1") land.push('<circle class="land" cx="' + (x * cell + 5) + '" cy="' + (y * cell + 5) + '" r="2.6"/>'); });
    var svg = $("map");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var k0 = W / (svg.getBoundingClientRect().width || W);
    var c = counts(), mk = [];
    Object.keys(c).filter(function (k) { return PLACES[k] && PLACES[k][1] !== null; }).sort(function (a, b) { return c[b] - c[a]; }).forEach(function (k) {
      var P = PLACES[k], x = (P[2] + 180) / st * cell, y = (D.top - P[1]) / st * cell, r = Math.min(22, 6 + Math.sqrt(c[k]) * 2.6) * k0;
      mk.push('<g class="mk' + (state.place === k ? " on" : "") + '" data-p="' + k + '" tabindex="0" role="button" aria-label="' + esc(P[0]) + ", " + c[k] + ' questions">' +
        '<circle class="halo" cx="' + x + '" cy="' + y + '" r="' + (r + 3 * k0) + '"/><circle class="core" cx="' + x + '" cy="' + y + '" r="' + r + '"/>' +
        '<text x="' + x + '" y="' + y + '" style="font-size:' + ((c[k] > 9 ? 10 : 9.5) * k0) + 'px">' + c[k] + "</text><title>" + esc(P[0]) + "</title></g>");
    });
    svg.innerHTML = land.join("") + mk.reverse().join("");
    $("places").innerHTML = Object.keys(c).sort(function (a, b) { return (a === "GL") - (b === "GL") || c[b] - c[a]; }).map(function (k) {
      return '<li class="' + (k === "GL" ? "gl" : "") + '"><button type="button" data-p="' + k + '">' + esc((PLACES[k] || [k])[0]) + "<b>" + c[k] + "</b></button></li>";
    }).join("");
  }
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { if (state.view === "map") drawMap(); }, 150); });
  function pickPlace(k) { state.place = k; state.view = state.deckView || "cards"; render(); window.scrollTo({ top: 0 }); }
  $("map").addEventListener("click", function (e) { var g = e.target.closest(".mk"); if (g) pickPlace(g.getAttribute("data-p")); });
  $("map").addEventListener("keydown", function (e) { var g = e.target.closest(".mk"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pickPlace(g.getAttribute("data-p")); } });
  $("places").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) pickPlace(b.getAttribute("data-p")); });
  document.querySelector(".views").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]"); if (b) { state.view = b.getAttribute("data-v"); if (state.view !== "map") state.deckView = state.view; render(); return; }
    if (e.target.closest("#clearplace")) { state.place = ""; render(); }
  });

  var list = [];
  function render() {
    try { localStorage.setItem("mm-filters", JSON.stringify(state)); } catch (e) {}
    tabs();
    list = DATA.filter(function (r) { return matches(r); });
    document.querySelectorAll(".views [data-v]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === state.view)); });
    var map = state.view === "map";
    $("mapview").hidden = !map; deck.hidden = map; document.querySelector(".pager").hidden = map;
    var chip = $("placechip");
    if (state.place) { chip.hidden = false; chip.innerHTML = esc((PLACES[state.place] || [state.place])[0]) + ' <button type="button" id="clearplace" aria-label="Show all places">×</button>'; }
    else chip.hidden = true;
    if (map) drawMap();
    $("count").textContent = list.length;
    deck.innerHTML = list.length ? list.map(state.view === "flip" ? flipcard : card).join("") : '<p class="empty">No questions match. Try another week or clear the search.</p>';
    deck.scrollLeft = 0; tick(); window.requestAnimationFrame(pager);
  }

  // phone pager
  function current() {
    var cards = deck.querySelectorAll(".card"); if (!cards.length) return 0;
    var w = cards[0].getBoundingClientRect().width + 10;
    return Math.min(cards.length - 1, Math.max(0, Math.round(deck.scrollLeft / w)));
  }
  function pager() {
    var n = list.length, i = current();
    $("pos").textContent = n ? (i + 1) + " / " + n : "0 / 0";
    $("prev").disabled = i <= 0; $("next").disabled = i >= n - 1;
  }
  function go(d) {
    var cards = deck.querySelectorAll(".card"); var i = current() + d;
    if (cards[i]) cards[i].scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "center", block: "nearest" });
  }
  deck.addEventListener("scroll", function () { window.requestAnimationFrame(pager); }, { passive: true });
  $("prev").addEventListener("click", function () { go(-1); });
  $("next").addEventListener("click", function () { go(1); });
  deck.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") { go(1); e.preventDefault(); } if (e.key === "ArrowLeft") { go(-1); e.preventDefault(); } });

  $("when").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; state.when = b.dataset.g; render(); });
  $("cat").addEventListener("change", function (e) { state.cat = e.target.value; render(); });
  $("str").addEventListener("change", function (e) { state.str = e.target.value; render(); });
  var t; $("q").addEventListener("input", function (e) { clearTimeout(t); t = setTimeout(function () { state.q = e.target.value.trim(); render(); }, 150); });
  $("cat").value = state.cat; $("str").value = state.str; $("q").value = state.q;
  render();
})();
