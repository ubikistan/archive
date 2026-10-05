/*
 * Ubikistan archive: the desk.
 *
 * A small Cloudflare Worker that gives the static archive what it cannot do alone.
 * It never publishes anything itself; edits and records still go to the State Archive.
 *
 *   GET  /auth/github, /auth/x     sign in with GitHub or X; returns to the site with a session
 *   GET  /me                       who is signed in
 *   GET  /talk?page=CODE           votes and remarks for one page
 *   GET  /talk/all                 counts for every page (read by the build)
 *   POST /vote {page, value}       like (1), unlike (-1) or withdraw (0); signed in
 *   POST /remark {page, body}      leave a remark; signed in
 *   POST /hide {id}                hide a remark; State Archive only
 *   GET  /crew?project=ID          who has signed up for a project, by role
 *   GET  /crew/all                 sign-up counts per project and role (read by the build)
 *   POST /join {project, role, note, kind, agent, link}   sign up, as yourself or for an agent you run; signed in
 *   POST /leave {project, role, agent}                    leave it again; signed in
 *   GET  /projects/live            owners, roles in force and sign-up counts per project (read by the build)
 *   POST /crew/remove {id}         take someone off a project; its owner or the State Archive
 *   POST /project/owner {project, member | clear}   appoint a member as owner; State Archive only
 *   POST /project/roles {project, roles}            define the roles; the owner or the State Archive
 *   POST /project/page {project, title, summary, status, body | reset}   rewrite the project page; the owner or the State Archive
 * Only the State Archive appoints or removes an owner.
 *   GET  /log                      who signed in and what they did; State Archive only
 *
 * Everything that changes the archive needs a signed-in account (GitHub or X):
 *   POST /propose                  a new version of a page        → a pull request
 *   POST /submit                   a new record, with images      → a submission issue
 *
 * The desk keeps a log of sign-ins and actions (account, handle, time, what was done; no IP addresses)
 * for one year, readable only by the State Archive.
 *   POST /version                  a new version of a record's image → a pull request
 *   POST /note                     a note under a record, lore page or branch → a pull request
 *   POST /branch                   a new branch on the lore map, as apocrypha → a pull request
 *
 * Proposals from the State Archive (ADMINS) and from trusted citizens (tools/trusted.txt: a GitHub username,
 * or "x:<account number>") are labelled "trusted" and go live once the checks pass. The State Archive is
 * always credited as Headroom, never by the handle it signs in with.
 *
 * Secrets: APP_ID, APP_PRIVATE_KEY (GitHub App), GH_CLIENT_ID, GH_CLIENT_SECRET (the same App's
 * user sign-in), X_CLIENT_ID, X_CLIENT_SECRET (X OAuth 2.0), ADMINS (optional: "github:name,x:name").
 * Database: D1, bound as DB (schema in schema.sql).
 */

const REPO = "ubikistan/archive";
const SITE = "https://ubikistan.github.io/archive/";
const ALLOWED_ORIGINS = ["https://ubikistan.github.io", "http://localhost:8765", "http://localhost:8766"];
const MAX_TEXT = 100_000;
const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_IMAGES = 6;
const PER_HOUR = 12;
const CODE_RX = /^([A-Z]{2,5}\/[A-Z]{2,4}\/\d{4}\/[A-Z]?\d{3,4}|REC \d{4}|ACC \d{4})$/;
// a page, or one version of a record's image ("AXL/PH/2024/0001~original", "...~v20261006-ab12")
const PAGE_RX = /^(lore\/[a-z0-9-]{1,40}|project\/[a-z0-9-]{2,40}|character\/[a-z0-9-]{2,40}|branch\/[a-z0-9-]{2,40}|([A-Z]{2,5}\/[A-Z]{2,4}\/\d{4}\/[A-Z]?\d{3,4}|REC \d{4}|ACC \d{4})(~(original|v\d{8}-[a-z0-9]{4}))?)$/;

const hits = new Map(); // light rate limit per key, per worker instance

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
    try {
      const path = url.pathname;
      if (req.method === "GET") {
        if (path === "/") return reply(200, { desk: "open", repo: REPO, signin: { github: !!env.GH_CLIENT_ID, x: !!env.X_CLIENT_ID } });
        if (path === "/auth/github" || path === "/auth/x") return await startSignin(path.slice(6), url, env);
        if (path === "/auth/github/callback") return await finishGithub(req, url, env);
        if (path === "/auth/x/callback") return await finishX(req, url, env);
        if (path === "/me") { const u = await session(req, env); return reply(u ? 200 : 401, u ? { handle: u.h, provider: u.p, id: u.sub } : { error: "Not signed in." }); }
        if (path.startsWith("/incoming/")) return await incoming(path.slice(10), env);
        if (path === "/talk") return reply(200, await talk(url.searchParams.get("page"), await session(req, env), env));
        if (path === "/talk/all") return reply(200, await talkAll(env));
        if (path === "/crew") return reply(200, await crew(url.searchParams.get("project"), await session(req, env), env));
        if (path === "/crew/all") return reply(200, await crewAll(env));
        if (path === "/projects/live") return reply(200, await projectsLive(env));
        if (path === "/log") return reply(200, await readLog(url, await session(req, env), env));
        return reply(404, { error: "Not found." });
      }
      if (req.method !== "POST") return reply(404, { error: "Not found." });
      if (!ALLOWED_ORIGINS.includes(origin)) return reply(403, { error: "Use the archive site." });
      const user = await session(req, env);
      const key = user ? user.sub : "ip:" + (req.headers.get("CF-Connecting-IP") || "unknown");
      if (path === "/vote") return reply(200, await vote(await req.json(), need(user), env));
      if (path === "/remark") { if (!await allow(key, 20, env)) throw refuse("That is a lot of remarks. Try again in an hour.", 429); return reply(200, await remark(await req.json(), need(user), env)); }
      if (path === "/hide") return reply(200, await hide(await req.json(), need(user), env));
      if (path === "/join") return reply(200, await join(await req.json(), need(user), env));
      if (path === "/leave") return reply(200, await leave(await req.json(), need(user), env));
      if (path === "/crew/remove") return reply(200, await crewRemove(await req.json(), need(user), env));
      if (path === "/project/owner") return reply(200, await setOwner(await req.json(), need(user), env));
      if (path === "/project/roles") return reply(200, await setRoles(await req.json(), need(user), env));
      if (path === "/project/page") return reply(200, await setPage(await req.json(), need(user), env));
      need(user); // from here on: changes to the archive, for signed-in people only
      if (!await allow(key, PER_HOUR, env)) return reply(429, { error: "Too many proposals from here. Try again in an hour." });
      const done = async (action, out) => { await log(env, user, action, out.url || ""); return reply(200, out); };
      if (path === "/propose") return await done("edit", await propose(await req.json(), env, user));
      if (path === "/submit") return await done("submit", await submit(await req.formData(), env, user, url.origin));
      if (path === "/version") return await done("version", await version(await req.formData(), env, user));
      if (path === "/note") return await done("note", await note(await req.json(), env, user));
      if (path === "/branch") return await done("branch", await branch(await req.json(), env, user));
      return reply(404, { error: "Not found." });
    } catch (e) {
      return reply(e.status || 500, { error: e.public || "The desk could not do this. Try again later.", detail: e.public ? undefined : String(e.message || e) });
    }
  },
};

