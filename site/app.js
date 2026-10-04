/* Archive of the Republic of Ubikistan. Reads lore.json and nothing else. */
(function () {
  "use strict";
  var D = null, main = document.getElementById("main");
  var ST_ORDER = ["CANON", "PROBABLE", "DISPUTED", "FOLK"];
  var RING = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15.5" fill="none" stroke="currentColor" stroke-width="5"/></svg>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function byId(id) { for (var i = 0; i < D.records.length; i++) if (D.records[i].id === id) return D.records[i]; return null; }
  function lore(id) { for (var i = 0; i < D.lore.length; i++) if (D.lore[i].id === id) return D.lore[i]; return null; }
  function era(id) { for (var i = 0; i < D.eras.length; i++) if (D.eras[i].id === id) return D.eras[i]; return null; }
  function firstImage(r) { for (var i = 0; i < r.media.length; i++) { var m = r.media[i]; if (m.type === "image" && m.file) return m; if (m.type === "video" && m.poster) return { file: m.poster, alt: m.alt }; } return null; }
  function badge(r) { return r.kind === "record" ? '<span class="badge REC">Record</span>' : r.specimen ? '<span class="badge SPEC">Specimen</span>' : '<span class="badge ' + esc(r.status) + '">' + esc(r.status_label) + "</span>"; }

  function card(r) {
    var img = firstImage(r), ph;
    if (r.access === "restricted") ph = '<span class="restricted">RESTRICTED<br>RECORD</span>';
    else if (img) ph = '<img src="' + esc(img.file) + '" alt="" loading="lazy">';
    else ph = '<span class="noimg">' + RING + "</span>";
    return '<li><a class="card" href="#/r/' + esc(r.id) + '"><span class="ph">' + ph + '</span><span class="meta"><span class="code">' + esc(r.code) +
      '</span><span class="t">' + esc(r.title) + '</span><span class="d"><span>' + esc(r.date) + talkShort(r.discussion) + "</span>" + badge(r) + "</span></span></a></li>";
  }

  function talkShort(t) {
    if (!t || !(t.up || t.down || t.comments)) return "";
    var b = [];
    if (t.up) b.push("▲ " + t.up);
    if (t.down) b.push("▼ " + t.down);
    if (t.comments) b.push("✎ " + t.comments);
    return ' <span class="talk" aria-label="' + (t.up || 0) + " up, " + (t.down || 0) + " down, " + (t.comments || 0) + ' comments">· ' + b.join(" ") + "</span>";
  }

  /* ---------- comments and votes (giscus, stored in the repository's Discussions) ---------- */
  function commentsHTML(term) {
    var c = D.comments;
    if (!c || !c.category_id) return '<section class="talkbox" aria-labelledby="talk-h"><h2 class="section-h" id="talk-h">Votes and remarks</h2><p class="muted small">The register of remarks opens shortly.</p></section>';
    return '<section class="talkbox" aria-labelledby="talk-h"><h2 class="section-h" id="talk-h">Votes and remarks</h2>' +
      '<p class="muted small">Like 👍 or unlike 👎 this entry, and leave a remark. Sign in with any GitHub account; a pseudonym is fine. Comments are kept in the archive\'s public discussions.</p>' +
      '<div class="giscus" data-term="' + esc(term) + '"></div></section>';
  }
  function mountComments() {
    var box = document.querySelector(".giscus"), c = D.comments;
    if (!box || !c || !c.category_id) return;
    var dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    var sc = document.createElement("script");
    var a = { src: "https://giscus.app/client.js", "data-repo": c.repo, "data-repo-id": c.repo_id, "data-category": c.category,
      "data-category-id": c.category_id, "data-mapping": "specific", "data-term": box.dataset.term, "data-strict": "1",
      "data-reactions-enabled": "1", "data-emit-metadata": "0", "data-input-position": "top",
      "data-theme": dark ? "noborder_dark" : "noborder_light",
      "data-lang": "en", "data-loading": "lazy", crossorigin: "anonymous", async: "" };
    Object.keys(a).forEach(function (k) { sc.setAttribute(k, a[k]); });
    box.appendChild(sc);
  }

  /* ---------- wiki tabs: read, edit, history, talk ---------- */
  function editURL(file) { return D.repository + "/edit/main/" + file; }
  function tabsHTML(base, file, active, nrev) {
    return '<nav class="wtabs" aria-label="Page">' +
      '<a href="' + base + '"' + (active === "read" ? ' aria-current="page"' : "") + ">Read</a>" +
      '<a href="' + editURL(file) + '" target="_blank" rel="noopener">Edit ↗</a>' +
      '<a href="' + base + '/history"' + (active === "history" ? ' aria-current="page"' : "") + ">History" + (nrev ? ' <span class="n">' + nrev + "</span>" : "") + "</a>" +
      '<button type="button" class="totalk"' + (active === "history" ? " hidden" : "") + ">Talk</button></nav>";
  }
  function wireTabs() {
    var b = document.querySelector(".totalk");
    if (b) b.addEventListener("click", function () { var t = document.getElementById("talk-h"); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
  function historyHTML(item, back, kindLabel) {
    var revs = item.revisions || [];
    var h = '<p class="crumb"><a href="' + back + '">' + esc(item.title) + "</a> / History</p>" + tabsHTML(back, item.file, "history", revs.length) +
      '<div class="prose"><h1>History</h1><p class="lede">Every version of this ' + kindLabel + ", newest first. Anyone with a GitHub account can propose a new version with Edit; the State Archive reviews it before it appears.</p></div>";
    h += revs.length ? '<ol class="revs">' + revs.map(function (v, i) {
      return '<li><span class="rd">' + esc(v.date) + '</span><span class="ra">' + esc(v.author) + '</span><span class="rm">' + esc(v.message) + (i === 0 ? ' <span class="badge">current</span>' : "") + '</span><span class="rl"><a href="' + esc(v.url) + '">changes</a><a href="' + esc(D.repository + "/blob/" + v.sha + "/" + item.file) + '">this version</a></span></li>';
    }).join("") + "</ol>" : '<p class="muted">No history recorded yet.</p>';
    return h + '<p class="tools"><a href="' + esc(D.repository + "/commits/main/" + item.file) + '">Full history on GitHub</a><a href="' + esc(D.repository + "/pulls") + '">Proposed changes waiting for review</a></p>';
  }

  /* ---------- recent changes ---------- */
  function pageFor(path) {
    var m = /^lore\/(.+)\.md$/.exec(path);
    if (m) { var l = lore(m[1]); return l ? { href: "#/lore/" + l.id, title: l.title } : null; }
    for (var i = 0; i < D.records.length; i++) if (D.records[i].file === path) return { href: "#/r/" + D.records[i].id, title: D.records[i].code + " · " + D.records[i].title };
    return null;
  }
  function viewChanges() {
    var list = D.changes || [];
    main.innerHTML = '<section class="hero"><p class="kicker">Recent changes</p><h1>What changed</h1><p class="lede">Every edit to the lore and the records, newest first, with who made it.</p></section>' +
      '<p class="tools" style="margin-top:0"><a href="' + esc(D.repository + "/pulls") + '">Proposed changes waiting for review</a><a href="' + esc(D.repository + "/issues?q=label%3Asubmission") + '">Submitted records</a></p>' +
      '<ol class="changes">' + list.map(function (c) {
        var more = c.files.length > 8 ? '<li class="muted">and ' + (c.files.length - 8) + " more</li>" : "";
        var files = c.files.slice(0, 8).map(function (f) {
          var pgl = pageFor(f.path);
          return "<li><span class=\"ch " + f.change + '">' + f.change + "</span> " + (pgl ? '<a href="' + pgl.href + '">' + esc(pgl.title) + "</a>" : '<span class="muted">' + esc(f.path) + "</span>") + "</li>";
        }).join("") + more;
        return '<li><div class="chh"><span class="rd">' + esc(c.date) + '</span><span class="ra">' + esc(c.author) + '</span><a class="rm" href="' + esc(c.url) + '">' + esc(c.message) + "</a></div><ul>" + files + "</ul></li>";
      }).join("") + "</ol>";
  }

  /* ---------- previous / next ---------- */
  var PAGER = { prev: null, next: null };
  function pagerHTML(list, i, href, label, top) {
    var p = list[i - 1], n = list[i + 1];
    PAGER.prev = p ? href(p) : null; PAGER.next = n ? href(n) : null;
    function side(x, cls, arrow) {
      if (!x) return '<span class="pg ' + cls + ' off"></span>';
      return '<a class="pg ' + cls + '" href="' + href(x) + '"' + (top ? ' aria-label="' + (cls === "prev" ? "Previous" : "Next") + ": " + esc(x.title) + '"' : "") + '><span class="pgk">' + arrow + "</span>" +
        (top ? "" : '<span class="pgt"><span class="pgc">' + esc(label(x)) + "</span>" + esc(x.title) + "</span>") + "</a>";
    }
    return '<nav class="pager' + (top ? " top" : "") + '" aria-label="Previous and next">' + side(p, "prev", "← Previous") +
      (top ? '<span class="pgpos">' + (i + 1) + " / " + list.length + "</span>" : "") + side(n, "next", "Next →") + "</nav>";
  }
  document.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "")) return;
    if (e.key === "ArrowLeft" && PAGER.prev) location.hash = PAGER.prev;
    if (e.key === "ArrowRight" && PAGER.next) location.hash = PAGER.next;
  });

  /* ---------- search ---------- */
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function hay(r) {
    if (!r._h) r._h = norm([r.code, r.title, r.date, r.institution, r.institution_name, r.format, r.status_label, r.text, (r.subjects || []).join(" "), (r.tags || []).join(" "), r.contributor, era(r.era) ? era(r.era).name : ""].join(" "));
    return r._h;
  }
  function match(r, words) { var h = hay(r); for (var i = 0; i < words.length; i++) if (h.indexOf(words[i]) < 0) return false; return true; }
  function words(q) { return norm(q).split(/[^a-z0-9/]+/).filter(Boolean); }

  function parseQ() {
    var q = {}, s = location.hash.split("?")[1] || "";
    s.split("&").forEach(function (p) { if (!p) return; var kv = p.split("="); q[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " ")); });
    return q;
  }
  function setQ(q, replace) {
    var parts = [];
    Object.keys(q).forEach(function (k) { if (q[k]) parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(q[k])); });
    var h = "#/" + (parts.length ? "?" + parts.join("&") : "");
    if (replace) history.replaceState(null, "", h); else location.hash = h;
  }

  function viewArchive() {
    var q = parseQ();
    var counts = D.counts;
    main.innerHTML =
      '<section class="hero"><p class="kicker">State Archive · founded 17.03.1966</p>' +
      "<h1>What Ubikistan says happened</h1>" +
      '<p class="lede">' + counts.archive + " records in the Archive, " + counts.record + " entries in the Record since 2026, and " + counts.lore + ' pages of lore. Search by year, name, institution, code or anything in the text.</p></section>' +
      '<div class="find"><label for="q">Search the archive</label><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6"/><path d="M13 13l5 5"/></svg>' +
      '<input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="passport, 1996, AIXBT, BSV/PP…" value="' + esc(q.q || "") + '"></div>' +
      '<div class="filters" id="filters"></div><div class="erastrip" id="strip" aria-hidden="true"></div><p class="count" id="count"></p><ul class="lorehits" id="lorehits"></ul><ul class="grid" id="grid"></ul>';
    var input = document.getElementById("q"), t;
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { var x = parseQ(); x.q = input.value.trim(); setQ(x, true); renderResults(); }, 120); });
    renderResults();
  }

  function renderResults() {
    var q = parseQ(), w = words(q.q || "");
    var pool = D.records.filter(function (r) { return match(r, w); });
    function apply(list, skip) {
      return list.filter(function (r) {
        if (skip !== "era" && q.era && r.era !== q.era) return false;
        if (skip !== "status" && q.status && (q.status === "REC" ? r.kind !== "record" : r.status !== q.status)) return false;
        if (skip !== "inst" && q.inst && r.institution !== q.inst) return false;
        return true;
      });
    }
    var list = apply(pool);
    function n(list, f) { return list.filter(f).length; }
    var eraPool = apply(pool, "era"), stPool = apply(pool, "status"), instPool = apply(pool, "inst");
    var f = '<div class="frow" role="group" aria-label="Era"><span class="flab">Era</span>' + chip("era", "", "All", eraPool.length, q);
    D.eras.forEach(function (e) { var c = n(eraPool, function (r) { return r.era === e.id; }); if (c || q.era === e.id) f += chip("era", e.id, e.name.replace(/^[IVX]+ · /, ""), c, q); });
    f += '</div><div class="frow" role="group" aria-label="Status"><span class="flab">Status</span>' + chip("status", "", "All", stPool.length, q);
    ST_ORDER.forEach(function (s) { var c = n(stPool, function (r) { return r.status === s; }); if (c || q.status === s) f += chip("status", s, D.statuses[s], c, q); });
    var rc = n(stPool, function (r) { return r.kind === "record"; });
    if (rc) f += chip("status", "REC", "The Record", rc, q);
    f += '</div><div class="frow"><span class="flab"><label for="inst">From</label></span><select id="inst" class="chip"><option value="">Every institution</option>';
    Object.keys(D.institutions).forEach(function (k) { var c = n(instPool, function (r) { return r.institution === k; }); if (c) f += '<option value="' + k + '"' + (q.inst === k ? " selected" : "") + ">" + esc(D.institutions[k]) + " (" + c + ")</option>"; });
    f += "</select></div>";
    document.getElementById("filters").innerHTML = f;
    document.querySelectorAll("#filters button[data-k]").forEach(function (b) {
      b.addEventListener("click", function () { var x = parseQ(); x[b.dataset.k] = b.dataset.v; setQ(x, true); renderResults(); });
    });
    document.getElementById("inst").addEventListener("change", function (e) { var x = parseQ(); x.inst = e.target.value; setQ(x, true); renderResults(); });

    // the era strip: one segment per year that has records, lit if it is in the current result
    var years = {}; D.records.forEach(function (r) { years[r.year] = 0; }); list.forEach(function (r) { years[r.year] = 1; });
    document.getElementById("strip").innerHTML = Object.keys(years).sort().map(function (y) { return '<span class="' + (years[y] ? "on" : "") + '" style="flex:1" title="' + y + '"></span>'; }).join("");

    var active = q.q || q.era || q.status || q.inst;
    document.getElementById("count").innerHTML = "<span>" + list.length + (list.length === 1 ? " record" : " records") + "</span>" + (active ? '<button type="button" id="clear">Clear search</button>' : "");
    if (active) document.getElementById("clear").addEventListener("click", function () { setQ({}, true); viewArchive(); });

    var lh = "";
    if (w.length) D.lore.forEach(function (l) {
      var h = norm(l.title + " " + l.summary + " " + l.text);
      if (w.every(function (x) { return h.indexOf(x) >= 0; })) lh += '<li><a href="#/lore/' + l.id + '"><span class="k">Lore</span><span><b>' + esc(l.title) + '</b> <span class="s">' + esc(l.summary) + "</span></span></a></li>";
    });
    document.getElementById("lorehits").innerHTML = lh;
    document.getElementById("grid").innerHTML = list.length ? list.map(card).join("") :
      '<li class="muted" style="grid-column:1/-1;padding:28px 0">Nothing in the archive matches. That does not mean it did not happen. <a href="#/add">Add it.</a></li>';
  }
  function chip(k, v, label, c, q) {
    var on = (q[k] || "") === v;
    return '<button type="button" class="chip" data-k="' + k + '" data-v="' + esc(v) + '" aria-pressed="' + on + '">' + esc(label) + '<span class="n">' + c + "</span></button>";
  }

  /* ---------- one record ---------- */
  function mediaHTML(m) {
    var cap = m.alt || m.caption || "";
    if (m.type === "image" && m.file) return '<figure><img src="' + esc(m.file) + '" alt="' + esc(m.alt || "") + '">' + (m.caption ? "<figcaption>" + esc(m.caption) + "</figcaption>" : "") + "</figure>";
    if (m.type === "video" && m.file) return '<figure><video controls preload="metadata" src="' + esc(m.file) + '"' + (m.poster ? ' poster="' + esc(m.poster) + '"' : "") + "></video>" + (cap ? "<figcaption>" + esc(cap) + "</figcaption>" : "") + "</figure>";
    if (m.type === "audio" && m.file) return '<figure><audio controls src="' + esc(m.file) + '" style="width:100%"></audio>' + (cap ? "<figcaption>" + esc(cap) + "</figcaption>" : "") + "</figure>";
    if (m.url) {
      var ia = /^https:\/\/archive\.org\/details\/([^/?#]+)/.exec(m.url);
      if (ia) return '<figure><iframe src="https://archive.org/embed/' + esc(ia[1]) + '" title="' + esc(cap || "Film") + '" allowfullscreen loading="lazy"></iframe><figcaption>' + esc(cap) + ' · <a href="' + esc(m.url) + '">Internet Archive</a></figcaption></figure>';
      return '<figure>' + (m.poster ? '<img src="' + esc(m.poster) + '" alt="">' : "") + '<figcaption><a href="' + esc(m.url) + '" rel="noopener">' + esc(cap || m.url) + " ↗</a></figcaption></figure>";
    }
    if (m.file) return '<figure><figcaption><a href="' + esc(m.file) + '">' + esc(cap || m.file) + "</a></figcaption></figure>";
    return "";
  }

  function viewRecord(id, sub) {
    var r = byId(id);
    if (!r) return notFound();
    if (sub === "history") { main.innerHTML = historyHTML(r, "#/r/" + r.id, "record"); document.title = "History · " + r.code; return; }
    var held = r.access === "restricted";
    var e = era(r.era);
    var dl = [["Code", esc(r.code)], ["Date", esc(r.date)], ["Era", esc(e ? e.name : "")],
      ["Issued by", esc(r.institution_name || "")], ["Format", esc(r.format || "")],
      ["Status", r.kind === "record" ? "Record entry" : r.specimen ? "SPECIMEN · shows how the state works, not an event" : esc(r.status_label)],
      ["Contributor", esc(r.contributor)], ["Catalogued", esc(r.added)],
      ["Citizens", r.discussion && (r.discussion.up || r.discussion.down || r.discussion.comments) ? "👍 " + (r.discussion.up || 0) + " · 👎 " + (r.discussion.down || 0) + " · " + (r.discussion.comments || 0) + " comments" : ""]].filter(function (x) { return x[1]; });
    var seq = D.records.filter(function (x) { return x.kind === r.kind; }), at = seq.indexOf(r);
    var rhref = function (x) { return "#/r/" + x.id; }, rlab = function (x) { return x.code + " · " + x.date; };
    var html = '<div class="crumbrow"><p class="crumb"><a href="#/' + (r.kind === "record" ? "record" : "") + '">' + (r.kind === "record" ? "The Record" : "The Archive") + "</a> / " + esc(r.code) + "</p>" + pagerHTML(seq, at, rhref, rlab, true) + "</div>" +
      '<article class="rec"><div class="media">' + (held ? '<div class="held">RESTRICTED RECORD<br>HELD IN THE STATE TERMINAL</div>' : r.media.map(mediaHTML).join("")) + "</div>" +
      '<div>' + tabsHTML("#/r/" + r.id, r.file, "read", (r.revisions || []).length) + '<p class="code-big">' + esc(r.code) + "</p><h1>" + esc(r.title) + "</h1>" + badge(r) +
      '<dl class="slate">' + dl.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl>" +
      '<div class="prose">' + (held ? "<p class=\"muted\">The text of this record is held in the State Terminal.</p>" : r.html) + "</div>" +
      '<p class="tools"><a href="' + esc(r.source) + '">Source file</a><a href="' + esc(r.source.replace("/blob/", "/edit/")) + '">Suggest a correction</a></p></div></article>';
    html += pagerHTML(seq, at, rhref, rlab, false) + commentsHTML(r.code);
    var rel = (r.related || []).map(byId).filter(Boolean);
    if (rel.length) html += '<h2 class="section-h">Related records</h2><ul class="grid">' + rel.map(card).join("") + "</ul>";
    var lo = (r.lore || []).map(lore).filter(Boolean);
    if (lo.length) html += '<h2 class="section-h">Lore</h2><ul class="lorehits">' + lo.map(function (l) { return '<li><a href="#/lore/' + l.id + '"><span class="k">Lore</span><span><b>' + esc(l.title) + '</b> <span class="s">' + esc(l.summary) + "</span></span></a></li>"; }).join("") + "</ul>";
    var same = D.records.filter(function (x) { return x.year === r.year && x.id !== r.id && rel.indexOf(x) < 0; });
    if (same.length) html += '<h2 class="section-h">Also from ' + r.year + '</h2><ul class="grid">' + same.slice(0, 8).map(card).join("") + "</ul>";
    main.innerHTML = html;
    mountComments(); wireTabs();
    document.title = r.title + " · " + r.code + " · Archive of the Republic of Ubikistan";
  }

  /* ---------- the Record ---------- */
  function viewRecordList() {
    var list = D.records.filter(function (r) { return r.kind === "record"; }).reverse();
    main.innerHTML = '<section class="hero"><p class="kicker">The Record · from 30.09.2026</p><h1>What actually happens</h1><p class="lede">Real films, real crossings and real work, newest first. No invented event ever gets a REC number.</p></section>' +
      '<ul class="reclist">' + list.map(function (r) {
        var img = firstImage(r);
        return '<li><a href="#/r/' + r.id + '"><span class="c">' + esc(r.code) + '<br><span class="muted" style="font-weight:400">' + esc(r.date) + '</span></span><span><span class="t">' + esc(r.title) + '</span><span class="x">' + esc((r.text || "").split("\n")[0]) + "</span></span>" +
          (img ? '<img src="' + esc(img.file) + '" alt="" loading="lazy">' : "<span></span>") + "</a></li>";
      }).join("") + "</ul>";
  }

  /* ---------- lore ---------- */
  function viewLore(id, sub) {
    if (!id) {
      main.innerHTML = '<section class="hero"><p class="kicker">Lore</p><h1>How the Republic works</h1><p class="lede">The rules, the eras, the people and the institutions. Read these first if you want to add to the archive.</p></section>' +
        '<ul class="loreindex">' + D.lore.map(function (l) { return '<li><a href="#/lore/' + l.id + '"><span class="t">' + esc(l.title) + '</span><span class="s">' + esc(l.summary) + "</span></a></li>"; }).join("") + "</ul>";
      return;
    }
    var l = lore(id);
    if (!l) return notFound();
    if (sub === "history") { main.innerHTML = '<div style="padding:8px 0 40px">' + historyHTML(l, "#/lore/" + l.id, "page") + "</div>"; document.title = "History · " + l.title; return; }
    var linked = D.records.filter(function (r) { return (r.lore || []).indexOf(id) >= 0; });
    main.innerHTML = '<div class="lorewrap"><nav class="loretoc" aria-label="Lore">' + D.lore.map(function (x) { return '<a href="#/lore/' + x.id + '"' + (x.id === id ? ' aria-current="page"' : "") + ">" + esc(x.title) + "</a>"; }).join("") + "</nav>" +
      '<article class="prose">' + tabsHTML("#/lore/" + l.id, l.file, "read", (l.revisions || []).length) + '<p class="kicker">Lore</p><h1>' + esc(l.title) + "</h1>" + l.html +
      '<p class="tools"><a href="' + esc(l.source) + '">Source file</a><a href="' + esc(l.source.replace("/blob/", "/edit/")) + '">Suggest a correction</a></p>' +
      pagerHTML(D.lore, D.lore.indexOf(l), function (x) { return "#/lore/" + x.id; }, function () { return "Lore"; }, false) + commentsHTML("lore/" + l.id) +
      (linked.length ? '<h2 class="section-h">Records</h2><ul class="grid">' + linked.map(card).join("") + "</ul>" : "") + "</article></div>";
    mountComments(); wireTabs();
    document.title = l.title + " · Archive of the Republic of Ubikistan";
  }

  /* ---------- add a record ---------- */
  var MEDIA_OPTS = [["PH", "photograph"], ["AV", "film, tape, broadcast"], ["DOC", "document"], ["POS", "poster, advertisement"], ["STP", "stamp"], ["NOTE", "banknote, coin, bond"], ["PP", "passport"], ["SCR", "screenshot, interface"], ["EPH", "ephemera"], ["OBJ", "product, hardware, packaging"]];
  var AI_PROMPT = "Read https://ubikistan.github.io/archive/llms.txt and the rules it links to. Then help me write a record for the Archive of the Republic of Ubikistan about: [describe your object or story]. Ask me what you need, check it against the rules, and give me the finished submission link.";

  function viewAdd() {
    var inst = Object.keys(D.institutions).map(function (k) { return '<option value="' + esc(D.institutions[k]) + '">'; }).join("");
    main.innerHTML = '<div class="addwrap"><div class="prose"><p class="kicker">Add to the archive</p><h1>Submit a record</h1>' +
      '<p class="lede">A photograph, a document, a story or a film. It enters the archive as apocrypha, and the State Archive may later promote it.</p>' +
      '<p class="muted">Read <a href="#/lore/rules">the rules</a> first. The Archive is invented history up to 2025. The Record is real things that happened from 2026 on.</p></div>' +
      '<form id="addf" class="addf" novalidate>' +
      '<fieldset><legend>Which archive?</legend><label class="opt"><input type="radio" name="archive" value="The Archive (invented history, 1965–2025)" checked> <span><b>The Archive</b> · invented history, 1965–2025</span></label>' +
      '<label class="opt"><input type="radio" name="archive" value="The Record (something that really happened, 2026 on)"> <span><b>The Record</b> · something that really happened, 2026 on</span></label></fieldset>' +
      '<label>Title<input name="record_title" required placeholder="Spectator ticket, Tour of the Plain 1983"></label>' +
      '<div class="two"><label>Date<input name="date" required placeholder="06.1983"></label>' +
      '<label>Medium<select name="medium">' + MEDIA_OPTS.map(function (m) { return '<option value="' + m[0] + " · " + m[1] + '"' + (m[0] === "EPH" ? " selected" : "") + ">" + m[1] + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="two"><label>Issued by<input name="institution" list="instl" placeholder="Sporting Committee"><datalist id="instl">' + inst + "</datalist></label>" +
      '<label>What is it, physically?<input name="format" placeholder="Ticket, letterpress on card"></label></div>' +
      '<label>Caption and text<textarea name="text" rows="5" required placeholder="One line of caption, the way a catalogue would put it. Then anything else the record needs."></textarea></label>' +
      '<label>Film link <span class="muted">(optional: Internet Archive, YouTube, Vimeo)</span><input name="film" type="url" placeholder="https://archive.org/details/…"></label>' +
      '<label>Credit as<input name="contributor" required placeholder="Your name or handle"></label>' +
      '<p class="muted small">Next you go to GitHub, which needs a free account (a pseudonym is fine). Drag your images onto that page, tick the CC0 box and submit.</p>' +
      '<p class="formerr" id="formerr" role="alert"></p><button class="btn" type="submit">Continue on GitHub ↗</button></form>' +
      '<div class="prose addside"><h2>Ask your AI</h2><p>Any assistant that can read web pages can help you write it. Paste this:</p><pre id="aip">' + esc(AI_PROMPT) + '</pre><button class="btn ghost" type="button" id="copyai">Copy</button>' +
      '<h2>With Claude Code</h2><p>Claude Code can write the record and propose it directly:</p><pre>git clone https://github.com/ubikistan/archive\ncd archive\nclaude</pre><p>Then say what you want to add. It follows the archive\'s <a href="https://github.com/ubikistan/archive/blob/main/CLAUDE.md">instructions</a>.</p>' +
      '<h2>For agents</h2><p>Everything is in <a href="lore.json">lore.json</a>, <a href="llms.txt">llms.txt</a> and <a href="llms-full.txt">llms-full.txt</a>.</p>' +
      '<h2>Not accepted</h2><ul><li>Real people as part of Ubikistan\'s history. The state borrows formats, never faces.</li><li>Anything you have no right to give away. Everything is CC0.</li><li>Price talk. Culture before coin.</li></ul></div></div>';
    document.getElementById("addf").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target, v = function (n) { return (f.elements[n].value || "").trim(); }, err = [];
      if (!v("record_title")) err.push("a title");
      if (!/(1[89]\d\d|20\d\d)/.test(v("date"))) err.push("a date with a year");
      if (!v("text")) err.push("a caption");
      if (!v("contributor")) err.push("a name to credit");
      var arch = f.querySelector("input[name=archive]:checked").value, y = +((v("date").match(/(1[89]\d\d|20\d\d)/) || [])[1]);
      if (y && /^The Archive/.test(arch) && y > 2025) err.push("a year up to 2025, or choose the Record");
      if (y && /^The Record/.test(arch) && y < 2026) err.push("a year from 2026, or choose the Archive");
      document.getElementById("formerr").textContent = err.length ? "Still needed: " + err.join(", ") + "." : "";
      if (err.length) return;
      var p = { template: "record.yml", title: "Record: " + v("record_title"), archive: arch, record_title: v("record_title"), date: v("date"),
        medium: v("medium"), institution: v("institution"), format: v("format"), text: v("text"), media: v("film"), contributor: v("contributor") };
      var qs = Object.keys(p).filter(function (k) { return p[k]; }).map(function (k) { return k + "=" + encodeURIComponent(p[k]); }).join("&");
      window.open("https://github.com/ubikistan/archive/issues/new?" + qs, "_blank", "noopener");
    });
    document.getElementById("copyai").addEventListener("click", function (e) {
      var b = e.target;
      (navigator.clipboard ? navigator.clipboard.writeText(AI_PROMPT) : Promise.reject()).then(function () { b.textContent = "Copied"; }, function () { b.textContent = "Select the text above"; });
    });
  }

  function notFound() {
    main.innerHTML = '<div style="padding:64px 0"><p class="kicker">Not found</p><h1>RECORD NOT FOUND</h1><p>This record does not exist, or no longer does. <a href="#/">Return to the archive</a>.</p></div>';
  }

  /* ---------- router ---------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, "").split("?")[0], parts = h.split("/");
    var nav = parts[0] === "contribute" ? "add" : parts[0] === "r" ? (byId(parts[1]) && byId(parts[1]).kind === "record" ? "record" : "archive") : (parts[0] || "archive");
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.dataset.nav === nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.title = "Archive of the Republic of Ubikistan";
    PAGER.prev = PAGER.next = null;
    if (!parts[0]) viewArchive();
    else if (parts[0] === "r") viewRecord(parts[1], parts[2]);
    else if (parts[0] === "changes") viewChanges();
    else if (parts[0] === "record") viewRecordList();
    else if (parts[0] === "lore") viewLore(parts[1], parts[2]);
    else if (parts[0] === "add" || parts[0] === "contribute") viewAdd();
    else notFound();
  }
  // filters and typing use replaceState, which fires no hashchange; every real navigation does
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); main.focus({ preventScroll: true }); });

  fetch("lore.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (data) {
    D = data; route();
  }).catch(function () {
    main.innerHTML = '<div style="padding:64px 0"><h1>ARCHIVE CONNECTION LOST</h1><p>The archive could not be opened. Try again, or read it as <a href="llms-full.txt">plain text</a>.</p></div>';
  });
})();
