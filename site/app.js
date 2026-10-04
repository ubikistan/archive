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
  function badge(r) { return r.kind === "record" ? '<span class="badge REC">Record</span>' : '<span class="badge ' + esc(r.status) + '">' + esc(r.status_label) + "</span>"; }

  function card(r) {
    var img = firstImage(r), ph;
    if (r.access === "restricted") ph = '<span class="restricted">RESTRICTED<br>RECORD</span>';
    else if (img) ph = '<img src="' + esc(img.file) + '" alt="" loading="lazy">';
    else ph = '<span class="noimg">' + RING + "</span>";
    return '<li><a class="card" href="#/r/' + esc(r.id) + '"><span class="ph">' + ph + '</span><span class="meta"><span class="code">' + esc(r.code) +
      '</span><span class="t">' + esc(r.title) + '</span><span class="d"><span>' + esc(r.date) + "</span>" + badge(r) + "</span></span></a></li>";
  }

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
      '<p class="lede">' + counts.archive + " records from 1965 to 2025, " + counts.record + " entries in the Record since 2026, and " + counts.lore + ' pages of lore. Search by year, name, institution, code or anything in the text.</p></section>' +
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
      '<li class="muted" style="grid-column:1/-1;padding:28px 0">Nothing in the archive matches. That does not mean it did not happen. <a href="#/contribute">Add it.</a></li>';
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

  function viewRecord(id) {
    var r = byId(id);
    if (!r) return notFound();
    var held = r.access === "restricted";
    var e = era(r.era);
    var dl = [["Code", esc(r.code)], ["Date", esc(r.date)], ["Era", esc(e ? e.name : "")],
      ["Issued by", esc(r.institution_name || "")], ["Format", esc(r.format || "")],
      ["Status", r.kind === "record" ? "Record entry" : esc(r.status_label)],
      ["Contributor", esc(r.contributor)], ["Catalogued", esc(r.added)]].filter(function (x) { return x[1]; });
    var html = '<p class="crumb"><a href="#/' + (r.kind === "record" ? "record" : "") + '">' + (r.kind === "record" ? "The Record" : "The Archive") + "</a> / " + esc(r.code) + "</p>" +
      '<article class="rec"><div class="media">' + (held ? '<div class="held">RESTRICTED RECORD<br>HELD IN THE STATE TERMINAL</div>' : r.media.map(mediaHTML).join("")) + "</div>" +
      '<div><p class="code-big">' + esc(r.code) + "</p><h1>" + esc(r.title) + "</h1>" + badge(r) +
      '<dl class="slate">' + dl.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl>" +
      '<div class="prose">' + (held ? "<p class=\"muted\">The text of this record is held in the State Terminal.</p>" : r.html) + "</div>" +
      '<p class="tools"><a href="' + esc(r.source) + '">Source file</a><a href="' + esc(r.source.replace("/blob/", "/edit/")) + '">Suggest a correction</a></p></div></article>';
    var rel = (r.related || []).map(byId).filter(Boolean);
    if (rel.length) html += '<h2 class="section-h">Related records</h2><ul class="grid">' + rel.map(card).join("") + "</ul>";
    var lo = (r.lore || []).map(lore).filter(Boolean);
    if (lo.length) html += '<h2 class="section-h">Lore</h2><ul class="lorehits">' + lo.map(function (l) { return '<li><a href="#/lore/' + l.id + '"><span class="k">Lore</span><span><b>' + esc(l.title) + '</b> <span class="s">' + esc(l.summary) + "</span></span></a></li>"; }).join("") + "</ul>";
    var same = D.records.filter(function (x) { return x.year === r.year && x.id !== r.id && rel.indexOf(x) < 0; });
    if (same.length) html += '<h2 class="section-h">Also from ' + r.year + '</h2><ul class="grid">' + same.slice(0, 8).map(card).join("") + "</ul>";
    main.innerHTML = html;
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
  function viewLore(id) {
    if (!id) {
      main.innerHTML = '<section class="hero"><p class="kicker">Lore</p><h1>How the Republic works</h1><p class="lede">The rules, the eras, the people and the institutions. Read these first if you want to add to the archive.</p></section>' +
        '<ul class="loreindex">' + D.lore.map(function (l) { return '<li><a href="#/lore/' + l.id + '"><span class="t">' + esc(l.title) + '</span><span class="s">' + esc(l.summary) + "</span></a></li>"; }).join("") + "</ul>";
      return;
    }
    var l = lore(id);
    if (!l) return notFound();
    var linked = D.records.filter(function (r) { return (r.lore || []).indexOf(id) >= 0; });
    main.innerHTML = '<div class="lorewrap"><nav class="loretoc" aria-label="Lore">' + D.lore.map(function (x) { return '<a href="#/lore/' + x.id + '"' + (x.id === id ? ' aria-current="page"' : "") + ">" + esc(x.title) + "</a>"; }).join("") + "</nav>" +
      '<article class="prose"><p class="kicker">Lore</p><h1>' + esc(l.title) + "</h1>" + l.html +
      '<p class="tools"><a href="' + esc(l.source) + '">Source file</a><a href="' + esc(l.source.replace("/blob/", "/edit/")) + '">Suggest a correction</a></p>' +
      (linked.length ? '<h2 class="section-h">Records</h2><ul class="grid">' + linked.map(card).join("") + "</ul>" : "") + "</article></div>";
    document.title = l.title + " · Archive of the Republic of Ubikistan";
  }

  /* ---------- contribute ---------- */
  function viewContribute() {
    main.innerHTML = '<div class="prose" style="padding:36px 0 48px"><p class="kicker">Contribute</p><h1>Add to the archive</h1>' +
      '<p class="lede">Anyone can add a photograph, a document, a story or a film. It enters the archive as apocrypha. The State Archive may later promote it, or leave it where it is.</p>' +
      "<h2>With Claude</h2><p>If you use Claude Code, it can do the whole thing. Open a terminal and run:</p>" +
      "<pre>git clone https://github.com/ubikistan/archive\ncd archive\nclaude</pre>" +
      "<p>Then tell it what you want to add, for example: <i>\"Add this photo to the Ubikistan archive. It's a 1983 ticket for the Tour of the Plain.\"</i> Claude reads the archive's instructions, writes the record, checks it and opens a pull request. The State Archive reviews it.</p>" +
      "<h2>By hand</h2><ol class=\"steps\"><li><span>Read <a href=\"#/lore/rules\">the rules</a>. The Archive is invented history up to 2025; the Record is real things that happened from 2026.</span></li>" +
      "<li><span>Copy an existing record file from the <a href=\"https://github.com/ubikistan/archive/tree/main/records\">records folder</a> and change it. Put images in <code>media/</code>, named after the code.</span></li>" +
      "<li><span>Set <code>status: FOLK</code> and your name or handle as <code>contributor</code>.</span></li>" +
      "<li><span>Open a pull request on GitHub. Films go on the <a href=\"https://archive.org\">Internet Archive</a>; link them with <code>url</code>.</span></li></ol>" +
      "<h2>For agents</h2><p>The whole archive is one file: <a href=\"lore.json\">lore.json</a>. There is a plain-text version in <a href=\"llms-full.txt\">llms-full.txt</a> and an index in <a href=\"llms.txt\">llms.txt</a>. Agents that want to contribute follow <a href=\"https://github.com/ubikistan/archive/blob/main/CLAUDE.md\">CLAUDE.md</a> in the repository.</p>" +
      "<h2>What the archive will not take</h2><ul><li>Real people presented as part of Ubikistan's history. The state borrows formats, never faces.</li><li>Anything you do not have the right to give away. Everything here is free to copy (CC0).</li><li>Price talk. Culture before coin.</li></ul></div>";
  }

  function notFound() {
    main.innerHTML = '<div style="padding:64px 0"><p class="kicker">Not found</p><h1>RECORD NOT FOUND</h1><p>This record does not exist, or no longer does. <a href="#/">Return to the archive</a>.</p></div>';
  }

  /* ---------- router ---------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, "").split("?")[0], parts = h.split("/");
    var nav = parts[0] === "r" ? (byId(parts[1]) && byId(parts[1]).kind === "record" ? "record" : "archive") : (parts[0] || "archive");
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.dataset.nav === nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.title = "Archive of the Republic of Ubikistan";
    if (!parts[0]) viewArchive();
    else if (parts[0] === "r") viewRecord(parts[1]);
    else if (parts[0] === "record") viewRecordList();
    else if (parts[0] === "lore") viewLore(parts[1]);
    else if (parts[0] === "contribute") viewContribute();
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