async function allow(key, max, env) {
  if (env && env.KV) { // shared across every desk instance; approximate, which is enough here
    const k = `rl:${key}:${Math.floor(Date.now() / 3600_000)}`;
    const n = parseInt((await env.KV.get(k)) || "0", 10);
    if (n >= max) return false;
    await env.KV.put(k, String(n + 1), { expirationTtl: 3700 });
    return true;
  }
  const now = Date.now(), list = (hits.get(key) || []).filter((t) => now - t < 3600_000);
  if (list.length >= max) return false;
  list.push(now); hits.set(key, list);
  return true;
}

function need(user) { if (!user) throw refuse("Sign in with GitHub or X first.", 401); return user; }
// the State Archive signs as Headroom; its own handles never appear in the archive
function credit(user, guest, env) { need(user); return isAdmin(user, env) ? "Headroom" : `@${user.h} (${user.p === "x" ? "X" : "GitHub"})`; }

/* ---------------- sessions: a signed token the site keeps and sends back ---------------- */

async function sessionKey(env) {
  if (!env.APP_PRIVATE_KEY || env.APP_PRIVATE_KEY.length < 200) throw refuse("The desk is not fully set up yet.", 503);
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ubikistan-session:" + (env.APP_PRIVATE_KEY || "")));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sign(payload, env) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await sessionKey(env), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}
async function unsign(token, env) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await sessionKey(env), unb64url(sig), new TextEncoder().encode(body));
  if (!ok) return null;
  const p = JSON.parse(new TextDecoder().decode(unb64url(body)));
  return p.exp && p.exp > Date.now() / 1000 ? p : null;
}
async function session(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get("Authorization") || "");
  return m ? unsign(m[1], env) : null;
}

/* ---------------- signing in ---------------- */

function returnTo(url) {
  const r = url.searchParams.get("return") || SITE;
  try { const u = new URL(r); return ALLOWED_ORIGINS.includes(u.origin) ? r : SITE; } catch { return SITE; }
}

const clean = (v) => String(v || "").replace(/[^\x21-\x7e]/g, "");

async function startSignin(provider, url, env) {
  const id = clean(provider === "x" ? env.X_CLIENT_ID : env.GH_CLIENT_ID);
  if (!id) throw refuse(`Signing in with ${provider === "x" ? "X" : "GitHub"} is not switched on yet.`, 503);
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const cb = `${url.origin}/auth/${provider}/callback`;
  let to;
  if (provider === "x") {
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    to = "https://x.com/i/oauth2/authorize?" + new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: cb, scope: "users.read tweet.read", state, code_challenge: challenge, code_challenge_method: "S256" });
  } else {
    to = "https://github.com/login/oauth/authorize?" + new URLSearchParams({ client_id: id, redirect_uri: cb, state, allow_signup: "true" });
  }
  const nonce = String(url.searchParams.get("nonce") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  const cookie = await sign({ state, verifier, ret: returnTo(url), nonce, exp: Date.now() / 1000 + 600 }, env);
  return new Response(null, { status: 302, headers: { Location: to, "Set-Cookie": `ubk_oauth=${cookie}; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax` } });
}

async function pending(req, url, env) {
  const c = /(?:^|;\s*)ubk_oauth=([^;]+)/.exec(req.headers.get("Cookie") || "");
  const p = c && await unsign(c[1], env);
  if (!p || p.state !== url.searchParams.get("state")) throw refuse("The sign-in took too long or was interrupted. Try again.", 400);
  return p;
}

async function finish(p, sub, handle, provider, env) {
  await log(env, { sub, h: handle, p: provider }, "sign-in", "");
  const token = await sign({ sub, h: handle, p: provider, exp: Math.floor(Date.now() / 1000) + 30 * 86400 }, env);
  const back = new URL(p.ret);
  const hash = back.hash.replace(/^#/, "") || "/";
  back.hash = "/signed-in?t=" + encodeURIComponent(token) + "&n=" + encodeURIComponent(p.nonce || "") + "&back=" + encodeURIComponent(hash);
  return new Response(null, { status: 302, headers: { Location: back.toString(), "Set-Cookie": "ubk_oauth=; Path=/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
}

async function finishGithub(req, url, env) {
  const p = await pending(req, url, env);
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.GH_CLIENT_ID, client_secret: env.GH_CLIENT_SECRET, code: url.searchParams.get("code"), redirect_uri: `${url.origin}/auth/github/callback` }),
  });
  const t = await r.json();
  if (!t.access_token) throw refuse("GitHub did not confirm the sign-in.", 400);
  const u = await call("GET", "/user", null, `token ${t.access_token}`);
  return finish(p, `github:${u.id}`, u.login, "github", env);
}

