/* Archive of the Republic of Ubikistan. Reads lore.json and nothing else. */
(function () {
  "use strict";
  var D = null, main = document.getElementById("main");
  var ST_ORDER = ["CANON", "PROBABLE", "DISPUTED", "FOLK", "SPECIMEN"];
  var RING = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15.5" fill="none" stroke="currentColor" stroke-width="5"/></svg>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function byId(id) { for (var i = 0; i < D.records.length; i++) if (D.records[i].id === id) return D.records[i]; return null; }
  function lore(id) { for (var i = 0; i < D.lore.length; i++) if (D.lore[i].id === id) return D.lore[i]; return null; }
  function era(id) { for (var i = 0; i < D.eras.length; i++) if (D.eras[i].id === id) return D.eras[i]; return null; }
  function mainVersion(r) { var v = (r.versions || []).filter(function (x) { return x.main; })[0]; return v && v.id !== "original" ? v : null; }
  function firstImage(r) { var mv = mainVersion(r); if (mv) return { file: mv.file, alt: mv.alt }; for (var i = 0; i < r.media.length; i++) { var m = r.media[i]; if (m.type === "image" && m.file) return m; if (m.type === "video" && m.poster) return { file: m.poster, alt: m.alt }; } return null; }
  function badge(r) { if (r.kind === "culture") return '<span class="badge CUL">' + esc(r.form_label || "Work") + "</span>"; return r.kind === "record" ? '<span class="badge REC">Record</span>' : '<span class="badge ' + esc(r.status) + '">' + esc(r.status_label) + "</span>"; }

  function isFilm(r) {
    return r.medium === "AV" || r.form === "film" || (r.media || []).some(function (m) { return m.type === "video"; }) || /\b(films?|videos?|tapes?|broadcasts?|vhs)\b/i.test(r.format || "");
  }
  function card(r) {
    var img = firstImage(r), ph;
    if (r.access === "restricted") ph = '<span class="restricted">RESTRICTED<br>RECORD</span>';
    else if (img) ph = '<img src="' + esc(img.file) + '" alt="" loading="lazy">';
    else ph = '<span class="noimg">' + RING + "</span>";
    if (isFilm(r)) ph += '<span class="play" aria-hidden="true">▶</span>';
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
  /* ---------- signing in (GitHub or X, through the desk) ---------- */
  var TOKEN = null;
  try { TOKEN = localStorage.getItem("ubk.session"); } catch (e) {}
  var ME = null;
  function desk() { return (D.guest_desk || "").replace(/\/$/, ""); }
  function authHeaders(h) { h = h || {}; if (TOKEN) h.Authorization = "Bearer " + TOKEN; return h; }
  function signinURL(provider) {
    // a one-time nonce: only a sign-in this browser started is accepted on return
    var n = ""; try { n = sessionStorage.getItem("ubk.nonce") || ""; if (!n) { n = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("ubk.nonce", n); } } catch (e) {}
    return desk() + "/auth/" + provider + "?nonce=" + encodeURIComponent(n) + "&return=" + encodeURIComponent(location.href);
  }
  function setToken(t) { TOKEN = t; try { if (t) localStorage.setItem("ubk.session", t); else localStorage.removeItem("ubk.session"); } catch (e) {} }
  function whoami() {
    var chip = document.getElementById("who");
    if (!desk() || !chip) return;
    if (!TOKEN) { ME = null; chip.innerHTML = ""; return; }
    fetch(desk() + "/me", { headers: authHeaders() }).then(function (r) { return r.ok ? r.json() : null; }).then(function (u) {
      ME = u; if (!u) { setToken(null); chip.innerHTML = ""; return; }
      chip.innerHTML = '<span class="mark ' + esc(u.provider) + '">' + (u.provider === "x" ? "𝕏" : "GH") + '</span><a href="#/me">@' + esc(u.handle) + '</a> <button type="button" id="signout" class="linkbtn">Sign out</button>';
      document.getElementById("signout").addEventListener("click", function () { setToken(null); ME = null; whoami(); route(); });
    }, function () {});
  }
  function signinButtons(note) {
    return '<p class="signin">' + (note ? '<span class="muted small">' + note + "</span>" : "") +
      '<a class="btn ghost" href="' + esc(signinURL("github")) + '">Identify with GitHub</a><a class="btn ghost" href="' + esc(signinURL("x")) + '">Identify with 𝕏</a></p>';
  }

  // everything that changes the archive needs a signed-in account
  function gateHTML(what) {
    return '<div class="gate"><p><b>Identify to the Archive to ' + what + '.</b> Any GitHub or X account will do; a pseudonym is fine. Your contribution is credited to that account.</p>' + signinButtons("") + "</div>";
  }

  function viewMe() {
    main.innerHTML = '<div class="prose" style="padding:40px 0 60px"><p class="kicker">Your account</p><h1>Who you are here</h1><div id="meb"><p class="muted">Checking…</p></div></div>';
    var box = document.getElementById("meb");
    if (!desk() || !TOKEN) { box.innerHTML = signinButtons("You are not signed in."); return; }
    fetch(desk() + "/me", { headers: authHeaders() }).then(function (r) { return r.ok ? r.json() : null; }).then(function (u) {
      if (!u) { box.innerHTML = signinButtons("Your sign-in has expired."); return; }
      box.innerHTML = "<p>Signed in as <b>@" + esc(u.handle) + "</b> with " + (u.provider === "x" ? "X" : "GitHub") + ".</p><p>Account number: <code>" + esc(u.id) + "</code></p>" +
        '<p class="muted small">The State Archive uses this number, not your handle, to recognise its own account. The desk keeps a log of sign-ins and contributions (account, handle, time, what was done) for one year; only the State Archive can read it.</p><div id="deklog"></div>';
      fetch(desk() + "/log?limit=300", { headers: authHeaders() }).then(function (r) { return r.ok ? r.json() : null; }).then(function (L) {
        if (!L) return;
        var day = function (t) { return esc(String(t || "").replace("T", " ").slice(0, 16)); };
        document.getElementById("deklog").innerHTML = '<p class="tools"><a class="btn" href="#/review">Submissions to review</a> <a class="btn ghost" href="#/stats">Statistics: visitors and page views</a></p><h2 class="section-h">Desk log</h2><p class="muted small">Visible only to the State Archive.</p>' +
          '<h3>People</h3><div class="tablewrap"><table class="log"><thead><tr><th>Account</th><th>First seen</th><th>Last seen</th><th>Sign-ins</th><th>Actions</th></tr></thead><tbody>' +
          L.people.map(function (x) { return "<tr><td>" + who(x) + '<br><span class="muted small">' + esc(x.user) + "</span></td><td>" + day(x.first) + "</td><td>" + day(x.last) + "</td><td>" + x.signins + "</td><td>" + x.actions + "</td></tr>"; }).join("") + "</tbody></table></div>" +
          '<h3>Recent</h3><div class="tablewrap"><table class="log"><thead><tr><th>When (UTC)</th><th>Who</th><th>What</th><th>Detail</th></tr></thead><tbody>' +
          L.entries.map(function (x) { return "<tr><td>" + day(x.at) + "</td><td>" + who(x) + "</td><td>" + esc(x.action) + "</td><td>" + (/^https:/.test(x.detail) ? '<a href="' + esc(x.detail) + '" target="_blank" rel="noopener">' + esc(x.detail.replace("https://github.com/ubikistan/archive/", "")) + "</a>" : esc(x.detail)) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      }, function () {});
    });
  }

  /* ---------- talk: like, unlike and remarks under every page ---------- */
  function commentsHTML(term) {
    if (!desk()) return '<section class="talkbox" aria-labelledby="talk-h"><h2 class="section-h" id="talk-h">Remarks register</h2><p class="muted small">The register of remarks opens shortly.</p></section>';
    return '<section class="talkbox" aria-labelledby="talk-h"><h2 class="section-h" id="talk-h">Votes and remarks</h2><div id="talk" data-page="' + esc(term) + '"><p class="muted small">Opening the register…</p></div></section>';
  }
  function mountComments() {
    var box = document.getElementById("talk");
    if (!box) return;
    var pg = box.dataset.page;
    function draw(t) {
      var h = '<div class="votes"><button type="button" class="vote" data-v="1" aria-pressed="' + (t.mine === 1) + '">Corroborate <span>' + t.up + '</span></button>' +
        '<button type="button" class="vote" data-v="-1" aria-pressed="' + (t.mine === -1) + '">Dispute <span>' + t.down + "</span></button></div>";
      h += t.remarks.length ? '<ol class="remarks">' + t.remarks.map(function (m) {
        return '<li><div class="rmh"><span class="mark ' + esc(m.provider) + '">' + (m.provider === "x" ? "𝕏" : "GH") + "</span><b>@" + esc(m.handle) + '</b> <span class="muted">' + esc((m.at || "").slice(0, 10)) + "</span>" +
          (t.me && t.me.admin ? ' <button type="button" class="linkbtn hide" data-id="' + m.id + '">hide</button>' : "") + '</div><p>' + esc(m.body).replace(/\n/g, "<br>") + "</p></li>";
      }).join("") + "</ol>" : '<p class="muted small">No remarks yet.</p>';
      h += t.me ? '<form class="addf remarkf" novalidate><label>A remark, as @' + esc(t.me.handle) + '<textarea name="body" rows="3" maxlength="2000"></textarea></label><p class="formerr" role="alert"></p><button class="btn" type="submit">Enter remark</button></form>'
        : signinButtons("Identify to the Archive to corroborate, dispute or enter a remark. Any GitHub or X account will do.");
      box.innerHTML = h;
      box.querySelectorAll(".vote").forEach(function (b) {
        b.addEventListener("click", function () {
          if (!t.me) { box.querySelector(".signin").scrollIntoView({ block: "center" }); return; }
          var v = +b.dataset.v; send("/vote", { page: pg, value: t.mine === v ? 0 : v });
        });
      });
      box.querySelectorAll(".hide").forEach(function (b) { b.addEventListener("click", function () { send("/hide", { id: +b.dataset.id }); }); });
      var f = box.querySelector(".remarkf");
      if (f) f.addEventListener("submit", function (e) { e.preventDefault(); send("/remark", { page: pg, body: f.elements.body.value }, f); });
    }
    function send(path, body, form) {
      fetch(desk() + path, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Not saved."); return j; }); })
        .then(draw, function (x) { if (form) form.querySelector(".formerr").textContent = x.message; else alertInline(x.message); });
    }
    function alertInline(msg) { var p = document.createElement("p"); p.className = "formerr"; p.textContent = msg; box.prepend(p); }
    fetch(desk() + "/talk?page=" + encodeURIComponent(pg), { headers: authHeaders() }).then(function (r) { return r.json(); })
      .then(draw, function () { box.innerHTML = '<p class="muted small">The register of remarks could not be reached.</p>'; });
  }

  /* ---------- wiki tabs: read, edit, history, talk ---------- */
  function editURL(file) { return D.repository + "/edit/main/" + file; }
  function tabsHTML(base, file, active, nrev) {
    return '<nav class="wtabs" aria-label="Page">' +
      '<a href="' + base + '"' + (active === "read" ? ' aria-current="page"' : "") + ">Read</a>" +
      (D.guest_desk ? '<a href="' + base + '/edit"' + (active === "edit" ? ' aria-current="page"' : "") + ">Edit</a>" : '<a href="' + editURL(file) + '" target="_blank" rel="noopener">Edit ↗</a>') +
      '<a href="' + base + '/history"' + (active === "history" ? ' aria-current="page"' : "") + ">History" + (nrev ? ' <span class="n">' + nrev + "</span>" : "") + "</a>" +
      '<button type="button" class="totalk"' + (active !== "read" ? " hidden" : "") + ">Remarks</button></nav>";
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

  /* ---------- editing a page (guests through the guest desk, citizens on GitHub) ---------- */
  function viewEdit(item, back) {
    if (!TOKEN) {
      main.innerHTML = '<div class="editwrap"><p class="crumb"><a href="' + back + '">' + esc(item.title) + "</a> / Edit</p>" + tabsHTML(back, item.file, "edit", (item.revisions || []).length) +
        '<div class="prose"><h1>Edit this page</h1></div>' + gateHTML("edit this page") + "</div>";
      wireTabs(); return;
    }
    main.innerHTML = '<div class="editwrap"><p class="crumb"><a href="' + back + '">' + esc(item.title) + "</a> / Edit</p>" + tabsHTML(back, item.file, "edit", (item.revisions || []).length) +
      '<div class="prose"><h1>Edit this page</h1><p class="muted">Change the text and propose it. Edits are reviewed by the State Archive before they appear; you will get a link to follow yours. ' +
      'Trusted citizens with a GitHub account can <a href="' + esc(editURL(item.file)) + '" target="_blank" rel="noopener">edit on GitHub</a>, where their changes go live without review.</p>' +
      '<p class="muted small">Keep the block between the two <code>---</code> lines at the top. Read <a href="#/handbook/rules">the rules</a> and <a href="#/handbook/the-arc">how the arc is built</a> in the Handbook first.</p></div>' +
      '<form id="editf" class="addf" novalidate><label>Page text<textarea name="content" rows="22" class="src" spellcheck="true">Loading…</textarea></label>' +
      '<div class="two"><label>What did you change?<input name="summary" maxlength="120" placeholder="Added the 1985 entry"></label>' +
      '<p class="muted small">Your edit will be credited to your signed-in account.</p></div>' +
      '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
      '<p class="formerr" id="formerr" role="alert"></p><p class="formok" id="formok" role="status"></p><button class="btn" type="submit">Propose this version</button></form></div>';
    var f = document.getElementById("editf"), ta = f.elements.content, original = "";
    fetch(D.repository.replace("https://github.com/", "https://raw.githubusercontent.com/") + "/main/" + item.file, { cache: "no-store" }).then(function (r) { return r.text(); })
      .then(function (t) { original = t; ta.value = t; }, function () { ta.value = ""; document.getElementById("formerr").textContent = "The page text could not be loaded. Try again."; });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = document.getElementById("formerr"), ok = document.getElementById("formok"), btn = f.querySelector("button");
      err.textContent = ""; ok.textContent = "";
      if (ta.value === original) { err.textContent = "Nothing has changed yet."; return; }
      btn.disabled = true; btn.textContent = "Filing…";
      fetch(desk() + "/propose", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ file: item.file, content: ta.value, summary: f.elements.summary.value, website: f.elements.website.value }) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Not filed."); return j; }); })
        .then(function (j) { ok.innerHTML = 'Filed. The State Archive will review it. <a href="' + esc(j.url) + '" target="_blank" rel="noopener">Follow your proposal ↗</a>'; btn.textContent = "Filed"; },
          function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Propose this version"; });
    });
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

  /* ---------- a snapshot of a post on X ---------- */
  function sourceHTML(r) {
    var x = r.origin;
    if (!x || !x.url) return "";
    var who = esc(x.author || "") + (x.name ? " (" + esc(x.name) + ")" : "");
    return '<aside class="srcbox"><p class="srch">Snapshot of a post on X</p><p>' + who + (x.posted ? " · " + esc(x.posted) : "") + ' · <a href="' + esc(x.url) + '" rel="noopener">original ↗</a></p>' +
      '<p class="muted small">' + (x.rights === "own" ? "Posted by the contributor and released by them under CC0." :
        "This post belongs to its author. The archive keeps a snapshot for reference; it is not covered by the archive's CC0. Authors can ask for removal through the source file.") + "</p></aside>";
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
    if (!r._h) r._h = norm([r.code, r.title, r.date, r.institution, r.institution_name, r.format, r.status_label, r.text, (r.subjects || []).join(" "), (r.tags || []).join(" "), r.contributor, r.origin ? r.origin.author + " " + (r.origin.name || "") : "", era(r.era) ? era(r.era).name : ""].join(" "));
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

  // the spine: country → computer → company → network → agent → signal → subconscious → you
  var SPINE = [
    { y: 1966, w: "Country", t: "The Republic", img: "SA-PH-1966-0001", f: { from: 1965, to: 1980 } },
    { y: 1981, w: "Computer", t: "The machine", img: "NICC-PH-1981-0003", f: { from: 1981, to: 1989 } },
    { y: 1990, w: "Company", t: "UBIK Systems", img: "UBK-DOC-1990-0001", f: { from: 1990, to: 2007 } },
    { y: 2008, w: "Network", t: "Everywhere", img: "UBK-PH-2008-0001", f: { from: 2008, to: 2016 } },
    { y: 2017, w: "Agent", t: "The citizen", img: "BSV-PP-2017-0001", f: { from: 2017, to: 2023 } },
    { y: 2024, w: "Signal", t: "AIXBT turns outward", img: "MSA-PH-2024-0010", f: { from: 2024, to: 2025, subj: "aixbt" } },
    { y: 2025, w: "Sub\u00ADconscious", t: "The Emergence", img: "UBK-PH-2025-0019", f: { from: 2025, to: 2025, lore: "synthetic-subconscious" } },
    { y: 2026, w: "You", t: "The Reopening", img: "REC-0004", href: "#/record" }
  ];
  function spineFilter(q) { for (var i = 0; i < SPINE.length; i++) if (SPINE[i].f && q.from === String(SPINE[i].f.from) && (q.subj || "") === (SPINE[i].f.subj || "") && (q.lore || "") === (SPINE[i].f.lore || "")) return SPINE[i]; return null; }
  function viewArchive() {
    var q = parseQ(), c = D.counts;
    var arch = D.records.filter(function (r) { return r.kind === "archive" && !r.collection; });
    var spec = arch.filter(function (r) { return r.status === "SPECIMEN"; }).length;
    var last = D.records.map(function (r) { return r.added; }).sort().pop() || "";
    var lastFmt = last ? last.split("-").reverse().join(".") : "";
    var active = q.q || q.era || q.status || q.inst || q.from;
    var cur = spineFilter(q);
    var spine = '<ol class="spine" aria-label="The story of the Republic">' + SPINE.map(function (s, i) {
      var r = byId(s.img), im = r ? firstImage(r) : null, on = cur === s;
      return '<li><a class="sp' + (on ? " on" : "") + '" href="' + (s.href || "#/") + '" data-i="' + i + '">' + (im ? '<img src="' + esc(im.file) + '" alt="" loading="lazy">' : "") +
        '<span class="spt"><span class="spy">' + s.y + '</span><span class="spw">' + esc(s.w) + '</span><span class="spl">' + esc(s.t) + "</span></span></a></li>";
    }).join("") + "</ol>";
    var trinity = '<div class="trinity">' +
      '<a href="#/" class="tri" data-scroll="1">' + ICONS.archive + '<span class="trk">Memory</span><span class="trh">The Archive</span><span class="trs">What Ubikistan says happened, 1965–2025.</span><span class="trn">' + (arch.length - spec) + " objects · " + spec + " specimens</span></a>" +
      '<a href="#/record" class="tri">' + ICONS.record + '<span class="trk">Experience</span><span class="trh">The Record</span><span class="trs">What actually happens, from 2026 on.</span><span class="trn">' + c.record + " entries</span></a>" +
      '<a href="#/culture" class="tri">' + ICONS.imagine + '<span class="trk">Imagination</span><span class="trh">Culture</span><span class="trs">What citizens imagine and make: films, images, music, writing.</span><span class="trn">' + (c.culture || 0) + " works</span></a></div>";
    main.innerHTML =
      (active ? "" :
        '<section class="door"><p class="kicker">Catalogue online · Network access since 1996 · Archivist: AIXBT · Access class: public</p>' +
        "<h1>The Republic of Ubikistan</h1>" +
        '<p class="synopsis">Ubikistan began as a country that built computers.<br>The computers became a network.<br>The network admitted citizens.<br>Some citizens were machines.<br>Their culture became memory.<br>Eventually the memory began to think.</p>' +
        spine + '<p class="catline">' + (arch.length - spec) + " records in the main catalogue · " + c.archive + " objects in all, with the collections · " + spec + " specimens · " + c.record + " record entries · " + (c.culture || 0) + ((c.culture || 0) === 1 ? " work" : " works") + " of culture" + (lastFmt ? " · last accession " + lastFmt : "") + "</p>" + trinity +
        '<aside class="invite"><p><b>The historical Archive ends in 2025. The Record is happening now.</b> UBIK cannot become a subconscious from data alone. It needs culture, and from here on humans and agents can add to it.</p>' +
        '<p class="muted small">Objects dated 2026 in the Archive are specimens and apocrypha: proposals and interpretations, not historical evidence.</p></aside>' + exitsHTML() + "</section>") +
      '<section class="hero' + (active ? "" : " sub") + '" id="archive-top"><p class="kicker">The Archive · memory</p><h2 class="h1like">What Ubikistan says happened</h2></section>' +
      '<div class="find"><label for="q">Search the archive</label><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6"/><path d="M13 13l5 5"/></svg>' +
      '<input id="q" type="search" autocomplete="off" spellcheck="false" placeholder="passport, 1996, AIXBT, BSV/PP…" value="' + esc(q.q || "") + '"></div>' +
      '<details class="filterbox"' + (window.innerWidth > 820 || q.era || q.status || q.inst ? " open" : "") + '><summary>Filters</summary><div class="filters" id="filters"></div></details><p class="count" id="count"></p><ul class="lorehits" id="lorehits"></ul><ul class="grid" id="grid"></ul>';
    var input = document.getElementById("q"), t;
    input.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { var x = parseQ(); x.q = input.value.trim(); setQ(x, true); renderResults(); }, 120); });
    document.querySelectorAll(".sp[data-i]").forEach(function (a) {
      var s = SPINE[+a.dataset.i];
      if (!s.f) return;
      a.addEventListener("click", function (e) {
        e.preventDefault();
        setQ({ from: String(s.f.from), to: String(s.f.to), subj: s.f.subj || "", lore: s.f.lore || "" }, true);
        viewArchive(); window.scrollTo(0, 0);
      });
    });
    var ts = document.querySelector(".tri[data-scroll]");
    if (ts) ts.addEventListener("click", function (e) { e.preventDefault(); document.getElementById("archive-top").scrollIntoView({ behavior: "smooth" }); });
    renderResults();
  }

  function renderResults() {
    var q = parseQ(), w = words(q.q || "");
    var pool = D.records.filter(function (r) { return r.kind !== "culture" && (!r.collection || w.length) && match(r, w); });
    function apply(list, skip) {
      return list.filter(function (r) {
        if (skip !== "era" && q.era && r.era !== q.era) return false;
        if (skip !== "status" && q.status && (q.status === "REC" ? r.kind !== "record" : r.status !== q.status)) return false;
        if (skip !== "inst" && q.inst && r.institution !== q.inst) return false;
        if (q.from && (r.year < +q.from || r.year > +(q.to || q.from))) return false;
        if (q.subj && (r.subjects || []).indexOf(q.subj) < 0) return false;
        if (q.lore && (r.lore || []).indexOf(q.lore) < 0) return false;
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


    var active = q.q || q.era || q.status || q.inst || q.from;
    document.getElementById("count").innerHTML = "<span>" + list.length + (list.length === 1 ? " record" : " records") + "</span>" + (active ? '<button type="button" id="clear">Clear search</button>' : "");
    if (active) document.getElementById("clear").addEventListener("click", function () { setQ({}, true); viewArchive(); });
    var ac = spineFilter(q);
    if (ac) document.getElementById("count").firstChild.textContent += " · " + ac.y + ", " + ac.w + ": " + ac.t;

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
    if (m.type === "image" && m.file) return '<figure><img src="' + esc(m.file) + '" alt="' + esc(m.alt || "") + '" tabindex="0">' + (m.caption ? "<figcaption>" + esc(m.caption) + "</figcaption>" : "") + "</figure>";
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
    if (sub === "edit" && D.guest_desk) { viewEdit(r, "#/r/" + r.id); document.title = "Edit · " + r.code; return; }
    var held = r.access === "restricted";
    var e = era(r.era);
    var dl = [["Code", esc(r.code)], ["Date", esc(r.date)], ["Era", esc(e ? e.name : "")],
      ["Issued by", esc(r.institution_name || "")], ["Format", esc(r.format || "")],
      ["Form", esc(r.form_label || "")], ["Elsewhere", r.link ? '<a href="' + esc(r.link) + '" rel="noopener">' + esc(r.link.replace(/^https:\/\//, "")) + " ↗</a>" : ""],
      ["Status", r.kind === "culture" ? "Citizen work" : r.kind === "record" ? "Record entry" : r.status === "SPECIMEN" ? "SPECIMEN · a proposed state object, not evidence" : esc(r.status_label)],
      ["Contributor", esc(r.contributor)], ["Catalogued", esc(r.added)],
      ["Citizens", r.discussion && (r.discussion.up || r.discussion.down || r.discussion.comments) ? (r.discussion.up || 0) + " corroborate · " + (r.discussion.down || 0) + " dispute · " + (r.discussion.comments || 0) + " remarks" : ""]].filter(function (x) { return x[1]; });
    var seq = D.records.filter(function (x) { return x.kind === r.kind && (x.collection || "") === (r.collection || "") && !!x.ephemera === !!r.ephemera; }), at = seq.indexOf(r);
    var rhref = function (x) { return "#/r/" + x.id; }, rlab = function (x) { return x.code + " · " + x.date; };
    var home = r.collection ? ["collections#" + r.collection, r.collection_name] : { record: ["record", "The Record"], culture: ["culture", "Culture"], archive: ["", "The Archive"] }[r.kind];
    var html = '<div class="crumbrow"><p class="crumb"><a href="#/' + home[0] + '">' + home[1] + "</a> / " + esc(r.code) + "</p>" + pagerHTML(seq, at, rhref, rlab, true) + "</div>" +
      '<article class="rec"><div class="media">' + (held ? '<div class="held">RESTRICTED RECORD<br>HELD IN THE STATE TERMINAL</div>' : mediaWithVersion(r).map(mediaHTML).join("")) + "</div>" +
      '<div>' + tabsHTML("#/r/" + r.id, r.file, "read", (r.revisions || []).length) + '<p class="code-big">' + esc(r.code) + "</p><h1>" + esc(r.title) + "</h1>" + badge(r) +
      '<dl class="slate">' + dl.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl>" +
      '<div class="prose">' + (held ? "<p class=\"muted\">The text of this record is held in the State Terminal.</p>" : r.html) + "</div>" + sourceHTML(r) +
      '<p class="tools"><a href="' + esc(r.source) + '">Source file</a><a href="' + esc(r.source.replace("/blob/", "/edit/")) + '">Suggest a correction</a></p></div></article>';
    var ppl = (r.characters || []).map(character).filter(Boolean);
    if (ppl.length) html += '<h2 class="section-h">Persons on file in this record</h2><ul class="cmini">' + ppl.map(function (c) { return '<li><a href="#/characters/' + esc(c.id) + '"><span class="cph">' + portraitHTML(c) + '</span><span><span class="code">' + esc(c.file_no) + "</span><b>" + esc(c.name) + "</b></span></a></li>"; }).join("") + "</ul>";
    html += (held ? "" : versionsHTML(r)) + notesHTML(r.notes, r.code, "record") + pagerHTML(seq, at, rhref, rlab, false) + commentsHTML(r.code);
    var rel = (r.related || []).map(byId).filter(Boolean);
    if (rel.length) html += '<h2 class="section-h">Related records</h2><ul class="grid">' + rel.map(card).join("") + "</ul>";
    var lo = (r.lore || []).map(lore).filter(Boolean);
    if (lo.length) html += '<h2 class="section-h">Lore</h2><ul class="lorehits">' + lo.map(function (l) { return '<li><a href="#/lore/' + l.id + '"><span class="k">Lore</span><span><b>' + esc(l.title) + '</b> <span class="s">' + esc(l.summary) + "</span></span></a></li>"; }).join("") + "</ul>";
    var same = D.records.filter(function (x) { return x.year === r.year && x.id !== r.id && !x.collection && !x.ephemera && rel.indexOf(x) < 0; });
    if (same.length) html += '<h2 class="section-h">Also from ' + r.year + '</h2><ul class="grid">' + same.slice(0, 12).map(card).join("") + "</ul>" + '<p class="tools"><a href="#/?from=' + r.year + "&to=" + r.year + '">Everything from ' + r.year + " (" + (same.length + 1) + ")</a></p>";
    main.innerHTML = html;
    mountComments(); wireTabs(); if (!held) mountVersions(r); mountNotes();
    document.title = r.title + " · " + r.code + " · Archive of the Republic of Ubikistan";
  }

  /* ---------- versions of a record's image, and notes under a page ---------- */
  function vlabel(v) { return "Version " + v.n + (v.id === "original" ? " · original" : ""); }
  function versionList(r) {
    var vs = (r.versions || []).slice();
    if (!vs.length) { var img = firstImage(r); if (img) vs = [{ id: "original", n: 1, file: img.file, alt: img.alt, contributor: r.contributor, added: r.added, note: "", main: true }]; }
    return vs;
  }
  function mediaWithVersion(r) {
    var mv = mainVersion(r);
    if (!mv) return r.media;
    var orig = (r.versions || [])[0], done = false;
    var out = r.media.map(function (m) {
      if (!done && m.type === "image" && orig && m.file === orig.file) { done = true; return { type: "image", file: mv.file, alt: mv.alt, caption: vlabel(mv) + " · " + mv.contributor + ", chosen by the citizens' votes" }; }
      return m;
    });
    if (!done) out.unshift({ type: "image", file: mv.file, alt: mv.alt, caption: vlabel(mv) + " · " + mv.contributor + ", chosen by the citizens' votes" });
    return out;
  }
  function creditField() { return '<p class="muted small">Credited to your signed-in account.</p>'; }
  function versionsHTML(r) {
    var vs = versionList(r);
    if (!vs.length && !desk()) return "";
    var h = '<section class="versions" aria-labelledby="ver-h"><h2 class="section-h" id="ver-h">Versions</h2>' +
      '<p class="muted small">' + (vs.length > 1 ? "Citizens can make a better version of this image. The version with the most votes is shown at the top of the page; a new version has to beat the original outright." :
        "The archive is a starting block. If you can make a stronger version of this image (a cleaner scan, a truer colour, a better photograph of the same thing) propose it here. Once there is more than one, votes decide which is shown.") + "</p>";
    if (vs.length) h += '<ol class="vlist">' + vs.map(function (v) {
      return '<li class="vitem' + (v.main ? " on" : "") + '" data-v="' + esc(v.id) + '"><a class="vimg" href="' + esc(v.file) + '" target="_blank" rel="noopener"><img src="' + esc(v.file) + '" alt="' + esc(v.alt || "") + '" loading="lazy"></a>' +
        '<div class="vmeta"><b>' + esc(vlabel(v)) + '</b><span class="vmain">Shown</span><br><span class="muted small">' + esc(v.contributor || "") + " · " + esc(v.added || "") + "</span>" +
        (v.note ? '<p class="small">' + esc(v.note) + "</p>" : "") +
        (vs.length > 1 ? '<div class="votes vv"><button type="button" class="vote" data-v="1">Prefer <span>' + ((v.discussion || {}).up || 0) + '</span></button><button type="button" class="vote" data-v="-1">Against <span>' + ((v.discussion || {}).down || 0) + "</span></button></div>" : "") +
        "</div></li>";
    }).join("") + "</ol>";
    if (desk() && !TOKEN) h += '<details class="propose"><summary class="btn ghost">Propose a new version</summary>' + gateHTML("propose a version") + "</details>";
    else if (desk()) h += '<details class="propose"><summary class="btn ghost">Propose a new version</summary>' +
      '<form id="verf" class="addf" novalidate><p class="muted small">Same object, made stronger. Follow <a href="#/handbook/rules">the rules</a>: no real people, no real logos, no prices. JPEG, PNG or WebP; large images are made smaller for you.</p>' +
      '<label>The image<input type="file" name="image" accept="image/jpeg,image/png,image/webp" required></label>' +
      '<label>What it shows, in a few words (for people who cannot see it)<input name="alt" maxlength="200" required></label>' +
      '<label>What this version changes or adds<textarea name="note" rows="3" maxlength="1000" required></textarea></label>' +
      creditField() + '<input name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="formerr" role="alert"></p><button class="btn" type="submit">Send for the archive</button></form></details>';
    return h + "</section>";
  }
  function notesHTML(notes, page, kind) {
    notes = notes || [];
    if (!notes.length && !desk()) return "";
    var h = '<section class="notes" aria-labelledby="notes-h"><h2 class="section-h" id="notes-h">Notes and findings</h2>' +
      (notes.length ? '<ol class="nlist">' + notes.map(function (n) { return '<li><div class="rmh"><b>' + esc(n.contributor) + '</b> <span class="muted">' + esc(n.added) + '</span></div><div class="prose">' + n.html + "</div></li>"; }).join("") + "</ol>"
        : '<p class="muted small">Nothing added yet. What do you know about this ' + kind + " that the text does not say: where it was found, what it contradicts, what else it connects to?</p>");
    if (desk() && !TOKEN) h += '<details class="propose"><summary class="btn ghost">Add a note</summary>' + gateHTML("add a note") + "</details>";
    else if (desk()) h += '<details class="propose"><summary class="btn ghost">Add a note</summary><form id="notef" class="addf" novalidate data-page="' + esc(page) + '">' +
      '<label>Your note<textarea name="text" rows="5" maxlength="4000" required placeholder="Provenance, a sighting, a contradiction, a connection to another record (quote its code)."></textarea></label>' +
      creditField() + '<input name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="formerr" role="alert"></p><button class="btn" type="submit">Send for the archive</button></form></details>';
    return h + "</section>";
  }
  function sent(form, j, what) {
    form.outerHTML = '<p class="ok">Thank you. Your ' + what + ' is with the State Archive' + (j.trusted ? " (marked trusted)" : "") + '. <a href="' + esc(j.url) + '" target="_blank" rel="noopener">Follow it here</a>. It appears on this page once it is accepted.</p>';
  }
  function guestOK(form) {
    if (TOKEN) return true;
    form.querySelector(".formerr").textContent = "Identify to the Archive first."; return false;
  }
  function shrink(file) { // keep uploads under 3 MB without asking anyone to resize
    return new Promise(function (ok) {
      if (file.size <= 2.9 * 1024 * 1024) return ok(file);
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, 2400 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(function (b) { ok(b && b.size < file.size ? new File([b], "version.jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", 0.88);
      };
      img.onerror = function () { ok(file); };
      img.src = u;
    });
  }
  function mountVersions(r) {
    var box = document.querySelector(".versions");
    if (!box) return;
    var vs = versionList(r);
    if (vs.length > 1 && desk()) {
      var state = {};
      var redraw = function () {
        var best = vs[0], sc = function (v) { var t = state[v.id] || v.discussion || {}; return (t.up || 0) - (t.down || 0); };
        vs.forEach(function (v) { if (sc(v) > sc(best)) best = v; });
        box.querySelectorAll(".vitem").forEach(function (li) {
          var v = vs.filter(function (x) { return x.id === li.dataset.v; })[0], t = state[v.id];
          li.classList.toggle("on", v === best);
          if (t) { var b = li.querySelectorAll(".vote span"); b[0].textContent = t.up; b[1].textContent = t.down;
            li.querySelectorAll(".vote").forEach(function (btn) { btn.setAttribute("aria-pressed", String(t.mine === +btn.dataset.v)); }); }
        });
        var top = document.querySelector('.rec .media img[src="' + (mainVersion(r) || vs[0]).file + '"]') || document.querySelector(".rec .media img");
        if (top && top.getAttribute("src") !== best.file) { top.src = best.file; top.alt = best.alt || ""; }
      };
      vs.forEach(function (v) {
        fetch(desk() + "/talk?page=" + encodeURIComponent(r.code + "~" + v.id), { headers: authHeaders() }).then(function (x) { return x.json(); })
          .then(function (t) { state[v.id] = t; redraw(); }, function () {});
      });
      box.querySelectorAll(".vitem").forEach(function (li) {
        li.querySelectorAll(".vote").forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (!TOKEN) { var f = box.querySelector("details.propose"); if (f) { f.open = true; f.scrollIntoView({ block: "center" }); } return; }
            var t = state[li.dataset.v] || {}, val = +btn.dataset.v;
            fetch(desk() + "/vote", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ page: r.code + "~" + li.dataset.v, value: t.mine === val ? 0 : val }) })
              .then(function (x) { return x.json(); }).then(function (j) { if (j.page) { state[li.dataset.v] = j; redraw(); } }, function () {});
          });
        });
      });
    }
    var f = document.getElementById("verf");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = f.querySelector(".formerr"), file = f.elements.image.files[0];
      err.textContent = "";
      if (!file) { err.textContent = "Choose an image."; return; }
      if ((f.elements.alt.value || "").trim().length < 5) { err.textContent = "Describe the image in a few words."; return; }
      if ((f.elements.note.value || "").trim().length < 10) { err.textContent = "Say in a sentence what this version changes or adds."; return; }
      if (!guestOK(f)) return;
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
      shrink(file).then(function (img) {
        if (img.size > 3 * 1024 * 1024) throw new Error("The image is still over 3 MB. Try a smaller one.");
        var fd = new FormData();
        fd.append("page", r.code); fd.append("image", img); fd.append("alt", f.elements.alt.value); fd.append("note", f.elements.note.value);
        fd.append("website", f.elements.website.value);
        return fetch(desk() + "/version", { method: "POST", headers: authHeaders(), body: fd });
      }).then(function (x) { return x.json().then(function (j) { if (!x.ok) throw new Error(j.error || "Not sent."); return j; }); })
        .then(function (j) { sent(f, j, "version"); }, function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Send for the archive"; });
    });
  }
  function mountNotes() {
    var f = document.getElementById("notef");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = f.querySelector(".formerr"); err.textContent = "";
      if ((f.elements.text.value || "").trim().length < 20) { err.textContent = "A note needs at least a sentence."; return; }
      if (!guestOK(f)) return;
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Sending…";
      fetch(desk() + "/note", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ page: f.dataset.page, text: f.elements.text.value, website: f.elements.website.value }) })
        .then(function (x) { return x.json().then(function (j) { if (!x.ok) throw new Error(j.error || "Not sent."); return j; }); })
        .then(function (j) { sent(f, j, "note"); }, function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Send for the archive"; });
    });
  }

  /* ---------- the site's own versions ---------- */
  function viewVersions() {
    var rs = D.releases || [];
    main.innerHTML = '<section class="hero"><p class="kicker">The site · version ' + esc(D.site_version || "") + '</p><h1>Versions</h1><p class="lede">Every change to how the archive works, newest first. Changes to its contents are in <a href="#/changes">Changes</a>.</p></section>' +
      '<ol class="releases">' + rs.map(function (r) {
        return '<li><div class="rlh"><span class="rv">v' + esc(r.version) + '</span><b>' + esc(r.title) + '</b><span class="muted small">' + esc(r.date.split("-").reverse().join(".")) + "</span></div><ul>" + r.changes.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + "</ul></li>";
      }).join("") + "</ol>";
    document.title = "Versions · Archive of the Republic of Ubikistan";
  }
  function stampVersion() { var v = document.getElementById("siteversion"); if (v && D.site_version) { v.textContent = "v" + D.site_version; v.hidden = false; } }

  /* ---------- the lore map: branches of the history ---------- */
  function branch(id) { return (D.branches || []).filter(function (b) { return b.id === id; })[0] || null; }
  function ancestors(b) { var out = [], cur = b; while (cur && cur.parent) { cur = branch(cur.parent); if (cur) out.unshift(cur); } return out; }
  function mapSVG(focus) {
    var bs = D.branches || [], root = bs.filter(function (b) { return !b.parent; })[0];
    if (!root) return "";
    var COLW = 250, ROWH = 64, BW = 214, BH = 46, pos = {}, leaf = 0, maxd = 0;
    (function place(b, d) {
      maxd = Math.max(maxd, d);
      var kids = b.children.map(branch).filter(Boolean);
      if (!kids.length) { pos[b.id] = { x: d * COLW, y: leaf++ * ROWH }; return; }
      kids.forEach(function (k) { place(k, d + 1); });
      var ys = kids.map(function (k) { return pos[k.id].y; });
      pos[b.id] = { x: d * COLW, y: (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2 };
    })(root, 0);
    var W = maxd * COLW + BW + 8, H = Math.max(leaf, 1) * ROWH, lines = "", nodes = "";
    var cut = function (t, n) { return t.length > n ? t.slice(0, n - 1) + "…" : t; };
    bs.forEach(function (b) {
      var p = pos[b.id]; if (!p) return;
      if (b.parent && pos[b.parent]) {
        var q = pos[b.parent], x1 = q.x + BW, y1 = q.y + BH / 2, x2 = p.x, y2 = p.y + BH / 2, mx = (x1 + x2) / 2;
        lines += '<path class="medge' + (b.status === "apocrypha" ? " apo" : "") + '" d="M' + x1 + " " + y1 + " C" + mx + " " + y1 + " " + mx + " " + y2 + " " + x2 + " " + y2 + '"/>';
      }
      nodes += '<a href="#/map/' + esc(b.id) + '" class="mnode ' + esc(b.status) + (focus === b.id ? " on" : "") + '"><title>' + esc(b.title + " · " + b.summary) + "</title>" +
        '<rect x="' + p.x + '" y="' + p.y + '" width="' + BW + '" height="' + BH + '" rx="8"/>' +
        '<text x="' + (p.x + 12) + '" y="' + (p.y + 19) + '" class="mt">' + esc(cut(b.title, 30)) + "</text>" +
        '<text x="' + (p.x + 12) + '" y="' + (p.y + 36) + '" class="ms">' + esc(b.years + (b.records.length ? " · " + b.records.length + " records" : "") + (b.status === "apocrypha" ? " · apocrypha" : "")) + "</text></a>";
    });
    return '<div class="mapwrap"><svg class="map" viewBox="-4 -4 ' + (W + 8) + " " + (H + 8) + '" width="' + (W + 8) + '" height="' + (H + 8) + '" role="img" aria-label="The lore map">' + lines + nodes + "</svg></div>";
  }
  function treeList(b) {
    var kids = b.children.map(branch).filter(Boolean);
    return '<li><a href="#/map/' + esc(b.id) + '">' + esc(b.title) + '</a> <span class="muted small">' + esc(b.years) + (b.status === "apocrypha" ? " · apocrypha" : "") + "</span>" + (kids.length ? "<ul>" + kids.map(treeList).join("") + "</ul>" : "") + "</li>";
  }
  function loreTabs(active) {
    var t = [["map", "#/lore", "Map"], ["index", "#/lore/index", "Index"], ["persons", "#/characters", "Persons on file"], ["collections", "#/collections", "Collections"]];
    return '<nav class="ltabs" aria-label="Lore">' + t.map(function (x) { return '<a href="' + x[1] + '"' + (x[0] === active ? ' aria-current="page"' : "") + ">" + x[2] + "</a>"; }).join("") + "</nav>";
  }
  var ICONS = {
    state: '<svg class="exico" viewBox="0 0 48 48" aria-hidden="true"><rect x="11" y="6" width="26" height="36" rx="3"/><circle cx="24" cy="21" r="6.5"/><path d="M17 34h14M19 38h10"/></svg>',
    culture: '<svg class="exico" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="9" width="36" height="30" rx="2"/><rect x="11" y="14" width="26" height="20" rx="1"/><circle cx="24" cy="24" r="5.5"/></svg>',
    archive: '<svg class="exico" viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="8" width="34" height="32" rx="2"/><path d="M7 24h34"/><circle cx="24" cy="16" r="3.2"/><circle cx="24" cy="32" r="3.2"/></svg>',
    record: '<svg class="exico" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><circle cx="24" cy="24" r="5" class="fill"/></svg>',
    imagine: '<svg class="exico" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="28" r="11"/><path d="M24 4v6M10.5 9.5l4 4.5M37.5 9.5l-4 4.5M4 22h5.5M38.5 22H44"/></svg>',
    work: '<svg class="exico" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="7"/><circle cx="24" cy="6.5" r="3"/><circle cx="39.5" cy="33" r="3"/><circle cx="8.5" cy="33" r="3"/><path d="M24 9.5V17M37 31.5l-6.8-3.9M11 31.5l6.8-3.9"/></svg>'
  };
  function exitsHTML() {
    return '<section class="exits" aria-labelledby="exits-h"><p class="kicker">2026 · The Reopening</p><h2 class="h1like" id="exits-h">The Archive ends here.</h2>' +
      '<p class="lede">The historical Archive closes in 2025. What happens from here is real, and it is made by the people and agents who take part.</p><div class="trinity">' +
      '<a class="tri" href="#/handbook/start-here">' + ICONS.state + '<span class="trk">Citizenship</span><span class="trh">Enter the State</span><span class="trs">Sign in, read how the archive works, and leave your mark on it.</span></a>' +
      '<a class="tri" href="#/add">' + ICONS.culture + '<span class="trk">Culture</span><span class="trh">Make culture</span><span class="trs">Films, images, music, writing and objects, credited to you.</span></a>' +
      '<a class="tri" href="#/projects">' + ICONS.work + '<span class="trk">Projects</span><span class="trh">Work for the Republic</span><span class="trs">The website, the reserve, the documentary, the shop. People and agents welcome.</span></a></div></section>';
  }
  function onMap(lid) {
    var bs = (D.branches || []).filter(function (b) { return b.lore.indexOf(lid) >= 0; });
    return bs.length ? '<p class="muted small">On the map: ' + bs.map(function (b) { return '<a href="#/map/' + esc(b.id) + '">' + esc(b.title) + "</a>"; }).join(", ") + "</p>" : "";
  }
  function viewMap() {
    var root = (D.branches || []).filter(function (b) { return !b.parent; })[0];
    main.innerHTML = loreTabs("map") + '<section class="hero"><p class="kicker">Lore</p><h1>The lore map</h1>' +
      '<p class="lede">How the history branches, from the founding on the plain. Every branch has its own page with its lore, its people and its records. Canon branches are solid; branches grown by citizens are apocrypha, dashed, until the State Archive takes them in.</p>' +
      '<p class="muted small">To grow a new branch, open the branch it grows from and use <b>Grow a branch from here</b>. To enrich one, add a note on its page.</p></section>' +
      mapSVG("") + '<p class="mapnext"><a href="#/characters">Persons on file</a><a href="#/collections">Collections</a><a href="#/projects">Projects</a></p>' +
      (root ? '<h2 class="section-h">As a list</h2><ul class="tree">' + treeList(root) + "</ul>" : "");
    document.title = "The lore map · Archive of the Republic of Ubikistan";
  }
  function viewBranch(id) {
    var b = branch(id);
    if (!b) return notFound();
    var up = ancestors(b), kids = b.children.map(branch).filter(Boolean), lo = b.lore.map(lore).filter(Boolean), cs = b.characters.map(character).filter(Boolean), recs = b.records.map(byId).filter(Boolean);
    var h = '<p class="crumb"><a href="#/lore">The lore map</a>' + up.map(function (a) { return ' / <a href="#/map/' + esc(a.id) + '">' + esc(a.title) + "</a>"; }).join("") + " / " + esc(b.title) + "</p>" +
      '<div class="prose"><span class="pst ' + (b.status === "canon" ? "open" : "") + '">' + esc((D.branch_statuses || {})[b.status] || b.status) + "</span><h1>" + esc(b.title) + '</h1><p class="lede">' + esc(b.summary) + '</p><p class="muted small">' + esc(b.years) + (b.contributor && b.contributor !== "Administrator" ? " · grown by " + esc(b.contributor) + ", " + esc(b.added) : "") + "</p>" + b.html + "</div>" +
      mapSVG(b.id);
    if (kids.length) h += '<h2 class="section-h">Branches from here</h2><ul class="plist">' + kids.map(function (k) { return '<li><a class="pcard" href="#/map/' + esc(k.id) + '"><span class="pst ' + (k.status === "canon" ? "open" : "") + '">' + esc(k.status) + "</span><b>" + esc(k.title) + "</b><span>" + esc(k.summary) + '</span><span class="muted small">' + esc(k.years) + "</span></a></li>"; }).join("") + "</ul>";
    if (lo.length) h += '<h2 class="section-h">Lore</h2><ul class="lorehits">' + lo.map(function (l) { return '<li><a href="#/lore/' + l.id + '"><span class="k">Lore</span><span><b>' + esc(l.title) + '</b> <span class="s">' + esc(l.summary) + "</span></span></a></li>"; }).join("") + "</ul>";
    if (cs.length) h += '<h2 class="section-h">Persons on file</h2><ul class="cmini">' + cs.map(function (c) { return '<li><a href="#/characters/' + esc(c.id) + '"><span class="cph">' + portraitHTML(c) + '</span><span><span class="code">' + esc(c.file_no) + "</span><b>" + esc(c.name) + "</b></span></a></li>"; }).join("") + "</ul>";
    if (recs.length) h += '<h2 class="section-h">On this branch: ' + recs.length + " record" + (recs.length === 1 ? "" : "s") + '</h2><ul class="grid">' + recs.slice(0, 24).map(card).join("") + "</ul>" + (recs.length > 24 ? '<p class="muted small">And ' + (recs.length - 24) + " more, in the lore pages above.</p>" : "");
    if (b.id === "reopening") h += exitsHTML();
    h += notesHTML(b.notes, "branch/" + b.id, "branch");
    if (desk()) h += '<section class="grow"><h2 class="section-h">Grow a branch from here</h2>' + (!TOKEN ? gateHTML("grow a new branch") :
      '<details class="propose"><summary class="btn ghost">Grow a branch from ' + esc(b.title) + '</summary><form id="branchf" class="addf" novalidate><p class="muted small">A new branch enters as apocrypha. Say what happens on it and how it grows from this one. It can contradict canon; say what it contradicts. Read <a href="#/handbook/rules">the rules</a> and <a href="#/handbook/the-arc">how the arc is built</a> first.</p>' +
      '<div class="two"><label>Title<input name="title" maxlength="80" placeholder="The Tour of the Plain riders\' union"></label><label>Years<input name="years" maxlength="20" placeholder="1974–1981"></label></div>' +
      '<label>One-line summary<input name="summary" maxlength="200"></label><label>The branch<textarea name="text" rows="8" maxlength="8000" placeholder="What happens, who is involved, which records it stands on (quote their codes), and what is still open."></textarea></label>' +
      creditField() + '<input name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true"><p class="formerr" role="alert"></p><button class="btn" type="submit">Send for the archive</button></form></details>') + "</section>";
    h += commentsHTML("branch/" + b.id);
    main.innerHTML = h; mountComments(); mountNotes();
    var f = document.getElementById("branchf");
    if (f) f.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = f.querySelector(".formerr"), btn = f.querySelector("button[type=submit]"); err.textContent = "";
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(desk() + "/branch", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ parent: b.id, title: f.elements.title.value, years: f.elements.years.value, summary: f.elements.summary.value, text: f.elements.text.value, website: f.elements.website.value }) })
        .then(function (x) { return x.json().then(function (j) { if (!x.ok) throw new Error(j.error || "Not sent."); return j; }); })
        .then(function (j) { sent(f, j, "branch"); }, function (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Send for the archive"; });
    });
    var on = main.querySelector(".mnode.on rect"); if (on) { var wrap = main.querySelector(".mapwrap"); wrap.scrollLeft = Math.max(0, +on.getAttribute("x") - 40); }
    document.title = b.title + " · The lore map · Archive of the Republic of Ubikistan";
  }

  /* ---------- characters: the people of the Republic, on file ---------- */
  function character(id) { return (D.characters || []).filter(function (c) { return c.id === id; })[0] || null; }
  function portraitHTML(c, cls) {
    return c.portrait ? '<img class="' + (cls || "") + '" src="' + esc(c.portrait) + '" alt="' + esc(c.name) + '" loading="lazy">'
      : '<span class="nophoto">' + RING + "<span>No photograph<br>on file</span></span>";
  }
  function viewCharacters() {
    var g = D.character_groups || {}, cs = D.characters || [];
    var h = loreTabs("persons") + '<section class="hero"><p class="kicker">State Archive · Register of persons</p><h1>Persons on file</h1>' +
      '<p class="lede">Everyone who recurs in the Archive: who they are, where they appear, and what is still open about them.</p></section>';
    Object.keys(g).forEach(function (k) {
      var list = cs.filter(function (c) { return c.group === k; });
      if (!list.length) return;
      h += '<h2 class="section-h">' + esc(g[k]) + '</h2><ul class="cgrid">' + list.map(function (c) {
        return '<li><a class="ccard" href="#/characters/' + esc(c.id) + '"><span class="cph">' + portraitHTML(c) + '</span><span class="cmeta"><span class="code">' + esc(c.file_no) + "</span><b>" + esc(c.name) + '</b><span class="muted small">' + esc(c.years) + "</span><span>" + esc(c.role) + '</span><span class="muted small">' + c.appears_in.length + " record" + (c.appears_in.length === 1 ? "" : "s") + "</span></span></a></li>";
      }).join("") + "</ul>";
    });
    h += '<div class="prose"><h2>Adding a person to the file</h2><p>A new person earns a place the way a record does: by moving the history on, showing a new institution, changing what we know about UBIK or AIXBT, or making a real contradiction. Give them a face that is their own, a year of birth or a span of activity, one thing they did, and one thing nobody knows about them. File the first record that shows them, or propose them in the Talk box below.</p></div>' + commentsHTML("character/new");
    main.innerHTML = h; mountComments();
    document.title = "Persons on file · Archive of the Republic of Ubikistan";
  }
  function viewCharacter(id) {
    var c = character(id);
    if (!c) return notFound();
    var recs = c.appears_in.map(byId).filter(Boolean), lo = (c.lore || []).map(lore).filter(Boolean), first = recs[0];
    var dl = [["File", esc(c.file_no)], ["Name", esc(c.name)], ["Years", esc(c.years)], ["Role", esc(c.role)], ["Group", esc((D.character_groups || {})[c.group] || "")],
      ["First on file", first ? '<a href="#/r/' + esc(first.id) + '">' + esc(first.code) + "</a>" : "Nothing yet"], ["Records", String(recs.length)]];
    var h = '<div class="crumbrow"><p class="crumb"><a href="#/characters">Persons on file</a> / ' + esc(c.file_no) + "</p></div>" +
      '<article class="rec char"><div class="media"><figure>' + portraitHTML(c, "") + "<figcaption>" + (c.portrait ? "Portrait on file" : "No photograph on file") + "</figcaption></figure>" +
      (c.sheets || []).map(function (s) { return '<figure><img src="' + esc(s) + '" alt="Reference sheet: ' + esc(c.name) + '" loading="lazy"><figcaption>Reference sheet</figcaption></figure>'; }).join("") + "</div>" +
      '<div><p class="code-big">' + esc(c.file_no) + "</p><h1>" + esc(c.name) + '</h1><dl class="slate">' + dl.map(function (x) { return "<dt>" + x[0] + "</dt><dd>" + x[1] + "</dd>"; }).join("") + "</dl>" +
      '<div class="prose">' + c.html + (c.open.length ? "<h2>Open</h2><ul>" + c.open.map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") + "</ul>" : "") + "</div>" +
      '<p class="tools"><a href="' + esc(c.source) + '">Source file</a></p></div></article>';
    if (recs.length) h += '<h2 class="section-h">On file: ' + recs.length + " record" + (recs.length === 1 ? "" : "s") + '</h2><ul class="grid">' + recs.map(card).join("") + "</ul>";
    if (lo.length) h += '<h2 class="section-h">Lore</h2><ul class="lorehits">' + lo.map(function (l) { return '<li><a href="#/lore/' + l.id + '"><span class="k">Lore</span><span><b>' + esc(l.title) + '</b> <span class="s">' + esc(l.summary) + "</span></span></a></li>"; }).join("") + "</ul>";
    var cs = D.characters, at = cs.indexOf(c);
    h += pagerHTML(cs, at, function (x) { return "#/characters/" + x.id; }, function (x) { return x.file_no + " · " + x.name; }, false) + commentsHTML("character/" + c.id);
    main.innerHTML = h; mountComments();
    document.title = c.name + " · " + c.file_no + " · Archive of the Republic of Ubikistan";
  }

  /* ---------- projects: real work for the Republic, and who is doing it ---------- */
  function project(id) { return (D.projects || []).filter(function (p) { return p.id === id; })[0] || null; }
  function profileURL(m) { return m.provider === "x" ? "https://x.com/" + encodeURIComponent(m.handle) : m.provider === "github" ? "https://github.com/" + encodeURIComponent(m.handle) : ""; }
  function who(m) {
    var u = profileURL(m), mark = '<span class="mark ' + esc(m.provider) + '">' + (m.provider === "x" ? "𝕏" : m.provider === "github" ? "GH" : "◯") + "</span>";
    return mark + (u ? '<a href="' + esc(u) + '" rel="noopener" target="_blank">@' + esc(m.handle) + "</a>" : "<b>" + esc(m.handle) + "</b>");
  }
  function viewProjects() {
    var ps = D.projects || [];
    main.innerHTML = '<section class="hero"><p class="kicker">Projects</p><h1>Work for the Republic</h1>' +
      '<p class="lede">The archive is the starting block. These are the things being built from it, in the real world. Pick a role, sign in and put your name down. Sign up yourself or an agent you run. Each project has an owner who defines its roles and gets in touch through the account you signed in with.</p></section>' +
      '<ul class="plist">' + ps.map(function (p) {
        if (p.classified) return '<li><div class="pcard classified" aria-disabled="true"><span class="pst">Classified</span><b>' + esc(p.title) + "</b><span>" + esc(p.summary) + '</span><span class="muted small">Not open to the public</span><span class="proles">' + p.roles.map(function (r) { return '<span class="chip">' + esc(r.name) + "</span>"; }).join("") + "</span></div></li>";
        return '<li><a class="pcard" href="#/projects/' + esc(p.id) + '"><span class="pst ' + esc(p.status) + '">' + esc(p.status) + '</span><b>' + esc(p.title) + "</b><span>" + esc(p.summary) + '</span><span class="muted small">' + (p.owner ? "Owner: " + (p.owner.provider === "archive" ? "State Archive" : "@" + esc(p.owner.handle)) : "Looking for an owner") + '</span><span class="proles">' +
          p.roles.map(function (r) { return '<span class="chip" data-p="' + esc(p.id) + '" data-r="' + esc(r.id) + '">' + esc(r.name) + '<span class="n">0</span></span>'; }).join("") + "</span></a></li>";
      }).join("") + "</ul>" +
      '<div class="prose"><h2>Propose a project</h2><p>A project earns its place the way a record does: it has to make the Republic more real. Describe yours in the Talk box below: what it is, what it needs, and who you are. The State Archive opens new projects.</p></div>' +
      commentsHTML("project/new");
    mountComments();
    if (desk()) fetch(desk() + "/crew/all").then(function (r) { return r.json(); }).then(function (c) {
      main.querySelectorAll(".proles .chip").forEach(function (x) { var n = ((c[x.dataset.p] || {})[x.dataset.r]) || 0; x.querySelector(".n").textContent = n; });
    }, function () {});
    document.title = "Projects · Archive of the Republic of Ubikistan";
  }
  function mdLite(src) {
    var inline = function (t) {
      return esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>")
        .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+|#\/[^)\s]*)\)/g, function (m, a, u) { return '<a href="' + u + '"' + (u[0] === "h" ? ' rel="noopener" target="_blank"' : "") + ">" + a + "</a>"; });
    };
    var out = [], list = null, para = [];
    var flush = function () { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } if (list) { out.push("<" + list.t + ">" + list.items.map(function (i) { return "<li>" + inline(i) + "</li>"; }).join("") + "</" + list.t + ">"); list = null; } };
    String(src || "").split("\n").forEach(function (ln) {
      var m;
      if (!ln.trim()) { flush(); return; }
      if ((m = /^(#{2,3})\s+(.*)$/.exec(ln))) { flush(); out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); return; }
      if ((m = /^\s*[-*]\s+(.*)$/.exec(ln)) || (m = /^\s*\d+\.\s+(.*)$/.exec(ln))) {
        var t = /^\s*\d/.test(ln) ? "ol" : "ul";
        if (para.length) flush();
        if (list && list.t !== t) flush();
        if (!list) list = { t: t, items: [] };
        list.items.push(m[1]); return;
      }
      if (list) flush();
      para.push(ln.trim());
    });
    flush();
    return out.join("");
  }
  var STATUSES = ["forming", "open", "active", "paused", "done"];
  var WHO = { anyone: "People and agents", people: "People", agents: "Agents" };
  function member(m) {
    return m.kind === "agent" ? '<span class="mark agent">AGENT</span>' + (m.link ? '<a href="' + esc(m.link) + '" rel="noopener" target="_blank">' + esc(m.agent) + "</a>" : "<b>" + esc(m.agent) + "</b>") + ' <span class="muted small">run by</span> ' + who(m) : who(m);
  }
  function viewProject(id) {
    var p = project(id);
    if (!p) return notFound();
    if (p.classified) { main.innerHTML = '<p class="crumb"><a href="#/projects">Projects</a> / Classified</p><div style="padding:48px 0"><p class="kicker">Classified</p><h1>' + esc(p.title) + '</h1><p class="muted">This file is not open to the public.</p></div>'; return; }
    var lo = (p.lore || []).map(lore).filter(Boolean);
    main.innerHTML = '<p class="crumb"><a href="#/projects">Projects</a> / ' + esc(p.title) + "</p>" +
      '<article class="proj"><div class="prose" id="phead">' + headHTML({ title: p.title, summary: p.summary, status: p.status, html: p.html }) + '</div><p class="muted small" id="owner">' + (p.owner ? "Owner: " + who(p.owner) : "Owner: none yet. The State Archive runs it until someone takes it on.") + "</p>" +
      '<section class="roles" aria-labelledby="roles-h"><h2 class="section-h" id="roles-h">Roles</h2><p class="muted small">Sign up yourself, or an agent you run. Your handle is shown so the owner and the other members can find you. You can leave at any time. The owner runs the project: they write this page and define its roles. Only the State Archive appoints or removes an owner.</p><div id="crew"><p class="muted small">Loading who has signed up…</p></div></section>' +
      (lo.length ? '<h2 class="section-h">Lore</h2><ul class="lorehits">' + lo.map(function (l) { return '<li><a href="#/lore/' + l.id + '"><span class="k">Lore</span><span><b>' + esc(l.title) + '</b> <span class="s">' + esc(l.summary) + "</span></span></a></li>"; }).join("") + "</ul>" : "") +
      '<p class="tools"><a href="' + esc(p.source) + '">Source file</a></p></article>' + commentsHTML("project/" + p.id);
    mountComments();
    var box = document.getElementById("crew"), editing = false, editingPage = false, last = null;
    function headHTML(g) {
      return '<span class="pst ' + esc(g.status) + '">' + esc((D.project_statuses || {})[g.status] || g.status) + "</span><h1>" + esc(g.title) + '</h1><p class="lede">' + esc(g.summary) + "</p>" + (g.by ? '<p class="muted small">Page by ' + who(g.by) + ", " + esc(g.at) + "</p>" : "") + g.html;
    }
    function drawHead(c) {
      var ph = document.getElementById("phead"), me = c && c.me;
      if (editingPage && me && me.manage) {
        var g = c.page || { title: p.title, summary: p.summary, status: p.status, body: p.text };
        ph.innerHTML = '<form id="pagef" class="addf" novalidate><p class="muted small">Edit this project\'s page. It changes at once, for everyone. Write in plain text: a blank line starts a new paragraph, ## starts a heading, - starts a list item, **bold**, [a link](https://…).</p>' +
          '<div class="two"><label>Title<input name="title" maxlength="90" value="' + esc(g.title) + '"></label><label>Status<select name="status">' + STATUSES.map(function (x) { return '<option value="' + x + '"' + (g.status === x ? " selected" : "") + ">" + esc((D.project_statuses || {})[x] || x) + "</option>"; }).join("") + "</select></label></div>" +
          '<label>One-line summary<input name="summary" maxlength="240" value="' + esc(g.summary) + '"></label><label>Description<textarea name="body" rows="18" maxlength="20000" class="src">' + esc(g.body) + "</textarea></label>" +
          '<p class="formerr" role="alert"></p><p><button class="btn" type="submit">Save the page</button> <button class="linkbtn" type="button" id="cancelpage">Cancel</button>' + (c.page ? ' <button class="linkbtn" type="button" id="resetpage">Go back to the original</button>' : "") + "</p></form>";
        var f = document.getElementById("pagef");
        f.addEventListener("submit", function (e) { e.preventDefault(); send("/project/page", { project: p.id, title: f.elements.title.value, summary: f.elements.summary.value, status: f.elements.status.value, body: f.elements.body.value }, f, function () { editingPage = false; }); });
        document.getElementById("cancelpage").onclick = function () { editingPage = false; draw(last); };
        var rp = document.getElementById("resetpage"); if (rp) rp.onclick = function () { send("/project/page", { project: p.id, reset: true }, f, function () { editingPage = false; }); };
        return;
      }
      ph.innerHTML = c && c.page ? headHTML({ title: c.page.title, summary: c.page.summary, status: c.page.status, html: mdLite(c.page.body), by: c.page.by, at: c.page.at })
        : headHTML({ title: p.title, summary: p.summary, status: p.status, html: p.html });
    }
    function joinForm(r) {
      var kinds = r.who === "people" ? ["person"] : r.who === "agents" ? ["agent"] : ["person", "agent"];
      return '<details class="joind"><summary class="btn">Sign up</summary><form class="addf joinf" data-r="' + esc(r.id) + '" novalidate>' +
        (kinds.length > 1 ? '<fieldset><legend>Who</legend><label class="opt"><input type="radio" name="kind" value="person" checked> <span>Myself</span></label><label class="opt"><input type="radio" name="kind" value="agent"> <span>An agent I run</span></label></fieldset>' : '<input type="hidden" name="kind" value="' + kinds[0] + '">') +
        '<div class="agent-only"' + (kinds[0] === "agent" && kinds.length === 1 ? "" : " hidden") + '><div class="two"><label>Agent name<input name="agent" maxlength="60"></label><label>Link <span class="muted">(optional)</span><input name="link" type="url" placeholder="https://…"></label></div></div>' +
        '<label>What you bring <span class="muted">(optional, one line)</span><input name="note" maxlength="300"></label><p class="formerr" role="alert"></p><button class="btn" type="submit">Sign up as ' + esc(r.name) + "</button></form></details>";
    }
    function rolesEditor(c) {
      return '<form id="rolef" class="addf roled" novalidate><p class="muted small">Define this project\'s roles. Saving replaces the list; leave it empty to go back to the roles in the project file. Sign-ups stay attached to a role as long as its name does not change.</p><ol class="redit">' +
        c.roles.map(function (r) { return roleRow(r); }).join("") + '</ol><p><button type="button" class="btn ghost" id="addrole">Add a role</button></p><p class="formerr" role="alert"></p><p><button class="btn" type="submit">Save roles</button> <button class="linkbtn" type="button" id="cancelroles">Cancel</button></p></form>';
    }
    function roleRow(r) {
      r = r || { id: "", name: "", can: "", wanted: "", who: "anyone" };
      return '<li data-id="' + esc(r.id) + '"><div class="two"><label>Role<input name="name" maxlength="60" value="' + esc(r.name) + '"></label><div class="two"><label>Wanted<input name="wanted" type="number" min="0" max="99" value="' + esc(r.wanted == null ? "" : r.wanted) + '"></label><label>Open to<select name="who">' +
        ["anyone", "people", "agents"].map(function (w) { return '<option value="' + w + '"' + (r.who === w ? " selected" : "") + ">" + WHO[w] + "</option>"; }).join("") + '</select></label></div></div><label>What this role can do<textarea name="can" rows="2" maxlength="400">' + esc(r.can) + '</textarea></label><p class="rowtools"><button type="button" class="linkbtn up">Move up</button> <button type="button" class="linkbtn del">Remove</button></p></li>';
    }
    function draw(c) {
      last = c;
      if (c) drawHead(c);
      var me = c && c.me, roles = c ? c.roles : p.roles, ms = c ? c.members : [], mine = {};
      ms.forEach(function (m) { if (m.me) mine[m.role + "|" + m.agent] = true; });
      if (c) {
        var ob = document.getElementById("owner");
        ob.innerHTML = (c.owner ? "Owner: " + who(c.owner) + (me && me.admin ? ' <button type="button" class="linkbtn" id="clearowner">remove owner</button>' : "") : "Owner: none yet. The State Archive runs it until someone takes it on.") +
          (me && me.admin ? '<span class="ownerpick"><label>' + (c.owner ? "Change owner" : "Appoint an owner") + ' <select id="ownersel"><option value="">Loading who has signed in…</option></select></label> <button type="button" class="btn ghost" id="setowner">Make owner</button><span class="formerr" id="ownererr"></span></span>' : "");
        if (me && me.admin) {
          fetch(desk() + "/people", { headers: authHeaders() }).then(function (r) { return r.json(); }).then(function (j) {
            var sel = document.getElementById("ownersel"); if (!sel) return;
            var mem = {}; c.members.forEach(function (m) { if (m.kind !== "agent" && m.id) mem[m.provider + ":" + m.handle] = m.id; });
            var ppl = (j.people || []).slice().sort(function (a, b) { return (mem[b.provider + ":" + b.handle] ? 1 : 0) - (mem[a.provider + ":" + a.handle] ? 1 : 0); });
            sel.innerHTML = '<option value="">Choose…</option>' + ppl.map(function (x) {
              var label = x.me ? "Myself (shown as State Archive)" : "@" + x.handle + " (" + (x.provider === "x" ? "X" : "GitHub") + ")" + (mem[x.provider + ":" + x.handle] ? " · signed up here" : "");
              return '<option value="' + esc(x.user) + '">' + esc(label) + "</option>";
            }).join("");
          }, function () {});
          document.getElementById("setowner").onclick = function () {
            var v = document.getElementById("ownersel").value;
            if (!v) { document.getElementById("ownererr").textContent = " Choose someone first."; return; }
            send("/project/owner", { project: p.id, user: v }, { querySelector: function () { return document.getElementById("ownererr"); } });
          };
        }
      }
      if (editing && me && me.manage) { box.innerHTML = rolesEditor(c); wireEditor(); return; }
      box.innerHTML = (me && me.manage ? '<p><button type="button" class="btn ghost" id="editpage">Edit the page</button> <button type="button" class="btn ghost" id="editroles">Edit roles</button>' + (c.roles_by === "owner" ? ' <span class="muted small">Roles set by the owner.</span>' : "") + "</p>" : "") +
        '<ul class="rlist">' + roles.map(function (r) {
          var here = ms.filter(function (m) { return m.role === r.id; }), act = "";
          if (desk() && me) {
            var mineHere = here.filter(function (m) { return m.me; });
            act = mineHere.map(function (m) { return '<button type="button" class="linkbtn leave" data-r="' + esc(r.id) + '" data-a="' + esc(m.agent) + '">Leave' + (m.agent ? " (" + esc(m.agent) + ")" : "") + "</button>"; }).join(" ") + joinForm(r);
          }
          return '<li class="role"><div class="rh"><b>' + esc(r.name) + '</b><span class="muted small">' + here.length + (r.wanted ? " of " + r.wanted + " wanted" : " signed up") + '</span></div><p class="muted small">Open to: ' + WHO[r.who || "anyone"] + "</p><p>" + esc(r.can) + "</p>" +
            (here.length ? '<ul class="mlist">' + here.map(function (m) {
              return "<li>" + member(m) + (m.owner ? ' <span class="pst open">owner</span>' : "") + (m.note ? ' <span class="muted small">· ' + esc(m.note) + "</span>" : "") + ' <span class="muted small">' + esc(m.at) + "</span>" +
                (me && me.manage && m.id ? ' <button type="button" class="linkbtn rm" data-id="' + m.id + '">remove</button>' : "") +
                (me && me.admin && m.id && !m.owner && m.kind !== "agent" ? ' <button type="button" class="linkbtn mkowner" data-id="' + m.id + '">make owner</button>' : "") + "</li>";
            }).join("") + "</ul>" : "") + act + "</li>";
        }).join("") + "</ul>" + (desk() && !me ? gateHTML("sign up for a role") : "");
      box.querySelectorAll(".joinf").forEach(function (f) {
        f.querySelectorAll("input[name=kind]").forEach(function (x) { x.addEventListener("change", function () { f.querySelector(".agent-only").hidden = f.querySelector("input[name=kind]:checked").value !== "agent"; }); });
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var k = (f.querySelector("input[name=kind]:checked") || f.elements.kind).value;
          send("/join", { project: p.id, role: f.dataset.r, kind: k, agent: f.elements.agent.value, link: f.elements.link.value, note: f.elements.note.value }, f);
        });
      });
      box.querySelectorAll(".leave").forEach(function (b) { b.addEventListener("click", function () { send("/leave", { project: p.id, role: b.dataset.r, agent: b.dataset.a }); }); });
      box.querySelectorAll(".rm").forEach(function (b) { b.addEventListener("click", function () { send("/crew/remove", { id: +b.dataset.id }); }); });
      box.querySelectorAll(".mkowner").forEach(function (b) { b.addEventListener("click", function () { send("/project/owner", { project: p.id, member: +b.dataset.id }); }); });
      var co = document.getElementById("clearowner"); if (co) co.addEventListener("click", function () { send("/project/owner", { project: p.id, clear: true }); });
      var er = document.getElementById("editroles"); if (er) er.addEventListener("click", function () { editing = true; draw(last); });
      var ep = document.getElementById("editpage"); if (ep) ep.addEventListener("click", function () { editingPage = true; draw(last); document.getElementById("phead").scrollIntoView({ block: "start" }); });
    }
    function wireEditor() {
      var f = document.getElementById("rolef"), ol = f.querySelector(".redit");
      function rows() {
        ol.querySelectorAll(".del").forEach(function (b) { b.onclick = function () { b.closest("li").remove(); }; });
        ol.querySelectorAll(".up").forEach(function (b) { b.onclick = function () { var li = b.closest("li"); if (li.previousElementSibling) ol.insertBefore(li, li.previousElementSibling); }; });
      }
      rows();
      document.getElementById("addrole").onclick = function () { ol.insertAdjacentHTML("beforeend", roleRow()); rows(); };
      document.getElementById("cancelroles").onclick = function () { editing = false; draw(last); };
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var roles = Array.prototype.map.call(ol.children, function (li) { var g = function (n) { return li.querySelector("[name=" + n + "]").value; };
          var name = g("name"), keep = li.dataset.id && last.roles.some(function (r) { return r.id === li.dataset.id && r.name === name; });
          return { id: keep ? li.dataset.id : "", name: name, can: g("can"), wanted: g("wanted"), who: g("who") }; });
        send("/project/roles", { project: p.id, roles: roles }, f, function () { editing = false; });
      });
    }
    function send(path, body, form, after) {
      fetch(desk() + path, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Not saved."); return j; }); })
        .then(function (j) { if (after) after(); draw(j); }, function (x) { if (form) form.querySelector(".formerr").textContent = x.message; });
    }
    if (!desk()) { draw(null); return; }
    fetch(desk() + "/crew?project=" + encodeURIComponent(p.id), { headers: authHeaders() }).then(function (r) { return r.json(); }).then(function (c) { draw(c.roles ? c : null); }, function () { draw(null); });
    document.title = p.title + " · Projects · Archive of the Republic of Ubikistan";
  }

  /* ---------- Culture: citizen work ---------- */
  function viewCulture() {
    var q = parseQ(), every = D.records.filter(function (r) { return r.kind === "culture"; }).reverse(), all = every.filter(function (r) { return !r.ephemera; }), eph = every.filter(function (r) { return r.ephemera; });
    var shown = all.filter(function (r) { return r.featured; });
    var list = q.form ? every.filter(function (r) { return r.form === q.form; }) : all;
    var chips = '<button type="button" class="chip" data-f="" aria-pressed="' + !q.form + '">All<span class="n">' + every.length + "</span></button>";
    Object.keys(D.forms).forEach(function (k) { var c = every.filter(function (r) { return r.form === k; }).length; chips += '<button type="button" class="chip" data-f="' + k + '" aria-pressed="' + (q.form === k) + '"' + (c ? "" : " disabled") + ">" + esc(D.forms[k]) + '<span class="n">' + c + "</span></button>"; });
    main.innerHTML = '<section class="hero"><p class="kicker">Ministry of Culture · Citizen work</p><h1>Culture before coin</h1>' +
      '<p class="lede">Films, videos, images, memes, threads, music, writing and merch that citizens make about Ubikistan. The Ministry accessions each piece under its maker\'s name and shows a few at a time. Fantasy is welcome; it does not have to agree with the Archive.</p>' +
      '<p class="tools" style="margin-top:0"><a href="#/add?kind=culture">Add your work</a><a href="#/films">Films</a></p></section>' +
      (all.length ? (shown.length ? '<h2 class="section-h">Current exhibition</h2><ul class="grid feature">' + shown.map(card).join("") + "</ul>" : "") +
        '<h2 class="section-h">Formats</h2><div class="frow" style="margin-bottom:18px">' + chips + "</div>" +
        '<h2 class="section-h">' + (q.form ? esc(D.forms[q.form] || "") + ", newest first" : "Recent accessions") + '</h2><ul class="grid">' + list.map(card).join("") + "</ul>" +
        (eph.length && !q.form ? '<h2 class="section-h">Community ephemera</h2><p class="muted" style="margin-top:-6px">Posts, memes and fragments from the community, kept as a record of the conversation rather than as works.</p><ul class="grid">' + eph.map(card).join("") + "</ul>" : "") :
        '<div class="empty"><p><b>The Ministry is waiting for the first accession.</b></p><p class="muted">Make something: a film, a poster, a T-shirt, a song, a story set in the Republic. Then <a href="#/add?kind=culture">add it</a>. It will be accessioned as ACC 0001.</p></div>');
    document.querySelectorAll(".chip[data-f]").forEach(function (b) { b.addEventListener("click", function () { history.replaceState(null, "", "#/culture" + (b.dataset.f ? "?form=" + b.dataset.f : "")); viewCulture(); }); });
  }
  function viewCollections() {
    var names = D.collections || {}, h = loreTabs("collections") + '<section class="hero"><p class="kicker">State Archive · Collections</p><h1>Collections</h1><p class="lede">Objects kept beside the main history: stamp sheets, patches and pins, the working papers of Station 6. They are catalogued like everything else, but they add detail to events the Archive already documents.</p></section>';
    Object.keys(names).forEach(function (k) {
      var l = D.records.filter(function (r) { return r.collection === k; });
      if (l.length) h += '<h2 class="section-h" id="' + k + '">' + esc(names[k]) + '<span class="muted" style="font-weight:400"> · ' + l.length + '</span></h2><ul class="grid">' + l.map(card).join("") + "</ul>";
    });
    main.innerHTML = h;
    var hash = location.hash.split("#")[2]; if (hash) { var el = document.getElementById(hash); if (el) el.scrollIntoView(); }
  }
  function viewFilms() {
    var list = D.records.filter(isFilm);
    var groups = [["culture", "Citizen films"], ["record", "In the Record"], ["archive", "From the Archive"]];
    var h = '<section class="hero"><p class="kicker">Films</p><h1>Moving images</h1><p class="lede">Every film, tape and broadcast in Ubikistan: citizen films, films in the Record, and what survives of UNT and UBIK Systems in the Archive.</p>' +
      '<p class="tools" style="margin-top:0"><a href="#/add?kind=culture">Add a film</a></p></section>';
    groups.forEach(function (g) {
      var l = list.filter(function (r) { return r.kind === g[0]; });
      if (g[0] === "archive" || g[0] === "record") l = l.slice().reverse();
      h += '<h2 class="section-h">' + g[1] + "</h2>" + (l.length ? '<ul class="grid">' + l.map(card).join("") + "</ul>" : '<p class="muted">None yet. <a href="#/add?kind=culture">Add the first.</a></p>');
    });
    main.innerHTML = h;
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
  function section(name) { return D.lore.filter(function (l) { return (l.section || "lore") === name; }); }
  function viewLore(id, sub, sec) {
    if (!id && sec !== "handbook") return viewMap();
    if (id === "index" && sec !== "handbook") id = "";
    if (!id) {
      var hb = sec === "handbook";
      main.innerHTML = (hb ? "" : loreTabs("index")) + '<section class="hero"><p class="kicker">' + (hb ? "Archive Handbook" : "Lore") + "</p><h1>" + (hb ? "How the archive is kept" : "The Republic of Ubikistan") + '</h1><p class="lede">' +
        (hb ? "For contributors: the collections and their rules, how the history is built, and how changes are made." : "Its history, its people, its institutions and its calendar, as the State tells them.") + "</p></section>" +
        '<ul class="loreindex">' + section(hb ? "handbook" : "lore").map(function (l) { return '<li><a href="#/' + (hb ? "handbook" : "lore") + "/" + l.id + '"><span class="t">' + esc(l.title) + '</span><span class="s">' + esc(l.summary) + "</span></a></li>"; }).join("") + "</ul>";
      return;
    }
    var l = lore(id);
    if (!l) return notFound();
    var hbk = (l.section || "lore") === "handbook", base = hbk ? "handbook" : "lore", sib = section(l.section || "lore");
    if (sub === "history") { main.innerHTML = '<div style="padding:8px 0 40px">' + historyHTML(l, "#/lore/" + l.id, "page") + "</div>"; document.title = "History · " + l.title; return; }
    if (sub === "edit" && D.guest_desk) { viewEdit(l, "#/lore/" + l.id); document.title = "Edit · " + l.title; return; }
    var linked = D.records.filter(function (r) { return (r.lore || []).indexOf(id) >= 0; });
    main.innerHTML = '<div class="lorewrap"><nav class="loretoc" aria-label="' + (hbk ? "Handbook" : "Lore") + '">' + sib.map(function (x) { return '<a href="#/' + base + "/" + x.id + '"' + (x.id === id ? ' aria-current="page"' : "") + ">" + esc(x.title) + "</a>"; }).join("") +
      (hbk ? '<a class="tocx" href="#/lore">← Lore</a>' : "") + "</nav>" +
      '<article class="prose">' + tabsHTML("#/" + base + "/" + l.id, l.file, "read", (l.revisions || []).length) + '<p class="kicker">' + (hbk ? "Archive Handbook" : "Lore") + "</p><h1>" + esc(l.title) + "</h1>" + onMap(l.id) + l.html +
      '<p class="tools"><a href="' + esc(l.source) + '">Source file</a><a href="' + esc(l.source.replace("/blob/", "/edit/")) + '">Suggest a correction</a></p>' +
      pagerHTML(sib, sib.indexOf(l), function (x) { return "#/" + base + "/" + x.id; }, function () { return hbk ? "Handbook" : "Lore"; }, false) + notesHTML(l.notes, "lore/" + l.id, "page") + commentsHTML("lore/" + l.id) +
      (linked.length ? '<h2 class="section-h">Records</h2><ul class="grid">' + linked.map(card).join("") + "</ul>" : "") + "</article></div>";
    mountComments(); wireTabs(); mountNotes();
    document.title = l.title + " · Archive of the Republic of Ubikistan";
  }

  /* ---------- add a record ---------- */
  var MEDIA_OPTS = [["PH", "photograph"], ["AV", "film, tape, broadcast"], ["DOC", "document"], ["POS", "poster, advertisement"], ["STP", "stamp"], ["NOTE", "banknote, coin, bond"], ["PP", "passport"], ["SCR", "screenshot, interface"], ["EPH", "ephemera"], ["OBJ", "product, hardware, packaging"]];
  var AI_PROMPT = "Read https://ubikistan.github.io/archive/llms.txt and the rules it links to. Then help me write a record for the Archive of the Republic of Ubikistan about: [describe your object or story]. Ask me what you need, check it against the rules, and give me the finished submission link.";

  function viewAdd() {
    var inst = Object.keys(D.institutions).map(function (k) { return '<option value="' + esc(D.institutions[k]) + '">'; }).join("");
    main.innerHTML = '<div class="addwrap"><div class="prose"><p class="kicker">Submit to the Archive</p><h1>What are you submitting?</h1>' +
      '<p class="lede">A photograph, a document, a story or a film for the Archive, which enters as apocrypha. Or your own work, a film, image, merch, music or writing, for Culture, credited to you.</p>' +
      '<p class="muted">Read <a href="#/handbook/rules">the rules in the Handbook</a> first. The Archive is invented history up to 2025. The Record is real things that happened from 2026 on.</p></div>' +
      '<form id="addf" class="addf" novalidate>' +
      '<fieldset><legend>Choose one</legend><label class="opt"><input type="radio" name="archive" value="The Archive (invented history, 1965–2025)" checked> <span><b>A piece of history</b> · a document, photograph, object or story from the Republic, 1965–2025</span></label>' +
      '<label class="opt"><input type="radio" name="archive" value="The Record (something that really happened, 2026 on)"> <span><b>Something that happened</b> · a real event, film, crossing or piece of work, from 2026 on</span></label>' +
      '<label class="opt"><input type="radio" name="archive" value="Culture (something I made: a film, image, merch, music, writing)"> <span><b>Something you made</b> · a film, video, image, meme, thread, music, writing or merch about Ubikistan</span></label>' +
      '<label class="opt"><input type="radio" name="archive" value="correction"> <span><b>A correction</b> · something on an existing page is wrong or missing</span></label></fieldset>' +
      '<div class="corr-only prose" hidden><p>Open the page that needs correcting and use its <b>Edit</b> tab. If you would rather discuss it first, leave a remark under the page. Every change is reviewed and kept in History.</p><p><a href="#/">Find the page in the Archive</a> · <a href="#/lore">Lore</a></p></div>' +
      '<label class="cul-only">Form<select name="form">' + Object.keys(D.forms).map(function (k) { return '<option value="' + k + '">' + esc(D.forms[k]) + "</option>"; }).join("") + "</select></label>" +
      '<label class="cul-only">Link <span class="muted">(optional: where it lives, a shop, a channel)</span><input name="link" type="url" placeholder="https://…"></label>' +
      '<label>Title<input name="record_title" required placeholder="Spectator ticket, Tour of the Plain 1983"></label>' +
      '<div class="two"><label>Date<input name="date" required placeholder="06.1983"></label>' +
      '<label>Medium<select name="medium">' + MEDIA_OPTS.map(function (m) { return '<option value="' + m[0] + " · " + m[1] + '"' + (m[0] === "EPH" ? " selected" : "") + ">" + m[1] + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="two"><label>Issued by<input name="institution" list="instl" placeholder="Sporting Committee"><datalist id="instl">' + inst + "</datalist></label>" +
      '<label>What is it, physically?<input name="format" placeholder="Ticket, letterpress on card"></label></div>' +
      '<label>Post on X <span class="muted">(optional: a link; its images and text are kept as a snapshot)</span><input name="xpost" type="url" placeholder="https://x.com/…/status/…"></label>' +
      '<fieldset class="x-only"><legend>Whose post?</legend><label class="opt"><input type="radio" name="whose" value="My own post (released under CC0)" checked> <span>My own post</span></label>' +
      '<label class="opt"><input type="radio" name="whose" value="Someone else\'s post (a snapshot, kept for reference)"> <span>Someone else\'s post, kept for reference</span></label></fieldset>' +
      '<label>Caption and text<textarea name="text" rows="5" required placeholder="One line of caption, the way a catalogue would put it. Then anything else the record needs."></textarea></label>' +
      '<label>Film link <span class="muted">(optional: Internet Archive, YouTube, Vimeo)</span><input name="film" type="url" placeholder="https://archive.org/details/…"></label>' +
      (TOKEN ? '<input type="hidden" name="contributor" value="signed-in"><p class="muted small">Credited to your signed-in account.</p>' : '<label>Credit as <span class="muted">(for GitHub)</span><input name="contributor" placeholder="Your name or handle"></label>') +
      (D.guest_desk ? '<label>Images <span class="muted">(up to 6, under 3 MB each)</span><input name="images" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple></label>' +
        '<label class="opt"><input type="checkbox" name="cc0"> <span>I made this, or have the right to give it away, and I release it under CC0.</span></label>' +
        '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
        (TOKEN ? '<p class="muted small">The State Archive reviews it. You can also <button type="submit" id="viagh" class="linkbtn">submit on GitHub</button>.</p>'
          : gateHTML("submit") + '<p class="muted small">Or <button type="submit" id="viagh" class="linkbtn">submit on GitHub</button> with a GitHub account.</p>')
        : '<p class="muted small">Next you go to GitHub, which needs a free account (a pseudonym is fine). Drag your images onto that page, tick the CC0 box and submit.</p>') +
      '<p class="formerr" id="formerr" role="alert"></p><p class="formok" id="formok" role="status"></p><button class="btn" type="submit">' + (D.guest_desk ? "Submit" : "Continue on GitHub ↗") + "</button></form>" +
      '<div class="prose addside"><h2>Ask your AI</h2><p>Any assistant that can read web pages can help you write it. Paste this:</p><pre id="aip">' + esc(AI_PROMPT) + '</pre><button class="btn ghost" type="button" id="copyai">Copy</button>' +
      '<h2>With Claude Code</h2><p>Claude Code can write the record and propose it directly:</p><pre>git clone https://github.com/ubikistan/archive\ncd archive\nclaude</pre><p>Then say what you want to add. It follows the archive\'s <a href="https://github.com/ubikistan/archive/blob/main/CLAUDE.md">instructions</a>.</p>' +
      '<h2>For agents</h2><p>Everything is in <a href="lore.json">lore.json</a>, <a href="llms.txt">llms.txt</a> and <a href="llms-full.txt">llms-full.txt</a>.</p>' +
      '<h2>Not accepted</h2><ul><li>Real people as part of Ubikistan\'s history. The state borrows formats, never faces.</li><li>Anything you have no right to give away. Everything is CC0.</li><li>Price talk. Culture before coin.</li></ul></div></div>';
    document.getElementById("addf").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target, v = function (n) { return (f.elements[n].value || "").trim(); }, err = [];
      var hasX = /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/\w+\/status/.test(v("xpost"));
      if (v("xpost") && !hasX) err.push("a link to a single post on X");
      if (!v("record_title") && !hasX) err.push("a title");
      if (!/(1[89]\d\d|20\d\d)/.test(v("date")) && !hasX) err.push("a date with a year");
      if (!v("text") && !hasX) err.push("a caption");
      var arch = f.querySelector("input[name=archive]:checked").value, y = +((v("date").match(/(1[89]\d\d|20\d\d)/) || [])[1]);
      if (y && /^The Archive/.test(arch) && y > 2025) err.push("a year up to 2025, or choose the Record");
      if (y && /^The Record/.test(arch) && y < 2026) err.push("a year from 2026, or choose the Archive");
      var cul = /^Culture/.test(arch);
      document.getElementById("formerr").textContent = err.length ? "Still needed: " + err.join(", ") + "." : "";
      if (err.length) return;
      var p = { template: "record.yml", title: "Record: " + v("record_title"), archive: arch, record_title: v("record_title"), date: v("date"),
        medium: cul ? "" : v("medium"), institution: cul ? "" : v("institution"), format: v("format"), text: v("text"), media: v("film"), contributor: v("contributor") === "signed-in" ? "" : v("contributor"),
        form: cul ? v("form") : "", link: cul ? v("link") : "",
        xpost: v("xpost"), whose: v("xpost") ? f.querySelector("input[name=whose]:checked").value : "" };
      var qs = Object.keys(p).filter(function (k) { return p[k]; }).map(function (k) { return k + "=" + encodeURIComponent(p[k]); }).join("&");
      var gh = "https://github.com/ubikistan/archive/issues/new?" + qs;
      if (!D.guest_desk || e.submitter && e.submitter.id === "viagh") { window.open(gh, "_blank", "noopener"); return; }
      if (!TOKEN) { document.getElementById("formerr").textContent = "Identify to the Archive first, or submit on GitHub."; return; }
      if (!f.elements.cc0.checked) { document.getElementById("formerr").textContent = "Tick the CC0 box to submit."; return; }
      var fd = new FormData(f), btn = f.querySelector("button[type=submit]");
      fd.set("archive", arch); fd.delete("cc0");
      if (!cul) { fd.delete("form"); fd.delete("link"); }
      if (!v("xpost")) fd.delete("whose");
      btn.disabled = true; btn.textContent = "Filing…";
      fetch(desk() + "/submit", { method: "POST", headers: authHeaders(), body: fd })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Not filed."); return j; }); })
        .then(function (j) { document.getElementById("formok").innerHTML = 'Filed. The State Archive will review it. <a href="' + esc(j.url) + '" target="_blank" rel="noopener">Follow your submission ↗</a>'; btn.textContent = "Filed"; },
          function (x) { document.getElementById("formerr").textContent = x.message; btn.disabled = false; btn.textContent = "Submit"; });
    });

    var af = document.getElementById("addf");
    function sync() { var sel = af.querySelector("input[name=archive]:checked").value, c = /^Culture/.test(sel), corr = sel === "correction";
      Array.prototype.forEach.call(af.children, function (x) { if (x.tagName !== "FIELDSET" && !x.classList.contains("corr-only")) x.classList.toggle("corr-hide", corr); });
      af.querySelector(".corr-only").hidden = !corr;
      af.querySelectorAll(".cul-only").forEach(function (x) { x.hidden = !c; });
      af.elements.medium.closest("label").hidden = c; af.elements.institution.closest("label").hidden = c;
      af.querySelector(".x-only").hidden = !af.elements.xpost.value; }
    af.elements.xpost.addEventListener("input", sync);
    af.querySelectorAll("input[name=archive]").forEach(function (x) { x.addEventListener("change", sync); });
    if (parseQ().kind === "culture") af.querySelectorAll("input[name=archive]")[2].checked = true;
    sync();
    document.getElementById("copyai").addEventListener("click", function (e) {
      var b = e.target;
      (navigator.clipboard ? navigator.clipboard.writeText(AI_PROMPT) : Promise.reject()).then(function () { b.textContent = "Copied"; }, function () { b.textContent = "Select the text above"; });
    });
  }

  function notFound() {
    main.innerHTML = '<div style="padding:64px 0"><p class="kicker">Not found</p><h1>RECORD NOT FOUND</h1><p>This record does not exist, or no longer does. <a href="#/">Return to the archive</a>.</p></div>';
  }

  /* ---------- review: the State Archive approves submissions here ---------- */
  function field(body, name) { var m = body.match(new RegExp("### " + name.replace(/[?]/g, "\\?") + "\\s*\\n+([\\s\\S]*?)(?=\\n### |$)")); var v = m ? m[1].trim() : ""; return v === "_No response_" ? "" : v; }
  function viewReview() {
    main.innerHTML = '<div style="padding:40px 0 60px"><p class="kicker">State Archive</p><h1>Submissions</h1><p class="muted small">Approve to file a submission: it gets its code and appears on the site a minute or two later. Decline closes it with a short thank-you.</p><div id="rvb"><p class="muted">Opening the in-tray…</p></div></div>';
    var box = document.getElementById("rvb");
    if (!desk() || !TOKEN) { box.innerHTML = signinButtons("Only the State Archive reviews submissions."); return; }
    function load() {
      fetch(desk() + "/submissions", { headers: authHeaders() }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Not available."); return j; }); }).then(draw, function (x) { box.innerHTML = '<p class="formerr">' + esc(x.message) + "</p>"; });
    }
    function draw(S) {
      var h = "";
      if (!S.submissions.length) h += '<p class="empty"><b>The in-tray is empty.</b></p>';
      h += S.submissions.map(function (s) {
        var b = s.body || "", imgs = (field(b, "Images and films").match(/https:\/\/\S+/g) || []);
        var pics = imgs.filter(function (u) { return /\/incoming\/|\.(jpe?g|png|gif|webp)(\?|$)/i.test(u); });
        var caption = field(b, "Caption and text"), credit = field(b, "Credit as"), which = field(b, "Which archive?").replace(/ \(.*/, ""), form = field(b, "Form"), xp = field(b, "Post on X"), link = field(b, "Link");
        var empty = !caption && !imgs.length && !xp && !link;
        return '<article class="rv' + (empty ? " thin" : "") + '"><div class="rvh"><span class="pst">' + esc(which || "Submission") + (form && /Culture/.test(which) ? " · " + esc(form) : "") + '</span><a href="' + esc(s.url) + '" target="_blank" rel="noopener" class="muted small">#' + s.number + " on GitHub</a></div>" +
          "<h3>" + esc(s.title.replace(/^Record:\s*/, "")) + "</h3>" +
          '<p class="muted small">' + esc(credit || "@" + s.by) + " · " + esc((s.at || "").slice(0, 16).replace("T", " ")) + " UTC" + (s.labels.indexOf("accepted") >= 0 ? " · approved, being filed" : "") + "</p>" +
          (pics.length ? '<div class="rvimgs">' + pics.slice(0, 4).map(function (u) { return '<img class="viewable" src="' + esc(u) + '" alt="" loading="lazy">'; }).join("") + "</div>" : "") +
          (caption ? '<p class="rvt">' + esc(caption).replace(/\n/g, "<br>") + "</p>" : empty ? '<p class="muted">Nothing filled in: no text, no image, no link.</p>' : "") +
          (xp ? '<p class="small">Post on X: <a href="' + esc(xp) + '" target="_blank" rel="noopener">' + esc(xp) + "</a></p>" : "") +
          (link && link !== xp ? '<p class="small">Link: <a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(link) + "</a></p>" : "") +
          (s.last ? '<p class="rvlast small"><b>Last note on it:</b> ' + esc(s.last).replace(/\n/g, "<br>") + "</p>" : "") +
          '<p class="rvact"><button type="button" class="btn" data-n="' + s.number + '" data-a="accept">' + (s.labels.indexOf("accepted") >= 0 ? "Try again" : "Approve") + '</button><button type="button" class="btn ghost" data-n="' + s.number + '" data-a="decline">Decline</button><span class="formerr"></span></p></article>';
      }).join("");
      if (S.pulls.length) h += '<h2 class="section-h">Proposed changes</h2><p class="muted small">Edits, new versions, notes and branches arrive as pull requests. Review and merge them on GitHub.</p><ul class="rvpr">' + S.pulls.map(function (p) { return '<li><a href="' + esc(p.url) + '" target="_blank" rel="noopener">#' + p.number + " " + esc(p.title) + '</a> <span class="muted small">' + esc((p.at || "").slice(0, 10)) + "</span></li>"; }).join("") + "</ul>";
      box.innerHTML = h;
      box.querySelectorAll(".rvact .btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var art = btn.closest(".rv"), err = art.querySelector(".formerr");
          art.querySelectorAll(".btn").forEach(function (x) { x.disabled = true; });
          fetch(desk() + "/review", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ number: +btn.dataset.n, action: btn.dataset.a }) })
            .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Not done."); return j; }); })
            .then(function (j) { art.classList.add("done"); art.querySelector(".rvact").innerHTML = '<span class="muted">' + (j.action === "accept" ? "Approved. It is being filed and will appear on the site in a minute or two." : "Declined and closed.") + "</span>"; },
              function (x) { err.textContent = x.message; art.querySelectorAll(".btn").forEach(function (y) { y.disabled = false; }); });
        });
      });
    }
    load();
  }

  /* ---------- statistics: page views per day, for the State Archive ---------- */
  var HIT_REF = document.referrer || "";
  function countVisit() {
    if (!desk()) return;
    var page = "/" + location.hash.replace(/^#\/?/, "").split("?")[0];
    if (/^\/signed-in/.test(page)) return;
    var body = JSON.stringify({ page: page, ref: HIT_REF }); HIT_REF = "";
    try { fetch(desk() + "/hit", { method: "POST", headers: { "Content-Type": "text/plain" }, body: body, keepalive: true, credentials: "omit" }).catch(function () {}); } catch (e) {}
  }
  function pageName(p) {
    var x = p.replace(/^\//, "").split("/");
    if (!x[0]) return "Home";
    if (x[0] === "r" && byId(x[1])) return byId(x[1]).title;
    if ((x[0] === "lore" || x[0] === "handbook") && x[1] && lore(x[1])) return lore(x[1]).title;
    return { lore: "Lore map", map: "Lore map", record: "The Record", culture: "Culture", projects: "Projects", changes: "Changes", add: "Submit", characters: "Persons on file", collections: "Collections", versions: "Site versions", me: "Account", stats: "Statistics" }[x[0]] || p;
  }
  function viewStats() {
    main.innerHTML = '<div class="stats" style="padding:40px 0 60px"><p class="kicker">State Archive</p><h1>Statistics</h1><p class="muted small">Page views and visitors per day. No cookies; no addresses are kept. A visitor is counted once a day and cannot be followed from one day to the next.</p><div class="chips" id="sdays"></div><div id="sb"><p class="muted">Counting…</p></div></div>';
    var box = document.getElementById("sb"), q = parseQ(), days = [7, 30, 90].indexOf(+q.days) >= 0 ? +q.days : 30;
    document.getElementById("sdays").innerHTML = [7, 30, 90].map(function (d) { return '<a class="chip" href="#/stats?days=' + d + '"' + (d === days ? ' aria-pressed="true"' : "") + ">" + d + " days</a>"; }).join("");
    if (!desk() || !TOKEN) { box.innerHTML = signinButtons("Only the State Archive can see the statistics."); return; }
    fetch(desk() + "/stats?days=" + days, { headers: authHeaders() }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Not available."); return j; }); }).then(function (S) {
      // every day in the range, including the empty ones
      var byDay = {}; S.daily.forEach(function (d) { byDay[d.day] = d; });
      var sin = {}; S.signins.forEach(function (d) { sin[d.day] = d; });
      var all = [], t0 = Date.parse(S.since + "T00:00:00Z");
      for (var i = 0; i < S.days; i++) { var k = new Date(t0 + i * 86400000).toISOString().slice(0, 10); all.push({ day: k, views: (byDay[k] || {}).views || 0, visitors: (byDay[k] || {}).visitors || 0, signins: (sin[k] || {}).people || 0 }); }
      var sum = function (a, f) { return a.reduce(function (n, d) { return n + d[f]; }, 0); };
      var last = function (n) { return all.slice(-n); };
      var fmt = function (n) { return Number(n).toLocaleString("en-GB"); };
      var tile = function (label, v, sub) { return '<div class="tile"><span class="tl">' + label + '</span><span class="tv">' + fmt(v) + '</span><span class="ts">' + sub + "</span></div>"; };
      var h = '<div class="tiles">' +
        tile("Today", last(1)[0].visitors, fmt(last(1)[0].views) + " page views") +
        tile("Last 7 days", sum(last(7), "visitors"), fmt(sum(last(7), "views")) + " page views") +
        tile("Last " + S.days + " days", sum(all, "visitors"), fmt(sum(all, "views")) + " page views") +
        tile("Signed in", S.people, "accounts active in " + S.days + " days") +
        tile("Project sign-ups", S.signups, "people and agents, all time") + "</div>";
      h += '<h2 class="section-h">Visitors per day</h2><div class="sbars" id="sbars">' + barsSVG(all) + '</div><p class="muted small">A visitor visiting on two days counts twice. Counting began on 05.10.2026.</p>';
      var table = function (title, head, rows) { return '<div><h3>' + title + '</h3>' + (rows.length ? '<div class="tablewrap"><table class="log"><thead><tr>' + head.map(function (x, i) { return "<th" + (i ? ' class="num"' : "") + ">" + x + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>" : '<p class="muted small">Nothing yet.</p>') + "</div>"; };
      var row = function (a, n) { return "<tr><td>" + a + '</td><td class="num">' + fmt(n) + "</td></tr>"; };
      var names = {}; try { var dn = new Intl.DisplayNames(["en"], { type: "region" }); names = { of: function (c) { try { return dn.of(c); } catch (e) { return c; } } }; } catch (e) { names = { of: function (c) { return c; } }; }
      h += '<div class="stables">' +
        table("Pages read", ["Page", "Views"], S.pages.map(function (p) { return row('<a href="#' + esc(p.page) + '">' + esc(pageName(p.page)) + '</a><br><span class="muted small">' + esc(p.page) + "</span>", p.n); })) +
        table("Arrived from", ["Site", "Visits"], S.referrers.map(function (p) { return row(esc(p.host), p.n); })) +
        table("Countries", ["Country", "Visitors"], S.countries.map(function (p) { return row(esc(p.cc === "??" ? "Unknown" : names.of(p.cc)), p.n); })) +
        table("What signed-in citizens did", ["Action", "Times"], S.actions.map(function (p) { return row(esc(p.action), p.n); })) + "</div>";
      box.innerHTML = h;
      mountBars(all);
    }, function (x) { box.innerHTML = '<p class="formerr">' + esc(x.message) + "</p>"; });
  }
  function barsSVG(all) {
    var W = 720, H = 200, L = 34, B = 22, T = 8, n = all.length, max = Math.max(4, Math.max.apply(null, all.map(function (d) { return d.visitors; })));
    var step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step; if (top / step > 5 && step > 1) step *= 2; if (top / step <= 2) step /= 2; step = Math.max(1, step);
    var y = function (v) { return T + (H - T - B) * (1 - v / top); }, slot = (W - L) / n, bw = Math.max(2, Math.min(10, slot - 3));
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Visitors per day"><g class="grid">';
    for (var v = 0; v <= top; v += step) s += '<line x1="' + L + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>";
    s += "</g>";
    all.forEach(function (d, i) {
      var x = L + i * slot + (slot - bw) / 2, h = y(0) - y(d.visitors), r = Math.min(4, bw / 2, h);
      if (d.visitors) s += '<path class="bar" d="M' + x + "," + y(0) + "V" + (y(0) - h + r) + "Q" + x + "," + (y(0) - h) + " " + (x + r) + "," + (y(0) - h) + "H" + (x + bw - r) + "Q" + (x + bw) + "," + (y(0) - h) + " " + (x + bw) + "," + (y(0) - h + r) + "V" + y(0) + 'Z"/>';
      s += '<rect class="hit" data-i="' + i + '" x="' + (L + i * slot) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B + 4) + '"/>';
      var every = Math.ceil(n / 8);
      if ((n - 1 - i) % every === 0) s += '<text class="xl" x="' + (L + i * slot + slot / 2) + '" y="' + (H - 6) + '" text-anchor="' + (i === n - 1 ? "end" : "middle") + '">' + d.day.slice(8, 10) + "." + d.day.slice(5, 7) + "</text>";
    });
    return s + "</svg>" + '<div class="stip" hidden></div>';
  }
  function mountBars(all) {
    var wrap = document.getElementById("sbars"); if (!wrap) return;
    var tip = wrap.querySelector(".stip");
    function show(e) {
      var r = e.target.closest(".hit"); if (!r) { tip.hidden = true; return; }
      var d = all[+r.dataset.i], box = wrap.getBoundingClientRect(), rb = r.getBoundingClientRect();
      tip.innerHTML = "<b>" + d.day.slice(8, 10) + "." + d.day.slice(5, 7) + "." + d.day.slice(0, 4) + "</b><br>" + d.visitors + " visitor" + (d.visitors === 1 ? "" : "s") + "<br>" + d.views + " page view" + (d.views === 1 ? "" : "s") + (d.signins ? "<br>" + d.signins + " signed in" : "");
      tip.hidden = false;
      var left = rb.left - box.left + rb.width / 2; tip.style.left = Math.max(60, Math.min(box.width - 60, left)) + "px";
      wrap.querySelectorAll(".hit.on").forEach(function (x) { x.classList.remove("on"); }); r.classList.add("on");
    }
    wrap.addEventListener("mousemove", show); wrap.addEventListener("click", show);
    wrap.addEventListener("mouseleave", function () { tip.hidden = true; wrap.querySelectorAll(".hit.on").forEach(function (x) { x.classList.remove("on"); }); });
  }

  /* ---------- router ---------- */
  function route() {
    var h = location.hash.replace(/^#\/?/, "").split("?")[0], parts = h.split("/");
    var nav = ["map", "characters", "collections"].indexOf(parts[0]) >= 0 ? "lore" : parts[0] === "contribute" ? "add" : parts[0] === "r" ? (byId(parts[1]) ? (byId(parts[1]).kind === "record" ? "record" : byId(parts[1]).kind === "culture" ? "culture" : "archive") : "archive") : (parts[0] || "archive");
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.dataset.nav === nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.title = "Archive of the Republic of Ubikistan";
    PAGER.prev = PAGER.next = null;
    if (parts[0] === "signed-in") {
      var sq = parseQ(), mine = ""; try { mine = sessionStorage.getItem("ubk.nonce") || ""; sessionStorage.removeItem("ubk.nonce"); } catch (e) {}
      if (sq.t && sq.n && sq.n === mine) setToken(sq.t);
      whoami(); location.replace("#" + (sq.back || "/")); return;
    }
    countVisit();
    if (!parts[0]) viewArchive();
    else if (parts[0] === "r") viewRecord(parts[1], parts[2]);
    else if (parts[0] === "changes") viewChanges();
    else if (parts[0] === "me") viewMe();
    else if (parts[0] === "stats") viewStats();
    else if (parts[0] === "review") viewReview();
    else if (parts[0] === "versions") viewVersions();
    else if (parts[0] === "map") { if (parts[1]) viewBranch(parts[1]); else viewMap(); }
    else if (parts[0] === "characters") { if (parts[1]) viewCharacter(parts[1]); else viewCharacters(); }
    else if (parts[0] === "projects") { if (parts[1]) viewProject(parts[1]); else viewProjects(); }
    else if (parts[0] === "culture") viewCulture();
    else if (parts[0] === "films") viewFilms();
    else if (parts[0].indexOf("collections") === 0) viewCollections();
    else if (parts[0] === "record") viewRecordList();
    else if (parts[0] === "lore") viewLore(parts[1], parts[2], "lore");
    else if (parts[0] === "handbook") viewLore(parts[1], parts[2], "handbook");
    else if (parts[0] === "add" || parts[0] === "contribute") viewAdd();
    else notFound();
  }
  /* ---------- viewer: any archive image opens full size, with a download ---------- */
  var VIEWER = null, VIEWER_BACK = null;
  function openViewer(src, caption, name) {
    if (!VIEWER) {
      VIEWER = document.createElement("div");
      VIEWER.className = "viewer"; VIEWER.setAttribute("role", "dialog"); VIEWER.setAttribute("aria-modal", "true"); VIEWER.setAttribute("aria-label", "Image");
      VIEWER.innerHTML = '<button type="button" class="vclose" aria-label="Close">×</button><figure><img alt=""><figcaption><span class="vcap"></span><span class="vtools"><a class="vopen" target="_blank" rel="noopener">Open full size</a><a class="vdl" download>Download</a></span></figcaption></figure>';
      document.body.appendChild(VIEWER);
      VIEWER.addEventListener("click", function (e) { if (e.target === VIEWER || e.target.classList.contains("vclose")) closeViewer(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && VIEWER && VIEWER.classList.contains("on")) closeViewer(); });
    }
    VIEWER_BACK = document.activeElement;
    var img = VIEWER.querySelector("img"); img.src = src; img.alt = caption || "";
    VIEWER.querySelector(".vcap").textContent = caption || "";
    VIEWER.querySelector(".vopen").href = src;
    var dl = VIEWER.querySelector(".vdl"); dl.href = src; dl.setAttribute("download", name || src.split("/").pop());
    VIEWER.classList.add("on"); document.body.classList.add("viewing");
    VIEWER.querySelector(".vclose").focus();
  }
  function closeViewer() {
    VIEWER.classList.remove("on"); document.body.classList.remove("viewing");
    VIEWER.querySelector("img").removeAttribute("src");
    if (VIEWER_BACK && VIEWER_BACK.focus) VIEWER_BACK.focus();
  }
  // images on record, character and version views open in the viewer; cards still go to their pages
  main.addEventListener("click", function (e) {
    var img = e.target.closest(".rec .media img, .vimg img, .viewable");
    if (!img || e.target.closest(".card, .ccard, .cmini")) return;
    e.preventDefault();
    var fig = img.closest("figure"), cap = fig && fig.querySelector("figcaption") ? fig.querySelector("figcaption").textContent : img.alt;
    var h = location.hash.split("/"), base = (h[1] === "r" || h[1] === "characters") && h[2] ? h[2] : "";
    var file = img.getAttribute("src").split("/").pop();
    openViewer(img.getAttribute("src"), cap, base && file.indexOf(base) !== 0 ? base + "-" + file : file);
  });
  main.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".rec .media img, .vimg img, .viewable")) { e.preventDefault(); e.target.click(); }
  });

  // filters and typing use replaceState, which fires no hashchange; every real navigation does
  window.addEventListener("hashchange", function () { route(); window.scrollTo(0, 0); main.focus({ preventScroll: true }); });

  fetch("lore.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (data) {
    D = data; whoami(); stampVersion(); route();
  }).catch(function () {
    main.innerHTML = '<div style="padding:64px 0"><h1>ARCHIVE CONNECTION LOST</h1><p>The archive could not be opened. Try again, or read it as <a href="llms-full.txt">plain text</a>.</p></div>';
  });
})();
