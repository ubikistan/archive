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
  var state = { when: "week", cat: "", str: "", q: "" };
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
      if (!due) { t.textContent = "Awaiting result"; c.className = "clock past"; return; }
      var ms = new Date(due).getTime() - now;
      if (ms <= 0) { t.textContent = "Awaiting result"; c.className = "clock past"; return; }
      var sec = Math.floor(ms / 1000), d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), mi = Math.floor(sec % 3600 / 60), x = sec % 60;
      t.textContent = (d ? d + "d " : "") + pad(h) + ":" + pad(mi) + ":" + pad(x);
      c.className = "clock" + (ms < 86400000 ? " soon" : "");
    });
  }
  setInterval(tick, 1000);
  function card(r) {
    return '<article class="card" aria-label="' + esc(r.q) + '">' +
      '<div class="top"><span class="clock" data-due="' + esc(r.due || "") + '"><span class="t">--</span><span class="d">' + esc(dueLabel(r)) + '</span></span><span class="str ' + r.strength + '">' + STR[r.strength] + '</span></div>' +
      '<h2 class="q">' + esc(r.q) + "</h2>" +
      '<div class="inst"><span>' + esc(r.cat) + " · </span>" + esc(r.instrument) + "</div>" +
      '<div class="out">' + outcome("yes", r.yes) + outcome("no", r.no) + "</div>" +
      (r.caveat ? '<div class="cav">' + esc(r.caveat) + "</div>" : "") +
      '<div class="foot"><span>UBIK\'s figure is for holders</span><a href="https://ubik.gold/forecasts/' + esc(r.id) + '">On ubik.gold ↗</a></div>' +
      "</article>";
  }

  var list = [];
  function render() {
    try { localStorage.setItem("mm-filters", JSON.stringify(state)); } catch (e) {}
    tabs();
    list = DATA.filter(function (r) { return matches(r); });
    $("count").textContent = list.length;
    deck.innerHTML = list.length ? list.map(card).join("") : '<p class="empty">No questions match. Try another week or clear the search.</p>';
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