async function finishX(req, url, env) {
  const p = await pending(req, url, env);
  const body = new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code") || "", redirect_uri: `${url.origin}/auth/x/callback`, code_verifier: p.verifier, client_id: clean(env.X_CLIENT_ID) });
  const form = { "Content-Type": "application/x-www-form-urlencoded" };
  let r = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: { ...form, Authorization: "Basic " + btoa(`${clean(env.X_CLIENT_ID)}:${clean(env.X_CLIENT_SECRET)}`) }, body });
  let t = await r.json().catch(() => ({}));
  if (!t.access_token) { // the app may be registered as a public client, which takes no secret
    const r2 = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: form, body });
    const t2 = await r2.json().catch(() => ({}));
    if (t2.access_token) { r = r2; t = t2; }
    else t.second = r2.status + " " + String(t2.error_description || t2.error || "").slice(0, 120);
  }
  if (!t.access_token) throw refuse("X did not confirm the sign-in (" + r.status + " " + String(t.error_description || t.error || "").slice(0, 160) + (t.second ? "; without secret: " + t.second : "") + ").", 400);
  const mr = await fetch("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${t.access_token}` } });
  const me = await mr.json().catch(() => ({}));
  if (!me.data) throw refuse("X did not say who you are (" + mr.status + " " + String(me.title || me.detail || "").slice(0, 160) + ").", 400);
  return finish(p, `x:${me.data.id}`, me.data.username, "x", env);
}

/* ---------------- talk: votes and remarks ---------------- */

function page(raw) { const p = String(raw || "").trim(); if (!PAGE_RX.test(p)) throw refuse("Unknown page."); return p; }
// ADMINS lists stable account ids ("github:123,x:456"), never handles, which can change hands
function isAdmin(user, env) { return !!user && String(env.ADMINS || "").split(",").map((x) => x.trim()).includes(user.sub); }

async function talk(raw, user, env) {
  const pg = page(raw);
  const v = await env.DB.prepare("SELECT COALESCE(SUM(value = 1),0) AS up, COALESCE(SUM(value = -1),0) AS down FROM votes WHERE page = ?").bind(pg).first();
  const mine = user ? await env.DB.prepare("SELECT value FROM votes WHERE page = ? AND user = ?").bind(pg, user.sub).first() : null;
  const { results } = await env.DB.prepare("SELECT id, user, handle, provider, body, at FROM remarks WHERE page = ? AND hidden = 0 ORDER BY id").bind(pg).all();
  const remarks = results.map((m) => isAdmin({ sub: m.user }, env) ? { id: m.id, handle: "State Archive", provider: "archive", body: m.body, at: m.at } : { id: m.id, handle: m.handle, provider: m.provider, body: m.body, at: m.at });
  return { page: pg, up: v.up, down: v.down, mine: mine ? mine.value : 0, remarks, me: user ? { handle: user.h, provider: user.p, admin: isAdmin(user, env) } : null };
}

async function talkAll(env) {
  const out = {};
  const v = await env.DB.prepare("SELECT page, SUM(value = 1) AS up, SUM(value = -1) AS down FROM votes GROUP BY page").all();
  for (const r of v.results) out[r.page] = { up: r.up, down: r.down, comments: 0 };
  const c = await env.DB.prepare("SELECT page, COUNT(*) AS n FROM remarks WHERE hidden = 0 GROUP BY page").all();
  for (const r of c.results) (out[r.page] = out[r.page] || { up: 0, down: 0, comments: 0 }).comments = r.n;
  return out;
}

async function vote(body, user, env) {
  const pg = page(body.page), value = [1, -1, 0].includes(body.value) ? body.value : 0;
  await log(env, user, "vote", `${pg} ${value}`);
  if (value === 0) await env.DB.prepare("DELETE FROM votes WHERE page = ? AND user = ?").bind(pg, user.sub).run();
  else await env.DB.prepare("INSERT INTO votes (page, user, value, at) VALUES (?, ?, ?, ?) ON CONFLICT(page, user) DO UPDATE SET value = excluded.value, at = excluded.at")
    .bind(pg, user.sub, value, new Date().toISOString()).run();
  return talk(pg, user, env);
}

async function remark(body, user, env) {
  const pg = page(body.page);
  const text = String(body.body || "").replace(/\r\n/g, "\n").trim();
  if (text.length < 2) throw refuse("Write something first.");
  if (text.length > 2000) throw refuse("Keep remarks under 2,000 characters.");
  await log(env, user, "remark", pg);
  await env.DB.prepare("INSERT INTO remarks (page, user, handle, provider, body, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(pg, user.sub, user.h, user.p, text, new Date().toISOString()).run();
  return talk(pg, user, env);
}

async function hide(body, user, env) {
  if (!isAdmin(user, env)) throw refuse("Only the State Archive can hide remarks.", 403);
  const r = await env.DB.prepare("SELECT page FROM remarks WHERE id = ?").bind(Number(body.id) || 0).first();
  if (!r) throw refuse("No such remark.");
  await env.DB.prepare("UPDATE remarks SET hidden = 1 WHERE id = ?").bind(Number(body.id)).run();
  return talk(r.page, user, env);
}

function refuse(msg, status = 400) { const e = new Error(msg); e.public = msg; e.status = status; return e; }

function guestName(raw) {
  const n = String(raw || "").replace(/[\r\n<>@]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (n.length < 2) throw refuse("Give a name or handle to be credited as.");
  if (["headroom", "state archive", "the state archive"].includes(n.toLowerCase())) throw refuse("That name is reserved for the State Archive.");
  return n;
}

/* ---------------- proposing a new version of a page ---------------- */

async function propose(body, env, user) {
  if (body.website) throw refuse("Not accepted."); // honeypot field, invisible to people
  const who = credit(user, body.name, env);
  const file = String(body.file || "");
  if (!/^(lore\/[a-z0-9-]+\.md|branches\/[a-z0-9-]+\.md|characters\/[a-z0-9-]+\.md|records\/(archive\/\d{4}\/[A-Z0-9-]+|record\/REC-\d{4}|culture\/ACC-\d{4})\.md)$/.test(file)) throw refuse("That page cannot be edited here.");
  const text = String(body.content || "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n") || text.indexOf("\n---", 4) < 0) throw refuse("Keep the block between the two --- lines at the top.");
  if (text.length > MAX_TEXT) throw refuse("That is too long for one page.");
  const summary = String(body.summary || "").replace(/[\r\n]/g, " ").trim().slice(0, 120) || "Edit";

  const gh = await github(env);
  const main = await gh(`GET /repos/${REPO}/git/ref/heads/main`);
  const current = await gh(`GET /repos/${REPO}/contents/${file}?ref=main`);
  if (b64decode(current.content) === text) throw refuse("Nothing has changed.");
  const branch = `guest/${Date.now().toString(36)}-${slug(file)}`;
  await gh(`POST /repos/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: main.object.sha });
  await gh(`PUT /repos/${REPO}/contents/${file}`, {
    message: `${summary}${user ? "" : " (guest edit)"}`, content: b64encode(text), branch, sha: current.sha,
    author: { name: who, email: user ? `${user.p}@ubikistan.invalid` : "guest@ubikistan.invalid" },
  });
  const pr = await gh(`POST /repos/${REPO}/pulls`, {
    title: `${user ? "Edit" : "Guest edit"}: ${file.replace(/^.*\//, "").replace(/\.md$/, "")} · ${summary}`,
    head: branch, base: "main",
    body: `Proposed by **${who}** through the archive site.\n\n> ${summary}\n\nEdits from the site are reviewed by the State Archive before they appear.`,
  });
  await gh(`POST /repos/${REPO}/issues/${pr.number}/labels`, { labels: [user ? "site-edit" : "guest-edit"] }).catch(() => {});
  return { ok: true, url: pr.html_url, number: pr.number };
}

/* ---------------- submitting a new record ---------------- */

async function submit(form, env, user, origin) {
  if (form.get("website")) throw refuse("Not accepted.");
  const who = credit(user, form.get("contributor"), env);
  const f = (k) => String(form.get(k) || "").trim();
  const hasX = /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/\w+\/status\/\d+/.test(f("xpost"));
  if (!f("record_title") && !hasX) throw refuse("A title is needed.");
  if (!/(1[89]\d\d|20\d\d)/.test(f("date")) && !hasX) throw refuse("A date with a year is needed.");
  if (!f("text") && !hasX) throw refuse("A caption is needed.");
  const images = form.getAll("images").filter((x) => x && typeof x === "object" && x.size);
  if (images.length > MAX_IMAGES) throw refuse(`At most ${MAX_IMAGES} images.`);
  for (const im of images) {
    if (!/^image\/(jpeg|png|gif|webp)$/.test(im.type)) throw refuse("Images must be JPEG, PNG, GIF or WebP.");
    if (im.size > MAX_IMAGE) throw refuse("Each image must be under 3 MB.");
  }

  const gh = await github(env);
  const links = [];
  if (images.length && !env.KV) throw refuse("Image uploads are not switched on yet.", 503);
  for (const im of images) {
    // held privately for 30 days; only the intake (after review) or someone with the exact link fetches them
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" }[im.type];
    const id = b64url(crypto.getRandomValues(new Uint8Array(18))) + "." + ext;
    await env.KV.put("img:" + id, await im.arrayBuffer(), { expirationTtl: 30 * 86400, metadata: { type: im.type } });
    links.push(`${origin}/incoming/${id}`);
  }
  const film = f("film");
  if (film && /^https:\/\//.test(film)) links.push(film);
  const sec = (h, v) => `### ${h}\n\n${v || "_No response_"}\n`;
  const body = [
    sec("Which archive?", f("archive")), sec("Title", f("record_title")), sec("Date", f("date")),
    sec("Medium", f("medium")), sec("Issued by", f("institution")), sec("What is it, physically?", f("format")),
    sec("Form", f("form")), sec("Link", f("link")), sec("Post on X", f("xpost")), sec("Whose post?", f("whose")),
    sec("Caption and text", f("text")), sec("Images and films", links.join("\n")), sec("Credit as", who),
    sec("Free to copy", "- [X] I made this, or have the right to give it away, and I release it under CC0."),
  ].join("\n");
  const issue = await gh(`POST /repos/${REPO}/issues`, { title: `Record: ${f("record_title") || f("xpost")}`.slice(0, 200), body, labels: ["submission", user ? "site-edit" : "guest-edit"] });
  return { ok: true, url: issue.html_url, number: issue.number };
}

async function incoming(id, env) {
  if (!env.KV || !/^[A-Za-z0-9_-]{20,30}\.(jpg|png|gif|webp)$/.test(id)) return new Response("Not found", { status: 404 });
  const { value, metadata } = await env.KV.getWithMetadata("img:" + id, { type: "arrayBuffer" });
  if (!value) return new Response("Not found", { status: 404 });
  return new Response(value, { headers: { "Content-Type": metadata && metadata.type || "application/octet-stream", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
}

/* ---------------- the log: who signed in and what they did ---------------- */

async function log(env, user, action, detail) {
  if (!env.DB || !user) return;
  try {
    const at = new Date().toISOString();
    await env.DB.prepare("INSERT INTO log (at, user, handle, provider, action, detail) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(at, user.sub, String(user.h || ""), String(user.p || ""), action, String(detail || "").slice(0, 300)).run();
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM log WHERE at < ?").bind(new Date(Date.now() - 365 * 86400_000).toISOString()).run();
  } catch (e) { /* the log never blocks the desk */ }
}

async function readLog(url, user, env) {
  if (!isAdmin(user, env)) throw refuse("Only the State Archive can read the log.", 403);
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") || "300", 10) || 300));
  const who = String(url.searchParams.get("user") || "");
  const q = who ? env.DB.prepare("SELECT id, at, user, handle, provider, action, detail FROM log WHERE user = ? ORDER BY id DESC LIMIT ?").bind(who, limit)
    : env.DB.prepare("SELECT id, at, user, handle, provider, action, detail FROM log ORDER BY id DESC LIMIT ?").bind(limit);
  const { results } = await q.all();
  const people = await env.DB.prepare("SELECT user, MAX(handle) AS handle, MAX(provider) AS provider, MIN(at) AS first, MAX(at) AS last, SUM(action = 'sign-in') AS signins, COUNT(*) AS actions FROM log GROUP BY user ORDER BY last DESC LIMIT 500").all();
  return { entries: results, people: people.results };
}

/* ---------------- projects: who signs up for what ---------------- */

let projectsCache = null;
// the roles in a project's file, from the published lore.json
async function fileProjects() {
  if (!projectsCache || projectsCache.at < Date.now() - 600_000) {
    const r = await fetch(SITE + "lore.json", { cf: { cacheTtl: 300 } });
    const d = await r.json();
    projectsCache = { at: Date.now(), map: Object.fromEntries((d.projects || []).map((p) => [p.id, p.roles])) };
  }
  return projectsCache.map;
}
// the roles in force: the owner's, if they have defined any, otherwise the file's
async function rolesOf(id, env) {
  const { results } = await env.DB.prepare("SELECT id, name, can, wanted, who FROM project_roles WHERE project = ? ORDER BY pos").bind(id).all();
  if (results.length) return { roles: results.map((r) => ({ ...r, wanted: r.wanted == null ? null : r.wanted })), by: "owner" };
  const file = (await fileProjects())[id];
  return file ? { roles: file.map((r) => ({ id: r.id, name: r.name, can: r.can, wanted: r.wanted == null ? null : r.wanted, who: r.who || "anyone" })), by: "file" } : null;
}
function shown(m, env) { // the State Archive appears as itself, never by its handle
  return isAdmin({ sub: m.user }, env) ? { handle: "State Archive", provider: "archive" } : { handle: m.handle, provider: m.provider };
}
async function ownerOf(id, env) { return env.DB.prepare("SELECT user, handle, provider, at FROM project_owners WHERE project = ?").bind(id).first(); }
async function canManage(id, user, env) {
  if (!user) return false;
  if (isAdmin(user, env)) return true;
  const o = await ownerOf(id, env);
  return !!o && o.user === user.sub;
}
function projectId(raw) { const id = String(raw || ""); if (!/^[a-z0-9-]{2,40}$/.test(id)) throw refuse("Unknown project."); return id; }

async function crew(raw, user, env) {
  const id = projectId(raw);
  const r = await rolesOf(id, env);
  if (!r) throw refuse("Unknown project.");
  const { results } = await env.DB.prepare("SELECT id, role, user, handle, provider, kind, agent, link, note, at FROM signups WHERE project = ? ORDER BY id").bind(id).all();
  const admin = isAdmin(user, env), o = await ownerOf(id, env), manage = admin || (!!o && !!user && o.user === user.sub);
  const pg = await env.DB.prepare("SELECT title, summary, status, body, user, handle, provider, at FROM project_pages WHERE project = ?").bind(id).first();
  return {
    project: id, roles: r.roles, roles_by: r.by,
    page: pg ? { title: pg.title, summary: pg.summary, status: pg.status, body: pg.body, by: shown(pg, env), at: pg.at.slice(0, 10) } : null,
    owner: o ? { ...shown(o, env), since: o.at.slice(0, 10) } : null,
    members: results.map((m) => ({ id: manage ? m.id : undefined, role: m.role, ...shown(m, env), kind: m.kind, agent: m.agent, link: m.link, note: m.note, at: m.at.slice(0, 10), me: !!user && m.user === user.sub, owner: !!o && m.user === o.user })),
    me: user ? { handle: user.h, provider: user.p, admin, manage } : null,
  };
}

// for the build: owners, roles in force and sign-up counts, per project
async function projectsLive(env) {
  const out = {};
  const own = await env.DB.prepare("SELECT project, user, handle, provider FROM project_owners").all();
  for (const o of own.results) (out[o.project] = out[o.project] || {}).owner = shown(o, env);
  const roles = await env.DB.prepare("SELECT project, id, name, can, wanted, who FROM project_roles ORDER BY project, pos").all();
  for (const r of roles.results) { const p = (out[r.project] = out[r.project] || {}); (p.roles = p.roles || []).push({ id: r.id, name: r.name, can: r.can, wanted: r.wanted, who: r.who }); }
  const pages = await env.DB.prepare("SELECT project, title, summary, status, body, user, handle, provider, at FROM project_pages").all();
  for (const g of pages.results) (out[g.project] = out[g.project] || {}).page = { title: g.title, summary: g.summary, status: g.status, body: g.body, by: shown(g, env), at: g.at.slice(0, 10) };
  const n = await env.DB.prepare("SELECT project, role, kind, COUNT(*) AS n FROM signups GROUP BY project, role, kind").all();
  for (const r of n.results) { const p = (out[r.project] = out[r.project] || {}); const c = (p.counts = p.counts || {}); c[r.role] = c[r.role] || { people: 0, agents: 0 }; c[r.role][r.kind === "agent" ? "agents" : "people"] = r.n; }
  return out;
}
async function crewAll(env) { // kept for older pages: totals per role
  const live = await projectsLive(env), out = {};
  for (const [p, v] of Object.entries(live)) for (const [role, c] of Object.entries(v.counts || {})) (out[p] = out[p] || {})[role] = c.people + c.agents;
  return out;
}

async function join(body, user, env) {
  const id = projectId(body.project), role = String(body.role || "");
  const r = await rolesOf(id, env);
  if (!r) throw refuse("Unknown project.");
  const def = r.roles.find((x) => x.id === role);
  if (!def) throw refuse("That role is not on this project.");
  const kind = body.kind === "agent" ? "agent" : "person";
  if (kind === "agent" && def.who === "people") throw refuse("This role is for people.");
  if (kind === "person" && def.who === "agents") throw refuse("This role is for agents. Sign up an agent you run.");
  const agent = kind === "agent" ? String(body.agent || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 60) : "";
  if (kind === "agent" && agent.length < 2) throw refuse("Give the agent's name.");
  const link = kind === "agent" ? String(body.link || "").trim().slice(0, 200) : "";
  if (link && !/^https:\/\/[^\s]+$/.test(link)) throw refuse("The agent's link must start with https://");
  const note = String(body.note || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM signups WHERE project = ? AND user = ?").bind(id, user.sub).first();
  if (mine.n >= 6) throw refuse("Six sign-ups per project, people and agents together, is the most one account can make.");
  await env.DB.prepare("INSERT INTO signups (project, role, user, handle, provider, kind, agent, link, note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project, role, user, agent) DO UPDATE SET note = excluded.note, link = excluded.link")
    .bind(id, role, user.sub, user.h, user.p, kind, agent, link, note, new Date().toISOString()).run();
  await log(env, user, "join", `${id}/${role}${agent ? " agent " + agent : ""}`);
  return crew(id, user, env);
}

async function leave(body, user, env) {
  const id = projectId(body.project), role = String(body.role || ""), agent = String(body.agent || "");
  await env.DB.prepare("DELETE FROM signups WHERE project = ? AND role = ? AND user = ? AND agent = ?").bind(id, role, user.sub, agent).run();
  await log(env, user, "leave", `${id}/${role}${agent ? " agent " + agent : ""}`);
  return crew(id, user, env);
}

async function crewRemove(body, user, env) {
  const m = await env.DB.prepare("SELECT project FROM signups WHERE id = ?").bind(Number(body.id) || 0).first();
  if (!m) throw refuse("No such sign-up.");
  if (!await canManage(m.project, user, env)) throw refuse("Only the project's owner or the State Archive can do that.", 403);
  await env.DB.prepare("DELETE FROM signups WHERE id = ?").bind(Number(body.id)).run();
  await log(env, user, "remove", `${m.project} #${body.id}`);
  return crew(m.project, user, env);
}

// the State Archive makes a member the owner (or clears it)
async function setOwner(body, user, env) {
  if (!isAdmin(user, env)) throw refuse("Only the State Archive appoints owners.", 403);
  const id = projectId(body.project);
  if (body.clear) {
    await env.DB.prepare("DELETE FROM project_owners WHERE project = ?").bind(id).run();
    await log(env, user, "owner", `${id} cleared`);
    return crew(id, user, env);
  }
  const m = await env.DB.prepare("SELECT user, handle, provider FROM signups WHERE id = ? AND project = ?").bind(Number(body.member) || 0, id).first();
  if (!m) throw refuse("Choose someone who has signed up for this project.");
  await env.DB.prepare("INSERT INTO project_owners (project, user, handle, provider, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project) DO UPDATE SET user = excluded.user, handle = excluded.handle, provider = excluded.provider, at = excluded.at")
    .bind(id, m.user, m.handle, m.provider, new Date().toISOString()).run();
  await log(env, user, "owner", `${id} -> ${m.provider}:${m.handle}`);
  return crew(id, user, env);
}

// the owner (or the State Archive) rewrites the project page; reset goes back to the file
async function setPage(body, user, env) {
  const id = projectId(body.project);
  if (!await rolesOf(id, env)) throw refuse("Unknown project.");
  if (!await canManage(id, user, env)) throw refuse("Only the project's owner or the State Archive can edit this page.", 403);
  if (body.reset) {
    await env.DB.prepare("DELETE FROM project_pages WHERE project = ?").bind(id).run();
    await log(env, user, "page", `${id}: back to the file`);
    return crew(id, user, env);
  }
  const title = String(body.title || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 90);
  const summary = String(body.summary || "").replace(/[\r\n]+/g, " ").trim().slice(0, 240);
  const status = ["forming", "open", "active", "paused", "done"].includes(body.status) ? body.status : "forming";
  const text = String(body.body || "").replace(/\r\n/g, "\n").trim();
  if (title.length < 3 || summary.length < 10) throw refuse("Give the project a title and a one-line summary.");
  if (text.length > 20000) throw refuse("Keep the description under 20,000 characters.");
  await env.DB.prepare("INSERT INTO project_pages (project, title, summary, status, body, user, handle, provider, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project) DO UPDATE SET title = excluded.title, summary = excluded.summary, status = excluded.status, body = excluded.body, user = excluded.user, handle = excluded.handle, provider = excluded.provider, at = excluded.at")
    .bind(id, title, summary, status, text, user.sub, user.h, user.p, new Date().toISOString()).run();
  await log(env, user, "page", id);
  return crew(id, user, env);
}

// the owner (or the State Archive) defines the roles; an empty list goes back to the file's roles
async function setRoles(body, user, env) {
  const id = projectId(body.project);
  if (!await rolesOf(id, env)) throw refuse("Unknown project.");
  if (!await canManage(id, user, env)) throw refuse("Only the project's owner or the State Archive can change its roles.", 403);
  const list = Array.isArray(body.roles) ? body.roles : [];
  if (list.length > 20) throw refuse("Twenty roles at most.");
  const seen = new Set(), clean = [];
  for (const r of list) {
    const name = String(r.name || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 60);
    const can = String(r.can || "").replace(/[\r\n]+/g, " ").trim().slice(0, 400);
    if (name.length < 2 || can.length < 10) throw refuse("Every role needs a name and a sentence on what it can do.");
    let rid = String(r.id || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "role";
    while (seen.has(rid)) rid += "-2";
    seen.add(rid);
    const wanted = r.wanted === "" || r.wanted == null ? null : Math.max(0, Math.min(99, parseInt(r.wanted, 10) || 0));
    const who = ["anyone", "people", "agents"].includes(r.who) ? r.who : "anyone";
    clean.push({ id: rid, name, can, wanted, who });
  }
  const stmts = [env.DB.prepare("DELETE FROM project_roles WHERE project = ?").bind(id)];
  clean.forEach((r, i) => stmts.push(env.DB.prepare("INSERT INTO project_roles (project, id, pos, name, can, wanted, who) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, r.id, i, r.name, r.can, r.wanted, r.who)));
  await env.DB.batch(stmts);
  await log(env, user, "roles", `${id}: ${clean.length ? clean.map((r) => r.id).join(", ") : "back to the file"}`);
  return crew(id, user, env);
}

/* ---------------- versions and notes: adding to a page that already exists ---------------- */

// where a page lives in the repository, or null
function pageFile(pg) {
  if (pg.startsWith("lore/")) return `${pg}.md`;
  if (pg.startsWith("branch/")) return `branches/${pg.slice(7)}.md`;
  const m = /^[A-Z]{2,5}\/[A-Z]{2,4}\/(\d{4})\//.exec(pg);
  if (m) return `records/archive/${m[1]}/${pg.replace(/\//g, "-")}.md`;
  if (pg.startsWith("REC ")) return `records/record/${pg.replace(" ", "-")}.md`;
  if (pg.startsWith("ACC ")) return `records/culture/${pg.replace(" ", "-")}.md`;
  return null;
}
function pageDir(pg) { return pg.replace(/\//g, "-").replace(" ", "-").replace(/^lore-/, "lore-"); }
function stamp(prefix) {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const r = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  return `${prefix}${d}-${r}`;
}
function yamlStr(v) { return JSON.stringify(String(v)); } // JSON strings are valid YAML

async function isTrusted(user, env, gh) {
  if (!user) return false;
  if (isAdmin(user, env)) return true;
  try {
    const f = await gh(`GET /repos/${REPO}/contents/tools/trusted.txt?ref=main`);
    const lines = b64decode(f.content).split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#"));
    return user.p === "github" ? lines.includes(String(user.h).toLowerCase()) : lines.includes(String(user.sub).toLowerCase());
  } catch (e) { return false; }
}

// one branch, a few files, one pull request; trusted ones are labelled to go live after the checks
async function proposeFiles(env, user, who, files, title, body, kind) {
  const gh = await github(env);
  const trusted = await isTrusted(user, env, gh);
  const main = await gh(`GET /repos/${REPO}/git/ref/heads/main`);
  const branch = `desk/${kind}-${Date.now().toString(36)}`;
  await gh(`POST /repos/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: main.object.sha });
  const author = { name: who, email: user ? `${user.p}@ubikistan.invalid` : "guest@ubikistan.invalid" };
  for (const f of files) await gh(`PUT /repos/${REPO}/contents/${f.path}`, { message: f.message, content: f.content, branch, author });
  const pr = await gh(`POST /repos/${REPO}/pulls`, { title, head: branch, base: "main",
    body: `${body}\n\nProposed by **${who}** through the archive site. ${trusted ? "Trusted: it goes live once the checks pass." : "The State Archive reviews it before it appears."}` });
  const labels = [kind === "version" ? "new-version" : kind === "branch" ? "new-branch" : "note", user ? "site-edit" : "guest-edit"];
  if (trusted) labels.push("trusted");
  if (user && isAdmin(user, env)) labels.push("state-archive");
  await gh(`POST /repos/${REPO}/issues/${pr.number}/labels`, { labels }).catch(() => {});
  return { ok: true, url: pr.html_url, number: pr.number, trusted };
}

async function pageExists(env, pg) {
  const file = pageFile(pg);
  if (!file) return false;
  const gh = await github(env);
  try { await gh(`GET /repos/${REPO}/contents/${encodeURI(file)}?ref=main`); return true; } catch (e) { return false; }
}

async function version(form, env, user) {
  if (form.get("website")) throw refuse("Not accepted.");
  const who = credit(user, form.get("name"), env);
  const pg = String(form.get("page") || "").trim();
  if (!CODE_RX.test(pg)) throw refuse("Versions are for records' images.");
  const im = form.get("image");
  if (!im || typeof im !== "object" || !im.size) throw refuse("Choose an image.");
  if (!/^image\/(jpeg|png|webp)$/.test(im.type)) throw refuse("The image must be JPEG, PNG or WebP.");
  if (im.size > MAX_IMAGE) throw refuse("The image must be under 3 MB.");
  const note = String(form.get("note") || "").replace(/\r\n/g, "\n").trim().slice(0, 1000);
  if (note.length < 10) throw refuse("Say in a sentence what this version changes or adds.");
  const alt = String(form.get("alt") || "").replace(/[\r\n]/g, " ").trim().slice(0, 200);
  if (alt.length < 5) throw refuse("Describe the image in a few words, for people who cannot see it.");
  if (!await pageExists(env, pg)) throw refuse("That record does not exist.");
  const id = stamp("v"), dir = pageDir(pg), ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[im.type];
  const media = `media/${dir}--${id}.${ext}`;
  const today = new Date().toISOString().slice(0, 10);
  const md = `---\npage: ${yamlStr(pg)}\nfile: ${media}\nalt: ${yamlStr(alt)}\ncontributor: ${yamlStr(who)}\nadded: ${today}\n---\n\n${note}\n`;
  return proposeFiles(env, user, who, [
    { path: media, content: b64encodeBytes(new Uint8Array(await im.arrayBuffer())), message: `New version of ${pg}: image` },
    { path: `records/versions/${dir}/${id}.md`, content: b64encode(md), message: `New version of ${pg}` },
  ], `New version: ${pg}`, `A new version of the image for **${pg}**.\n\n> ${note.replace(/\n/g, "\n> ")}`, "version");
}

async function note(body, env, user) {
  if (body.website) throw refuse("Not accepted.");
  const who = credit(user, body.name, env);
  const pg = String(body.page || "").trim();
  if (!PAGE_RX.test(pg) || pg.includes("~")) throw refuse("Unknown page.");
  const text = String(body.text || "").replace(/\r\n/g, "\n").trim();
  if (text.length < 20) throw refuse("A note needs at least a sentence.");
  if (text.length > 4000) throw refuse("Keep notes under 4,000 characters.");
  if (!await pageExists(env, pg)) throw refuse("That page does not exist.");
  const id = stamp("n"), today = new Date().toISOString().slice(0, 10);
  const md = `---\npage: ${yamlStr(pg)}\ncontributor: ${yamlStr(who)}\nadded: ${today}\n---\n\n${text}\n`;
  return proposeFiles(env, user, who, [{ path: `records/notes/${pageDir(pg)}/${id}.md`, content: b64encode(md), message: `Note on ${pg}` }],
    `Note: ${pg}`, `A note for **${pg}**.\n\n> ${text.slice(0, 600).replace(/\n/g, "\n> ")}`, "note");
}

// a new branch grows from an existing one, as apocrypha
async function branch(body, env, user) {
  if (body.website) throw refuse("Not accepted.");
  const who = credit(user, "", env);
  const parent = String(body.parent || "");
  if (!/^[a-z0-9-]{2,40}$/.test(parent) || !await pageExists(env, "branch/" + parent)) throw refuse("Choose the branch this one grows from.");
  const title = String(body.title || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 80);
  if (title.length < 3) throw refuse("Give the branch a title.");
  const summary = String(body.summary || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  if (summary.length < 10) throw refuse("Give it a one-line summary.");
  const years = String(body.years || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 20);
  const text = String(body.text || "").replace(/\r\n/g, "\n").trim();
  if (text.length < 60) throw refuse("Write at least a few sentences: what happens on this branch, and how it grows from its parent.");
  if (text.length > 8000) throw refuse("Keep a new branch under 8,000 characters. It can grow later.");
  let id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34) || "branch";
  if (await pageExists(env, "branch/" + id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
  const today = new Date().toISOString().slice(0, 10);
  const md = `---\ntitle: ${yamlStr(title)}\nparent: ${parent}\nyears: ${yamlStr(years)}\nstatus: apocrypha\nsummary: ${yamlStr(summary)}\ncontributor: ${yamlStr(who)}\nadded: ${today}\n---\n\n${text}\n`;
  return proposeFiles(env, user, who, [{ path: `branches/${id}.md`, content: b64encode(md), message: `New branch: ${title}` }],
    `New branch: ${title}`, `A new branch on the lore map, growing from **${parent}**, as apocrypha.\n\n> ${summary}`, "branch");
}

/* ---------------- GitHub App authentication ---------------- */

let cached = null;

async function github(env) {
  if (!cached || cached.expires < Date.now() + 60_000) {
    const jwt = await appJWT(env.APP_ID, env.APP_PRIVATE_KEY);
    const inst = await call("GET", `/repos/${REPO}/installation`, null, `Bearer ${jwt}`);
    const tok = await call("POST", `/app/installations/${inst.id}/access_tokens`, {}, `Bearer ${jwt}`);
    cached = { token: tok.token, expires: Date.parse(tok.expires_at) };
  }
  return (route, body) => { const [m, p] = route.split(" "); return call(m, p, body, `token ${cached.token}`); };
}

async function call(method, path, body, auth) {
  const r = await fetch("https://api.github.com" + path, {
    method, body: body == null ? undefined : JSON.stringify(body),
    headers: { Authorization: auth, Accept: "application/vnd.github+json", "User-Agent": "ubikistan-guest-desk", "X-GitHub-Api-Version": "2022-11-28" },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : {};
}

async function appJWT(appId, pem) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const data = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat: now - 60, exp: now + 540, iss: String(appId) })}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

// GitHub hands out PKCS#1 keys ("BEGIN RSA PRIVATE KEY"); WebCrypto wants PKCS#8. Wrap if needed.
function pemToPkcs8(pem) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return der.buffer;
  const len = (n) => n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255];
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...len(der.length)];
  const inner = [0x02, 0x01, 0x00, ...algo, ...octet];
  const out = new Uint8Array([0x30, ...len(inner.length + der.length), ...inner, ...der]);
  return out.buffer;
}

/* ---------------- small helpers ---------------- */

function slug(s) { return s.replace(/^.*\//, "").replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40); }
function unb64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }
function b64url(bytes) { return b64encodeBytes(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64encode(text) { return b64encodeBytes(new TextEncoder().encode(text)); }
function b64encodeBytes(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function b64decode(b64) { return new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, "")), (c) => c.charCodeAt(0))); }
